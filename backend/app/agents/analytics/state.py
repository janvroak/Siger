import operator
from typing import Annotated, Any, TypedDict

from app.agents.analytics.tools import Scope


class ToolCall(TypedDict):
    tool: str
    args: dict[str, Any]


class ToolResult(TypedDict):
    tool: str
    args: dict[str, Any]
    result: Any  # None when the call failed
    error: str | None


class TraceStep(TypedDict):
    node: str
    detail: str


class AnalyticsState(TypedDict, total=False):
    # Inputs
    scope: Scope
    question: str
    context: str  # course and whose data, for the prompt

    # analyst_llm <-> sql_tools
    pending: list[ToolCall]
    results: Annotated[list[ToolResult], operator.add]
    calls_used: int

    # analyst_llm -> verify_numbers
    insight: str
    rewrites: int
    feedback: str  # why the last insight failed verification

    # verify_numbers
    verified: bool
    unsupported: list[str]

    trace: Annotated[list[TraceStep], operator.add]
