import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.agents.chat.state import AnswerStatus


class ChatRequest(BaseModel):
    # Earlier turns come from the stored conversation, not from the client.
    question: str = Field(min_length=1, max_length=2000)


class SourceRead(BaseModel):
    material_id: uuid.UUID
    filename: str
    page: int
    chunk_index: int
    score: float
    text: str


class TraceStepRead(BaseModel):
    node: str
    detail: str


class ChatResponse(BaseModel):
    course_id: uuid.UUID
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    answer: str
    status: AnswerStatus
    grounded: bool
    in_scope: bool
    sources: list[SourceRead]
    trace: list[TraceStepRead]
    created_at: datetime


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    # Only set on assistant messages.
    status: AnswerStatus | None
    sources: list[SourceRead] | None
    trace: list[TraceStepRead] | None
    created_at: datetime


class ConversationRead(BaseModel):
    course_id: uuid.UUID
    conversation_id: uuid.UUID | None  # None until the first question is asked
    messages: list[ChatMessageRead]
