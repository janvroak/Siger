"""LangGraph wiring for the evaluation agent.

START -> extract_text -> segment_answers -> score_question x N (parallel)
      -> check_confidence --disagree, not yet re-checked--> recheck --+
              ^                                                       |
              +-------------------------------------------------------+
         check_confidence --agree / flagged--> write_feedback -> save_results -> END

Faculty approve or override the grade outside the graph, via the review API.
"""

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agents.evaluation.nodes import (
    check_confidence,
    extract_text,
    fan_out,
    recheck,
    route_after_check,
    save_results,
    score_question,
    segment_answers,
    write_feedback,
)
from app.agents.evaluation.state import EvalState


def build_evaluation_graph() -> CompiledStateGraph:
    graph = StateGraph(EvalState)
    graph.add_node("extract_text", extract_text)
    graph.add_node("segment_answers", segment_answers)
    graph.add_node("score_question", score_question)
    graph.add_node("check_confidence", check_confidence)
    graph.add_node("recheck", recheck)
    graph.add_node("write_feedback", write_feedback)
    graph.add_node("save_results", save_results)

    graph.add_edge(START, "extract_text")
    graph.add_edge("extract_text", "segment_answers")
    graph.add_conditional_edges("segment_answers", fan_out, ["score_question"])
    graph.add_edge("score_question", "check_confidence")
    graph.add_conditional_edges(
        "check_confidence", route_after_check, ["recheck", "write_feedback"]
    )
    graph.add_edge("recheck", "check_confidence")
    graph.add_edge("write_feedback", "save_results")
    graph.add_edge("save_results", END)
    return graph.compile()


evaluation_graph = build_evaluation_graph()


async def run_evaluation_graph(initial: EvalState) -> EvalState:
    return await evaluation_graph.ainvoke({**initial, "scores": {}, "trace": []})
