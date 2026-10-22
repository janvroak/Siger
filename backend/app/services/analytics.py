"""Fixed, parameterised SQL for learning analytics.

Every number on the dashboards (and every number the analytics agent may
quote) comes from one of these functions. Only published grades count.

Definitions (SIGER revised architecture, section 8):
- Topic mastery = sum of final marks / sum of max marks for that topic.
- Comprehension = mastery over all the course's topics, weighted by marks,
  which equals total final marks / total max marks.
- Completion = submitted / enrolled; overdue = enrolled, no submission and the
  deadline has passed.
- Learning gap = a topic whose mastery is below the threshold (default 50%).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.assignment import Assignment, Question
from app.models.course import Enrollment
from app.models.question_score import QuestionScore
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.analytics import (
    AIAgreement,
    Completion,
    CourseAnalytics,
    OverdueItem,
    StudentAssignmentProgress,
    StudentProgress,
    StudentSummary,
    TopicMastery,
    TrendPoint,
)

PUBLISHED = Submission.status == SubmissionStatus.PUBLISHED


def _published_scores():
    """Published question scores with their question, submission and assignment."""
    return (
        select()
        .select_from(QuestionScore)
        .join(Question, Question.id == QuestionScore.question_id)
        .join(Submission, Submission.id == QuestionScore.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(PUBLISHED)
    )


def _ratio(earned: float | None, possible: float | None) -> float | None:
    return round(earned / possible, 4) if earned is not None and possible else None


# --- topic mastery ---------------------------------------------------------


async def topic_mastery(
    session: AsyncSession,
    course_id: uuid.UUID,
    *,
    student_id: uuid.UUID | None = None,
    assignment_id: uuid.UUID | None = None,
) -> list[TopicMastery]:
    """Mastery per topic, weakest first, for the class or one student."""
    statement = (
        _published_scores()
        .add_columns(
            Question.topic,
            func.sum(QuestionScore.final_marks),
            func.sum(Question.max_marks),
            func.count(QuestionScore.id),
        )
        .where(Assignment.course_id == course_id)
        .group_by(Question.topic)
    )
    if student_id is not None:
        statement = statement.where(Submission.student_id == student_id)
    if assignment_id is not None:
        statement = statement.where(Assignment.id == assignment_id)

    threshold = settings.learning_gap_threshold
    topics = []
    for topic, earned, possible, answers in await session.execute(statement):
        mastery = _ratio(float(earned or 0), float(possible or 0)) or 0.0
        topics.append(
            TopicMastery(
                topic=topic,
                mastery=mastery,
                earned=float(earned or 0),
                possible=float(possible or 0),
                graded_answers=answers,
                is_gap=mastery < threshold,
            )
        )
    return sorted(topics, key=lambda t: (t.mastery, t.topic))


async def class_topic_averages(
    session: AsyncSession, course_id: uuid.UUID, assignment_id: uuid.UUID
) -> list[TopicMastery]:
    """Average % per topic for the class on one assignment."""
    return await topic_mastery(session, course_id, assignment_id=assignment_id)


async def weakest_topics(
    session: AsyncSession, course_id: uuid.UUID, limit: int = 5
) -> list[TopicMastery]:
    """Topics with the lowest class mastery (learning gaps first)."""
    return (await topic_mastery(session, course_id))[:limit]


async def student_topic_mastery(
    session: AsyncSession, course_id: uuid.UUID, student_id: uuid.UUID
) -> list[TopicMastery]:
    return await topic_mastery(session, course_id, student_id=student_id)


# --- completion and overdue ----------------------------------------------


async def completion(
    session: AsyncSession,
    course_id: uuid.UUID,
    assignment_id: uuid.UUID | None = None,
) -> list[Completion]:
    """Submitted / pending / overdue per assignment, by deadline."""
    now = datetime.now(UTC)
    enrolled = await _enrolled_count(session, course_id)

    submitted = func.count(Submission.id)
    published = func.count(Submission.id).filter(PUBLISHED)
    statement = (
        select(Assignment, submitted, published)
        .outerjoin(Submission, Submission.assignment_id == Assignment.id)
        .where(Assignment.course_id == course_id)
        .group_by(Assignment.id)
        .order_by(Assignment.deadline, Assignment.created_at)
    )
    if assignment_id is not None:
        statement = statement.where(Assignment.id == assignment_id)
    averages = await _average_scores(session, course_id)

    rows = []
    for assignment, submitted_count, published_count in await session.execute(
        statement
    ):
        missing = max(enrolled - submitted_count, 0)
        closed = assignment.deadline < now
        rows.append(
            Completion(
                assignment_id=assignment.id,
                title=assignment.title,
                deadline=assignment.deadline,
                enrolled=enrolled,
                submitted=submitted_count,
                pending=0 if closed else missing,
                overdue=missing if closed else 0,
                published=published_count,
                rate=_ratio(float(submitted_count), float(enrolled)) or 0.0,
                average_score=averages.get(assignment.id),
            )
        )
    return rows


async def completion_rate(
    session: AsyncSession, course_id: uuid.UUID, assignment_id: uuid.UUID
) -> Completion | None:
    rows = await completion(session, course_id, assignment_id)
    return rows[0] if rows else None


async def overdue_students(
    session: AsyncSession, course_id: uuid.UUID
) -> list[OverdueItem]:
    """Enrolled students with no submission for an assignment past its deadline."""
    statement = (
        select(User, Assignment)
        .join(Enrollment, Enrollment.student_id == User.id)
        .join(Assignment, Assignment.course_id == Enrollment.course_id)
        .outerjoin(
            Submission,
            and_(
                Submission.assignment_id == Assignment.id,
                Submission.student_id == User.id,
            ),
        )
        .where(
            Enrollment.course_id == course_id,
            Assignment.deadline < datetime.now(UTC),
            Submission.id.is_(None),
        )
        .order_by(Assignment.deadline.desc(), User.full_name)
    )
    return [
        OverdueItem(
            student_id=student.id,
            student_name=student.full_name,
            assignment_id=assignment.id,
            assignment_title=assignment.title,
            deadline=assignment.deadline,
        )
        for student, assignment in await session.execute(statement)
    ]


# --- scores --------------------------------------------------------------


async def score_trend(
    session: AsyncSession, course_id: uuid.UUID, student_id: uuid.UUID
) -> list[TrendPoint]:
    """A student's published score per assignment, in deadline order."""
    statement = (
        _published_scores()
        .add_columns(
            Assignment.id,
            Assignment.title,
            Assignment.deadline,
            func.sum(QuestionScore.final_marks),
            func.sum(Question.max_marks),
        )
        .where(Assignment.course_id == course_id, Submission.student_id == student_id)
        .group_by(Assignment.id)
        .order_by(Assignment.deadline)
    )
    return [
        TrendPoint(
            assignment_id=assignment_id,
            title=title,
            deadline=deadline,
            earned=float(earned or 0),
            possible=float(possible or 0),
            score=_ratio(float(earned or 0), float(possible or 0)) or 0.0,
        )
        for assignment_id, title, deadline, earned, possible in await session.execute(
            statement
        )
    ]


