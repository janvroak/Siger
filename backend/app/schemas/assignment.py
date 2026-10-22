import uuid
from datetime import datetime

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

from app.models.submission import SubmissionStatus

MAX_QUESTIONS = 30
MAX_KEY_POINTS = 5


class QuestionIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    model_answer: str = Field(min_length=1, max_length=10000)
    max_marks: float = Field(gt=0, le=100)
    topic: str = Field(min_length=1, max_length=100)
    key_points: list[str] = Field(default_factory=list, max_length=MAX_KEY_POINTS)

    @field_validator("text", "model_answer", "topic")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("key_points")
    @classmethod
    def _clean_key_points(cls, points: list[str]) -> list[str]:
        cleaned = [point.strip() for point in points if point.strip()]
        if any(len(point) > 500 for point in cleaned):
            raise ValueError("each key point must be at most 500 characters")
        return cleaned


class AssignmentIn(BaseModel):
    """Create or fully replace an assignment and its answer key."""

    title: str = Field(min_length=1, max_length=255)
    instructions: str = Field(default="", max_length=5000)
    deadline: AwareDatetime
    questions: list[QuestionIn] = Field(min_length=1, max_length=MAX_QUESTIONS)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class StudentQuestionRead(BaseModel):
    """What a student may see of a question: never the answer key."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    text: str
    max_marks: float
    topic: str


class QuestionRead(StudentQuestionRead):
    """A question with its answer key, for the course's professor only."""

    model_answer: str
    key_points: list[str]


class AssignmentSummary(BaseModel):
    """An assignment as listed on the course page (no questions)."""

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    deadline: datetime
    created_at: datetime
    question_count: int
    total_marks: float
    submission_count: int | None = None  # professors only
    # The requesting student's submission status; None if not submitted
    # (or when a professor lists the assignments).
    my_status: SubmissionStatus | None = None


class StudentAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    instructions: str
    deadline: datetime
    created_at: datetime
    questions: list[StudentQuestionRead]


class AssignmentRead(StudentAssignmentRead):
    """Full assignment with its answer key, for the course's professor only."""

    updated_at: datetime
    answer_keys_indexed: bool
    questions: list[QuestionRead]
