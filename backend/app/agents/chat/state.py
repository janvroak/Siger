import operator
import uuid
from typing import Annotated, Literal, TypedDict

from app.rag.vector_store import RetrievedChunk

# grounded: answered from retrieved material
# not_in_material: nothing in the uploaded material is relevant enough
# out_of_scope: the material matched, but the question is not about the course
AnswerStatus = Literal["grounded", "not_in_material", "out_of_scope"]


class ChatTurn(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class TraceStep(TypedDict):
    node: str
    detail: str


class ChatState(TypedDict, total=False):
    # Inputs
    course_id: uuid.UUID
    course_code: str
    course_title: str
    course_description: str
    question: str
    history: list[ChatTurn]

    # retrieve / check_relevance
    search_query: str
    chunks: list[RetrievedChunk]  # only those above the relevance threshold

    # answer / refuse
    status: AnswerStatus
    answer: str
    sources: list[RetrievedChunk]

    # Each node appends one step, so the UI can show the path taken.
    trace: Annotated[list[TraceStep], operator.add]
