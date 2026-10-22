import hashlib
import uuid
from contextlib import suppress
from pathlib import Path

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.course import Course
from app.models.course_material import CourseMaterial, MaterialStatus
from app.models.user import User
from app.rag import llm, vector_store
from app.rag.chunking import chunk_pages
from app.rag.llm import LLMError, LLMNotConfiguredError
from app.rag.pdf import extract_pdf
from app.rag.vector_store import VectorStoreError


class DuplicateMaterialError(Exception):
    """The course already has this document."""

    def __init__(self, existing: CourseMaterial) -> None:
        super().__init__(f"{existing.filename} is already in this course")
        self.existing = existing


async def find_duplicate(
    session: AsyncSession,
    *,
    course_id: uuid.UUID,
    content_sha256: str,
    filename: str,
    page_count: int,
) -> CourseMaterial | None:
    """An existing, non-failed copy of the same document in the course.

    Material uploaded before hashes were recorded has no hash, so for those rows
    the same filename and page count counts as the same document.
    """
    statement = select(CourseMaterial).where(
        CourseMaterial.course_id == course_id,
        CourseMaterial.status != MaterialStatus.FAILED,
        or_(
            CourseMaterial.content_sha256 == content_sha256,
            and_(
                CourseMaterial.content_sha256.is_(None),
                CourseMaterial.filename == filename,
                CourseMaterial.page_count == page_count,
            ),
        ),
    )
    return await session.scalar(statement.order_by(CourseMaterial.created_at).limit(1))


async def ingest_pdf(
    session: AsyncSession,
    *,
    course: Course,
    uploader: User,
    filename: str,
    data: bytes,
) -> CourseMaterial:
    """Extract, chunk, embed and index a PDF for one course.

    Raises InvalidPDFError, DuplicateMaterialError or LLMNotConfiguredError
    before anything is stored. If embedding or indexing fails, the material row
    is kept as FAILED so the professor can see why.
    """
    extracted = extract_pdf(data)
    content_sha256 = hashlib.sha256(data).hexdigest()
    duplicate = await find_duplicate(
        session,
        course_id=course.id,
        content_sha256=content_sha256,
        filename=filename,
        page_count=extracted.page_count,
    )
    if duplicate is not None:
        raise DuplicateMaterialError(duplicate)
    if not llm.is_configured():
        raise LLMNotConfiguredError("OPENROUTER_API_KEY is not set")
    await _remove_failed_attempts(session, course.id, content_sha256)
    chunks = chunk_pages(extracted.pages, settings.chunk_size, settings.chunk_overlap)

    # Keep the original PDF so it can be viewed later; the name is ours, never
    # the client's, so it cannot point anywhere outside the uploads directory.
    material_id = uuid.uuid4()
    stored_path = f"materials/{material_id}.pdf"
    destination = settings.upload_dir / stored_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)

    material = CourseMaterial(
        id=material_id,
        stored_path=stored_path,
        content_sha256=content_sha256,
        course_id=course.id,
        uploaded_by_id=uploader.id,
        filename=filename,
        page_count=extracted.page_count,
        status=MaterialStatus.PROCESSING,
    )
    session.add(material)
    try:
        await session.commit()
    except IntegrityError:
        # The same document was uploaded concurrently; the unique index caught it.
        await session.rollback()
        destination.unlink(missing_ok=True)
        duplicate = await find_duplicate(
            session,
            course_id=course.id,
            content_sha256=content_sha256,
            filename=filename,
            page_count=extracted.page_count,
        )
        if duplicate is None:
            raise
        raise DuplicateMaterialError(duplicate) from None
    await session.refresh(material)

    try:
        vectors = await llm.embed([chunk.text for chunk in chunks])
        await vector_store.upsert_chunks(
            course_id=course.id,
            material_id=material.id,
            filename=filename,
            chunks=chunks,
            vectors=vectors,
        )
    except (LLMError, VectorStoreError) as exc:
        material.status = MaterialStatus.FAILED
        material.error = str(exc)[:1000]
        # A failed upload is not course material; don't keep its file around.
        delete_material_file(material)
        material.stored_path = None
        await session.commit()
        # Remove any partially written chunks so retrieval never sees them.
        with suppress(VectorStoreError):
            await vector_store.delete_material(material.id)
        raise

    material.status = MaterialStatus.READY
    material.chunk_count = len(chunks)
    await session.commit()
    await session.refresh(material)
    return material


async def _remove_failed_attempts(
    session: AsyncSession, course_id: uuid.UUID, content_sha256: str
) -> None:
    """Drop earlier failed uploads of this document; the new attempt replaces them."""
    failed = await session.scalars(
        select(CourseMaterial).where(
            CourseMaterial.course_id == course_id,
            CourseMaterial.content_sha256 == content_sha256,
            CourseMaterial.status == MaterialStatus.FAILED,
        )
    )
    for material in failed:
        delete_material_file(material)
        await session.delete(material)
    await session.commit()


def material_file(material: CourseMaterial) -> Path | None:
    """Absolute path of a material's stored PDF, if it exists inside upload_dir."""
    if not material.stored_path:
        return None
    root = settings.upload_dir.resolve()
    path = (root / material.stored_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        return None
    return path


def delete_material_file(material: CourseMaterial) -> None:
    path = material_file(material)
    if path is not None:
        path.unlink(missing_ok=True)


async def get_course_material(
    session: AsyncSession, course_id: uuid.UUID, material_id: uuid.UUID
) -> CourseMaterial | None:
    material = await session.get(CourseMaterial, material_id)
    if material is None or material.course_id != course_id:
        return None
    return material


async def list_materials(
    session: AsyncSession, course_id: uuid.UUID
) -> list[CourseMaterial]:
    statement = select(CourseMaterial).where(CourseMaterial.course_id == course_id)
    return list(
        await session.scalars(statement.order_by(CourseMaterial.created_at.desc()))
    )


async def has_ready_material(session: AsyncSession, course_id: uuid.UUID) -> bool:
    statement = select(
        exists().where(
            CourseMaterial.course_id == course_id,
            CourseMaterial.status == MaterialStatus.READY,
        )
    )
    return bool(await session.scalar(statement))
