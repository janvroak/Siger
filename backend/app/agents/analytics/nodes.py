"""Nodes of the analytics agent (SIGER revised architecture, Figure 3)."""

import json
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.agents.analytics.prompts import (
    ANALYST_SYSTEM,
    ANSWER_NOW,
    FINAL_NOTE,
    IDS_RULE,
    REWRITE_NOTE,
)
from app.agents.analytics.state import AnalyticsState, ToolCall, ToolResult, TraceStep
from app.agents.analytics.tools import ToolError, catalogue, run_tool
from app.agents.analytics.verify import (
    allowed_numbers,
    numbers_in_text,
    unsupported_numbers,
)
from app.rag import llm

MAX_TOOL_CALLS = 5
CALLS_PER_TURN = 3
MAX_REWRITES = 1
RESULTS_CHARS = 14000


async def analyst_llm(state: AnalyticsState) -> dict[str, Any]:
    """The LLM decides which tools to call next, or writes the insight."""
    scope = state["scope"]
    rewriting = bool(state.get("feedback"))
    remaining = 0 if rewriting else MAX_TOOL_CALLS - state.get("calls_used", 0)
    system = ANALYST_SYSTEM.format(
        audience="a professor" if scope.role == "faculty" else "a student",
        context=state["context"],
        catalogue=catalogue(scope),
        ids_rule=IDS_RULE[scope.role],
        remaining=remaining,
        final_note=FINAL_NOTE if remaining <= 0 else "",
    )
    message = f"Question: {state['question']}\n\nTool results so far:\n{_render(state)}"
    if rewriting:
        message += "\n\n" + state["feedback"]

    decision = await llm.chat_json(system, message)
    calls = _calls(decision) if decision.get("action") == "call" else []
    if calls and remaining <= 0:
        # Out of budget but still asking for data: insist on an answer once.
        decision = await llm.chat_json(system, f"{message}\n\n{ANSWER_NOW}")
        calls = []
    if calls and remaining > 0:
        calls = calls[: min(CALLS_PER_TURN, remaining)]
        names = ", ".join(call["tool"] for call in calls)
        return {"pending": calls, "trace": [_step("analyst_llm", f"calls {names}")]}

    insight = str(decision.get("insight") or "").strip()
    detail = "rewrote the insight" if rewriting else "wrote the insight"
    return {
        "pending": [],
        "insight": insight,
        "feedback": "",
        "trace": [_step("analyst_llm", detail if insight else "gave no insight")],
    }


def after_analyst(state: AnalyticsState) -> str:
    return "sql_tools" if state.get("pending") else "verify_numbers"


async def sql_tools(state: AnalyticsState, config: RunnableConfig) -> dict[str, Any]:
    """Run the requested fixed queries within the caller's scope."""
    session = config["configurable"]["session"]
    results: list[ToolResult] = []
    for call in state["pending"]:
        try:
            data = await run_tool(session, state["scope"], call["tool"], call["args"])
            results.append(
                ToolResult(
                    tool=call["tool"], args=call["args"], result=data, error=None
                )
            )
        except ToolError as exc:
            results.append(
                ToolResult(
                    tool=call["tool"], args=call["args"], result=None, error=str(exc)
                )
            )
    used = state.get("calls_used", 0) + len(results)
    failed = sum(1 for result in results if result["error"])
    detail = f"{len(results)} quer{'y' if len(results) == 1 else 'ies'}"
    if failed:
        detail += f", {failed} refused"
    return {
        "pending": [],
        "results": results,
        "calls_used": used,
        "trace": [_step("sql_tools", detail)],
    }


async def verify_numbers(state: AnalyticsState) -> dict[str, Any]:
    """Every figure in the insight must appear in a tool result."""
    insight = state.get("insight", "")
    allowed = allowed_numbers(
        [r["result"] for r in state.get("results", []) if r["error"] is None],
        state["question"],
    )
    missing = unsupported_numbers(insight, allowed)
    if insight and not missing:
        figures = len(set(numbers_in_text(insight)))
        return {
            "verified": True,
            "unsupported": [],
            "trace": [
                _step("verify_numbers", f"all {figures} figure(s) match tool results")
            ],
        }

    rewrites = state.get("rewrites", 0)
    if insight and rewrites < MAX_REWRITES:
        return {
            "verified": False,
            "unsupported": missing,
            "rewrites": rewrites + 1,
            "feedback": REWRITE_NOTE.format(numbers=", ".join(missing)),
            "trace": [
                _step(
                    "verify_numbers",
                    f"unsupported {', '.join(missing)}; asking for a rewrite",
                )
            ],
        }
    return {
        "verified": False,
        "unsupported": missing,
        "trace": [
            _step(
                "verify_numbers",
                f"still unsupported {', '.join(missing)}; insight withheld"
                if insight
                else "no insight to verify",
            )
        ],
    }


def after_verify(state: AnalyticsState) -> str:
    return "analyst_llm" if state.get("feedback") else "__end__"


def _calls(decision: dict[str, Any]) -> list[ToolCall]:
    calls = decision.get("calls")
    if not isinstance(calls, list):
        # Tolerate the single-call shape {"tool": ..., "args": ...}.
        calls = [decision] if decision.get("tool") else []
    parsed: list[ToolCall] = []
    for call in calls:
        if isinstance(call, dict) and isinstance(call.get("tool"), str):
            args = call.get("args")
            parsed.append(
                ToolCall(tool=call["tool"], args=args if isinstance(args, dict) else {})
            )
    return parsed


def _render(state: AnalyticsState) -> str:
    results = state.get("results", [])
    if not results:
        return "(none yet)"
    text = "\n\n".join(
        f"{r['tool']}({json.dumps(r['args'])}) -> "
        + (
            f"ERROR: {r['error']}"
            if r["error"]
            else json.dumps(r["result"], separators=(",", ":"))
        )
        for r in results
    )
    return text[:RESULTS_CHARS]


def _step(node: str, detail: str) -> TraceStep:
    return {"node": node, "detail": detail}
