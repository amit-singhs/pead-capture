import { loadEnvFile } from "./utils/env.js";

loadEnvFile();

const numberFromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const listFromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
};

const valueFromEnv = (name, fallback = "") => process.env[name] || fallback;

export const config = {
  port: numberFromEnv("PORT", 4173),
  pollIntervalMs: numberFromEnv("POLL_INTERVAL_MS", 6000),
  hotPollIntervalMs: numberFromEnv("HOT_POLL_INTERVAL_MS", 3000),
  reportFreshnessHours: numberFromEnv("REPORT_FRESHNESS_HOURS", 5),
  mode: process.env.COLLECTOR_MODE || "live",
  pythonPath: process.env.PYTHON_PATH || "python3",
  nseAnnouncementsUrl:
    process.env.NSE_ANNOUNCEMENTS_URL ||
    "https://www.nseindia.com/api/corporate-announcements?index=equities",
  nseRefererUrl:
    process.env.NSE_REFERER_URL ||
    "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  bseAnnouncementsUrl:
    process.env.BSE_ANNOUNCEMENTS_URL ||
    "https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C",
  bseRefererUrl:
    process.env.BSE_REFERER_URL ||
    "https://www.bseindia.com/corporates/ann.html",
  bseAttachmentRoot:
    process.env.BSE_ATTACHMENT_ROOT ||
    "https://www.bseindia.com/xml-data/corpfiling/AttachLive",
  watchlist: listFromEnv("WATCHLIST", []),
  ai: {
    provider: valueFromEnv("AI_PROVIDER", "disabled").toLowerCase(),
    apiKey: valueFromEnv("AI_API_KEY"),
    model: valueFromEnv("AI_MODEL"),
    extractionMode: valueFromEnv("AI_EXTRACTION_MODE", "disabled").toLowerCase(),
    maxPages: numberFromEnv("AI_MAX_PAGES", 4),
    maxCharsPerPage: numberFromEnv("AI_MAX_CHARS_PER_PAGE", 3600),
    timeoutMs: numberFromEnv("AI_TIMEOUT_MS", 18000),
    minLocalConfidence: numberFromEnv("AI_MIN_LOCAL_CONFIDENCE", 0.82),
    concurrency: numberFromEnv("AI_CONCURRENCY", 2)
  },
  staticRoot: new URL("../../frontend/", import.meta.url)
};
