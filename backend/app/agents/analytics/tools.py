"""The analytics agent's tools: fixed, safe SQL queries scoped by role.

The LLM only chooses which tools to call and with which ids; every number it
may quote comes from these results. Scoping is enforced here, not in the
prompt: a student's session can only ever read that student's own data, and a
professor only their course's assignments and enrolled students.
"""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.services import analytics
from app.services.courses import get_enrollment

Role = Literal["faculty", "student"]

# Fractions 0..1 are shown to the model as percentages, so it never converts.
_FRACTIONS = {
    "mastery",
    "rate",
    "score",
    "average_score",
    "comprehension",
    "exact_agreement",
    "within_half_mark",
}
MAX_ROWS = 25


class ToolError(Exception):
    """A tool call the agent is not allowed to make or got wrong."""


@dataclass(frozen=True)
class Scope:
    """Who is asking, about which course and (optionally) which student."""

    role: Role
    course_id: uuid.UUID
    # A student: always themselves. Faculty: the student whose dashboard
    # they are on, or None for the whole class.
    student_id: uuid.UUID | None


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    params: str  # shown to the model
    roles: tuple[Role, ...]
    run: Callable[[AsyncSession, Scope, dict[str, Any]], Awaitable[Any]]


# --- argument checks ------------------------------------------------------


async def _assignment_id(session: AsyncSession, scope: Scope, args: dict) -> uuid.UUID:
    try:
        assignment_id = uuid.UUID(str(args.get("assignment_id")))
    except ValueError:
        raise ToolError(
            "assignment_id must be one of the ids from list_assignments"
        ) from None
    assignment = await session.get(Assignment, assignment_id)
    if assignment is None or assignment.course_id != scope.course_id:
        raise ToolError("unknown assignment_id; call list_assignments first")
    return assignment_id


async def _student_id(session: AsyncSession, scope: Scope, args: dict) -> uuid.UUID:
    if scope.role == "student":
        # A student session only ever sees its own data, whatever was asked.
        assert scope.student_id is not None
        return scope.student_id
    raw = args.get("student_id") or scope.student_id
    try:
        student_id = uuid.UUID(str(raw))
    except ValueError:
        raise ToolError(
            "student_id must be one of the ids from list_students"
        ) from None
    if not await get_enrollment(session, student_id, scope.course_id):
        raise ToolError("that student is not enrolled in this course")
    return student_id


# --- tools ----------------------------------------------------------------


async def _list_assignments(session, scope, args):
    if scope.role == "student":
        assert scope.student_id is not None
        rows = await analytics.student_assignments(
            session, scope.course_id, scope.student_id
        )
        return [row.model_dump(mode="json") for row in rows]
    rows = await analytics.completion(session, scope.course_id)
    return [
        {
            "assignment_id": str(r.assignment_id),
            "title": r.title,
            "deadline": r.deadline.isoformat(),
        }
        for r in rows
    ]


async def _list_students(session, scope, args):
    rows = await analytics.student_summaries(session, scope.course_id)
    return [row.model_dump(mode="json") for row in rows]


async def _class_topic_averages(session, scope, args):
    assignment_id = await _assignment_id(session, scope, args)
    rows = await analytics.class_topic_averages(session, scope.course_id, assignment_id)
    return [row.model_dump(mode="json") for row in rows]


async def _completion_rate(session, scope, args):
    assignment_id = await _assignment_id(session, scope, args)
    row = await analytics.completion_rate(session, scope.course_id, assignment_id)
    return row.model_dump(mode="json") if row else None


async def _overdue_students(session, scope, args):
    rows = await analytics.overdue_students(session, scope.course_id)
    return [row.model_dump(mode="json") for row in rows]


async def _weakest_topics(session, scope, args):
    try:
        limit = min(max(int(args.get("limit", 5)), 1), 10)
    except (TypeError, ValueError):
        limit = 5
    rows = await analytics.weakest_topics(session, scope.course_id, limit)
    return [row.model_dump(mode="json") for row in rows]


