"""The analytics agent with a scripted LLM over the real database.

Uses the hand-computed dataset from test_analytics: Transactions 20% (a gap),
Normalization 88.9%, Keys 100%; Cal missed A1.
"""

import pytest

from app.agents.analytics import nodes
from app.agents.analytics.tools import present
from app.agents.analytics.verify import allowed_numbers, unsupported_numbers
from app.rag.llm import LLMRateLimitError
from tests.test_analytics import build

pytestmark = pytest.mark.anyio


class ScriptedLLM:
    """Plays back replies in order and records what the agent saw."""

    def __init__(self, replies) -> None:
        self.replies = list(replies)
        self.seen: list[tuple[str, str]] = []

    async def chat_json(self, system: str, user: str) -> dict:
        self.seen.append((system, user))
        reply = (
            self.replies.pop(0) if self.replies else {"action": "answer", "insight": ""}
        )
        return reply(system, user) if callable(reply) else reply


def call(*calls) -> dict:
    return {
        "action": "call",
        "calls": [{"tool": name, "args": args} for name, args in calls],
    }


def answer(text: str) -> dict:
    return {"action": "answer", "insight": text}


@pytest.fixture
def llm(monkeypatch):
    def install(*replies):
        scripted = ScriptedLLM(replies)
        monkeypatch.setattr(nodes.llm, "chat_json", scripted.chat_json)
        monkeypatch.setattr(nodes.llm, "is_configured", lambda: True)
        from app.api.routes import analytics as routes

        monkeypatch.setattr(routes.llm, "is_configured", lambda: True)
        return scripted

    return install


async def ask(world, user, **body):
    async with world.client(user) as client:
        return await client.post(
            f"/courses/{world.course.id}/analytics/insight", json=body
        )


# --- deterministic parts --------------------------------------------------


def test_numbers_must_match_tool_results_to_written_precision() -> None:
    results = [
        {"topic": "Transactions", "mastery_pct": 46.9, "title": "Assignment 2"},
        {"overdue": 3},
    ]
    allowed = allowed_numbers(results, question="top 5 topics")
    assert unsupported_numbers("Transactions is at 47% (46.9%).", allowed) == []
    assert (
        unsupported_numbers("In Assignment 2, 3 students are late; top 5.", allowed)
        == []
    )
    assert unsupported_numbers("Mastery rose to 52% across 4 topics.", allowed) == [
        "52",
        "4",
    ]


def test_fractions_are_presented_as_percentages() -> None:
    shown = present(
        {
            "mastery": 0.2,
            "comprehension": None,
            "earned": 1.0,
            "rows": [{"rate": 0.6667}],
        }
    )
    assert shown == {
        "mastery_pct": 20.0,
        "comprehension_pct": None,
        "earned": 1.0,
        "rows": [{"rate_pct": 66.7}],
    }


# --- the agent ------------------------------------------------------------


async def test_faculty_insight_uses_tools_and_is_verified(world, llm) -> None:
    await build(world)
    scripted = llm(
        call(("weakest_topics", {"limit": 3}), ("overdue_students", {})),
        answer(
            "- Transactions is the main learning gap at 20.0% mastery.\n"
            "- Cal missed the deadline for A1.\n"
            "- Revisit transactions in the next lecture."
        ),
    )

    response = await ask(world, world.professor)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verified"] is True and body["insight"].startswith("- Transactions")
    assert [c["tool"] for c in body["tool_calls"]] == [
        "weakest_topics",
        "overdue_students",
    ]
    assert body["tool_calls"][0]["result"][0] == {
        "topic": "Transactions",
        "mastery_pct": 20.0,
        "earned": 1.0,
        "possible": 5.0,
        "graded_answers": 1,
        "is_gap": True,
    }
    assert [s["node"] for s in body["trace"]] == [
        "analyst_llm",
        "sql_tools",
        "analyst_llm",
        "verify_numbers",
    ]
    # The second turn saw the first turn's SQL results.
    assert "Transactions" in scripted.seen[1][1]


