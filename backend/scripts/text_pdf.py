"""Write a plain text PDF without extra dependencies (for demo submissions)."""

import textwrap

PAGE_WIDTH, PAGE_HEIGHT = 612, 792
MARGIN, LEADING, FONT_SIZE = 56, 15, 11
WRAP = 88
LINES_PER_PAGE = (PAGE_HEIGHT - 2 * MARGIN) // LEADING


def text_pdf(text: str) -> bytes:
    """A PDF whose text layer is `text`, wrapped and paginated (Helvetica)."""
    lines: list[str] = []
    for paragraph in text.split("\n"):
        lines.extend(textwrap.wrap(paragraph, WRAP) or [""])
    pages = [
        lines[start : start + LINES_PER_PAGE]
        for start in range(0, max(len(lines), 1), LINES_PER_PAGE)
    ]

    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog = add(b"")  # filled in once the page tree exists
    tree = add(b"")
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_ids = []
    for page_lines in pages:
        rows = [
            f"BT /F1 {FONT_SIZE} Tf {MARGIN} {PAGE_HEIGHT - MARGIN} Td {LEADING} TL"
        ]
        rows += [f"({_escape(line)}) Tj T*" for line in page_lines]
        rows.append("ET")
        stream = "\n".join(rows).encode("latin-1", "replace")
        content = add(
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"
        )
        page_ids.append(
            add(
                (
                    f"<< /Type /Page /Parent {tree} 0 R "
                    f"/MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                    f"/Resources << /Font << /F1 {font} 0 R >> >> "
                    f"/Contents {content} 0 R >>"
                ).encode()
            )
        )
    kids = " ".join(f"{page} 0 R" for page in page_ids)
    objects[tree - 1] = (
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()
    )
    objects[catalog - 1] = f"<< /Type /Catalog /Pages {tree} 0 R >>".encode()

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)


def _escape(line: str) -> str:
    # Typographic characters outside Latin-1 are replaced with ASCII ones.
    line = (
        line.replace("—", "-")
        .replace("–", "-")
        .replace("→", "->")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
    )
    return line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
