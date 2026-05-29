import io
import json
import sys
from urllib.request import Request, urlopen

import pypdfium2 as pdfium
from PIL import ImageDraw


HEADERS = {
    "accept": "application/pdf,*/*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    ),
}


def fetch_bytes(url, timeout=12):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=timeout) as response:
        return response.read()


def draw_search_highlight(page, image, search_text, scale):
    if not search_text:
        return False
    textpage = page.get_textpage()
    searcher = textpage.search(search_text, match_case=False, consecutive=False)
    occurrence = searcher.get_next()
    if not occurrence:
        return False

    start, count = occurrence
    try:
        rect_count = textpage.count_rects(start, count)
    except Exception:
        return False

    draw = ImageDraw.Draw(image, "RGBA")
    image_height = image.height
    highlighted = False
    for rect_index in range(rect_count):
        left, bottom, right, top = textpage.get_rect(rect_index)
        x1 = max(0, int(left * scale) - 10)
        y1 = max(0, int(image_height - top * scale) - 8)
        x2 = min(image.width, int(right * scale) + 10)
        y2 = min(image.height, int(image_height - bottom * scale) + 8)
        if x2 <= x1 or y2 <= y1:
            continue
        draw.rectangle((x1, y1, x2, y2), fill=(53, 216, 159, 58), outline=(53, 216, 159, 230), width=4)
        highlighted = True
    return highlighted


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    url = payload["url"]
    page_number = max(1, int(payload.get("page") or 1))
    search_text = payload.get("search") or ""
    scale = 1.9
    pdf = pdfium.PdfDocument(fetch_bytes(url))
    page_index = min(page_number - 1, len(pdf) - 1)
    page = pdf[page_index]
    bitmap = page.render(scale=scale)
    image = bitmap.to_pil()
    draw_search_highlight(page, image, search_text, scale)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    sys.stdout.buffer.write(output.getvalue())


if __name__ == "__main__":
    main()
