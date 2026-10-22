"""Graph routing tests with the LLM and Qdrant replaced by fakes."""

import uuid
from typing import Any

import pytest

from app.agents.chat import nodes, run_chat
from app.rag.llm import LLMError
from app.rag.vector_store import RetrievedChunk

pytestmark = pytest.mark.anyio

COURSE = {
    "course_id": uuid.uuid4(),
    "course_code": "DB201",
    "course_title": "Database Systems",
    "course_description": "Relational databases.",
    "history": [],
}


def chunk(score: float, page: int = 1) -> RetrievedChunk:
    return RetrievedChunk(
        material_id=str(uuid.uuid4()),
        filename="notes.pdf",
        page=page,
        chunk_index=page,
        text=f"Excerpt from page {page}.",
        score=score,
    )


class FakeLLM:
    """The teaching LLM plus embeddings; records every call."""

    def __init__(self, teaching: Any = None) -> None:
        self.teaching = teaching
        self.calls: list[str] = []
        self.embedded: list[list[str]] = []

    async def chat_json(self, system: str, user: str) -> dict[str, Any]:
        self.calls.append("Teaching")
        if isinstance(self.teaching, Exception):
            raise self.teaching
        return self.teaching

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.embedded.append(texts)
        return [[float(i), 0.2] for i, _ in enumerate(texts)]


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch):
    def _wire(fake: FakeLLM, chunks: Any) -> FakeLLM:
        async def search(*, vector: list[float], **_: Any) -> list[RetrievedChunk]:
            # A list of results per query, or the same chunks for every query.
            return chunks[int(vector[0])] if isinstance(chunks, dict) else chunks

        monkeypatch.setattr(nodes.llm, "chat_json", fake.chat_json)
        monkeypatch.setattr(nodes.llm, "embed", fake.embed)
        monkeypatch.setattr(nodes.vector_store, "search", search)
        return fake

    return _wire


def nodes_visited(result: dict[str, Any]) -> list[str]:
    return [step["node"] for step in result["trace"]]


async def test_grounded_answer_cites_only_used_excerpts(wire) -> None:
    fake = wire(
        FakeLLM(
            {
                "status": "answered",
                "answer": "3NF removes transitive dependencies [2]. See [2, 3].",
                "cited_excerpts": [2, "3", 2, 9],
            }
        ),
        [chunk(0.7, page=1), chunk(0.6, page=3), chunk(0.5, page=4)],
    )

    result = await run_chat({**COURSE, "question": "What is 3NF?"})

    assert result["status"] == "grounded"
    # Citations are renumbered to match the returned sources list.
    assert result["answer"] == "3NF removes transitive dependencies [1]. See [1, 2]."
    assert [source.page for source in result["sources"]] == [3, 4]
    assert nodes_visited(result) == ["retrieve", "check_relevance", "answer"]
    assert fake.calls == ["Teaching"]  # one LLM call per answered question


async def test_irrelevant_question_is_refused_without_any_llm_call(wire) -> None:
    fake = wire(FakeLLM(), [chunk(0.05)])

    result = await run_chat({**COURSE, "question": "Who won the World Cup?"})

    assert result["status"] == "not_in_material"
    assert "couldn't find this in the course material" in result["answer"]
    assert result["sources"] == []
    assert nodes_visited(result) == ["retrieve", "check_relevance", "refuse"]
    assert fake.calls == []


async def test_teaching_reports_insufficient_context(wire) -> None:
    wire(
        FakeLLM({"status": "not_in_material", "answer": "", "cited_excerpts": []}),
        [chunk(0.45)],
    )

    result = await run_chat({**COURSE, "question": "How does sharding work?"})

    assert result["status"] == "not_in_material"
    assert result["sources"] == []


async def test_matching_words_but_off_topic_request_is_refused(wire) -> None:
    wire(FakeLLM({"status": "off_topic", "answer": ""}), [chunk(0.5)])

    result = await run_chat({**COURSE, "question": "Write a poem about tables"})

    assert result["status"] == "out_of_scope"
    assert "DB201" in result["answer"]
    assert nodes_visited(result) == ["retrieve", "check_relevance", "answer", "refuse"]


async def test_follow_up_is_searched_with_the_previous_question(wire) -> None:
    alone, together = chunk(0.1, page=1), chunk(0.6, page=2)
    fake = wire(
        FakeLLM(
            {"status": "answered", "answer": "Anomalies [1].", "cited_excerpts": [1]}
        ),
        {0: [alone], 1: [together]},
    )

    result = await run_chat(
        {
            **COURSE,
            "question": "And its disadvantages?",
            "history": [
                {"role": "user", "content": "What is denormalization?"},
                {"role": "assistant", "content": "It adds redundancy..."},
            ],
        }
    )

    # One embedding call with both queries; the follow-up alone matched nothing.
    assert fake.embedded == [
        ["And its disadvantages?", "What is denormalization?\nAnd its disadvantages?"]
    ]
    assert result["status"] == "grounded"
    assert [source.page for source in result["sources"]] == [2]


async def test_provider_failure_propagates(wire) -> None:
    wire(FakeLLM(LLMError("timeout")), [chunk(0.8)])

    with pytest.raises(LLMError):
        await run_chat({**COURSE, "question": "What is a key?"})
