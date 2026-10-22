import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.analytics import router as analytics_router
from app.api.routes.assignments import router as assignments_router
from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.courses import router as courses_router
from app.api.routes.health import router as health_router
from app.api.routes.materials import router as materials_router
from app.api.routes.submissions import router as submissions_router
from app.api.routes.users import router as users_router
from app.core.config import settings
from app.rag import vector_store
from app.services import grading

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Qdrant being down must not stop the API; RAG endpoints report it instead.
    try:
        await vector_store.ensure_collection()
        await vector_store.ensure_answer_key_collection()
    except vector_store.VectorStoreError as exc:
        logger.warning("Course knowledge base not ready: %s", exc)
    # Gradings cut off by a restart would otherwise stay "evaluating" forever.
    try:
        if recovered := await grading.recover_interrupted():
            logger.warning("Marked %d interrupted grading(s) as failed", recovered)
    except Exception:
        logger.exception("Could not check for interrupted gradings")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        lifespan=lifespan,
    )

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(courses_router)
    app.include_router(materials_router)
    app.include_router(assignments_router)
    app.include_router(submissions_router)
    app.include_router(analytics_router)
    app.include_router(chat_router)
    app.include_router(users_router)

    return app


app = create_app()
