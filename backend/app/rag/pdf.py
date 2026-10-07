import io
import re
from dataclasses import dataclass

from pypdf import PdfReader
from pypdf.errors import PyPdfError


class InvalidPDFError(ValueError):
    """The upload is not a readable PDF or has no extractable text."""


@dataclass(frozen=True)
class PageText:
    page: int  # 1-based, as shown to students
    text: str


@dataclass(frozen=True)
class ExtractedPDF:
    page_count: int
    pages: list[PageText]  # only pages with text


def extract_pdf(data: bytes) -> ExtractedPDF:
    """Return the cleaned text of every page that has any."""
    if not data.lstrip().startswith(b"%PDF"):
        raise InvalidPDFError("The file is not a PDF")

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise InvalidPDFError("Encrypted PDFs are not supported")
        raw_pages = [page.extract_text() or "" for page in reader.pages]
    except InvalidPDFError:
        raise
    except (PyPdfError, ValueError, KeyError, TypeError) as exc:
        raise InvalidPDFError("The PDF could not be read") from exc

    pages = [
        PageText(page=number, text=cleaned)
        for number, raw in enumerate(raw_pages, start=1)
        if (cleaned := _clean(raw))
    ]
    if not pages:
        raise InvalidPDFError(
            "The PDF has no extractable text (scanned PDFs are not supported)"
        )
    return ExtractedPDF(page_count=len(raw_pages), pages=pages)


def _clean(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join hyphenated line breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
