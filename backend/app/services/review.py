"""Faculty review: approve or override AI marks, then publish to the student.

Human in the loop: nothing the AI decided is visible to a student until a
faculty member has reviewed every question and published the grade.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Question
from app.models.question_score import QuestionScore
from app.models.review_log import ReviewAction, ReviewLog
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.submission import (
    ReviewIn,
    StudentQuestionResult,
    StudentResult,
    SubmissionRead,
)

REVIEWABLE = (SubmissionStatus.UNDER_REVIEW, SubmissionStatus.PUBLISHED)


class ReviewError(ValueError):
    """The review cannot be applied (wrong status, questions or marks)."""


async def review(
    session: AsyncSession, submission: Submission, faculty: User, data: ReviewIn
) -> None:
    """Store final marks and feedback per question; publish if asked.

    Every question must be reviewed. A change of final marks is logged as
    approve (same as the AI) or override (different), with both marks.
    """
    if submission.status not in REVIEWABLE:
        raise ReviewError("Only AI-graded submissions can be reviewed")

    rows = await session.execute(
        select(QuestionScore, Question)
        .join(Question, Question.id == QuestionScore.question_id)
        .where(QuestionScore.submission_id == submission.id)
    )
    scores = {question.id: (score, question) for score, question in rows}
    decided = {item.question_id: item for item in data.questions}
    if len(decided) != len(data.questions):
        raise ReviewError("Each question can be reviewed only once")
    if set(decided) != set(scores):
        raise ReviewError("Every graded question must be reviewed")

    for question_id, item in decided.items():
        score, question = scores[question_id]
        if item.final_marks > question.max_marks:
            raise ReviewError(
                f"Question {question.position} is worth at most "
                f"{question.max_marks:g} marks"
            )
        if score.final_marks != item.final_marks:
            session.add(
                ReviewLog(
                    submission_id=submission.id,
                    faculty_id=faculty.id,
                    question_id=question_id,
                    action=(
                        ReviewAction.APPROVE
                        if item.final_marks == score.ai_marks
                        else ReviewAction.OVERRIDE
                    ),
                    ai_marks=score.ai_marks,
                    final_marks=item.final_marks,
                )
            )
        score.final_marks = item.final_marks
        score.feedback = item.feedback.strip()

    if data.publish and submission.status != SubmissionStatus.PUBLISHED:
        submission.status = SubmissionStatus.PUBLISHED
        submission.published_at = datetime.now(UTC)
        session.add(
            ReviewLog(
                submission_id=submission.id,
                faculty_id=faculty.id,
                action=ReviewAction.PUBLISH,
            )
        )
    await session.commit()
    await session.refresh(submission)


async def student_result(
    session: AsyncSession, submission: Submission
) -> StudentResult | None:
    """The published grade, or None while it is not published."""
    if submission.status != SubmissionStatus.PUBLISHED or not submission.published_at:
        return None
    rows = await session.execute(
        select(QuestionScore, Question)
        .join(Question, Question.id == QuestionScore.question_id)
        .where(QuestionScore.submission_id == submission.id)
        .order_by(Question.position)
    )
    questions = [
        StudentQuestionResult(
            position=question.position,
            text=question.text,
            topic=question.topic,
            max_marks=question.max_marks,
            marks=score.final_marks if score.final_marks is not None else 0.0,
            key_points_hit=score.key_points_hit,
            key_points_missed=score.key_points_missed,
            feedback=score.feedback,
            feedback_sources=score.feedback_sources,
        )
        for score, question in rows
    ]
    return StudentResult(
        submission=SubmissionRead.model_validate(submission),
        published_at=submission.published_at,
        total_marks=sum(question.marks for question in questions),
        max_marks=sum(question.max_marks for question in questions),
        questions=questions,
    )
