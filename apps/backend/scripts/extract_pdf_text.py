import io
import sys

from pypdf import PdfReader


def main() -> int:
    data = sys.stdin.buffer.read()
    if not data:
        return 0

    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages[:8]:
        text = page.extract_text() or ""
        pages.append(text)

    sys.stdout.write("\n".join(pages)[:120000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
