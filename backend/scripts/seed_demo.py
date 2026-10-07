"""Seed the Chat / Teaching demo: users, courses, enrollments and course material.

Run from backend/:  uv run python -m scripts.seed_demo [--reingest]

Safe to run repeatedly; existing users, courses and enrollments are reused.
"""

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import select

from app.db.session import AsyncSessionLocal, engine
from app.models.course import Course
from app.models.course_material import CourseMaterial, MaterialStatus
from app.models.user import User
from app.rag import llm, vector_store
from app.schemas.course import CourseCreate
from app.schemas.user import UserCreate
from app.services.auth import get_user_by_email, register_user
from app.services.courses import (
    create_course,
    enroll_student,
    get_course_by_code,
    get_enrollment,
)
from app.services.materials import ingest_pdf

DEMO_PASSWORD = "SigerDemo123"
DEMO_PDF = Path(__file__).resolve().parents[1] / "demo_data" / "db201_course_notes.pdf"

PROFESSOR = UserCreate(
    full_name="Dr. Ada Rao",
    email="prof.demo@siger.edu",
    password=DEMO_PASSWORD,
    role="professor",
)
STUDENT = UserCreate(
    full_name="Sam Student",
    email="student.demo@siger.edu",
    password=DEMO_PASSWORD,
    role="student",
)
# Not enrolled anywhere: shows the "not enrolled" guard.
OUTSIDER = UserCreate(
    full_name="Olive Outsider",
    email="outsider.demo@siger.edu",
    password=DEMO_PASSWORD,
    role="student",
)

DB201 = CourseCreate(
    title="Database Systems",
    code="DB201",
    description=(
        "Relational databases: the relational model and keys, functional "
        "dependencies and normalization, SQL joins, transactions and "
        "concurrency control, and indexing."
    ),
    semester="Fall 2026",
)
# Enrolled but without material: shows the "no course material" guard.
CS210 = CourseCreate(
    title="Design and Analysis of Algorithms",
    code="CS210",
    description="Algorithm design paradigms, complexity analysis and graph algorithms.",
    semester="Fall 2026",
)


async def get_or_create_user(session, user_in: UserCreate) -> User:
    user = await get_user_by_email(session, user_in.email)
    if user is None:
        user = await register_user(session, user_in)
        print(f"  created {user_in.role:<9} {user.email}")
    else:
        print(f"  exists  {user_in.role:<9} {user.email}")
    return user


async def get_or_create_course(session, course_in: CourseCreate, professor: User):
    course = await get_course_by_code(session, course_in.code)
    if course is None:
        course = await create_course(session, course_in, professor)
        print(f"  created course {course.code}")
    else:
        print(f"  exists  course {course.code}")
    return course


async def ensure_enrolled(session, student: User, course: Course) -> None:
    if await get_enrollment(session, student.id, course.id) is None:
        await enroll_student(session, student.id, course.id)
        print(f"  enrolled {student.email} in {course.code}")


async def ensure_material(
    session, course: Course, professor: User, reingest: bool
) -> None:
    existing = list(
        await session.scalars(
            select(CourseMaterial).where(CourseMaterial.course_id == course.id)
        )
    )
    # Failed attempts (e.g. no API key yet) are cleared so the UI stays tidy.
    stale = [m for m in existing if reingest or m.status != MaterialStatus.READY]
    for material in stale:
        await vector_store.delete_material(material.id)
        await session.delete(material)
    await session.commit()

    ready = [m for m in existing if m not in stale]
    if ready:
        print(f"  exists  material {ready[0].filename} ({ready[0].chunk_count} chunks)")
        return

    if not llm.is_configured():
        print("  skipped: set OPENROUTER_API_KEY in backend/.env, then run again")
        return

    material = await ingest_pdf(
        session,
        course=course,
        uploader=professor,
        filename=DEMO_PDF.name,
        data=DEMO_PDF.read_bytes(),
    )
    print(
        f"  ingested {material.filename}: {material.page_count} pages, "
        f"{material.chunk_count} chunks"
    )


async def main(reingest: bool) -> None:
    async with AsyncSessionLocal() as session:
        print("Users")
        professor = await get_or_create_user(session, PROFESSOR)
        student = await get_or_create_user(session, STUDENT)
        await get_or_create_user(session, OUTSIDER)

        print("Courses")
        db201 = await get_or_create_course(session, DB201, professor)
        cs210 = await get_or_create_course(session, CS210, professor)
        await ensure_enrolled(session, student, db201)
        await ensure_enrolled(session, student, cs210)

        print("Course material")
        await ensure_material(session, db201, professor, reingest)

    await engine.dispose()
    print(f"\nDone. All demo accounts use the password {DEMO_PASSWORD!r}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--reingest",
        action="store_true",
        help="delete DB201's material and embed the demo PDF again",
    )
    asyncio.run(main(parser.parse_args().reingest))
