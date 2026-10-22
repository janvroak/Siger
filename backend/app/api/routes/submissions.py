"""Student submissions: upload, own status, and the faculty roster."""

import uuid
from pathlib import PurePath
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import course_for_member, owned_course
from app.api.routes.assignments import get_course_assignment
from app.auth.dependencies import get_current_professor, get_current_student
from app.core.config import settings
from app.db.session import get_db_session
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.rag.pdf import InvalidPDFError
from app.schemas.submission import (
    MySubmission,
    ReviewIn,
    StudentResult,
    SubmissionRead,
    SubmissionResults,
    SubmissionRoster,
)
from app.services import storage
from app.services.grading import GRADABLE, grade_submission
from app.services.review import REVIEWABLE, ReviewError, review, student_result
from app.services.submissions import (
    AlreadySubmittedError,
    SubmissionClosedError,
    get_student_submission,
    get_submission,
    results,
    roster,
    submit,
)

router = APIRouter(prefix="/courses", tags=["submissions"])

ASSIGNMENT = "/{course_id}/assignments/{assignment_id}"


@router.post(
    f"{ASSIGNMENT}/submission",
    response_model=SubmissionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit your answers as one PDF",
)
async def submit_assignment(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    file: UploadFile,
    background: BackgroundTasks,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Submission:
    course = await course_for_member(session, course_id, student)
    assignment = await get_course_assignment(session, course.id, assignment_id)

    filename = PurePath(file.filename or "answers.pdf").name[:255]
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Please upload your answers as a PDF",
        )
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"PDF must be at most {settings.max_upload_mb} MB",
        )

    try:
        submission = await submit(
            session,
            assignment=assignment,
            student=student,
            filename=filename,
            data=data,
        )
    except SubmissionClosedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The deadline for this assignment has passed",
        ) from None
    except AlreadySubmittedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted this assignment",
        ) from None
    except InvalidPDFError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{exc}. Scanned or handwritten PDFs without a text layer "
            "are not supported.",
        ) from None

    # The response returns now; the evaluation agent grades in the background.
    background.add_task(grade_submission, submission.id)
    return submission


@router.get(
    f"{ASSIGNMENT}/submission",
    response_model=MySubmission,
    summary="Your own submission for an assignment",
)
async def read_my_submission(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MySubmission:
    course = await course_for_member(session, course_id, student)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    submission = await get_student_submission(session, assignment.id, student.id)
    return MySubmission(
        submission=SubmissionRead.model_validate(submission) if submission else None
    )


@router.get(
    f"{ASSIGNMENT}/submission/file",
    response_class=FileResponse,
    summary="Download your own submitted PDF",
)
async def read_my_submission_file(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> FileResponse:
    course = await course_for_member(session, course_id, student)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    submission = await get_student_submission(session, assignment.id, student.id)
    return _pdf(submission)


@router.get(
    f"{ASSIGNMENT}/submission/result",
    response_model=StudentResult,
    summary="Your published grade and feedback",
)
async def read_my_result(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StudentResult:
    course = await course_for_member(session, course_id, student)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    submission = await get_student_submission(session, assignment.id, student.id)
    result = await student_result(session, submission) if submission else None
    if result is None:
        # Grades exist only once faculty have reviewed and published them.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Your grade has not been published yet",
        )
    return result


@router.get(
    f"{ASSIGNMENT}/submissions",
    response_model=SubmissionRoster,
    summary="Every enrolled student's submission status (course professor only)",
)
async def read_roster(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SubmissionRoster:
    course = await owned_course(session, course_id, professor)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    return await roster(session, assignment)


@router.get(
    f"{ASSIGNMENT}/submissions/{{submission_id}}/file",
    response_class=FileResponse,
    summary="Download a student's submitted PDF (course professor only)",
)
async def read_submission_file(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> FileResponse:
    course = await owned_course(session, course_id, professor)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    submission = await get_submission(session, assignment.id, submission_id)
    return _pdf(submission)


@router.get(
    f"{ASSIGNMENT}/submissions/{{submission_id}}",
    response_model=SubmissionResults,
    summary="A submission's AI evaluation (course professor only)",
)
async def read_submission_results(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SubmissionResults:
    submission = await _professor_submission(
        session, course_id, assignment_id, submission_id, professor
    )
    return await results(session, submission)


@router.put(
    f"{ASSIGNMENT}/submissions/{{submission_id}}/review",
    response_model=SubmissionResults,
    summary="Approve or override AI marks, edit feedback, and publish",
)
async def review_submission(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    data: ReviewIn,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SubmissionResults:
    submission = await _professor_submission(
        session, course_id, assignment_id, submission_id, professor
    )
    # Read before a possible rollback, which expires the loaded submission.
    code = (
        status.HTTP_422_UNPROCESSABLE_CONTENT
        if submission.status in REVIEWABLE
        else status.HTTP_409_CONFLICT
    )
    try:
        await review(session, submission, professor, data)
    except ReviewError as exc:
        await session.rollback()
        raise HTTPException(status_code=code, detail=str(exc)) from None
    return await results(session, submission)


@router.post(
    f"{ASSIGNMENT}/submissions/{{submission_id}}/grade",
    response_model=SubmissionRead,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry AI grading of a failed or stuck submission (course professor only)",
)
async def regrade_submission(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    background: BackgroundTasks,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Submission:
    submission = await _professor_submission(
        session, course_id, assignment_id, submission_id, professor
    )
    if submission.status not in GRADABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only submissions that are waiting or whose grading failed can "
            "be graded again",
        )
    submission.status = SubmissionStatus.SUBMITTED
    submission.error = None
    await session.commit()
    await session.refresh(submission)
    background.add_task(grade_submission, submission.id)
    return submission


async def _professor_submission(
    session: AsyncSession,
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    professor: User,
) -> Submission:
    course = await owned_course(session, course_id, professor)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    submission = await get_submission(session, assignment.id, submission_id)
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )
    return submission


def _pdf(submission: Submission | None) -> FileResponse:
    path = storage.resolve(submission.stored_path) if submission else None
    if submission is None or path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=submission.filename,
        content_disposition_type="inline",
    )
