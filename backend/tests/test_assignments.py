"""Assignment API, run against the real Postgres with fake embedding/Qdrant.

The key property: no endpoint a student can reach ever returns model answers
or key points.
"""

import uuid
from datetime import UTC, datetime, timedelta

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
from app.rag.llm import LLMError
from app.services import assignments as assignment_service

pytestmark = pytest.mark.anyio

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
async def world(monkeypatch: pytest.MonkeyPatch):
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


async def create(w: World) -> dict:
    async with w.client(w.professor) as client:
        response = await client.post(w.base, json=assignment_body())
    assert response.status_code == 201, response.text
    return response.json()


async def test_professor_creates_assignment_with_answer_key(world) -> None:
    created = await create(world)

    assert [q["position"] for q in created["questions"]] == [1, 2]
    first = created["questions"][0]
    assert first["model_answer"] == SECRET_ANSWER
    # Blank key points are dropped.
    assert first["key_points"] == [SECRET_POINT, "Avoids update anomalies"]
    assert created["answer_keys_indexed"] is True
    assert world.indexed[created["id"]] == [q["id"] for q in created["questions"]]


async def test_student_never_sees_the_answer_key(world) -> None:
    created = await create(world)

    async with world.client(world.student) as client:
        listing = await client.get(world.base)
        detail = await client.get(f"{world.base}/{created['id']}")
        key = await client.get(f"{world.base}/{created['id']}/key")

    assert listing.status_code == 200
    assert listing.json()[0]["question_count"] == 2
    assert listing.json()[0]["total_marks"] == 7.5

    assert detail.status_code == 200
    question = detail.json()["questions"][0]
    assert question["text"] == "Why do we normalize a schema?"
    assert "model_answer" not in question and "key_points" not in question
    for response in (listing, detail):
        assert "SECRET" not in response.text

    assert key.status_code == 403


async def test_only_the_course_professor_manages_assignments(world) -> None:
    created = await create(world)
    url = f"{world.base}/{created['id']}"

    async with world.client(world.other_professor) as client:
        assert (
            await client.post(world.base, json=assignment_body())
        ).status_code == 403
        assert (await client.get(f"{url}/key")).status_code == 403
        assert (await client.delete(url)).status_code == 403

    async with world.client(world.student) as client:
        assert (
            await client.post(world.base, json=assignment_body())
        ).status_code == 403
        assert (await client.put(url, json=assignment_body())).status_code == 403

    async with world.client(world.outsider) as client:
        assert (await client.get(world.base)).status_code == 403
        assert (await client.get(url)).status_code == 403


async def test_replace_and_delete(world) -> None:
    created = await create(world)
    url = f"{world.base}/{created['id']}"
    body = assignment_body(title="Quiz v2")
    body["questions"] = body["questions"][:1]

    async with world.client(world.professor) as client:
        replaced = await client.put(url, json=body)
        assert replaced.status_code == 200, replaced.text
        assert replaced.json()["title"] == "Quiz v2"
        assert len(replaced.json()["questions"]) == 1
        assert world.indexed[created["id"]] == [replaced.json()["questions"][0]["id"]]

        assert (await client.delete(url)).status_code == 204
        assert (await client.get(url)).status_code == 404

    assert created["id"] not in world.indexed


async def test_assignment_is_saved_even_if_indexing_fails(world, monkeypatch) -> None:
    async def failing_embed(texts):
        raise LLMError("rate limited")

    monkeypatch.setattr(assignment_service.llm, "embed", failing_embed)
    created = await create(world)
    assert created["answer_keys_indexed"] is False
    assert len(created["questions"]) == 2


@pytest.mark.parametrize(
    "overrides",
    [
        {"questions": []},
        {"title": "   "},
        {"deadline": "2030-01-01T10:00:00"},  # no timezone
        {
            "questions": [
                {"text": "q", "model_answer": "a", "max_marks": 0, "topic": "t"}
            ]
        },
        {
            "questions": [
                {
                    "text": "q",
                    "model_answer": "a",
                    "max_marks": 1,
                    "topic": "t",
                    "key_points": ["1", "2", "3", "4", "5", "6"],
                }
            ]
        },
    ],
)
async def test_invalid_assignments_are_rejected(world, overrides) -> None:
    async with world.client(world.professor) as client:
        response = await client.post(world.base, json=assignment_body(**overrides))
    assert response.status_code == 422
