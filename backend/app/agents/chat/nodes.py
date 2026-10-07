"""Nodes of the Chat / Teaching graph (SIGER architecture, Figure 3)."""

import re
from typing import Any

from app.agents.chat.prompts import (
    NOT_IN_MATERIAL_ANSWER,
    OUT_OF_SCOPE_ANSWER,
    PLANNER_SYSTEM,
    TEACHING_SYSTEM,
)
from app.agents.chat.state import ChatState, ChatTurn, TraceStep
from app.core.config import settings
from app.rag import llm, vector_store
from app.rag.llm import LLMOutputError
from app.rag.vector_store import RetrievedChunk

_CITATION = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")

HISTORY_TURNS = 6
HISTORY_CHARS = 800


async def planner(state: ChatState) -> dict[str, Any]:
    """Route the request and turn the question into a standalone search query."""
    prompt = PLANNER_SYSTEM.format(
        course_code=state["course_code"],
        course_title=state["course_title"],
        course_description=state["course_description"],
    )
    message = (
        f"{_render_history(state.get('history', []))}"
        f"Student's latest message:\n{state['question']}"
    )
    try:
        decision = await llm.chat_json(prompt, message)
    except LLMOutputError:
        # A malformed plan should not block the student; take the chat path.
        decision = {}

    route = "off_topic" if decision.get("route") == "off_topic" else "course_question"
    search_query = str(decision.get("search_query") or "").strip() or state["question"]
    reason = str(decision.get("reason") or "").strip()
    detail = f"route={route}; query={search_query!r}"
    return {
        "route": route,
        "search_query": search_query,
        "trace": [_step("planner", f"{detail}; {reason}" if reason else detail)],
    }


async def retrieval(state: ChatState) -> dict[str, Any]:
    """Fetch the selected course's most relevant chunks from Qdrant."""
    [vector] = await llm.embed([state["search_query"]])
    candidates = await vector_store.search(
        course_id=state["course_id"], vector=vector, limit=settings.retrieval_top_k
    )
    relevant = [c for c in candidates if c.score >= settings.retrieval_min_score]

    top = f"{candidates[0].score:.2f}" if candidates else "n/a"
    detail = (
        f"{len(relevant)} of {len(candidates)} chunks above similarity "
        f"{settings.retrieval_min_score:.2f} (top {top})"
    )
    return {"chunks": relevant, "trace": [_step("retrieval", detail)]}


async def teaching(state: ChatState) -> dict[str, Any]:
    """Answer strictly from the retrieved course context."""
    chunks = state.get("chunks", [])
    if not chunks:
        # Nothing in the course material is close enough; don't ask the LLM to
        # answer from thin air.
        return _not_in_material(state, "no relevant course material; LLM not called")

    prompt = TEACHING_SYSTEM.format(
        course_code=state["course_code"], course_title=state["course_title"]
    )
    excerpts = "\n\n".join(
        f"[{number}] ({chunk.filename}, page {chunk.page})\n{chunk.text}"
        for number, chunk in enumerate(chunks, start=1)
    )
    message = (
        f"Course material excerpts:\n\n{excerpts}\n\n"
        f"{_render_history(state.get('history', []))}"
        f"Student's question:\n{state['question']}"
    )
    result = await llm.chat_json(prompt, message)

    status = result.get("status")
    if status == "off_topic":
        return {
            "status": "out_of_scope",
            "trace": [_step("teaching", "model judged the question off-topic")],
        }

    answer = str(result.get("answer") or "").strip()
    if status != "answered" or not answer:
        return _not_in_material(state, "model found the excerpts insufficient")

    sources, answer = _cited(chunks, result.get("cited_excerpts"), answer)
    return {
        "status": "grounded",
        "answer": answer,
        "sources": sources,
        "trace": [
            _step("teaching", f"grounded answer citing {len(sources)} excerpt(s)")
        ],
    }


async def refusal(state: ChatState) -> dict[str, Any]:
    """Politely decline questions outside the selected course."""
    return {
        "status": "out_of_scope",
        "answer": OUT_OF_SCOPE_ANSWER.format(
            course_code=state["course_code"], course_title=state["course_title"]
        ),
        "sources": [],
        "trace": [_step("refusal", "out-of-scope question politely declined")],
    }


def _not_in_material(state: ChatState, detail: str) -> dict[str, Any]:
    return {
        "status": "not_in_material",
        "answer": NOT_IN_MATERIAL_ANSWER.format(course_code=state["course_code"]),
        "sources": [],
        "trace": [_step("teaching", f"not in course material: {detail}")],
    }


def _cited(
    chunks: list[RetrievedChunk], cited: object, answer: str
) -> tuple[list[RetrievedChunk], str]:
    """Keep only the cited excerpts and renumber [n] markers to match them."""
    numbers = [
        int(item)
        for item in (cited if isinstance(cited, list) else [])
        if isinstance(item, int) or (isinstance(item, str) and item.isdigit())
    ]
    valid = [n for n in dict.fromkeys(numbers) if 1 <= n <= len(chunks)]
    if not valid:
        # An answer without valid citations still came only from these excerpts.
        return chunks, answer

    renumbered = {old: new for new, old in enumerate(valid, start=1)}

    def replace(match: re.Match[str]) -> str:
        refs = [renumbered.get(int(n)) for n in re.findall(r"\d+", match.group(1))]
        kept = [str(ref) for ref in refs if ref is not None]
        return f"[{', '.join(kept)}]" if kept else ""

    answer = _CITATION.sub(replace, answer)
    return [chunks[number - 1] for number in valid], answer


def _render_history(history: list[ChatTurn]) -> str:
    recent = history[-HISTORY_TURNS:]
    if not recent:
        return ""
    lines = [
        f"{turn['role'].capitalize()}: {turn['content'][:HISTORY_CHARS]}"
        for turn in recent
    ]
    return "Recent conversation:\n" + "\n".join(lines) + "\n\n"


def _step(node: str, detail: str) -> TraceStep:
    return {"node": node, "detail": detail}
