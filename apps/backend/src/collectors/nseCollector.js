import { fetchJson } from "../utils/http.js";
import { sha256 } from "../utils/hash.js";

const ANNOUNCEMENTS_URL =
  "https://www.nseindia.com/api/corporate-announcements?index=equities";
const NSE_HOME = "https://www.nseindia.com";

const isResultAnnouncement = (item) => {
  const text = [
    item?.desc,
    item?.subject,
    item?.attchmntText,
    item?.sm_name,
    item?.symbol
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    text.includes("financial result") ||
    text.includes("audited result") ||
    text.includes("unaudited result") ||
    text.includes("results") && text.includes("quarter")
  );
};

const toAbsoluteUrl = (href) => {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  return `${NSE_HOME}${href.startsWith("/") ? "" : "/"}${href}`;
};

const matchesWatchlist = (item, watchlist) => {
  if (!watchlist.size) return true;
  const haystack = [item.symbol, item.sm_name, item.companyName, item.desc]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return [...watchlist].some((symbol) => haystack.includes(symbol));
};

export class NseCollector {
  name = "NSE";

  async collect({ watchlist }) {
    const rows = await fetchJson(ANNOUNCEMENTS_URL, {
      headers: {
        referer: "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
      }
    });

    const announcements = Array.isArray(rows) ? rows : rows?.data || [];
    return announcements
      .filter(isResultAnnouncement)
      .filter((item) => matchesWatchlist(item, watchlist))
      .map((item) => {
        const attachmentUrl = toAbsoluteUrl(item.attchmntFile || item.attachmentFile);
        const receivedAt = item.exchdisstime || item.an_dt || new Date().toISOString();
        const id = sha256(["NSE", item.symbol, receivedAt, attachmentUrl, item.desc].join("|"));
        return {
          id,
          source: "NSE",
          symbol: String(item.symbol || item.sm_name || "UNKNOWN").toUpperCase(),
          companyName: item.sm_name || item.companyName || item.symbol || "Unknown company",
          title: item.desc || item.subject || "Financial results",
          receivedAt,
          disseminatedAt: item.exchdisstime || item.an_dt || receivedAt,
          attachmentUrl,
          raw: item
        };
      });
  }
}
