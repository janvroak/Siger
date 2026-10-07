"""Graph routing tests with the LLM and Qdrant replaced by fakes."""

import uuid
from typing import Any

import pytest

from app.agents.chat import nodes, run_chat
from app.rag.llm import LLMError, LLMOutputError
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
    def __init__(self, planner: Any, teaching: Any = None) -> None:
        self.replies = {"Planner": planner, "Teaching": teaching}
        self.calls: list[str] = []

    async def chat_json(self, system: str, user: str) -> dict[str, Any]:
        agent = "Planner" if "the Planner of SIGER" in system else "Teaching"
        self.calls.append(agent)
        reply = self.replies[agent]
        if isinstance(reply, Exception):
            raise reply
        return reply

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1, 0.2] for _ in texts]


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch):
    def _wire(fake: FakeLLM, chunks: list[RetrievedChunk]) -> FakeLLM:
        async def search(**_: Any) -> list[RetrievedChunk]:
            return chunks

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
            planner={"route": "course_question", "search_query": "3NF definition"},
            teaching={
                "status": "answered",
                "answer": "3NF removes transitive dependencies [2]. See [2, 3].",
                "cited_excerpts": [2, "3", 2, 9],
            },
        ),
        [chunk(0.7, page=1), chunk(0.6, page=3), chunk(0.5, page=4)],
    )

    result = await run_chat({**COURSE, "question": "What is 3NF?"})

    assert result["status"] == "grounded"
    # Citations are renumbered to match the returned sources list.
    assert result["answer"] == "3NF removes transitive dependencies [1]. See [1, 2]."
    assert [source.page for source in result["sources"]] == [3, 4]
    assert nodes_visited(result) == ["planner", "retrieval", "teaching"]
    assert fake.calls == ["Planner", "Teaching"]


async def test_planner_routes_off_topic_question_to_refusal(wire) -> None:
    fake = wire(FakeLLM(planner={"route": "off_topic"}), [chunk(0.9)])

    result = await run_chat({**COURSE, "question": "Who won the World Cup?"})

    assert result["status"] == "out_of_scope"
    assert "DB201" in result["answer"] and result["sources"] == []
    assert nodes_visited(result) == ["planner", "refusal"]
    assert fake.calls == ["Planner"]


async def test_low_similarity_is_not_in_material_without_teaching_llm(wire) -> None:
    fake = wire(
        FakeLLM(planner={"route": "course_question", "search_query": "triggers"}),
        [chunk(0.05)],
    )

    result = await run_chat({**COURSE, "question": "What is a trigger?"})

    assert result["status"] == "not_in_material"
    assert "couldn't find this in the course material" in result["answer"]
    assert result["sources"] == []
    assert nodes_visited(result) == ["planner", "retrieval", "teaching"]
    assert fake.calls == ["Planner"]


async def test_teaching_reports_insufficient_context(wire) -> None:
    wire(
        FakeLLM(
            planner={"route": "course_question", "search_query": "sharding"},
            teaching={"status": "not_in_material", "answer": "", "cited_excerpts": []},
        ),
        [chunk(0.45)],
    )

    result = await run_chat({**COURSE, "question": "How does sharding work?"})

    assert result["status"] == "not_in_material"
    assert result["sources"] == []


async def test_teaching_off_topic_verdict_goes_to_refusal(wire) -> None:
    wire(
        FakeLLM(
            planner={"route": "course_question", "search_query": "poem"},
            teaching={"status": "off_topic", "answer": ""},
        ),
        [chunk(0.5)],
    )

    result = await run_chat({**COURSE, "question": "Write a poem about tables"})

    assert result["status"] == "out_of_scope"
    assert nodes_visited(result) == ["planner", "retrieval", "teaching", "refusal"]


async def test_malformed_plan_falls_back_to_the_chat_path(wire) -> None:
    wire(
        FakeLLM(
            planner=LLMOutputError("bad json"),
            teaching={
                "status": "answered",
                "answer": "A key [1].",
                "cited_excerpts": [],
            },
        ),
        [chunk(0.8)],
    )

    result = await run_chat({**COURSE, "question": "What is a key?"})

    assert result["status"] == "grounded"
    assert result["search_query"] == "What is a key?"
    assert len(result["sources"]) == 1  # uncited answers still show their context


async def test_provider_failure_propagates(wire) -> None:
    wire(FakeLLM(planner=LLMError("timeout")), [])

    with pytest.raises(LLMError):
        await run_chat({**COURSE, "question": "What is a key?"})
