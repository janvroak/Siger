"""Seed the Chat / Teaching demo: users, courses, enrollments and course material.

Run from backend/:  uv run python -m scripts.seed_demo [--reingest | --remove]

Demo data exists only when this script is run explicitly; the application never
creates it. Safe to run repeatedly; existing users, courses and enrollments are
reused. --remove deletes everything this script creates.
"""

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import delete, select

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
from app.services.materials import delete_material_file, ingest_pdf

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
        delete_material_file(material)
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


async def remove_demo() -> None:
    """Delete the demo accounts and the courses they own, with their material."""
    demo_emails = [user.email for user in (PROFESSOR, STUDENT, OUTSIDER)]
    async with AsyncSessionLocal() as session:
        users = list(
            await session.scalars(select(User).where(User.email.in_(demo_emails)))
        )
        user_ids = [user.id for user in users]
        courses = list(
            await session.scalars(
                select(Course).where(Course.professor_id.in_(user_ids))
            )
        )
        course_ids = [course.id for course in courses]
        materials = list(
            await session.scalars(
                select(CourseMaterial).where(CourseMaterial.course_id.in_(course_ids))
            )
        )
        for material in materials:
            await vector_store.delete_material(material.id)
            delete_material_file(material)

        # Enrollments, materials and conversations go with the course/user rows
        # through ON DELETE CASCADE.
        await session.execute(delete(Course).where(Course.id.in_(course_ids)))
        await session.execute(delete(User).where(User.id.in_(user_ids)))
        await session.commit()

    await engine.dispose()
    print(
        f"Removed {len(courses)} demo course(s) {[c.code for c in courses]}, "
        f"{len(materials)} material(s) and {len(users)} demo account(s)."
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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--reingest",
        action="store_true",
        help="delete DB201's material and embed the demo PDF again",
    )
    mode.add_argument(
        "--remove",
        action="store_true",
        help="delete all demo accounts, courses and material",
    )
    args = parser.parse_args()
    asyncio.run(remove_demo() if args.remove else main(args.reingest))
