import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.agents.chat.state import AnswerStatus


class ChatTurnIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # Earlier turns of this session, so follow-ups like "explain that again" work.
    history: list[ChatTurnIn] = Field(default_factory=list, max_length=20)


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
    answer: str
    status: AnswerStatus
    grounded: bool
    in_scope: bool
    sources: list[SourceRead]
    trace: list[TraceStepRead]
