"""Dashboards: class analytics for faculty, progress for students.

Role scoping: faculty see their own courses; a student sees only their own
progress. Every number is computed by app/services/analytics.py.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.analytics import run_analytics
from app.agents.analytics.prompts import DEFAULT_QUESTION
from app.agents.analytics.tools import Scope
from app.api.access import course_for_member, owned_course
from app.auth.dependencies import (
    get_current_professor,
    get_current_student,
    get_current_user,
)
from app.db.session import get_db_session
from app.models.user import User, UserRole
from app.rag import llm
from app.rag.llm import LLMError, LLMRateLimitError, describe_rate_limit
from app.schemas.analytics import (
    CourseAnalytics,
    InsightRead,
    InsightRequest,
    StudentProgress,
)
from app.services.analytics import course_analytics, student_progress
from app.services.courses import get_enrollment

router = APIRouter(prefix="/courses", tags=["analytics"])


@router.get(
    "/{course_id}/analytics",
    response_model=CourseAnalytics,
    summary="Class analytics for a course (course professor only)",
)
async def read_course_analytics(
    course_id: uuid.UUID,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CourseAnalytics:
    course = await owned_course(session, course_id, professor)
    return await course_analytics(session, course.id)


@router.get(
    "/{course_id}/analytics/me",
    response_model=StudentProgress,
    summary="Your own progress in a course",
)
async def read_my_progress(
    course_id: uuid.UUID,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StudentProgress:
    course = await course_for_member(session, course_id, student)
    return await student_progress(session, course.id, student)


@router.get(
    "/{course_id}/analytics/students/{student_id}",
    response_model=StudentProgress,
    summary="One enrolled student's progress (course professor only)",
)
async def read_student_progress(
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StudentProgress:
    course = await owned_course(session, course_id, professor)
    student = await session.get(User, student_id)
    if student is None or not await get_enrollment(session, student_id, course.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This student is not enrolled in the course",
        )
    return await student_progress(session, course.id, student)


@router.post(
    "/{course_id}/analytics/insight",
    response_model=InsightRead,
    summary="Ask the analytics agent about performance (numbers are verified)",
)
async def ask_analytics_agent(
    course_id: uuid.UUID,
    request: InsightRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InsightRead:
    if user.role == UserRole.PROFESSOR:
        course = await owned_course(session, course_id, user)
        student = None
        if request.student_id is not None:
            student = await session.get(User, request.student_id)
            if student is None or not await get_enrollment(
                session, student.id, course.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="This student is not enrolled in the course",
                )
        scope = Scope("faculty", course.id, student.id if student else None)
        context = (
            f"Course: {course.code} - {course.title}. Asked by the course professor "
            + (
                f"about one student, {student.full_name} (student_id {student.id})."
                if student
                else "about the whole class."
            )
        )
        default = DEFAULT_QUESTION["faculty_student" if student else "faculty"]
    elif user.role == UserRole.STUDENT:
        # A student's agent can only ever read that student's own data.
        course = await course_for_member(session, course_id, user)
        scope = Scope("student", course.id, user.id)
        context = (
            f"Course: {course.code} - {course.title}. Asked by the student "
            f"{user.full_name} about their own results. Address them as 'you'."
        )
        default = DEFAULT_QUESTION["student"]
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    if not llm.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The analytics agent is not configured",
        )
    question = request.question.strip() or default
    try:
        result = await run_analytics(session, scope, question, context)
    except LLMRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=describe_rate_limit(exc),
        ) from None
    except LLMError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The analytics agent is temporarily unavailable; please try again",
        ) from None

    return InsightRead(
        question=question,
        insight=result.insight,
        verified=result.verified,
        unsupported_numbers=result.unsupported,
        tool_calls=result.tool_calls,
        trace=result.trace,
    )
