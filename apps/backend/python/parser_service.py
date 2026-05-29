import io
import json
import re
import sys
import time
from urllib.request import Request, urlopen

from pypdf import PdfReader


HEADERS = {
    "accept": "application/pdf,text/plain,*/*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    ),
}


def fetch_bytes(url, timeout=8):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=timeout) as response:
        return response.read()


def pdf_text(data):
    reader = PdfReader(io.BytesIO(data))
    pages = []
    empty_pages = 0
    for page in reader.pages[:10]:
        text = page.extract_text() or ""
        if len(text.strip()) < 25:
            empty_pages += 1
        pages.append(text)
    return {
        "text": "\n".join(pages)[:150000],
        "pages": pages,
        "pageCountRead": min(len(reader.pages), 10),
        "emptyPageCount": empty_pages,
    }


def number(value):
    if value is None:
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def percent_after(text, phrases):
    for phrase in phrases:
        match = re.search(rf"{phrase}[^\d-]{{0,40}}(-?\d+(?:\.\d+)?)\s*%", text, re.I)
        if match:
            return number(match.group(1))
    return None


def numeric_tokens(text):
    return [number(token) for token in re.findall(r"-?\d[\d,]*(?:\.\d+)?", text)]


def useful_numbers(values, max_abs=None):
    cleaned = []
    for value in values:
        if value is None:
            continue
        if value in (0, 1, 2, 3, 4, 5, 12, 31, 2025, 2026, 2027):
            continue
        if max_abs is not None and abs(value) > max_abs:
            continue
        cleaned.append(value)
    return cleaned


def row_values(text, names, max_abs=None):
    for name in names:
        pattern = rf"{name}[^\n\d-]*(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)"
        match = re.search(pattern, text, re.I)
        if match:
            values = useful_numbers([number(match.group(1)), number(match.group(2))], max_abs)
            if len(values) >= 2:
                return values[0], values[1]
    return None, None


def row_values_from_lines(text, names, max_abs=None):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        lower_line = line.lower()
        if not any(name in lower_line for name in names):
            continue
        window = " ".join(lines[index : index + 4])
        after_label = window
        for name in names:
            position = window.lower().find(name)
            if position >= 0:
                after_label = window[position + len(name):]
                break
        values = useful_numbers(numeric_tokens(after_label), max_abs)
        if len(values) >= 2:
            return values[0], values[1]
    return None, None


def best_row_values(text, flat, names, max_abs=None):
    current, previous = row_values(flat, names, max_abs)
    if current is not None or previous is not None:
        return current, previous
    return row_values_from_lines(text, names, max_abs)


def detect_amount_unit(text):
    lower = text.lower()
    patterns = [
        (r"(?:rs\.?|inr|₹|amount)[^\n.]{0,80}crores?", "crore"),
        (r"(?:rs\.?|inr|₹|amount)[^\n.]{0,80}lakhs?", "lakh"),
        (r"(?:rs\.?|inr|₹|amount)[^\n.]{0,80}lacs?", "lakh"),
        (r"(?:rs\.?|inr|₹|amount)[^\n.]{0,80}millions?", "million"),
        (r"(?:rs\.?|inr|₹|amount)[^\n.]{0,80}thousands?", "thousand"),
        (r"rupees[^\n.]{0,30}crores?", "crore"),
        (r"rupees[^\n.]{0,30}lakhs?", "lakh"),
        (r"in\s+crores?", "crore"),
        (r"in\s+lakhs?", "lakh"),
        (r"in\s+lacs?", "lakh"),
    ]
    for pattern, unit in patterns:
        if re.search(pattern, lower, re.I):
            return unit
    return None


def sanitize_eps(current, previous):
    # EPS is per share. Values above this are almost always table-extraction mistakes.
    if current is not None and abs(current) > 10000:
        current = None
    if previous is not None and abs(previous) > 10000:
        previous = None
    return current, previous


def sanitize_growth(value):
    if value is None:
        return None
    if abs(value) > 1000:
        return None
    return value


def evidence_for_metric(pages, names, current_value):
    if not pages:
        return None
    current_text = None
    if current_value is not None:
        current_text = str(current_value).rstrip("0").rstrip(".")
    for page_index, page_text in enumerate(pages[:10]):
        lines = [line.strip() for line in page_text.splitlines() if line.strip()]
        for line_index, line in enumerate(lines):
            lower_line = line.lower()
            if not any(name in lower_line for name in names):
                continue
            window_lines = lines[line_index : line_index + 5]
            snippet = " ".join(window_lines)
            if current_text and current_text not in snippet.replace(",", ""):
                nearby = " ".join(lines[max(0, line_index - 2) : line_index + 8])
                snippet = nearby
            return {
                "page": page_index + 1,
                "snippet": re.sub(r"\s+", " ", snippet)[:700],
                "matchedLabels": names[:3],
                "locatorType": "text-snippet",
                "precision": "page-and-snippet",
                "note": "The verification view renders this PDF page and highlights the matched label when the text layer supports it.",
            }
    return None


