import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, urljoin, urlparse, parse_qs, urlunparse
from urllib.request import Request, urlopen


HEADERS = {
    "accept": "application/json,text/plain,*/*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    ),
}
IST = timezone(timedelta(hours=5, minutes=30))


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_exchange_time(*values):
    for value in values:
        if not value:
            continue
        raw = str(value)
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%d-%b-%Y %H:%M:%S",
            "%d %b %Y %H:%M:%S",
        ):
            try:
                parsed = datetime.strptime(raw, fmt)
                return parsed.replace(tzinfo=IST).astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
            except ValueError:
                pass
    return now_iso()


def first_value(*values):
    for value in values:
        if value:
            return str(value)
    return None


def fetch_json(url, referer=None, origin=None, timeout=5):
    headers = dict(HEADERS)
    if referer:
        headers["referer"] = referer
    if origin:
        headers["origin"] = origin
    req = Request(url, headers=headers)
    with urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def stable_id(parts):
    return hashlib.sha256("|".join(str(part or "") for part in parts).encode()).hexdigest()


def contains_result_text(*values):
    text = " ".join(str(value or "") for value in values).lower()
    return (
        "financial result" in text
        or "financial results" in text
        or "audited result" in text
        or "unaudited result" in text
        or ("result" in text and "quarter" in text)
    )


def is_actual_result_disclosure(*values):
    text = " ".join(str(value or "") for value in values).lower()
    blocked = (
        "board meeting intimation" in text
        or "meeting of the board of directors is scheduled" in text
        or "is scheduled on" in text
        or "rescheduled" in text
        or "postponement" in text
        or "press release" in text
        or "newspaper" in text
        or "audio recording" in text
        or "recording of the presentation" in text
        or "investor presentation" in text
        or "presentation on the audited financial" in text
    )
    has_financial_result = "financial result" in text or "financial results" in text
    has_period = "quarter" in text or "period ended" in text or "year ended" in text
    return has_financial_result and has_period and not blocked


def matches_watchlist(row, watchlist, *fields):
    if not watchlist:
        return True
    haystack = " ".join(str(row.get(field, "")) for field in fields).upper()
    return any(symbol in haystack for symbol in watchlist)


def absolute_nse_attachment(href):
    if not href:
        return None
    if href.startswith("http"):
        return href
    return urljoin("https://www.nseindia.com", href)


def normalize_nse(rows, watchlist):
    filings = []
    for row in rows if isinstance(rows, list) else rows.get("data", []):
        result_text = [row.get("desc"), row.get("subject"), row.get("attchmntText")]
        if not is_actual_result_disclosure(*result_text):
            continue
        if not matches_watchlist(row, watchlist, "symbol", "sm_name", "companyName", "desc"):
            continue
        attachment = absolute_nse_attachment(row.get("attchmntFile") or row.get("attachmentFile"))
        received_at = parse_exchange_time(row.get("sort_date"), row.get("exchdisstime"), row.get("an_dt"))
        symbol = str(row.get("symbol") or row.get("sm_name") or "UNKNOWN").upper()
        filings.append(
            {
                "id": stable_id(["NSE", symbol, received_at, attachment, row.get("desc")]),
                "source": "NSE",
                "symbol": symbol,
                "companyName": row.get("sm_name") or row.get("companyName") or symbol,
                "title": row.get("desc") or row.get("subject") or "Financial results",
                "receivedAt": received_at,
                "disseminatedAt": row.get("exchdisstime") or row.get("an_dt") or received_at,
                "portalPublishedAt": first_value(row.get("exchdisstime"), row.get("an_dt"), row.get("sort_date")),
                "attachmentUrl": attachment,
                "portalUrl": os.environ.get("NSE_REFERER_URL"),
                "raw": row,
            }
        )
    return filings


def bse_attachment(row):
    file_name = row.get("ATTACHMENTNAME") or row.get("NSURL")
    if not file_name:
        return None
    if str(file_name).startswith("http"):
        return file_name
    return f"{os.environ.get('BSE_ATTACHMENT_ROOT').rstrip('/')}/{file_name}"


def normalize_bse(payload, watchlist):
    rows = payload.get("Table") or payload.get("data") or []
    filings = []
    for row in rows:
        result_text = [
            row.get("HEADLINE"),
            row.get("SUBCATNAME"),
            row.get("NEWSSUB"),
            row.get("MORE"),
            row.get("CATEGORYNAME"),
        ]
        if not is_actual_result_disclosure(*result_text):
            continue
        if not matches_watchlist(row, watchlist, "SCRIP_CD", "SLONGNAME", "HEADLINE", "NEWSSUB"):
            continue
        attachment = bse_attachment(row)
        received_at = parse_exchange_time(row.get("NEWS_DT"), row.get("DT_TM"))
        symbol = str(row.get("SCRIP_CD") or row.get("SLONGNAME") or "UNKNOWN").upper()
        filings.append(
            {
                "id": stable_id(["BSE", symbol, received_at, attachment, row.get("HEADLINE")]),
                "source": "BSE",
                "symbol": symbol,
                "companyName": row.get("SLONGNAME") or symbol,
                "title": row.get("HEADLINE") or row.get("NEWSSUB") or "Financial results",
                "receivedAt": received_at,
                "disseminatedAt": row.get("DISSEM_DT") or received_at,
                "portalPublishedAt": first_value(row.get("DISSEM_DT"), row.get("NEWS_DT"), row.get("DT_TM")),
                "attachmentUrl": attachment,
                "portalUrl": os.environ.get("BSE_REFERER_URL"),
                "raw": row,
            }
        )
    return filings


def bse_date_urls(base_url):
    dates = [
        datetime.now(IST).strftime("%Y%m%d"),
        (datetime.now(IST) - timedelta(days=1)).strftime("%Y%m%d"),
    ]
    parsed = urlparse(base_url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    urls = []
    for date in dates:
        next_query = {key: values[-1] if values else "" for key, values in query.items()}
        next_query["strPrevDate"] = date
        next_query["strToDate"] = date
        urls.append(urlunparse(parsed._replace(query=urlencode(next_query))))
    return urls


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    watchlist = set(payload.get("watchlist") or [])
    started = time.perf_counter()
    sources = []
    filings = []

    try:
        nse = fetch_json(os.environ["NSE_ANNOUNCEMENTS_URL"], os.environ.get("NSE_REFERER_URL"))
        nse_filings = normalize_nse(nse, watchlist)
        sources.append({"name": "NSE", "ok": True, "count": len(nse_filings)})
        filings.extend(nse_filings)
    except Exception as exc:
        sources.append({"name": "NSE", "ok": False, "error": str(exc)})

    try:
        bse_filings = []
        seen = set()
        for url in bse_date_urls(os.environ["BSE_ANNOUNCEMENTS_URL"]):
            bse = fetch_json(url, os.environ.get("BSE_REFERER_URL"), "https://www.bseindia.com")
            for filing in normalize_bse(bse, watchlist):
                if filing["id"] in seen:
                    continue
                seen.add(filing["id"])
                bse_filings.append(filing)
        sources.append({"name": "BSE", "ok": True, "count": len(bse_filings)})
        filings.extend(bse_filings)
    except Exception as exc:
        sources.append({"name": "BSE", "ok": False, "error": str(exc)})

    print(
        json.dumps(
            {
                "polledAt": now_iso(),
                "durationMs": round((time.perf_counter() - started) * 1000),
                "sources": sources,
                "filings": filings,
            }
        )
    )


if __name__ == "__main__":
    main()