async def test_student_agent_only_sees_their_own_data(world, llm) -> None:
    data = await build(world)
    scripted = llm(
        call(
            ("student_topic_mastery", {"student_id": str(data["s2"].id)}),
            ("list_students", {}),
            ("overdue_students", {}),
        ),
        answer("Your weakest topic is Transactions at 20.0%; study it next."),
    )

    body = (await ask(world, world.student)).json()

    mastery, students, overdue = body["tool_calls"]
    # Asking for another student's id still returns the caller's own data.
    assert mastery["result"]["student_id"] == str(world.student.id)
    assert mastery["result"]["comprehension_pct"] == 68.8
    # Faculty-only tools are refused, not run.
    assert students["result"] is None and "not an available tool" in students["error"]
    assert overdue["result"] is None and overdue["error"]
    # Faculty-only tools are not even offered to a student.
    assert "list_students" not in scripted.seen[0][0]
    assert body["verified"] is True


async def test_invented_number_triggers_one_rewrite(world, llm) -> None:
    await build(world)
    llm(
        call(("weakest_topics", {})),
        answer("Transactions is at 35% mastery."),  # 35 is not in any result
        answer("Transactions is the weakest topic at 20.0% mastery."),
    )

    body = (await ask(world, world.professor)).json()

    assert body["verified"] is True
    assert body["insight"] == "Transactions is the weakest topic at 20.0% mastery."
    assert [s["node"] for s in body["trace"]][-3:] == [
        "verify_numbers",
        "analyst_llm",
        "verify_numbers",
    ]


async def test_unverifiable_insight_is_withheld(world, llm) -> None:
    await build(world)
    llm(
        call(("weakest_topics", {})),
        answer("Transactions is at 35% mastery."),
        answer("Transactions improved by 12 points."),
    )

    body = (await ask(world, world.professor)).json()

    assert body["verified"] is False and body["insight"] is None
    assert body["unsupported_numbers"] == ["12"]


async def test_tool_calls_are_capped_at_five(world, llm) -> None:
    await build(world)
    greedy = call(
        ("list_assignments", {}), ("weakest_topics", {}), ("list_students", {})
    )
    # Third turn: budget spent but it asks again; the nudge gets the answer.
    scripted = llm(greedy, greedy, greedy, answer("Transactions is the weakest topic."))

    body = (await ask(world, world.professor)).json()

    assert len(body["tool_calls"]) == 5
    # Once the budget is spent the model is told to answer.
    assert "No tool calls are left" in scripted.seen[2][0]
    assert "You have no tool calls left" in scripted.seen[3][1]
    assert body["verified"] is True


async def test_bad_ids_are_refused_without_crashing(world, llm) -> None:
    data = await build(world)
    llm(
        call(
            ("completion_rate", {"assignment_id": "not-an-id"}),
            (
                "class_topic_averages",
                {"assignment_id": "00000000-0000-0000-0000-000000000000"},
            ),
            ("score_trend", {"student_id": str(world.outsider.id)}),
        ),
        call(("completion_rate", {"assignment_id": str(data["a1"].id)})),
        answer("A1 has 1 overdue student."),
    )

    body = (await ask(world, world.professor)).json()

    errors = [c["error"] for c in body["tool_calls"][:3]]
    assert all(errors), errors
    assert body["tool_calls"][3]["result"]["overdue"] == 1
    assert body["verified"] is True


async def test_faculty_can_ask_about_one_student(world, llm) -> None:
    data = await build(world)
    llm(
        call(("score_trend", {})),  # no id: defaults to the student on the page
        answer("Their score went from 83.3% to 60.0%."),
    )
    body = (await ask(world, world.professor, student_id=str(world.student.id))).json()
    assert body["tool_calls"][0]["result"]["student_id"] == str(world.student.id)
    assert body["verified"] is True

    outsider = await ask(world, world.professor, student_id=str(world.outsider.id))
    assert outsider.status_code == 404
    assert data  # dataset built


async def test_only_course_members_can_ask(world, llm) -> None:
    llm()
    assert (await ask(world, world.outsider)).status_code == 403
    assert (await ask(world, world.other_professor)).status_code == 403


async def test_rate_limit_is_reported(world, llm) -> None:
    def limited(system, user):
        raise LLMRateLimitError("quota", None)

    llm(limited)
    response = await ask(world, world.professor)
    assert response.status_code == 429
    assert "limit" in response.json()["detail"]
