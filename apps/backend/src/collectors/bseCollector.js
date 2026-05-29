import { fetchJson } from "../utils/http.js";
import { sha256 } from "../utils/hash.js";

const BSE_API =
  "https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C";
const BSE_ATTACHMENT_ROOT = "https://www.bseindia.com/xml-data/corpfiling/AttachLive";

const isResultAnnouncement = (item) => {
  const text = [item?.HEADLINE, item?.SUBCATNAME, item?.MORE, item?.NEWSSUB]
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

const attachmentUrl = (item) => {
  const file = item?.ATTACHMENTNAME || item?.NSURL;
  if (!file) return null;
  if (file.startsWith("http")) return file;
  return `${BSE_ATTACHMENT_ROOT}/${file}`;
};

const matchesWatchlist = (item, watchlist) => {
  if (!watchlist.size) return true;
  const haystack = [item.SCRIP_CD, item.SLONGNAME, item.HEADLINE, item.NEWSSUB]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return [...watchlist].some((symbol) => haystack.includes(symbol));
};

export class BseCollector {
  name = "BSE";

  async collect({ watchlist }) {
    const payload = await fetchJson(BSE_API, {
      headers: {
        origin: "https://www.bseindia.com",
        referer: "https://www.bseindia.com/corporates/ann.html"
      }
    });

    const rows = payload?.Table || payload?.data || [];
    return rows
      .filter(isResultAnnouncement)
      .filter((item) => matchesWatchlist(item, watchlist))
      .map((item) => {
        const url = attachmentUrl(item);
        const receivedAt = item.NEWS_DT || item.DT_TM || new Date().toISOString();
        const symbol = String(item.SCRIP_CD || item.SLONGNAME || "UNKNOWN").toUpperCase();
        return {
          id: sha256(["BSE", symbol, receivedAt, url, item.HEADLINE].join("|")),
          source: "BSE",
          symbol,
          companyName: item.SLONGNAME || item.SCRIP_CD || "Unknown company",
          title: item.HEADLINE || item.NEWSSUB || "Financial results",
          receivedAt,
          disseminatedAt: item.DISSEM_DT || receivedAt,
          attachmentUrl: url,
          raw: item
        };
      });
  }
}
