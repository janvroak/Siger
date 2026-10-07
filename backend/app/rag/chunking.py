import re
from dataclasses import dataclass

from app.rag.pdf import PageText

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


@dataclass(frozen=True)
class Chunk:
    index: int  # position within the document
    page: int
    text: str


def chunk_pages(pages: list[PageText], size: int, overlap: int) -> list[Chunk]:
    """Split each page into overlapping chunks that never span two pages.

    Keeping chunks inside one page lets every answer cite an exact page.
    """
    if overlap >= size:
        raise ValueError("chunk overlap must be smaller than chunk size")

    chunks: list[Chunk] = []
    for page in pages:
        for text in _split(page.text, size, overlap):
            chunks.append(Chunk(index=len(chunks), page=page.page, text=text))
    return chunks


def _split(text: str, size: int, overlap: int) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    length = 0

    for sentence in _sentences(text, size):
        if current and length + len(sentence) + 1 > size:
            chunks.append(" ".join(current))
            # Carry trailing sentences forward so context spans the boundary.
            carried: list[str] = []
            carried_length = 0
            for previous in reversed(current):
                if carried_length + len(previous) + 1 > overlap:
                    break
                carried.insert(0, previous)
                carried_length += len(previous) + 1
            current, length = carried, carried_length
        current.append(sentence)
        length += len(sentence) + 1

    if current:
        chunks.append(" ".join(current))
    return chunks


def _sentences(text: str, size: int) -> list[str]:
    """Split into sentences; hard-cut any sentence longer than size."""
    sentences: list[str] = []
    for paragraph in text.split("\n\n"):
        # PDF extraction hard-wraps lines; rejoin them before splitting.
        paragraph = " ".join(paragraph.split())
        for sentence in _SENTENCE_END.split(paragraph):
            for start in range(0, len(sentence), size):
                sentences.append(sentence[start : start + size])
    return [sentence for sentence in sentences if sentence]
