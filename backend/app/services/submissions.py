import uuid
from datetime import UTC, datetime

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course import Enrollment
from app.models.submission import Submission
from app.models.user import User
from app.rag.pdf import extract_pdf
from app.schemas.submission import (
    RosterRow,
    SubmissionRead,
    SubmissionRoster,
)
from app.services import storage


class SubmissionClosedError(Exception):
    """The assignment's deadline has passed."""


class AlreadySubmittedError(Exception):
    """The student already submitted this assignment (one submission each)."""


def is_closed(assignment: Assignment, now: datetime | None = None) -> bool:
    return (now or datetime.now(UTC)) > assignment.deadline


async def submit(
    session: AsyncSession,
    *,
    assignment: Assignment,
    student: User,
    filename: str,
    data: bytes,
) -> Submission:
    """Store a student's answer PDF.

    Raises SubmissionClosedError, AlreadySubmittedError or InvalidPDFError
    (unreadable, or a scan without a text layer) before anything is stored.
    """
    if is_closed(assignment):
        raise SubmissionClosedError
    if await get_student_submission(session, assignment.id, student.id):
        raise AlreadySubmittedError
    # Grading needs text, so reject scans now rather than fail later.
    extracted = extract_pdf(data)

    submission_id = uuid.uuid4()
    stored_path = f"submissions/{submission_id}.pdf"
    storage.save(stored_path, data)
    submission = Submission(
        id=submission_id,
        assignment_id=assignment.id,
        student_id=student.id,
        filename=filename,
        stored_path=stored_path,
        page_count=extracted.page_count,
    )
    session.add(submission)
    try:
        await session.commit()
    except IntegrityError:
        # A second upload raced this one; the unique constraint kept only one.
        await session.rollback()
        storage.remove(stored_path)
        raise AlreadySubmittedError from None
    await session.refresh(submission)
    return submission


async def get_student_submission(
    session: AsyncSession, assignment_id: uuid.UUID, student_id: uuid.UUID
) -> Submission | None:
    return await session.scalar(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == student_id,
        )
    )


async def get_submission(
    session: AsyncSession, assignment_id: uuid.UUID, submission_id: uuid.UUID
) -> Submission | None:
    submission = await session.get(Submission, submission_id)
    if submission is None or submission.assignment_id != assignment_id:
        return None
    return submission


async def has_submissions(session: AsyncSession, assignment_id: uuid.UUID) -> bool:
    statement = select(exists().where(Submission.assignment_id == assignment_id))
    return bool(await session.scalar(statement))


async def submission_paths(
    session: AsyncSession, assignment_id: uuid.UUID
) -> list[str]:
    rows = await session.scalars(
        select(Submission.stored_path).where(Submission.assignment_id == assignment_id)
    )
    return list(rows)


async def roster(session: AsyncSession, assignment: Assignment) -> SubmissionRoster:
    """Every enrolled student with their submission state, by name."""
    statement = (
        select(User, Submission)
        .join(Enrollment, Enrollment.student_id == User.id)
        .outerjoin(
            Submission,
            (Submission.student_id == User.id)
            & (Submission.assignment_id == assignment.id),
        )
        .where(Enrollment.course_id == assignment.course_id)
        .order_by(User.full_name)
    )
    closed = is_closed(assignment)
    students: list[RosterRow] = []
    for student, submission in await session.execute(statement):
        if submission is None:
            state = "overdue" if closed else "not_submitted"
        else:
            state = submission.status.value
        students.append(
            RosterRow(
                student_id=student.id,
                student_name=student.full_name,
                student_email=student.email,
                state=state,
                submission=(
                    SubmissionRead.model_validate(submission) if submission else None
                ),
                error=submission.error if submission else None,
            )
        )

    submitted = sum(1 for row in students if row.submission is not None)
    overdue = sum(1 for row in students if row.state == "overdue")
    return SubmissionRoster(
        assignment_id=assignment.id,
        deadline=assignment.deadline,
        enrolled=len(students),
        submitted=submitted,
        pending=len(students) - submitted - overdue,
        overdue=overdue,
        students=students,
    )
