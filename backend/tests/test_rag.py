from pathlib import Path

import pytest

from app.rag.chunking import chunk_pages
from app.rag.llm import LLMOutputError, _parse_json_object
from app.rag.pdf import InvalidPDFError, PageText, extract_pdf

DEMO_PDF = Path(__file__).resolve().parents[1] / "demo_data" / "db201_course_notes.pdf"


def test_chunks_stay_within_size_and_page() -> None:
    text = "\n\n".join(
        " ".join(f"Sentence {p}.{s} has a few words." for s in range(12))
        for p in range(6)
    )
    chunks = chunk_pages([PageText(1, text), PageText(2, "Short page.")], 300, 60)

    assert all(len(chunk.text) <= 300 for chunk in chunks)
    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert chunks[-1].page == 2 and chunks[-1].text == "Short page."
    assert {chunk.page for chunk in chunks[:-1]} == {1}


def test_chunks_overlap_by_whole_sentences() -> None:
    text = " ".join(f"Sentence {i} is here." for i in range(40))
    first, second, *_ = chunk_pages([PageText(1, text)], 200, 50)

    # The second chunk opens with whole sentences carried from the end of the first.
    opening_sentence = second.text.split(". ")[0] + "."
    assert opening_sentence in first.text
    assert first.text.endswith(
        second.text[: len(first.text) - first.text.index(opening_sentence)]
    )


def test_overlong_text_without_punctuation_is_hard_cut() -> None:
    chunks = chunk_pages([PageText(3, "x" * 2500)], 1000, 150)
    assert [len(chunk.text) for chunk in chunks] == [1000, 1000, 500]


def test_extracts_demo_pdf_with_page_numbers() -> None:
    extracted = extract_pdf(DEMO_PDF.read_bytes())

    assert extracted.page_count == len(extracted.pages) > 1
    assert extracted.pages[0].page == 1
    assert "Relational Model" in extracted.pages[0].text


@pytest.mark.parametrize(
    "data",
    [b"", b"hello world", b"%PDF-1.4 truncated garbage"],
    ids=["empty", "not-a-pdf", "corrupt-pdf"],
)
def test_rejects_invalid_pdf(data: bytes) -> None:
    with pytest.raises(InvalidPDFError):
        extract_pdf(data)


def test_parses_json_wrapped_in_code_fence() -> None:
    assert _parse_json_object('```json\n{"status": "answered"}\n```') == {
        "status": "answered"
    }


def test_rejects_non_json_output() -> None:
    with pytest.raises(LLMOutputError):
        _parse_json_object("I think the answer is 42.")


def test_rate_limit_without_reset_header_is_still_a_rate_limit() -> None:
    import httpx
    import openai

    from app.rag.llm import LLMRateLimitError, _rate_limited

    response = httpx.Response(429, request=httpx.Request("POST", "http://x"))
    exc = openai.RateLimitError(
        "limited", response=response, body={"message": "Rate limit exceeded"}
    )
    converted = _rate_limited(exc)
    assert isinstance(converted, LLMRateLimitError) and converted.retry_after is None


async def _no_sleep(_: float) -> None:
    return None


def _completion(content: str | None):
    from types import SimpleNamespace

    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


def test_empty_replies_are_retried(monkeypatch) -> None:
    import asyncio

    from app.rag import llm

    replies = [_completion(None), _completion('{"ok": true}')]

    async def create(**_):
        return replies.pop(0)

    fake = type("C", (), {})()
    fake.chat = type("Ch", (), {})()
    fake.chat.completions = type("Co", (), {"create": staticmethod(create)})()
    monkeypatch.setattr(llm, "_client", lambda: fake)
    monkeypatch.setattr(llm.asyncio, "sleep", _no_sleep)
    assert asyncio.run(llm.chat_json("s", "u")) == {"ok": True}
    assert not replies


def test_retries_give_up_after_max_attempts(monkeypatch) -> None:
    import asyncio

    import pytest

    from app.rag import llm

    calls = []

    async def create(**_):
        calls.append(1)
        return _completion("")

    fake = type("C", (), {})()
    fake.chat = type("Ch", (), {})()
    fake.chat.completions = type("Co", (), {"create": staticmethod(create)})()
    monkeypatch.setattr(llm, "_client", lambda: fake)
    monkeypatch.setattr(llm.asyncio, "sleep", _no_sleep)
    monkeypatch.setattr(llm.settings, "llm_max_attempts", 3)
    monkeypatch.setattr(llm, "_chat_slots", None)
    with pytest.raises(llm.LLMError, match="after 3 attempts"):
        asyncio.run(llm.chat_json("s", "u"))
    assert len(calls) == 3


def test_a_call_that_never_returns_times_out_and_is_retried(monkeypatch) -> None:
    import asyncio

    from app.rag import llm

    calls = []
    real_sleep = asyncio.sleep

    async def create(**_):
        calls.append(1)
        if len(calls) == 1:
            await real_sleep(10)  # a stalled provider
        return _completion('{"ok": true}')

    fake = type("C", (), {})()
    fake.chat = type("Ch", (), {})()
    fake.chat.completions = type("Co", (), {"create": staticmethod(create)})()
    monkeypatch.setattr(llm, "_client", lambda: fake)
    monkeypatch.setattr(llm.settings, "llm_timeout_seconds", 0.05)
    monkeypatch.setattr(llm, "_chat_slots", None)

    async def short_backoff(seconds):
        await real_sleep(0 if seconds >= 1 else seconds)

    monkeypatch.setattr(llm.asyncio, "sleep", short_backoff)
    assert asyncio.run(llm.chat_json("s", "u")) == {"ok": True}
    assert len(calls) == 2
