import logging
import uuid
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.chat import run_chat
from app.agents.chat.nodes import HISTORY_TURNS
from app.auth.dependencies import get_current_student
from app.db.session import get_db_session
from app.models.conversation import ChatRole
from app.models.course import Course
from app.models.user import User
from app.rag import llm
from app.rag.llm import LLMError, LLMRateLimitError, describe_rate_limit
from app.rag.vector_store import VectorStoreError
from app.schemas.chat import ChatRequest, ChatResponse, ConversationRead
from app.services.conversations import (
    add_message,
    get_conversation,
    get_or_create_conversation,
    list_messages,
)
from app.services.courses import get_enrollment
from app.services.materials import has_ready_material

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["chat"])


@router.get(
    "/{course_id}/chat",
    response_model=ConversationRead,
    summary="The student's saved conversation for a course",
)
async def read_conversation(
    course_id: uuid.UUID,
    student: Annotated[User, Depends(get_current_student)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ConversationRead:
    course = await _enrolled_course(session, course_id, student)
    conversation = await get_conversation(session, student.id, course.id)
    messages = await list_messages(session, conversation.id) if conversation else []
    return ConversationRead(
        course_id=course.id,
        conversation_id=conversation.id if conversation else None,
        messages=messages,
    )


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
    course = await _enrolled_course(session, course_id, student)
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

    # The question and its answer are committed together below, so a failed
    # LLM call never leaves an unanswered question in the stored history.
    conversation = await get_or_create_conversation(session, student.id, course.id)
    earlier = await list_messages(session, conversation.id, limit=HISTORY_TURNS)
    add_message(session, conversation, role=ChatRole.USER, content=question)

    try:
        result = await run_chat(
            {
                "course_id": course.id,
                "course_code": course.code,
                "course_title": course.title,
                "course_description": course.description,
                "question": question,
                "history": [
                    {"role": message.role.value, "content": message.content}
                    for message in earlier
                ],
            }
        )
    except LLMRateLimitError as exc:
        await session.rollback()
        logger.warning("Chat flow hit the provider rate limit: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=describe_rate_limit(exc),
        ) from None
    except LLMError:
        await session.rollback()
        logger.exception("Chat flow failed at the LLM provider")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI tutor is temporarily unavailable; please try again",
        ) from None
    except VectorStoreError:
        await session.rollback()
        logger.exception("Chat flow failed at the vector store")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The course knowledge base is unavailable; please try again",
        ) from None

    answer_status = result["status"]
    sources = [asdict(source) for source in result.get("sources", [])]
    reply = add_message(
        session,
        conversation,
        role=ChatRole.ASSISTANT,
        content=result["answer"],
        status=answer_status,
        sources=sources,
        trace=list(result["trace"]),
    )
    await session.commit()

    return ChatResponse(
        course_id=course.id,
        conversation_id=conversation.id,
        message_id=reply.id,
        answer=result["answer"],
        status=answer_status,
        grounded=answer_status == "grounded",
        in_scope=answer_status != "out_of_scope",
        sources=sources,
        trace=result["trace"],
        created_at=reply.created_at,
    )


async def _enrolled_course(
    session: AsyncSession, course_id: uuid.UUID, student: User
) -> Course:
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
    return course
