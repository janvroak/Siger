import uuid
from dataclasses import dataclass
from functools import lru_cache

import httpx
from qdrant_client import AsyncQdrantClient, models
from qdrant_client.http.exceptions import ResponseHandlingException, UnexpectedResponse

from app.core.config import settings
from app.rag.chunking import Chunk

_QDRANT_ERRORS = (ResponseHandlingException, UnexpectedResponse, httpx.HTTPError)


class VectorStoreError(Exception):
    """Qdrant is unreachable or rejected the request."""


@dataclass(frozen=True)
class RetrievedChunk:
    material_id: str
    filename: str
    page: int
    chunk_index: int
    text: str
    score: float


@lru_cache
def _client() -> AsyncQdrantClient:
    return AsyncQdrantClient(url=settings.qdrant_url, timeout=10)


async def ensure_collection() -> None:
    """Create the lecture-material (slides) collection if missing."""
    await _ensure(settings.qdrant_collection, ("course_id", "material_id"))


async def ensure_answer_key_collection() -> None:
    """Create the answer-key collection if missing.

    Model answers live apart from lecture material so the student chatbot, which
    only searches the lecture collection, can never retrieve them.
    """
    await _ensure(settings.qdrant_answer_key_collection, ("course_id", "assignment_id"))


async def _ensure(name: str, keyword_fields: tuple[str, ...]) -> None:
    client = _client()
    try:
        if await client.collection_exists(name):
            info = await client.get_collection(name)
            vectors = info.config.params.vectors
            size = vectors.size if isinstance(vectors, models.VectorParams) else None
            if size != settings.embedding_dimensions:
                raise VectorStoreError(
                    f"Qdrant collection '{name}' stores {size}-dimensional vectors "
                    f"but EMBEDDING_DIMENSIONS={settings.embedding_dimensions}; "
                    "recreate the collection and re-index its content"
                )
            return

        await client.create_collection(
            collection_name=name,
            vectors_config=models.VectorParams(
                size=settings.embedding_dimensions, distance=models.Distance.COSINE
            ),
        )
        # Searches and deletes filter on these fields, so index them.
        for field in keyword_fields:
            await client.create_payload_index(
                collection_name=name,
                field_name=field,
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
    except _QDRANT_ERRORS as exc:
        raise VectorStoreError(f"Qdrant is unavailable: {exc}") from exc


async def upsert_chunks(
    *,
    course_id: uuid.UUID,
    material_id: uuid.UUID,
    filename: str,
    chunks: list[Chunk],
    vectors: list[list[float]],
) -> None:
    await ensure_collection()
    points = [
        models.PointStruct(
            id=str(uuid.uuid5(material_id, str(chunk.index))),
            vector=vector,
            payload={
                "course_id": str(course_id),
                "material_id": str(material_id),
                "filename": filename,
                "page": chunk.page,
                "chunk_index": chunk.index,
                "text": chunk.text,
            },
        )
        for chunk, vector in zip(chunks, vectors, strict=True)
    ]
    try:
        await _client().upsert(
            collection_name=settings.qdrant_collection, points=points, wait=True
        )
    except _QDRANT_ERRORS as exc:
        raise VectorStoreError(f"Could not store chunks in Qdrant: {exc}") from exc


async def delete_material(material_id: uuid.UUID) -> None:
    await ensure_collection()
    try:
        await _client().delete(
            collection_name=settings.qdrant_collection,
            points_selector=models.FilterSelector(
                filter=_match("material_id", str(material_id))
            ),
            wait=True,
        )
    except _QDRANT_ERRORS as exc:
        raise VectorStoreError(f"Could not delete chunks from Qdrant: {exc}") from exc


async def search(
    *, course_id: uuid.UUID, vector: list[float], limit: int
) -> list[RetrievedChunk]:
    """Nearest chunks by cosine similarity, restricted to one course."""
    await ensure_collection()
    try:
        response = await _client().query_points(
            collection_name=settings.qdrant_collection,
            query=vector,
            query_filter=_match("course_id", str(course_id)),
            limit=limit,
            with_payload=True,
        )
    except _QDRANT_ERRORS as exc:
        raise VectorStoreError(f"Qdrant search failed: {exc}") from exc

    return [
        RetrievedChunk(
            material_id=point.payload["material_id"],
            filename=point.payload["filename"],
            page=point.payload["page"],
            chunk_index=point.payload["chunk_index"],
            text=point.payload["text"],
            score=point.score,
        )
        for point in response.points
        if point.payload
    ]


async def replace_answer_keys(
    *,
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    question_ids: list[uuid.UUID],
    vectors: list[list[float]],
) -> None:
    """Store one model-answer vector per question, replacing the old ones."""
    await delete_answer_keys(assignment_id)
    points = [
        models.PointStruct(
            id=str(question_id),
            vector=vector,
            # Only identifiers: the model answer text stays in PostgreSQL.
            payload={
                "course_id": str(course_id),
                "assignment_id": str(assignment_id),
                "question_id": str(question_id),
            },
        )
        for question_id, vector in zip(question_ids, vectors, strict=True)
    ]
    try:
        await _client().upsert(
            collection_name=settings.qdrant_answer_key_collection,
            points=points,
            wait=True,
        )
    except _QDRANT_ERRORS as exc:
        raise VectorStoreError(f"Could not store answer keys in Qdrant: {exc}") from exc


async def delete_answer_keys(assignment_id: uuid.UUID) -> None:
    await ensure_answer_key_collection()
    try:
        await _client().delete(
            collection_name=settings.qdrant_answer_key_collection,
            points_selector=models.FilterSelector(
                filter=_match("assignment_id", str(assignment_id))
            ),
            wait=True,
        )
    except _QDRANT_ERRORS as exc:
        raise VectorStoreError(
            f"Could not delete answer keys from Qdrant: {exc}"
        ) from exc


async def get_answer_key_vectors(
    question_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[float]]:
    """Model-answer vectors by question id; questions not indexed are left out."""
    await ensure_answer_key_collection()
    try:
        records = await _client().retrieve(
            collection_name=settings.qdrant_answer_key_collection,
            ids=[str(question_id) for question_id in question_ids],
            with_vectors=True,
            with_payload=False,
        )
    except _QDRANT_ERRORS as exc:
        raise VectorStoreError(
            f"Could not read answer keys from Qdrant: {exc}"
        ) from exc
    return {
        uuid.UUID(str(record.id)): list(record.vector)
        for record in records
        if isinstance(record.vector, list)
    }


def _match(field: str, value: str) -> models.Filter:
    return models.Filter(
        must=[models.FieldCondition(key=field, match=models.MatchValue(value=value))]
    )
