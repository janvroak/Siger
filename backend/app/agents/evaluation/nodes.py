"""Nodes of the evaluation graph (SIGER revised architecture, Figure 2)."""

import asyncio
import logging
import math
import re
import uuid
from pathlib import Path
from typing import Any

from langgraph.types import Send

from app.agents.evaluation.prompts import (
    FEEDBACK_SYSTEM,
    RECHECK_NOTE,
    SCORE_SYSTEM,
    SEGMENT_SYSTEM,
    escape_student_text,
)
from app.agents.evaluation.scoring import (
    as_text_list,
    clamp_marks,
    confidence,
    cosine,
    disagrees,
    split_by_labels,
)
from app.agents.evaluation.state import (
    EvalState,
    FeedbackItem,
    QuestionScore,
    QuestionSpec,
    ScoreTask,
    TraceStep,
)
from app.core.config import settings
from app.rag import llm, vector_store
from app.rag.llm import LLMError, LLMOutputError
from app.rag.pdf import extract_pdf
from app.rag.vector_store import RetrievedChunk, VectorStoreError

logger = logging.getLogger(__name__)

_CITATION = re.compile(r"\s*\[\d+(?:\s*,\s*\d+)*\]")


class GradingError(Exception):
    """Grading cannot proceed (e.g. the answer key is not indexed)."""


# --- extract_text ---------------------------------------------------------


async def extract_text(state: EvalState) -> dict[str, Any]:
    """Deterministic: the submitted PDF as plain text."""
    extracted = extract_pdf(Path(state["pdf_path"]).read_bytes())
    text = "\n\n".join(page.text for page in extracted.pages)
    detail = f"{extracted.page_count} page(s), {len(text)} characters"
    return {"raw_text": text, "trace": [_step("extract_text", detail)]}


# --- segment_answers ------------------------------------------------------


async def segment_answers(state: EvalState) -> dict[str, Any]:
    """Map the submission to questions, then measure similarity to the key."""
    questions = state["questions"]
    by_position = split_by_labels(state["raw_text"], len(questions))
    if by_position is not None:
        how = "answer labels found; LLM not needed"
    else:
        by_position = await _segment_with_llm(state["raw_text"], questions)
        how = "labels unclear; LLM mapped the text to questions"

    answers = {q["id"]: by_position.get(q["position"], "") for q in questions}
    similarities = await _similarities(questions, answers)

    answered = sum(1 for answer in answers.values() if answer)
    detail = f"{how}; {answered} of {len(questions)} answered"
    return {
        "answers": answers,
        "similarities": similarities,
        "trace": [_step("segment_answers", detail)],
    }


async def _segment_with_llm(text: str, questions: list[QuestionSpec]) -> dict[int, str]:
    listing = "\n".join(f"{q['position']}. {q['text']}" for q in questions)
    message = (
        f"Questions:\n{listing}\n\n"
        f"<submission>\n{escape_student_text(text)}\n</submission>"
    )
    result = await llm.chat_json(SEGMENT_SYSTEM, message)
    answers: dict[int, str] = {}
    items = result.get("answers")
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            number = int(item.get("question"))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        answer = str(item.get("answer") or "").strip()
        if 1 <= number <= len(questions) and answer:
            answers[number] = answer
    return answers


async def _similarities(
    questions: list[QuestionSpec], answers: dict[str, str]
) -> dict[str, float | None]:
    answered = [q for q in questions if answers[q["id"]]]
    if not answered:
        return {q["id"]: None for q in questions}

    student_vectors = await llm.embed([answers[q["id"]] for q in answered])
    keys = await vector_store.get_answer_key_vectors([_uuid(q["id"]) for q in answered])
    similarities: dict[str, float | None] = {q["id"]: None for q in questions}
    for question, vector in zip(answered, student_vectors, strict=True):
        key = keys.get(_uuid(question["id"]))
        if key is None:
            raise GradingError(
                f"The answer key of question {question['position']} is not indexed"
            )
        similarities[question["id"]] = round(cosine(vector, key), 4)
    return similarities


# --- score_question x N (parallel) and recheck ----------------------------


def fan_out(state: EvalState) -> list[Send]:
    """One score_question run per question, in parallel."""
    return [
        Send(
            "score_question",
            ScoreTask(
                question=question,
                answer=state["answers"][question["id"]],
                similarity=state["similarities"][question["id"]],
                previous=None,
            ),
        )
        for question in state["questions"]
    ]


async def score_question(task: ScoreTask) -> dict[str, Any]:
    score = await _grade(task)
    question = task["question"]
    detail = (
        f"Q{question['position']}: {score['ai_marks']:g}/{question['max_marks']:g}, "
        f"similarity {_fmt(score['similarity'])}, confidence {score['confidence']:.2f}"
    )
    return {
        "scores": {question["id"]: score},
        "trace": [_step("score_question", detail)],
    }


