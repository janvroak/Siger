import logging
import uuid

from sqlalchemy import func, null, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.assignment import Assignment, Question
from app.models.course import Course
from app.models.question_score import QuestionScore
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.rag import llm, vector_store
from app.rag.llm import LLMError
from app.rag.vector_store import VectorStoreError
from app.schemas.assignment import AssignmentIn, AssignmentSummary, QuestionIn
from app.services import storage
from app.services.submissions import submission_paths

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
    """Delete an assignment with its answer key and all submissions."""
    assignment_id = assignment.id
    files = await submission_paths(session, assignment_id)
    await session.delete(assignment)
    await session.commit()
    for path in files:
        storage.remove(path)
    try:
        await vector_store.delete_answer_keys(assignment_id)
    except VectorStoreError:
        # Orphaned vectors are harmless: they are only looked up by question id.
        logger.warning("Could not remove answer keys of assignment %s", assignment_id)


async def index_answer_keys(
    session: AsyncSession, assignment: Assignment, *, raise_errors: bool = False
) -> bool:
    """Embed the model answers into the answer_keys collection.

    Best effort when saving: the assignment is already stored, and grading
    indexes the key again if it is still missing, so a provider hiccup must
    not lose the work. Grading passes raise_errors=True to report the cause.
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
        assignment.answer_keys_indexed = False
        await session.commit()
        if raise_errors:
            raise
        return False

    assignment.answer_keys_indexed = True
    await session.commit()
    return True


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
    session: AsyncSession, course_id: uuid.UUID, student_id: uuid.UUID | None = None
) -> list[AssignmentSummary]:
    """A course's assignments; with student_id, each carries that student's status."""

    def per_assignment(column, *conditions):
        """A value computed per assignment row (count, sum, status)."""
        return select(column).where(*conditions).correlate(Assignment).scalar_subquery()

    of_question = Question.assignment_id == Assignment.id
    of_submission = Submission.assignment_id == Assignment.id
    question_count = per_assignment(func.count(Question.id), of_question)
    total_marks = per_assignment(
        func.coalesce(func.sum(Question.max_marks), 0.0), of_question
    )
    submission_count = per_assignment(func.count(Submission.id), of_submission)
    my_status = (
        per_assignment(
            Submission.status, of_submission, Submission.student_id == student_id
        )
        if student_id
        else null()
    )
    # The student's published total; drafts of a review stay hidden.
    my_score = (
        select(func.sum(QuestionScore.final_marks))
        .join(Submission, Submission.id == QuestionScore.submission_id)
        .where(
            of_submission,
            Submission.student_id == student_id,
            Submission.status == SubmissionStatus.PUBLISHED,
        )
        .correlate(Assignment)
        .scalar_subquery()
        if student_id
        else null()
    )
    statement = (
        select(
            Assignment,
            question_count,
            total_marks,
            submission_count,
            my_status,
            my_score,
        )
        .where(Assignment.course_id == course_id)
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
            question_count=questions,
            total_marks=float(marks),
            # Students are not told how many classmates have submitted.
            submission_count=None if student_id else submissions,
            my_status=status,
            my_score=float(score) if score is not None else None,
        )
        for assignment, questions, marks, submissions, status, score in rows
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
