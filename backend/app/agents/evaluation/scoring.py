"""Deterministic parts of grading: label-based segmentation and confidence."""

import math
import re

from app.core.config import settings

# A line that starts an answer: "Q1", "Q.2)", "Question 3:", "Ans 4 -",
# "**Answer 5**". Bare "1." is not used: numbered lists inside answers would
# be mistaken for labels.
_LABEL = re.compile(
    r"^[ \t>*#_]*(?:q(?:uestion)?|ans(?:wer)?)[ \t]*(?:no\.?|number|#)?[ \t.]*"
    r"(\d{1,2})\b[ \t*_]*[.):\-–]?",
    re.IGNORECASE | re.MULTILINE,
)


def split_by_labels(text: str, question_count: int) -> dict[int, str] | None:
    """Answers by question number when the student labelled them clearly.

    Returns None when the labels are missing, repeated, out of order or out of
    range; the LLM then maps the text to questions instead.
    """
    if question_count == 1 and not _LABEL.search(text):
        return {1: text.strip()}

    matches = list(_LABEL.finditer(text))
    numbers = [int(match.group(1)) for match in matches]
    if not numbers or numbers != sorted(set(numbers)):
        return None
    if numbers[0] < 1 or numbers[-1] > question_count:
        return None

    answers = {number: "" for number in range(1, question_count + 1)}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        answers[numbers[index]] = text[match.end() : end].strip()
    return answers


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def clamp_marks(value: object, max_marks: float) -> float:
    """LLM marks as a number in [0, max], rounded to half marks."""
    try:
        marks = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        marks = 0.0
    if math.isnan(marks):
        marks = 0.0
    marks = min(max(marks, 0.0), max_marks)
    return round(marks * 2) / 2


def expected_fraction(similarity: float) -> float:
    """The score fraction the similarity alone would suggest."""
    low, high = settings.grading_similarity_low, settings.grading_similarity_high
    if high <= low:
        return 1.0 if similarity >= high else 0.0
    return min(max((similarity - low) / (high - low), 0.0), 1.0)


def confidence(similarity: float | None, marks: float, max_marks: float) -> float:
    """Agreement between the similarity signal and the LLM's marks, in [0, 1].

    Similarity only says whether two texts are about the same thing, so it
    never sets the grade; a large gap between the two means low confidence.
    """
    if similarity is None or max_marks <= 0:
        return 1.0
    gap = abs(expected_fraction(similarity) - marks / max_marks)
    return round(1.0 - gap, 3)


def disagrees(score_confidence: float) -> bool:
    return score_confidence < settings.grading_min_confidence


def as_text_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()][:10]