async def recheck(task: ScoreTask) -> dict[str, Any]:
    """One stricter, independent re-evaluation of a disputed question."""
    question, previous = task["question"], task["previous"]
    assert previous is not None
    try:
        score = await _grade(task, strict=True)
    except LLMError as exc:
        # Keep the first grade; check_confidence flags it for faculty.
        logger.warning("Recheck of question %s failed: %s", question["id"], exc)
        score = {**previous, "rechecked": True}
        detail = f"Q{question['position']}: re-check failed, first grade kept"
    else:
        detail = (
            f"Q{question['position']}: {previous['ai_marks']:g} -> "
            f"{score['ai_marks']:g}/{question['max_marks']:g}, "
            f"confidence {score['confidence']:.2f}"
        )
    return {"scores": {question["id"]: score}, "trace": [_step("recheck", detail)]}


async def _grade(task: ScoreTask, strict: bool = False) -> QuestionScore:
    question, answer = task["question"], task["answer"]
    base = {
        "question_id": question["id"],
        "position": question["position"],
        "topic": question["topic"],
        "max_marks": question["max_marks"],
        "student_answer": answer,
        "similarity": task["similarity"],
        "flagged": False,
        "rechecked": strict,
    }
    if not answer.strip():
        return QuestionScore(
            **base,
            ai_marks=0.0,
            key_points_hit=[],
            key_points_missed=question["key_points"],
            incorrect_points=[],
            rationale="No answer was found for this question in the submission.",
            confidence=1.0,
        )

    key_points = "\n".join(f"- {point}" for point in question["key_points"])
    message = (
        f"Question ({question['max_marks']:g} marks):\n{question['text']}\n\n"
        f"Teacher's model answer:\n{question['model_answer']}\n\n"
        f"Teacher's key points:\n{key_points or '(none given; derive them)'}\n\n"
        f"<student_answer>\n{escape_student_text(answer)}\n</student_answer>"
    )
    system = SCORE_SYSTEM
    if strict and task["previous"] is not None:
        system += "\n\n" + RECHECK_NOTE.format(
            previous_marks=f"{task['previous']['ai_marks']:g}",
            max_marks=f"{question['max_marks']:g}",
        )

    result = await _complete_grade(system, message)
    marks = clamp_marks(result["marks"], question["max_marks"])
    return QuestionScore(
        **base,
        ai_marks=marks,
        key_points_hit=as_text_list(result.get("covered")),
        key_points_missed=as_text_list(result.get("missing")),
        incorrect_points=as_text_list(result.get("incorrect")),
        rationale=str(result["rationale"]).strip(),
        confidence=confidence(task["similarity"], marks, question["max_marks"]),
    )


async def _complete_grade(system: str, message: str) -> dict[str, Any]:
    """A grading reply with numeric marks and a rationale.

    A reply missing either is retried, never read as zero marks: free models
    sometimes return truncated or partial JSON.
    """
    # chat_json already retries failed calls; this only covers valid JSON that
    # lacks the marks, so one extra try is enough.
    for _ in range(2):
        result = await llm.chat_json(system, message)
        if (
            _is_number(result.get("marks"))
            and str(result.get("rationale") or "").strip()
        ):
            return result
    raise LLMOutputError("The grader returned an incomplete result (no marks)")


def _is_number(value: object) -> bool:
    try:
        return not math.isnan(float(value))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False


# --- check_confidence (conditional edge) ----------------------------------


async def check_confidence(state: EvalState) -> dict[str, Any]:
    """Flag questions that still disagree after their one re-check."""
    flagged: dict[str, QuestionScore] = {}
    for question_id, score in state["scores"].items():
        if (
            score["rechecked"]
            and disagrees(score["confidence"])
            and not score["flagged"]
        ):
            flagged[question_id] = {**score, "flagged": True}

    disputed = _disputed(state["scores"])
    if disputed:
        detail = f"{len(disputed)} question(s) disagree; re-checking once"
    else:
        detail = (
            f"{len(flagged)} question(s) flagged for faculty"
            if flagged
            else "similarity and LLM marks agree"
        )
    return {"scores": flagged, "trace": [_step("check_confidence", detail)]}


def route_after_check(state: EvalState) -> list[Send] | str:
    disputed = _disputed(state["scores"])
    if not disputed:
        return "write_feedback"
    specs = {q["id"]: q for q in state["questions"]}
    return [
        Send(
            "recheck",
            ScoreTask(
                question=specs[score["question_id"]],
                answer=score["student_answer"],
                similarity=score["similarity"],
                previous=score,
            ),
        )
        for score in disputed
    ]


def _disputed(scores: dict[str, QuestionScore]) -> list[QuestionScore]:
    return [
        score
        for score in scores.values()
        if disagrees(score["confidence"]) and not score["rechecked"]
    ]


# --- write_feedback (LLM + RAG on lecture slides) -------------------------


