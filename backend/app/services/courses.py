import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, Enrollment
from app.models.user import User
from app.schemas.course import CourseCreate


async def get_course_by_code(session: AsyncSession, code: str) -> Course | None:
    statement = select(Course).where(Course.code == code.upper())
    return await session.scalar(statement)


async def create_course(
    session: AsyncSession, course_in: CourseCreate, professor: User
) -> Course:
    course = Course(
        title=course_in.title.strip(),
        code=course_in.code.strip().upper(),
        description=course_in.description.strip(),
        semester=course_in.semester.strip(),
        professor_id=professor.id,
    )
    session.add(course)
    await session.commit()
    await session.refresh(course)
    return course


async def list_professor_courses(
    session: AsyncSession, professor_id: uuid.UUID
) -> list[Course]:
    statement = select(Course).where(Course.professor_id == professor_id)
    return list(await session.scalars(statement.order_by(Course.created_at.desc())))


async def list_courses(session: AsyncSession) -> list[Course]:
    statement = select(Course).order_by(Course.created_at.desc())
    return list(await session.scalars(statement))


async def get_enrollment(
    session: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> Enrollment | None:
    statement = select(Enrollment).where(
        Enrollment.student_id == student_id, Enrollment.course_id == course_id
    )
    return await session.scalar(statement)


async def enroll_student(
    session: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> Enrollment:
    enrollment = Enrollment(student_id=student_id, course_id=course_id)
    session.add(enrollment)
    await session.commit()
    await session.refresh(enrollment)
    return enrollment


async def list_enrolled_courses(
    session: AsyncSession, student_id: uuid.UUID
) -> list[Course]:
    statement = (
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.student_id == student_id)
        .order_by(Enrollment.enrolled_at.desc())
    )
    return list(await session.scalars(statement))