async def comprehension(
    session: AsyncSession,
    course_id: uuid.UUID,
    student_id: uuid.UUID | None = None,
) -> float | None:
    """Marks-weighted mastery across the course: final / max over published grades."""
    statement = (
        _published_scores()
        .add_columns(func.sum(QuestionScore.final_marks), func.sum(Question.max_marks))
        .where(Assignment.course_id == course_id)
    )
    if student_id is not None:
        statement = statement.where(Submission.student_id == student_id)
    earned, possible = (await session.execute(statement)).one()
    return _ratio(
        float(earned) if earned is not None else None,
        float(possible) if possible else None,
    )


async def _average_scores(
    session: AsyncSession, course_id: uuid.UUID
) -> dict[uuid.UUID, float]:
    """Mean published score per assignment (each submission weighs the same)."""
    per_submission = (
        _published_scores()
        .add_columns(
            Assignment.id.label("assignment_id"),
            (func.sum(QuestionScore.final_marks) / func.sum(Question.max_marks)).label(
                "score"
            ),
        )
        .where(Assignment.course_id == course_id)
        .group_by(Assignment.id, Submission.id)
        .subquery()
    )
    rows = await session.execute(
        select(
            per_submission.c.assignment_id, func.avg(per_submission.c.score)
        ).group_by(per_submission.c.assignment_id)
    )
    return {assignment_id: round(float(avg), 4) for assignment_id, avg in rows}


# --- AI vs faculty -------------------------------------------------------


async def ai_agreement(session: AsyncSession, course_id: uuid.UUID) -> AIAgreement:
    """How often faculty kept the AI's marks: the grader's evaluation metric."""
    difference = func.abs(QuestionScore.final_marks - QuestionScore.ai_marks)
    changed = difference > 0.001
    statement = (
        _published_scores()
        .add_columns(
            func.count(QuestionScore.id),
            func.count(QuestionScore.id).filter(~changed),
            func.count(QuestionScore.id).filter(difference <= 0.5),
            func.avg(difference),
            func.count(QuestionScore.id).filter(changed),
            func.count(QuestionScore.id).filter(QuestionScore.flagged),
            func.count(QuestionScore.id).filter(QuestionScore.flagged & changed),
        )
        .where(
            Assignment.course_id == course_id, QuestionScore.final_marks.is_not(None)
        )
    )
    total, exact, close, mean_diff, overrides, flagged, flagged_changed = (
        await session.execute(statement)
    ).one()
    return AIAgreement(
        reviewed_answers=total,
        exact_agreement=_ratio(float(exact), float(total)),
        within_half_mark=_ratio(float(close), float(total)),
        mean_abs_difference=round(float(mean_diff), 3)
        if mean_diff is not None
        else None,
        overrides=overrides,
        flagged=flagged,
        flagged_overridden=flagged_changed,
    )


