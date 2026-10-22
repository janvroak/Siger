import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.submission import SubmissionStatus


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    filename: str
    page_count: int
    status: SubmissionStatus
    submitted_at: datetime
    updated_at: datetime


class MySubmission(BaseModel):
    """The student's own submission for an assignment, if any."""

    submission: SubmissionRead | None


# Where one enrolled student stands on an assignment.
RosterState = Literal[
    "not_submitted",  # deadline not reached yet
    "overdue",  # deadline passed with no submission
    "submitted",
    "evaluating",
    "under_review",
    "published",
    "failed",
]


class RosterRow(BaseModel):
    student_id: uuid.UUID
    student_name: str
    student_email: str
    state: RosterState
    submission: SubmissionRead | None
    error: str | None  # why grading failed, for faculty only


class SubmissionRoster(BaseModel):
    """Every enrolled student's status on one assignment (faculty view)."""

    assignment_id: uuid.UUID
    deadline: datetime
    enrolled: int
    submitted: int
    pending: int  # not submitted, deadline not reached
    overdue: int  # not submitted, deadline passed
    students: list[RosterRow]


class FeedbackSource(BaseModel):
    filename: str
    page: int


class QuestionResult(BaseModel):
    """One question's evaluation, with everything that explains it."""

    question_id: uuid.UUID
    position: int
    text: str
    topic: str
    max_marks: float
    student_answer: str
    similarity: float | None
    ai_marks: float
    final_marks: float | None
    key_points_hit: list[str]
    key_points_missed: list[str]
    incorrect_points: list[str]
    rationale: str
    confidence: float
    flagged: bool
    rechecked: bool
    feedback: str
    feedback_sources: list[FeedbackSource]


class TraceStepRead(BaseModel):
    node: str
    detail: str


class SubmissionResults(BaseModel):
    """A graded submission as faculty review it."""

    submission: SubmissionRead
    student_name: str
    student_email: str
    error: str | None
    graded_at: datetime | None
    grading_trace: list[TraceStepRead]
    total_ai_marks: float
    total_marks: float
    flagged_count: int
    questions: list[QuestionResult]
