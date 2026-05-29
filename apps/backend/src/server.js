import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
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
const store = new InMemoryStore();
const eventBus = new EventBus();
const pipeline = new FilingPipeline({
  store,
  eventBus,
  parser: new PythonResultParser(),
  scorer: new PeadScorer()
});

const collectors = [new PythonPortalCollector({ eventBus })];

const sendJson = (res, status, body) => {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json)
  });
  res.end(json);
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
