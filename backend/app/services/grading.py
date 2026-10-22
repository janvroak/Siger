"""Run the evaluation agent for a submission and store what it decides.

Grading runs as a background task after the upload request has returned. A
semaphore limits how many submissions are graded at once, since each one makes
several LLM calls and providers enforce rate limits.
"""

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import selectinload

from app.agents.evaluation import run_evaluation_graph
from app.agents.evaluation.nodes import GradingError
from app.agents.evaluation.state import EvalState, TraceStep
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment
from app.models.question_score import QuestionScore
from app.models.submission import Submission, SubmissionStatus
from app.rag.llm import (
    LLMError,
    LLMNotConfiguredError,
    LLMRateLimitError,
    describe_rate_limit,
)
from app.rag.pdf import InvalidPDFError
from app.rag.vector_store import VectorStoreError
from app.services import storage
from app.services.assignments import index_answer_keys

logger = logging.getLogger(__name__)

# Replaced in tests, which run each test on its own event loop and engine.
session_factory = AsyncSessionLocal

GRADABLE = (SubmissionStatus.SUBMITTED, SubmissionStatus.FAILED)

_slots: asyncio.Semaphore | None = None


def _grading_slots() -> asyncio.Semaphore:
    global _slots
    if _slots is None:
        _slots = asyncio.Semaphore(settings.grading_concurrency)
    return _slots


async def grade_submission(submission_id: uuid.UUID) -> None:
    """Grade one submission end to end; failures are recorded, never raised."""
    async with _grading_slots():
        try:
            await _grade(submission_id)
        except Exception as exc:  # a background task has nobody to raise to
            logger.exception("Grading of submission %s failed", submission_id)
            await _mark_failed(submission_id, _describe(exc))


async def _grade(submission_id: uuid.UUID) -> None:
    async with session_factory() as session:
        submission = await session.get(Submission, submission_id)
        if submission is None or submission.status not in GRADABLE:
            return
        assignment = await session.scalar(
            select(Assignment)
            .where(Assignment.id == submission.assignment_id)
            .options(selectinload(Assignment.questions))
        )
        assert assignment is not None
        submission.status = SubmissionStatus.EVALUATING
        submission.error = None
        await session.commit()

        if not assignment.answer_keys_indexed:
            # Raises the provider's error (e.g. its rate limit) so the failure
            # reason shown to faculty is the real one.
            await index_answer_keys(session, assignment, raise_errors=True)
        path = storage.resolve(submission.stored_path)
        if path is None:
            raise GradingError("The submitted PDF is missing from storage")

        initial: EvalState = {
            "submission_id": submission.id,
            "course_id": assignment.course_id,
            "pdf_path": str(path),
            "questions": [
                {
                    "id": str(question.id),
                    "position": question.position,
                    "text": question.text,
                    "model_answer": question.model_answer,
                    "max_marks": question.max_marks,
                    "topic": question.topic,
                    "key_points": list(question.key_points),
                }
                for question in assignment.questions
            ],
        }
    try:
        async with asyncio.timeout(settings.grading_timeout_seconds):
            await run_evaluation_graph(initial)
    except TimeoutError:
        raise GradingError(
            f"Grading took longer than {settings.grading_timeout_seconds // 60} "
            "minutes; the AI provider may be overloaded. Retry later."
        ) from None


async def store_results(state: EvalState, trace: list[TraceStep]) -> None:
    """Save every question's evaluation; the submission goes to faculty review."""
    submission_id = state["submission_id"]
    async with session_factory() as session:
        await session.execute(
            delete(QuestionScore).where(QuestionScore.submission_id == submission_id)
        )
        for question_id, score in state["scores"].items():
            feedback = state["feedback"][question_id]
            session.add(
                QuestionScore(
                    submission_id=submission_id,
                    question_id=uuid.UUID(question_id),
                    student_answer=score["student_answer"],
                    similarity=score["similarity"],
                    ai_marks=score["ai_marks"],
                    key_points_hit=score["key_points_hit"],
                    key_points_missed=score["key_points_missed"],
                    incorrect_points=score["incorrect_points"],
                    rationale=score["rationale"],
                    confidence=score["confidence"],
                    flagged=score["flagged"],
                    rechecked=score["rechecked"],
                    feedback=feedback["text"],
                    feedback_sources=feedback["sources"],
                )
            )
        await session.execute(
            update(Submission)
            .where(Submission.id == submission_id)
            .values(
                status=SubmissionStatus.UNDER_REVIEW,
                error=None,
                grading_trace=list(trace),
                graded_at=datetime.now(UTC),
            )
        )
        await session.commit()


async def _mark_failed(submission_id: uuid.UUID, reason: str) -> None:
    try:
        async with session_factory() as session:
            await session.execute(
                update(Submission)
                .where(Submission.id == submission_id)
                .values(status=SubmissionStatus.FAILED, error=reason[:1000])
            )
            await session.commit()
    except Exception:
        logger.exception("Could not record the failure of submission %s", submission_id)


async def recover_interrupted() -> int:
    """Mark gradings cut off by a restart as failed, so they can be retried."""
    async with session_factory() as session:
        result = await session.execute(
            update(Submission)
            .where(Submission.status == SubmissionStatus.EVALUATING)
            .values(
                status=SubmissionStatus.FAILED,
                error="Grading was interrupted by a server restart; retry it.",
            )
        )
        await session.commit()
        return result.rowcount or 0


def _describe(exc: Exception) -> str:
    """A reason faculty can act on."""
    if isinstance(exc, LLMRateLimitError):
        return describe_rate_limit(exc)
    if isinstance(exc, LLMNotConfiguredError):
        return "The AI grader is not configured (OPENROUTER_API_KEY is missing)."
    if isinstance(exc, GradingError | InvalidPDFError):
        return str(exc)
    if isinstance(exc, LLMError):
        return f"The AI provider failed: {exc}"
    if isinstance(exc, VectorStoreError):
        return "The vector database (Qdrant) is unavailable."
    return f"Unexpected error: {type(exc).__name__}: {exc}"
