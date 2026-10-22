"""Dashboards: class analytics for faculty, progress for students.

Role scoping: faculty see their own courses; a student sees only their own
progress. Every number is computed by app/services/analytics.py.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import course_for_member, owned_course
from app.auth.dependencies import get_current_professor, get_current_student
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.analytics import CourseAnalytics, StudentProgress
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
