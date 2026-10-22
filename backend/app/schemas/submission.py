import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.review_log import ReviewAction
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
    ai_marks: float | None  # total AI marks once graded
    final_marks: float | None  # total final marks once published


class SubmissionRoster(BaseModel):
    """Every enrolled student's status on one assignment (faculty view)."""

    assignment_id: uuid.UUID
    deadline: datetime
    enrolled: int
    submitted: int
    pending: int  # not submitted, deadline not reached
    overdue: int  # not submitted, deadline passed
    total_marks: float
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


class ReviewLogRead(BaseModel):
    action: ReviewAction
    question_position: int | None  # None for a publish
    ai_marks: float | None
    final_marks: float | None
    faculty_name: str
    created_at: datetime


class SubmissionResults(BaseModel):
    """A graded submission as faculty review it."""

    submission: SubmissionRead
    student_name: str
    student_email: str
    error: str | None
    graded_at: datetime | None
    published_at: datetime | None
    review_log: list[ReviewLogRead]
    grading_trace: list[TraceStepRead]
    total_ai_marks: float
    total_marks: float
    flagged_count: int
    questions: list[QuestionResult]


class ReviewQuestionIn(BaseModel):
    question_id: uuid.UUID
    final_marks: float = Field(ge=0)
    feedback: str = Field(min_length=1, max_length=5000)


class ReviewIn(BaseModel):
    """Faculty decision on every question; optionally publish to the student."""

    questions: list[ReviewQuestionIn] = Field(min_length=1)
    publish: bool = False


class StudentQuestionResult(BaseModel):
    """A published question grade as the student sees it.

    AI-only details (AI marks, similarity, confidence, rationale) are left out:
    the student sees the faculty-approved grade and the feedback.
    """

    position: int
    text: str
    topic: str
    max_marks: float
    marks: float
    key_points_hit: list[str]
    key_points_missed: list[str]
    feedback: str
    feedback_sources: list[FeedbackSource]


class StudentResult(BaseModel):
    submission: SubmissionRead
    published_at: datetime
    total_marks: float
    max_marks: float
    questions: list[StudentQuestionResult]