async def _student_topic_mastery(session, scope, args):
    student_id = await _student_id(session, scope, args)
    topics = await analytics.student_topic_mastery(session, scope.course_id, student_id)
    return {
        "student_id": str(student_id),
        "comprehension": await analytics.comprehension(
            session, scope.course_id, student_id
        ),
        "topics": [row.model_dump(mode="json") for row in topics],
    }


async def _score_trend(session, scope, args):
    student_id = await _student_id(session, scope, args)
    rows = await analytics.score_trend(session, scope.course_id, student_id)
    return {
        "student_id": str(student_id),
        "trend": [row.model_dump(mode="json") for row in rows],
    }


async def _ai_agreement(session, scope, args):
    return (await analytics.ai_agreement(session, scope.course_id)).model_dump(
        mode="json"
    )


STUDENT_PARAM = (
    '{"student_id": "<id from list_students>"} (optional on a student\'s page)'
)

TOOLS: dict[str, Tool] = {
    tool.name: tool
    for tool in [
        Tool(
            "list_assignments",
            "The course's assignments (ids, titles, deadlines). For a student: their "
            "state on each (graded, overdue, pending...) and score.",
            "{}",
            ("faculty", "student"),
            _list_assignments,
        ),
        Tool(
            "list_students",
            "Every enrolled student with comprehension, graded/submitted counts and "
            "overdue count, weakest first.",
            "{}",
            ("faculty",),
            _list_students,
        ),
        Tool(
            "class_topic_averages",
            "Average % per topic for the class on one assignment.",
            '{"assignment_id": "<id>"}',
            ("faculty",),
            _class_topic_averages,
        ),
        Tool(
            "completion_rate",
            "Submitted / pending / overdue counts and the average score of one "
            "assignment.",
            '{"assignment_id": "<id>"}',
            ("faculty",),
            _completion_rate,
        ),
        Tool(
            "overdue_students",
            "Students who missed a deadline, with the assignment.",
            "{}",
            ("faculty",),
            _overdue_students,
        ),
        Tool(
            "weakest_topics",
            "Topics with the lowest class mastery across the course (learning gaps).",
            '{"limit": <1-10, default 5>}',
            ("faculty",),
            _weakest_topics,
        ),
        Tool(
            "student_topic_mastery",
            "Mastery per topic and overall comprehension for one student.",
            STUDENT_PARAM,
            ("faculty", "student"),
            _student_topic_mastery,
        ),
        Tool(
            "score_trend",
            "One student's published score per assignment over time.",
            STUDENT_PARAM,
            ("faculty", "student"),
            _score_trend,
        ),
        Tool(
            "ai_grading_agreement",
            "How often faculty kept the AI's marks when reviewing.",
            "{}",
            ("faculty",),
            _ai_agreement,
        ),
    ]
}


def tools_for(scope: Scope) -> list[Tool]:
    return [tool for tool in TOOLS.values() if scope.role in tool.roles]


def catalogue(scope: Scope) -> str:
    lines = []
    for tool in tools_for(scope):
        params = (
            "{}"
            if scope.role == "student" and tool.params == STUDENT_PARAM
            else tool.params
        )
        lines.append(f"- {tool.name} {params}: {tool.description}")
    return "\n".join(lines)


async def run_tool(
    session: AsyncSession, scope: Scope, name: str, args: dict[str, Any]
) -> Any:
    """Run one tool for this scope; returns model-ready data (percentages)."""
    tool = TOOLS.get(name)
    if tool is None or scope.role not in tool.roles:
        raise ToolError(f"'{name}' is not an available tool")
    result = await tool.run(session, scope, args if isinstance(args, dict) else {})
    return present(result)


def present(value: Any) -> Any:
    """Fractions as percentages (1 decimal) and long lists cut, for the model."""
    if isinstance(value, list):
        return [present(item) for item in value[:MAX_ROWS]]
    if isinstance(value, dict):
        shown: dict[str, Any] = {}
        for key, item in value.items():
            if key in _FRACTIONS and isinstance(item, int | float):
                shown[f"{key}_pct"] = round(item * 100, 1)
            elif key in _FRACTIONS and item is None:
                shown[f"{key}_pct"] = None
            else:
                shown[key] = present(item)
        return shown
    return value
