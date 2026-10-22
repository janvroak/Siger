"""Shared API test setup: real Postgres, fake embeddings/Qdrant, fake auth.

`world` gives two professors, an enrolled student, a student from outside the
course, and a course; `world.client(user)` calls the API as that user.
"""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.db.session import get_db_session
from app.main import app
from app.models.course import Course, Enrollment
from app.models.user import User, UserRole
from app.services import assignments as assignment_service

TAG = "tasg"
SECRET_ANSWER = "Normalization removes redundancy SECRET-ANSWER"
SECRET_POINT = "SECRET-POINT about anomalies"


def assignment_body(**overrides) -> dict:
    body = {
        "title": "Normalization quiz",
        "instructions": "Answer in your own words.",
        "deadline": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        "questions": [
            {
                "text": "Why do we normalize a schema?",
                "model_answer": SECRET_ANSWER,
                "max_marks": 5,
                "topic": "Normalization",
                "key_points": [SECRET_POINT, "  ", "Avoids update anomalies"],
            },
            {
                "text": "Define a primary key.",
                "model_answer": "A minimal set of attributes that identifies a row.",
                "max_marks": 2.5,
                "topic": "Keys",
            },
        ],
    }
    body.update(overrides)
    return body


class World:
    """Users and a course, plus a way to call the API as any of them."""

    def __init__(self, db, professor, other_professor, student, outsider, course):
        self.db = db
        self.professor = professor
        self.other_professor = other_professor
        self.student = student
        self.outsider = outsider
        self.course = course
        self.indexed: dict[str, list[str]] = {}  # assignment_id -> question ids

    def client(self, user: User) -> httpx.AsyncClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    @property
    def base(self) -> str:
        return f"/courses/{self.course.id}/assignments"


@pytest.fixture
async def world(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setattr(settings, "upload_dir", tmp_path)
    engine = create_async_engine(settings.sqlalchemy_database_uri, poolclass=NullPool)
    try:
        async with engine.connect():
            pass
    except OSError:
        pytest.skip("PostgreSQL is not running")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def db_override():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_db_session] = db_override

    async with sessions() as db:
        tag = uuid.uuid4().hex[:8]

        def user(name: str, role: UserRole) -> User:
            return User(
                full_name=name,
                email=f"{TAG}-{name}-{tag}@example.com",
                hashed_password="x",
                role=role,
            )

        professor = user("prof", UserRole.PROFESSOR)
        other_professor = user("prof2", UserRole.PROFESSOR)
        student = user("student", UserRole.STUDENT)
        outsider = user("outsider", UserRole.STUDENT)
        db.add_all([professor, other_professor, student, outsider])
        await db.flush()
        course = Course(
            title="Databases",
            code=f"{TAG}{tag}".upper(),
            description="d",
            semester="s",
            professor_id=professor.id,
        )
        db.add(course)
        await db.flush()
        db.add(Enrollment(student_id=student.id, course_id=course.id))
        await db.commit()

        w = World(db, professor, other_professor, student, outsider, course)

        async def fake_embed(texts):
            return [[0.1] * settings.embedding_dimensions for _ in texts]

        async def fake_replace(*, course_id, assignment_id, question_ids, vectors):
            w.indexed[str(assignment_id)] = [str(q) for q in question_ids]

        async def fake_delete(assignment_id):
            w.indexed.pop(str(assignment_id), None)

        monkeypatch.setattr(assignment_service.llm, "embed", fake_embed)
        monkeypatch.setattr(
            assignment_service.vector_store, "replace_answer_keys", fake_replace
        )
        monkeypatch.setattr(
            assignment_service.vector_store, "delete_answer_keys", fake_delete
        )

        yield w

        await db.execute(delete(Course).where(Course.id == course.id))
        await db.execute(delete(User).where(User.email.like(f"{TAG}-%@example.com")))
        await db.commit()

    app.dependency_overrides.clear()
    await engine.dispose()


async def create_assignment(w: World, **overrides) -> dict:
    async with w.client(w.professor) as client:
        response = await client.post(w.base, json=assignment_body(**overrides))
    assert response.status_code == 201, response.text
    return response.json()
