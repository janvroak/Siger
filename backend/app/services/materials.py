import uuid
from contextlib import suppress

from sqlalchemy import exists, select
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


async def ingest_pdf(
    session: AsyncSession,
    *,
    course: Course,
    uploader: User,
    filename: str,
    data: bytes,
) -> CourseMaterial:
    """Extract, chunk, embed and index a PDF for one course.

    Raises InvalidPDFError or LLMNotConfiguredError before anything is stored.
    If embedding or indexing fails, the material row is kept as FAILED so the
    professor can see why.
    """
    extracted = extract_pdf(data)
    if not llm.is_configured():
        raise LLMNotConfiguredError("OPENROUTER_API_KEY is not set")
    chunks = chunk_pages(extracted.pages, settings.chunk_size, settings.chunk_overlap)

    material = CourseMaterial(
        course_id=course.id,
        uploaded_by_id=uploader.id,
        filename=filename,
        page_count=extracted.page_count,
        status=MaterialStatus.PROCESSING,
    )
    session.add(material)
    await session.commit()
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
