"""Nodes of the lecture chatbot (SIGER revised architecture, Figure 4)."""

import re
from typing import Any

from app.agents.chat.prompts import (
    NOT_IN_MATERIAL_ANSWER,
    OUT_OF_SCOPE_ANSWER,
    TEACHING_SYSTEM,
)
from app.agents.chat.state import ChatState, ChatTurn, TraceStep
from app.core.config import settings
from app.rag import llm, vector_store
from app.rag.vector_store import RetrievedChunk

_CITATION = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")

HISTORY_TURNS = 6
HISTORY_CHARS = 800


async def retrieve(state: ChatState) -> dict[str, Any]:
    """Search the course's lecture material (never the answer keys).

    A follow-up such as "and its disadvantages?" only makes sense with the
    previous question, so when there is one, the question is also searched
    together with it - in the same embedding call - and the best matches of
    both searches are kept. This replaces an LLM query-rewriting step.
    """
    queries = [state["question"]]
    previous = _last_user_turn(state.get("history", []))
    if previous:
        queries.append(f"{previous[:HISTORY_CHARS]}\n{state['question']}")

    vectors = await llm.embed(queries)
    best: dict[tuple[str, int], RetrievedChunk] = {}
    for vector in vectors:
        for chunk in await vector_store.search(
            course_id=state["course_id"], vector=vector, limit=settings.retrieval_top_k
        ):
            key = (chunk.material_id, chunk.chunk_index)
            if key not in best or chunk.score > best[key].score:
                best[key] = chunk
    candidates = sorted(best.values(), key=lambda c: c.score, reverse=True)
    candidates = candidates[: settings.retrieval_top_k]
    detail = f"{len(candidates)} chunk(s) from the slides"
    if previous:
        detail += " (question searched alone and with the previous one)"
    return {
        "search_query": queries[-1],
        "chunks": candidates,
        "trace": [_step("retrieve", detail)],
    }


async def check_relevance(state: ChatState) -> dict[str, Any]:
    """Decide scope from retrieval similarity, before any LLM call."""
    candidates = state.get("chunks", [])
    relevant = [c for c in candidates if c.score >= settings.retrieval_min_score]
    top = f"{candidates[0].score:.2f}" if candidates else "n/a"
    verdict = "relevant" if relevant else "out of scope; LLM not called"
    detail = (
        f"{len(relevant)} of {len(candidates)} above similarity "
        f"{settings.retrieval_min_score:.2f} (top {top}): {verdict}"
    )
    return {"chunks": relevant, "trace": [_step("check_relevance", detail)]}


async def answer(state: ChatState) -> dict[str, Any]:
    """Answer strictly from the relevant lecture excerpts."""
    chunks = state["chunks"]
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
        # The words matched the slides, but the request is not about the course.
        return {
            "status": "out_of_scope",
            "trace": [_step("answer", "model judged the question off-topic")],
        }

    text = str(result.get("answer") or "").strip()
    if status != "answered" or not text:
        return _not_in_material(state, "model found the excerpts insufficient")

    sources, text = _cited(chunks, result.get("cited_excerpts"), text)
    return {
        "status": "grounded",
        "answer": text,
        "sources": sources,
        "trace": [_step("answer", f"grounded answer citing {len(sources)} excerpt(s)")],
    }


async def refuse(state: ChatState) -> dict[str, Any]:
    """Politely decline: nothing relevant in the slides, or not a course question."""
    if state.get("status") == "out_of_scope":
        return {
            "answer": OUT_OF_SCOPE_ANSWER.format(
                course_code=state["course_code"], course_title=state["course_title"]
            ),
            "sources": [],
            "trace": [_step("refuse", "not a course question; politely declined")],
        }
    return {
        "status": "not_in_material",
        "answer": NOT_IN_MATERIAL_ANSWER.format(course_code=state["course_code"]),
        "sources": [],
        "trace": [_step("refuse", "nothing relevant in the slides; politely declined")],
    }


def _not_in_material(state: ChatState, detail: str) -> dict[str, Any]:
    return {
        "status": "not_in_material",
        "answer": NOT_IN_MATERIAL_ANSWER.format(course_code=state["course_code"]),
        "sources": [],
        "trace": [_step("answer", f"not in course material: {detail}")],
    }


def _last_user_turn(history: list[ChatTurn]) -> str:
    for turn in reversed(history):
        if turn["role"] == "user":
            return turn["content"]
    return ""


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
