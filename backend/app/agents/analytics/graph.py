"""LangGraph wiring for the analytics agent.

START -> analyst_llm --tool call--> sql_tools --results--> analyst_llm
                     --answer--> verify_numbers --ok / withheld--> END
                                                --rewrite once--> analyst_llm
"""

from dataclasses import dataclass

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.analytics.nodes import (
    after_analyst,
    after_verify,
    analyst_llm,
    sql_tools,
    verify_numbers,
)
from app.agents.analytics.state import AnalyticsState, ToolResult, TraceStep
from app.agents.analytics.tools import Scope


def build_analytics_graph() -> CompiledStateGraph:
    graph = StateGraph(AnalyticsState)
    graph.add_node("analyst_llm", analyst_llm)
    graph.add_node("sql_tools", sql_tools)
    graph.add_node("verify_numbers", verify_numbers)

    graph.add_edge(START, "analyst_llm")
    graph.add_conditional_edges(
        "analyst_llm", after_analyst, ["sql_tools", "verify_numbers"]
    )
    graph.add_edge("sql_tools", "analyst_llm")
    graph.add_conditional_edges("verify_numbers", after_verify, ["analyst_llm", END])
    return graph.compile()


analytics_graph = build_analytics_graph()


@dataclass
class Insight:
    insight: str | None  # None when it could not be verified
    verified: bool
    unsupported: list[str]
    tool_calls: list[ToolResult]
    trace: list[TraceStep]


async def run_analytics(
    session: AsyncSession, scope: Scope, question: str, context: str
) -> Insight:
    final = await analytics_graph.ainvoke(
        {
            "scope": scope,
            "question": question,
            "context": context,
            "results": [],
            "trace": [],
        },
        config={"configurable": {"session": session}, "recursion_limit": 30},
    )
    verified = bool(final.get("verified"))
    return Insight(
        insight=final.get("insight") if verified else None,
        verified=verified,
        unsupported=final.get("unsupported", []),
        tool_calls=final.get("results", []),
        trace=final.get("trace", []),
    )
