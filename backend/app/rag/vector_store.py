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
    """Create the chunk collection and its payload indexes if missing."""
    client = _client()
    name = settings.qdrant_collection
    try:
        if await client.collection_exists(name):
            info = await client.get_collection(name)
            vectors = info.config.params.vectors
            size = vectors.size if isinstance(vectors, models.VectorParams) else None
            if size != settings.embedding_dimensions:
                raise VectorStoreError(
                    f"Qdrant collection '{name}' stores {size}-dimensional vectors "
                    f"but EMBEDDING_DIMENSIONS={settings.embedding_dimensions}; "
                    "recreate the collection and re-upload the course material"
                )
            return

        await client.create_collection(
            collection_name=name,
            vectors_config=models.VectorParams(
                size=settings.embedding_dimensions, distance=models.Distance.COSINE
            ),
        )
        # Every search filters by course, so index the fields used in filters.
        for field in ("course_id", "material_id"):
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


def _match(field: str, value: str) -> models.Filter:
    return models.Filter(
        must=[models.FieldCondition(key=field, match=models.MatchValue(value=value))]
    )
