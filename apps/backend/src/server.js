import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PythonPortalCollector } from "./collectors/pythonPortalCollector.js";
import { CollectorScheduler } from "./collectors/scheduler.js";
import { config } from "./config.js";
import { EventBus } from "./events/eventBus.js";
import { PythonResultParser } from "./parsers/pythonResultParser.js";
import { FilingPipeline } from "./pipeline/filingPipeline.js";
import { PeadScorer } from "./scoring/peadScorer.js";
import { InMemoryStore } from "./store/inMemoryStore.js";
import { logger } from "./utils/logger.js";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const staticRoot = fileURLToPath(config.staticRoot);
const renderPdfPageScript = fileURLToPath(new URL("../python/render_pdf_page.py", import.meta.url));
const store = new InMemoryStore();
const eventBus = new EventBus();
const pipeline = new FilingPipeline({
  store,
  eventBus,
  parser: new PythonResultParser({ timeoutMs: config.parserTimeoutMs }),
  scorer: new PeadScorer(),
  config
});

const collectors = [new PythonPortalCollector({ eventBus })];

const allowedPdfHosts = new Set([
  "nsearchives.nseindia.com",
  "archives.nseindia.com",
  "www.bseindia.com",
  "api.bseindia.com"
]);

const sendJson = (res, status, body) => {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json)
  });
  res.end(json);
};

const isAllowedPdfUrl = (value) => {
  try {
    const target = new URL(value);
    return target.protocol === "https:" && allowedPdfHosts.has(target.hostname);
  } catch {
    return false;
  }
};

const streamPdf = async (url, res) => {
  if (!isAllowedPdfUrl(url)) {
    sendJson(res, 400, { error: "Unsupported PDF source" });
    return;
  }

  const target = new URL(url);
  const response = await fetch(target, {
    headers: {
      accept: "application/pdf,*/*",
      "accept-language": "en-US,en;q=0.9",
      referer: target.hostname.includes("bseindia.com")
        ? "https://www.bseindia.com/"
        : "https://www.nseindia.com/",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    }
  });

  if (!response.ok) {
    sendJson(res, response.status, { error: `Unable to load PDF: ${response.statusText}` });
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "content-type": response.headers.get("content-type") || "application/pdf",
    "content-length": body.byteLength,
    "cache-control": "private, max-age=300",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff"
  });
  res.end(body);
};

const streamPdfPage = async (url, page, search, res) => {
  if (!isAllowedPdfUrl(url)) {
    sendJson(res, 400, { error: "Unsupported PDF source" });
    return;
  }

  const child = spawn(config.pythonPath, [renderPdfPageScript], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  const chunks = [];
  const errors = [];

  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => errors.push(chunk));
  child.stdin.end(JSON.stringify({ url, page, search }));

  child.on("error", (error) => {
    sendJson(res, 500, { error: error.message });
  });

  child.on("close", (code) => {
    if (res.writableEnded) return;
    if (code !== 0) {
      const message = Buffer.concat(errors).toString("utf8").trim();
      sendJson(res, 500, {
        error: message || "Unable to render PDF page"
      });
      return;
    }

    const body = Buffer.concat(chunks);
    res.writeHead(200, {
      "content-type": "image/png",
      "content-length": body.byteLength,
      "cache-control": "private, max-age=300"
    });
    res.end(body);
  });
};

const sendStatic = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = normalize(join(staticRoot, requested));
  if (!fullPath.startsWith(staticRoot)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(fullPath);
    res.writeHead(200, {
      "content-type": mime[extname(fullPath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
};

const sseClients = new Set();

eventBus.on("poll-status", (pollStatus) => {
  store.savePollStatus(pollStatus);
});

eventBus.on("*", (event) => {
  const packet = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
  for (const client of sseClients) client.write(packet);
});

const handleEvents = (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.write(`event: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      mode: config.mode,
      watchlist: config.watchlist,
      collectors: collectors.map((collector) => collector.name),
      urls: {
        nse: config.nseAnnouncementsUrl,
        bse: config.bseAnnouncementsUrl
      },
      now: new Date().toISOString()
    });
    return;
  }

  if (url.pathname === "/api/snapshot") {
    sendJson(res, 200, store.snapshot());
    return;
  }

  if (url.pathname === "/api/pdf") {
    await streamPdf(url.searchParams.get("url"), res);
    return;
  }

  if (url.pathname === "/api/pdf-page") {
    await streamPdfPage(
      url.searchParams.get("url"),
      url.searchParams.get("page"),
      url.searchParams.get("search"),
      res
    );
    return;
  }

  if (url.pathname.startsWith("/api/signals/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/signals/", ""));
    const signal = store.signalById(id);
    if (!signal) {
      sendJson(res, 404, { error: "Signal not found" });
      return;
    }
    sendJson(res, 200, { signal });
    return;
  }

  if (url.pathname === "/api/events") {
    handleEvents(req, res);
    return;
  }

  await sendStatic(req, res);
});

server.listen(config.port, () => {
  logger.info("server.started", {
    url: `http://localhost:${config.port}`,
    mode: config.mode
  });
  const scheduler = new CollectorScheduler({ collectors, pipeline, config });
  scheduler.start();
});