# --- per-student ---------------------------------------------------------


async def student_summaries(
    session: AsyncSession, course_id: uuid.UUID
) -> list[StudentSummary]:
    """Every enrolled student's standing; weakest first, ungraded last."""
    graded = (
        _published_scores()
        .add_columns(
            Submission.student_id.label("student_id"),
            func.sum(QuestionScore.final_marks).label("earned"),
            func.sum(Question.max_marks).label("possible"),
            func.count(func.distinct(Submission.id)).label("graded"),
        )
        .where(Assignment.course_id == course_id)
        .group_by(Submission.student_id)
        .subquery()
    )
    submitted = (
        select(
            Submission.student_id.label("student_id"),
            func.count(Submission.id).label("submitted"),
        )
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.course_id == course_id)
        .group_by(Submission.student_id)
        .subquery()
    )
    statement = (
        select(
            User,
            graded.c.earned,
            graded.c.possible,
            func.coalesce(graded.c.graded, 0),
            func.coalesce(submitted.c.submitted, 0),
        )
        .join(Enrollment, Enrollment.student_id == User.id)
        .outerjoin(graded, graded.c.student_id == User.id)
        .outerjoin(submitted, submitted.c.student_id == User.id)
        .where(Enrollment.course_id == course_id)
    )
    overdue_counts: dict[uuid.UUID, int] = {}
    for item in await overdue_students(session, course_id):
        overdue_counts[item.student_id] = overdue_counts.get(item.student_id, 0) + 1

    summaries = [
        StudentSummary(
            student_id=student.id,
            student_name=student.full_name,
            student_email=student.email,
            comprehension=_ratio(
                float(earned) if earned is not None else None,
                float(possible) if possible else None,
            ),
            graded=graded_count,
            submitted=submitted_count,
            overdue=overdue_counts.get(student.id, 0),
        )
        for student, earned, possible, graded_count, submitted_count in (
            await session.execute(statement)
        )
    ]
    return sorted(
        summaries,
        key=lambda s: (
            s.comprehension is None,
            s.comprehension or 0,
            s.student_name,
        ),
    )


async def student_assignments(
    session: AsyncSession, course_id: uuid.UUID, student_id: uuid.UUID
) -> list[StudentAssignmentProgress]:
    """Where one student stands on every assignment of the course."""
    now = datetime.now(UTC)
    trend = {
        point.assignment_id: point.score
        for point in await score_trend(session, course_id, student_id)
    }
    statement = (
        select(Assignment, Submission.status)
        .outerjoin(
            Submission,
            and_(
                Submission.assignment_id == Assignment.id,
                Submission.student_id == student_id,
            ),
        )
        .where(Assignment.course_id == course_id)
        .order_by(Assignment.deadline, Assignment.created_at)
    )
    states = {
        SubmissionStatus.PUBLISHED: "graded",
        SubmissionStatus.UNDER_REVIEW: "under_review",
        SubmissionStatus.SUBMITTED: "submitted",
        SubmissionStatus.EVALUATING: "submitted",
        SubmissionStatus.FAILED: "failed",
    }
    return [
        StudentAssignmentProgress(
            assignment_id=assignment.id,
            title=assignment.title,
            deadline=assignment.deadline,
            state=(
                states[status]
                if status is not None
                else ("overdue" if assignment.deadline < now else "pending")
            ),
            score=trend.get(assignment.id),
        )
        for assignment, status in await session.execute(statement)
    ]


# --- dashboards ----------------------------------------------------------


async def course_analytics(
    session: AsyncSession, course_id: uuid.UUID
) -> CourseAnalytics:
    enrolled = await _enrolled_count(session, course_id)
    rows = await completion(session, course_id)
    expected = enrolled * len(rows)
    return CourseAnalytics(
        course_id=course_id,
        gap_threshold=settings.learning_gap_threshold,
        enrolled=enrolled,
        assignments=len(rows),
        comprehension=await comprehension(session, course_id),
        completion_rate=_ratio(float(sum(r.submitted for r in rows)), float(expected)),
        topics=await topic_mastery(session, course_id),
        completion=rows,
        students=await student_summaries(session, course_id),
        overdue=await overdue_students(session, course_id),
        agreement=await ai_agreement(session, course_id),
    )


async def student_progress(
    session: AsyncSession, course_id: uuid.UUID, student: User
) -> StudentProgress:
    return StudentProgress(
        course_id=course_id,
        student_id=student.id,
        student_name=student.full_name,
        gap_threshold=settings.learning_gap_threshold,
        comprehension=await comprehension(session, course_id, student.id),
        topics=await student_topic_mastery(session, course_id, student.id),
        trend=await score_trend(session, course_id, student.id),
        assignments=await student_assignments(session, course_id, student.id),
    )


async def _enrolled_count(session: AsyncSession, course_id: uuid.UUID) -> int:
    return int(
        await session.scalar(
            select(func.count(Enrollment.id)).where(Enrollment.course_id == course_id)
        )
        or 0
    )
