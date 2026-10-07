import logging
import uuid
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.chat import run_chat
from app.auth.dependencies import get_current_student
from app.db.session import get_db_session
from app.models.course import Course
from app.models.user import User
from app.rag import llm
from app.rag.llm import LLMError
from app.rag.vector_store import VectorStoreError
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.courses import get_enrollment
from app.services.materials import has_ready_material

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["chat"])


@router.post(
    "/{course_id}/chat",
    response_model=ChatResponse,
    summary="Ask the course teaching assistant a question",
)
async def chat_with_course(
    course_id: uuid.UUID,
    request: ChatRequest,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatResponse:
    course = await session.get(Course, course_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )
    if await get_enrollment(session, student.id, course.id) is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in this course",
        )
    if not await has_ready_material(session, course.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No course material has been uploaded for this course yet",
        )
    if not llm.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI tutor is not configured",
        )

    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question must not be empty",
        )

    try:
        result = await run_chat(
            {
                "course_id": course.id,
                "course_code": course.code,
                "course_title": course.title,
                "course_description": course.description,
                "question": question,
                "history": [turn.model_dump() for turn in request.history],
            }
        )
    except LLMError:
        logger.exception("Chat flow failed at the LLM provider")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI tutor is temporarily unavailable; please try again",
        ) from None
    except VectorStoreError:
        logger.exception("Chat flow failed at the vector store")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The course knowledge base is unavailable; please try again",
        ) from None

    answer_status = result["status"]
    return ChatResponse(
        course_id=course.id,
        answer=result["answer"],
        status=answer_status,
        grounded=answer_status == "grounded",
        in_scope=answer_status != "out_of_scope",
        sources=[asdict(source) for source in result.get("sources", [])],
        trace=result["trace"],
    )
