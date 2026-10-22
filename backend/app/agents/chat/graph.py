"""LangGraph wiring for the lecture chatbot (revised architecture, Figure 4).

START -> retrieve -> check_relevance --relevant--> answer --grounded--> END
                                     |                    --off-topic--+
                                     +--out of scope--> refuse <-------+--> END

Scope is decided from retrieval similarity before any LLM call, so questions
outside the course material cost no LLM request and are refused consistently.
"""

from typing import Literal

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agents.chat.nodes import answer, check_relevance, refuse, retrieve
from app.agents.chat.state import ChatState


def _relevant(state: ChatState) -> Literal["answer", "refuse"]:
    return "answer" if state.get("chunks") else "refuse"


def _after_answer(state: ChatState) -> Literal["refuse", "__end__"]:
    return "refuse" if state.get("status") == "out_of_scope" else END


def build_chat_graph() -> CompiledStateGraph:
    graph = StateGraph(ChatState)
    graph.add_node("retrieve", retrieve)
    graph.add_node("check_relevance", check_relevance)
    graph.add_node("answer", answer)
    graph.add_node("refuse", refuse)

    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "check_relevance")
    graph.add_conditional_edges("check_relevance", _relevant, ["answer", "refuse"])
    graph.add_conditional_edges("answer", _after_answer, ["refuse", END])
    graph.add_edge("refuse", END)
    return graph.compile()


chat_graph = build_chat_graph()


async def run_chat(initial: ChatState) -> ChatState:
    return await chat_graph.ainvoke({**initial, "trace": []})
