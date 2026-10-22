import uuid

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, Enrollment
from app.models.course_material import CourseMaterial, MaterialStatus
from app.models.user import User
from app.schemas.course import CourseCreate, CourseRead, CourseSummary


async def get_course_by_code(session: AsyncSession, code: str) -> Course | None:
    statement = select(Course).where(Course.code == code.strip().upper())
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
) -> list[CourseSummary]:
    statement = _summaries().where(Course.professor_id == professor_id)
    return await _fetch_summaries(session, statement.order_by(Course.created_at.desc()))


async def list_courses(session: AsyncSession) -> list[CourseSummary]:
    statement = _summaries().order_by(Course.created_at.desc())
    return await _fetch_summaries(session, statement)


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
) -> list[CourseSummary]:
    statement = (
        _summaries()
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.student_id == student_id)
        .order_by(Enrollment.enrolled_at.desc())
    )
    return await _fetch_summaries(session, statement)


async def get_course_summary(
    session: AsyncSession, course_id: uuid.UUID
) -> CourseSummary | None:
    summaries = await _fetch_summaries(
        session, _summaries().where(Course.id == course_id)
    )
    return summaries[0] if summaries else None


def _summaries() -> Select:
    """Courses with their professor's name and enrollment/material counts."""
    student_count = (
        select(func.count(Enrollment.id))
        .where(Enrollment.course_id == Course.id)
        .correlate(Course)
        .scalar_subquery()
    )
    material_count = (
        select(func.count(CourseMaterial.id))
        .where(
            CourseMaterial.course_id == Course.id,
            CourseMaterial.status == MaterialStatus.READY,
        )
        .correlate(Course)
        .scalar_subquery()
    )
    return select(
        Course,
        User.full_name,
        student_count.label("student_count"),
        material_count.label("material_count"),
    ).join(User, User.id == Course.professor_id)


async def _fetch_summaries(
    session: AsyncSession, statement: Select
) -> list[CourseSummary]:
    rows = await session.execute(statement)
    return [
        CourseSummary(
            **CourseRead.model_validate(course).model_dump(),
            professor_name=professor_name,
            student_count=student_count,
            material_count=material_count,
        )
        for course, professor_name, student_count, material_count in rows
    ]
