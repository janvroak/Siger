import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_professor, get_current_student
from app.db.session import get_db_session
from app.models.course import Course
from app.models.user import User
from app.schemas.course import CourseCreate, CourseRead, EnrollmentRead
from app.services.courses import (
    create_course,
    enroll_student,
    get_course_by_code,
    get_enrollment,
    list_courses,
    list_enrolled_courses,
    list_professor_courses,
)

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
async def create_course_endpoint(
    course_in: CourseCreate,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CourseRead:
    if await get_course_by_code(session, course_in.code):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A course with this code already exists",
        )

    try:
        return await create_course(session, course_in, professor)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A course with this code already exists",
        ) from None


@router.get("/my", response_model=list[CourseRead])
async def read_professor_courses(
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[CourseRead]:
    return await list_professor_courses(session, professor.id)


@router.get("/enrolled", response_model=list[CourseRead])
async def read_enrolled_courses(
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[CourseRead]:
    return await list_enrolled_courses(session, student.id)


@router.get("", response_model=list[CourseRead])
async def read_courses(
    _: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[CourseRead]:
    return await list_courses(session)


@router.post(
    "/{course_id}/enroll",
    response_model=EnrollmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_in_course(
    course_id: uuid.UUID,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EnrollmentRead:
    if await session.get(Course, course_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    if await get_enrollment(session, student.id, course_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already enrolled in this course",
        )

    try:
        return await enroll_student(session, student.id, course_id)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already enrolled in this course",
        ) from None
