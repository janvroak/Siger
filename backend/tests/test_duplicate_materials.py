"""Duplicate-upload handling, run against the real Postgres with fake RAG backends."""

import uuid
from pathlib import Path

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.course import Course
from app.models.course_material import CourseMaterial, MaterialStatus
from app.models.user import User, UserRole
from app.rag.llm import LLMError
from app.services import materials
from app.services.materials import DuplicateMaterialError, ingest_pdf

pytestmark = pytest.mark.anyio

DEMO_PDF = (
    Path(__file__).resolve().parents[1] / "demo_data" / "db201_course_notes.pdf"
).read_bytes()


@pytest.fixture
async def session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "upload_dir", tmp_path)
    monkeypatch.setattr(materials.llm, "is_configured", lambda: True)
    monkeypatch.setattr(materials.llm, "embed", _fake_embed)
    monkeypatch.setattr(materials.vector_store, "upsert_chunks", _noop)
    monkeypatch.setattr(materials.vector_store, "delete_material", _noop)

    engine = create_async_engine(settings.sqlalchemy_database_uri, poolclass=NullPool)
    try:
        async with engine.connect():
            pass
    except OSError:
        pytest.skip("PostgreSQL is not running")

    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
        await db.rollback()
        await db.execute(delete(Course).where(Course.code.like("TDUP%")))
        await db.execute(delete(User).where(User.email.like("tdup-%@example.com")))
        await db.commit()
    await engine.dispose()


async def _fake_embed(texts: list[str]) -> list[list[float]]:
    return [[0.0] * settings.embedding_dimensions for _ in texts]


async def _noop(*_: object, **__: object) -> None:
    return None


async def make_course(db) -> tuple[Course, User]:
    tag = uuid.uuid4().hex[:8]
    professor = User(
        full_name="Test Prof",
        email=f"tdup-{tag}@example.com",
        hashed_password="x",
        role=UserRole.PROFESSOR,
    )
    db.add(professor)
    await db.flush()
    course = Course(
        title="Dup test",
        code=f"TDUP{tag}".upper(),
        description="d",
        semester="s",
        professor_id=professor.id,
    )
    db.add(course)
    await db.commit()
    return course, professor


async def test_same_pdf_twice_is_rejected(session) -> None:
    course, professor = await make_course(session)
    first = await ingest_pdf(
        session, course=course, uploader=professor, filename="a.pdf", data=DEMO_PDF
    )
    assert first.status == MaterialStatus.READY and first.content_sha256

    with pytest.raises(DuplicateMaterialError) as caught:
        # A different filename does not matter: the content is the same.
        await ingest_pdf(
            session, course=course, uploader=professor, filename="b.pdf", data=DEMO_PDF
        )
    assert caught.value.existing.id == first.id
    assert len(list(Path(settings.upload_dir, "materials").iterdir())) == 1


async def test_same_pdf_in_another_course_is_allowed(session) -> None:
    course_a, professor = await make_course(session)
    course_b, _ = await make_course(session)
    await ingest_pdf(
        session, course=course_a, uploader=professor, filename="a.pdf", data=DEMO_PDF
    )
    other = await ingest_pdf(
        session, course=course_b, uploader=professor, filename="a.pdf", data=DEMO_PDF
    )
    assert other.status == MaterialStatus.READY


async def test_failed_upload_can_be_retried(session, monkeypatch) -> None:
    course, professor = await make_course(session)

    async def failing_embed(texts):
        raise LLMError("provider down")

    monkeypatch.setattr(materials.llm, "embed", failing_embed)
    with pytest.raises(LLMError):
        await ingest_pdf(
            session, course=course, uploader=professor, filename="a.pdf", data=DEMO_PDF
        )

    failed = await session.scalar(
        select(CourseMaterial).where(CourseMaterial.course_id == course.id)
    )
    assert failed.status == MaterialStatus.FAILED
    assert failed.stored_path is None  # the failed upload's file is not kept
    assert not list(Path(settings.upload_dir, "materials").iterdir())

    monkeypatch.setattr(materials.llm, "embed", _fake_embed)
    retried = await ingest_pdf(
        session, course=course, uploader=professor, filename="a.pdf", data=DEMO_PDF
    )
    assert retried.status == MaterialStatus.READY
    # The retry replaces the failed attempt instead of piling up rows.
    remaining = list(
        await session.scalars(
            select(CourseMaterial).where(CourseMaterial.course_id == course.id)
        )
    )
    assert [m.id for m in remaining] == [retried.id]


async def test_legacy_row_without_hash_matches_by_name_and_pages(session) -> None:
    course, professor = await make_course(session)
    session.add(
        CourseMaterial(
            course_id=course.id,
            uploaded_by_id=professor.id,
            filename="notes.pdf",
            status=MaterialStatus.READY,
            page_count=5,  # the demo PDF has 5 pages
            chunk_count=14,
        )
    )
    await session.commit()

    with pytest.raises(DuplicateMaterialError):
        await ingest_pdf(
            session,
            course=course,
            uploader=professor,
            filename="notes.pdf",
            data=DEMO_PDF,
        )
