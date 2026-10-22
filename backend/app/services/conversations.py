import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import ChatMessage, ChatRole, Conversation


async def get_conversation(
    session: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> Conversation | None:
    statement = select(Conversation).where(
        Conversation.student_id == student_id, Conversation.course_id == course_id
    )
    return await session.scalar(statement)


async def get_or_create_conversation(
    session: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> Conversation:
    """Return the student's conversation for the course, adding one if needed.

    New rows are only flushed; the caller commits them together with the
    messages, so a failed request leaves nothing behind.
    """
    conversation = await get_conversation(session, student_id, course_id)
    if conversation is None:
        conversation = Conversation(student_id=student_id, course_id=course_id)
        session.add(conversation)
        await session.flush()
    return conversation


async def list_messages(
    session: AsyncSession, conversation_id: uuid.UUID, limit: int | None = None
) -> list[ChatMessage]:
    """Messages oldest first; with a limit, the most recent ones."""
    statement = select(ChatMessage).where(
        ChatMessage.conversation_id == conversation_id
    )
    if limit is None:
        return list(await session.scalars(statement.order_by(ChatMessage.created_at)))

    recent = await session.scalars(
        statement.order_by(ChatMessage.created_at.desc()).limit(limit)
    )
    return list(reversed(list(recent)))


def add_message(
    session: AsyncSession,
    conversation: Conversation,
    *,
    role: ChatRole,
    content: str,
    status: str | None = None,
    sources: list[dict[str, Any]] | None = None,
    trace: list[dict[str, Any]] | None = None,
) -> ChatMessage:
    # Timestamps are set here rather than by now(), which is fixed for the whole
    # transaction and would give the question and its answer the same time.
    now = datetime.now(UTC)
    message = ChatMessage(
        conversation_id=conversation.id,
        role=role,
        content=content,
        status=status,
        sources=sources,
        trace=trace,
        created_at=now,
    )
    conversation.updated_at = now
    session.add(message)
    return message
