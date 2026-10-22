import uuid
from typing import Annotated, TypedDict


class QuestionSpec(TypedDict):
    """A question with its answer key, as the grader sees it."""

    id: str
    position: int
    text: str
    model_answer: str
    max_marks: float
    topic: str
    key_points: list[str]


class QuestionScore(TypedDict):
    question_id: str
    position: int
    topic: str
    max_marks: float
    student_answer: str
    similarity: float | None  # None when there is no answer to compare
    ai_marks: float
    key_points_hit: list[str]
    key_points_missed: list[str]
    incorrect_points: list[str]
    rationale: str
    confidence: float
    flagged: bool
    rechecked: bool


class FeedbackItem(TypedDict):
    text: str
    sources: list[dict[str, object]]  # [{filename, page}]


class TraceStep(TypedDict):
    node: str
    detail: str


def merge_scores(
    current: dict[str, QuestionScore], update: dict[str, QuestionScore]
) -> dict[str, QuestionScore]:
    """Parallel scorers each add their question; a re-check replaces it."""
    return {**current, **update}


def add_trace(current: list[TraceStep], update: list[TraceStep]) -> list[TraceStep]:
    return current + update


class EvalState(TypedDict, total=False):
    # Inputs
    submission_id: uuid.UUID
    course_id: uuid.UUID
    pdf_path: str
    questions: list[QuestionSpec]

    # extract_text
    raw_text: str
    # segment_answers: question_id -> the student's answer ("" if missing)
    answers: dict[str, str]
    # question_id -> cosine similarity of the answer with the model answer
    similarities: dict[str, float | None]

    # score_question / recheck / check_confidence
    scores: Annotated[dict[str, QuestionScore], merge_scores]

    # write_feedback: question_id -> feedback
    feedback: dict[str, FeedbackItem]

    trace: Annotated[list[TraceStep], add_trace]


class ScoreTask(TypedDict):
    """What one parallel score_question / recheck run receives (via Send)."""

    question: QuestionSpec
    answer: str
    similarity: float | None
    previous: QuestionScore | None  # set for a re-check
