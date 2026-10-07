import operator
import uuid
from typing import Annotated, Literal, TypedDict

from app.rag.vector_store import RetrievedChunk

Route = Literal["course_question", "off_topic"]
# grounded: answered from retrieved material
# not_in_material: about the course, but the uploaded material does not cover it
# out_of_scope: unrelated to the course, politely refused
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

    # Planner
    route: Route
    search_query: str

    # Retrieval
    chunks: list[RetrievedChunk]

    # Teaching / Refusal
    status: AnswerStatus
    answer: str
    sources: list[RetrievedChunk]

    # Each node appends one step, so the UI can show the path taken.
    trace: Annotated[list[TraceStep], operator.add]