def pct_change(current, previous):
    if current is None or previous in (None, 0):
        return None
    return round(((current - previous) / abs(previous)) * 100, 2)


def extract_metrics(text, mode, pdf_stats=None, pages=None):
    flat = re.sub(r"\s+", " ", text)
    lower = flat.lower()
    amount_unit = detect_amount_unit(text[:12000])
    revenue_labels = [
        "revenue from operations",
        "total income",
        "total revenue",
        "revenue",
        "sales",
    ]
    profit_labels = [
        "profit after tax",
        "net profit after tax",
        "net profit",
        "profit for the period",
        "pat",
    ]
    eps_labels = ["basic eps", "diluted eps", "earnings per share", "eps"]

    revenue_current, revenue_previous = best_row_values(
        text,
        flat,
        revenue_labels,
    )
    profit_current, profit_previous = best_row_values(
        text,
        flat,
        profit_labels,
    )
    eps_current, eps_previous = best_row_values(
        text,
        flat,
        eps_labels,
        max_abs=10000,
    )
    eps_current, eps_previous = sanitize_eps(eps_current, eps_previous)

    revenue_growth = sanitize_growth(pct_change(revenue_current, revenue_previous))
    profit_growth = sanitize_growth(pct_change(profit_current, profit_previous))
    eps_growth = sanitize_growth(pct_change(eps_current, eps_previous))

    if revenue_growth is None:
        revenue_growth = percent_after(
            lower,
            ["revenue from operations increased", "revenue increased", "total income increased", "sales increased"],
        )
    if profit_growth is None:
        profit_growth = percent_after(
            lower,
            ["net profit increased", "profit after tax increased", "pat increased", "net profit grew"],
        )
    if eps_growth is None:
        eps_growth = sanitize_growth(percent_after(lower, ["eps increased", "eps grew"]))

    filled = len([value for value in [revenue_growth, profit_growth, eps_growth, revenue_current, profit_current] if value is not None])
    confidence = min(0.9, 0.45 + filled * 0.09)
    if amount_unit is None and (revenue_current is not None or profit_current is not None):
        confidence = min(confidence, 0.62)

    extraction_warning = None
    if filled == 0 and pdf_stats and pdf_stats.get("emptyPageCount", 0) >= 1:
        extraction_warning = "Financial table may be image-based; OCR/table extraction is needed."

    return {
        "revenueGrowthPct": revenue_growth,
        "profitGrowthPct": profit_growth,
        "epsGrowthPct": eps_growth,
        "ebitdaMarginChangePct": percent_after(
            lower,
            ["ebitda margin expanded by", "operating margin expanded by", "margin expanded by"],
        ),
        "revenueCrore": revenue_current,
        "previousRevenueCrore": revenue_previous,
        "profitCrore": profit_current,
        "previousProfitCrore": profit_previous,
        "eps": eps_current,
        "previousEps": eps_previous,
        "amountUnit": amount_unit,
        "amountUnitMissing": amount_unit is None and (revenue_current is not None or profit_current is not None),
        "currency": "INR",
        "extractionWarning": extraction_warning,
        "pdfStats": pdf_stats or {},
        "evidence": {
            "revenue": evidence_for_metric(pages or [], revenue_labels, revenue_current),
            "profit": evidence_for_metric(pages or [], profit_labels, profit_current),
            "eps": evidence_for_metric(pages or [], eps_labels, eps_current),
        },
        "parserConfidence": confidence,
        "extractionMode": mode,
        "textPreview": flat[:420],
        "auditNotes": [
            "Values are extracted directly from the linked filing PDF when available.",
            "If a current/previous table pair is found, growth is recalculated from those two numbers.",
            "Low confidence means the filing layout needs manual verification.",
        ],
    }


def main():
    started = time.perf_counter()
    payload = json.loads(sys.stdin.read() or "{}")
    filing = payload.get("filing") or {}

    if filing.get("inlineText"):
        text = filing["inlineText"]
        mode = "python-inline-text"
    elif filing.get("attachmentUrl"):
        data = fetch_bytes(filing["attachmentUrl"])
        parsed_pdf = pdf_text(data)
        text = parsed_pdf["text"]
        pages = parsed_pdf["pages"]
        pdf_stats = {
            "pageCountRead": parsed_pdf["pageCountRead"],
            "emptyPageCount": parsed_pdf["emptyPageCount"],
        }
        mode = "python-pdf-text"
    else:
        text = ""
        pages = []
        pdf_stats = {}
        mode = "python-empty"

    if filing.get("inlineText"):
        pdf_stats = {}
        pages = [text]

    metrics = extract_metrics(text, mode, pdf_stats, pages)
    metrics["parseDurationMs"] = round((time.perf_counter() - started) * 1000)
    print(json.dumps({"metrics": metrics}))


if __name__ == "__main__":
    main()
