"""Course access checks shared by the course-scoped routes."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User, UserRole
from app.services.courses import get_enrollment


async def course_for_member(
    session: AsyncSession, course_id: uuid.UUID, user: User
) -> Course:
    """The course, if the user owns it (professor) or is enrolled (student)."""
    course = await _course(session, course_id)
    is_owner = user.role == UserRole.PROFESSOR and course.professor_id == user.id
    is_enrolled = user.role == UserRole.STUDENT and await get_enrollment(
        session, user.id, course.id
    )
    if not (is_owner or is_enrolled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this course",
        )
    return course


async def owned_course(
    session: AsyncSession, course_id: uuid.UUID, professor: User
) -> Course:
    """The course, if this professor teaches it."""
    course = await _course(session, course_id)
    if course.professor_id != professor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage your own courses",
        )
    return course


async def _course(session: AsyncSession, course_id: uuid.UUID) -> Course:
    course = await session.get(Course, course_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )
    return course
