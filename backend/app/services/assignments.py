import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.assignment import Assignment, Question
from app.models.course import Course
from app.models.user import User
from app.rag import llm, vector_store
from app.rag.llm import LLMError
from app.rag.vector_store import VectorStoreError
from app.schemas.assignment import AssignmentIn, AssignmentSummary, QuestionIn

logger = logging.getLogger(__name__)


async def create_assignment(
    session: AsyncSession, course: Course, professor: User, data: AssignmentIn
) -> Assignment:
    assignment = Assignment(
        course_id=course.id,
        created_by_id=professor.id,
        title=data.title,
        instructions=data.instructions.strip(),
        deadline=data.deadline,
        questions=_questions(data.questions),
    )
    session.add(assignment)
    await session.commit()
    await index_answer_keys(session, assignment)
    return await get_assignment(session, course.id, assignment.id)  # type: ignore[return-value]


async def replace_assignment(
    session: AsyncSession, assignment: Assignment, data: AssignmentIn
) -> Assignment:
    """Overwrite an assignment's details and its whole answer key."""
    assignment.title = data.title
    assignment.instructions = data.instructions.strip()
    assignment.deadline = data.deadline
    assignment.answer_keys_indexed = False
    # Remove the old questions first: inserting the new ones in the same flush
    # would clash with the unique (assignment, position) constraint.
    assignment.questions.clear()
    await session.flush()
    assignment.questions.extend(_questions(data.questions))
    await session.commit()
    await index_answer_keys(session, assignment)
    return await get_assignment(session, assignment.course_id, assignment.id)  # type: ignore[return-value]


async def delete_assignment(session: AsyncSession, assignment: Assignment) -> None:
    assignment_id = assignment.id
    await session.delete(assignment)
    await session.commit()
    try:
        await vector_store.delete_answer_keys(assignment_id)
    except VectorStoreError:
        # Orphaned vectors are harmless: they are only looked up by question id.
        logger.warning("Could not remove answer keys of assignment %s", assignment_id)


async def index_answer_keys(session: AsyncSession, assignment: Assignment) -> bool:
    """Embed the model answers into the answer_keys collection.

    Best effort: the assignment is already saved, and grading indexes the key
    again if it is still missing, so a provider hiccup must not lose the work.
    """
    questions = list(assignment.questions)
    try:
        vectors = await llm.embed([question.model_answer for question in questions])
        await vector_store.replace_answer_keys(
            course_id=assignment.course_id,
            assignment_id=assignment.id,
            question_ids=[question.id for question in questions],
            vectors=vectors,
        )
    except (LLMError, VectorStoreError) as exc:
        logger.warning(
            "Answer key of assignment %s not indexed: %s", assignment.id, exc
        )
        indexed = False
    else:
        indexed = True

    assignment.answer_keys_indexed = indexed
    await session.commit()
    return indexed


async def get_assignment(
    session: AsyncSession, course_id: uuid.UUID, assignment_id: uuid.UUID
) -> Assignment | None:
    statement = (
        select(Assignment)
        .where(Assignment.id == assignment_id, Assignment.course_id == course_id)
        .options(selectinload(Assignment.questions))
        # Reload questions even if this assignment is already in the session.
        .execution_options(populate_existing=True)
    )
    return await session.scalar(statement)


async def list_assignments(
    session: AsyncSession, course_id: uuid.UUID
) -> list[AssignmentSummary]:
    statement = (
        select(
            Assignment,
            func.count(Question.id),
            func.coalesce(func.sum(Question.max_marks), 0.0),
        )
        .outerjoin(Question, Question.assignment_id == Assignment.id)
        .where(Assignment.course_id == course_id)
        .group_by(Assignment.id)
        .order_by(Assignment.deadline.asc(), Assignment.created_at.asc())
    )
    rows = await session.execute(statement)
    return [
        AssignmentSummary(
            id=assignment.id,
            course_id=assignment.course_id,
            title=assignment.title,
            deadline=assignment.deadline,
            created_at=assignment.created_at,
            question_count=question_count,
            total_marks=float(total_marks),
        )
        for assignment, question_count, total_marks in rows
    ]


def _questions(items: list[QuestionIn]) -> list[Question]:
    return [
        Question(
            position=position,
            text=item.text,
            model_answer=item.model_answer,
            max_marks=item.max_marks,
            topic=item.topic,
            key_points=item.key_points,
        )
        for position, item in enumerate(items, start=1)
    ]