async def write_feedback(state: EvalState) -> dict[str, Any]:
    """Personalised feedback that points to the lecture slides on missed concepts."""
    specs = {q["id"]: q for q in state["questions"]}
    scores = sorted(state["scores"].values(), key=lambda score: score["position"])
    needs_help = [s for s in scores if s["key_points_missed"] or s["incorrect_points"]]

    excerpts = await _slide_excerpts(state["course_id"], needs_help, specs)
    try:
        feedback = await _feedback_with_llm(scores, specs, excerpts)
        detail = f"LLM feedback for {len(feedback)} question(s)"
    except LLMError as exc:
        logger.warning("Feedback LLM failed, using plain feedback: %s", exc)
        feedback = {}
        detail = "LLM unavailable; plain feedback from key points"

    for score in scores:
        if score["question_id"] not in feedback:
            feedback[score["question_id"]] = _plain_feedback(score)
    cited = sum(1 for item in feedback.values() if item["sources"])
    detail += f"; {len(excerpts)} slide excerpt(s), cited in {cited} question(s)"
    return {"feedback": feedback, "trace": [_step("write_feedback", detail)]}


async def _slide_excerpts(
    course_id: uuid.UUID,
    needs_help: list[QuestionScore],
    specs: dict[str, QuestionSpec],
) -> list[RetrievedChunk]:
    """Lecture passages about what students missed, from the slides only."""
    if not needs_help:
        return []
    queries = [
        " ".join([specs[s["question_id"]]["text"], *s["key_points_missed"][:3]])[:1000]
        for s in needs_help
    ]
    try:
        vectors = await llm.embed(queries)
        results = await asyncio.gather(
            *(
                vector_store.search(course_id=course_id, vector=vector, limit=3)
                for vector in vectors
            )
        )
    except (LLMError, VectorStoreError) as exc:
        logger.warning("Slide retrieval for feedback failed: %s", exc)
        return []

    unique: dict[tuple[str, int], RetrievedChunk] = {}
    for chunks in results:
        for chunk in chunks:
            if chunk.score >= settings.retrieval_min_score:
                unique.setdefault((chunk.material_id, chunk.chunk_index), chunk)
    return list(unique.values())[:8]


async def _feedback_with_llm(
    scores: list[QuestionScore],
    specs: dict[str, QuestionSpec],
    excerpts: list[RetrievedChunk],
) -> dict[str, FeedbackItem]:
    blocks = []
    for score in scores:
        spec = specs[score["question_id"]]
        blocks.append(
            f"Question {score['position']} ({spec['topic']}): {spec['text']}\n"
            f"Marks: {score['ai_marks']:g} of {score['max_marks']:g}\n"
            f"Covered: {'; '.join(score['key_points_hit']) or 'none'}\n"
            f"Missed: {'; '.join(score['key_points_missed']) or 'none'}\n"
            f"Errors: {'; '.join(score['incorrect_points']) or 'none'}\n"
            f"<student_answer>\n{escape_student_text(score['student_answer'][:1500])}"
            "\n</student_answer>"
        )
    slides = "\n\n".join(
        f"[{n}] ({chunk.filename}, page {chunk.page})\n{chunk.text[:800]}"
        for n, chunk in enumerate(excerpts, start=1)
    )
    message = (
        "\n\n".join(blocks)
        + "\n\nLecture slide excerpts:\n\n"
        + (slides or "(none found)")
    )
    result = await llm.chat_json(FEEDBACK_SYSTEM, message)

    by_position = {score["position"]: score for score in scores}
    feedback: dict[str, FeedbackItem] = {}
    items = result.get("feedback")
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            score = by_position[int(item.get("question"))]  # type: ignore[arg-type]
        except (KeyError, TypeError, ValueError):
            continue
        text = _CITATION.sub("", str(item.get("text") or "")).strip()
        if not text:
            continue
        cited = item.get("cited_excerpts")
        numbers = [
            int(n)
            for n in (cited if isinstance(cited, list) else [])
            if str(n).isdigit() and 1 <= int(n) <= len(excerpts)
        ]
        sources = [
            {"filename": excerpts[n - 1].filename, "page": excerpts[n - 1].page}
            for n in dict.fromkeys(numbers)
        ]
        feedback[score["question_id"]] = FeedbackItem(text=text, sources=sources)
    return feedback


def _plain_feedback(score: QuestionScore) -> FeedbackItem:
    if not score["student_answer"].strip():
        text = "This question was not answered."
    elif not score["key_points_missed"] and not score["incorrect_points"]:
        text = "Well done: your answer covers all the key points."
    else:
        parts = []
        if score["key_points_hit"]:
            parts.append(f"You covered: {'; '.join(score['key_points_hit'])}.")
        if score["key_points_missed"]:
            parts.append(f"Review: {'; '.join(score['key_points_missed'])}.")
        if score["incorrect_points"]:
            parts.append(f"Check: {'; '.join(score['incorrect_points'])}.")
        text = " ".join(parts)
    return FeedbackItem(text=text, sources=[])


# --- save_results ---------------------------------------------------------


async def save_results(state: EvalState) -> dict[str, Any]:
    """Deterministic: store per-question results; status becomes under review."""
    from app.services.grading import store_results  # avoid an import cycle

    trace = [*state.get("trace", []), _step("save_results", "status: under review")]
    await store_results(state, trace)
    return {"trace": [trace[-1]]}


def _uuid(value: str) -> uuid.UUID:
    return uuid.UUID(value)


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.2f}"


def _step(node: str, detail: str) -> TraceStep:
    return {"node": node, "detail": detail}
