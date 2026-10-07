"""LangGraph wiring for the Chat / Teaching flow.

START -> planner -> retrieval -> teaching -> END        (grounded / not in material)
           |                       |
           +-- off_topic ------+---+-- out of scope
                               v
                            refusal -> END
"""

from typing import Literal

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agents.chat.nodes import planner, refusal, retrieval, teaching
from app.agents.chat.state import ChatState


def _after_planner(state: ChatState) -> Literal["retrieval", "refusal"]:
    return "refusal" if state["route"] == "off_topic" else "retrieval"


def _in_scope(state: ChatState) -> Literal["refusal", "__end__"]:
    return "refusal" if state["status"] == "out_of_scope" else END


def build_chat_graph() -> CompiledStateGraph:
    graph = StateGraph(ChatState)
    graph.add_node("planner", planner)
    graph.add_node("retrieval", retrieval)
    graph.add_node("teaching", teaching)
    graph.add_node("refusal", refusal)

    graph.add_edge(START, "planner")
    graph.add_conditional_edges("planner", _after_planner, ["retrieval", "refusal"])
    graph.add_edge("retrieval", "teaching")
    graph.add_conditional_edges("teaching", _in_scope, ["refusal", END])
    graph.add_edge("refusal", END)
    return graph.compile()


chat_graph = build_chat_graph()


async def run_chat(initial: ChatState) -> ChatState:
    return await chat_graph.ainvoke({**initial, "trace": []})
