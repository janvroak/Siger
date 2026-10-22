"""Learning analytics, all computed by fixed SQL (see app/services/analytics.py).

Only published grades count: a grade still under faculty review is not a
measurement of the student yet.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class TopicMastery(BaseModel):
    """Mastery = sum of final marks / sum of max marks over a topic's questions."""

    topic: str
    mastery: float  # 0..1
    earned: float
    possible: float
    graded_answers: int  # question answers that count towards it
    is_gap: bool  # class/student mastery below the learning-gap threshold


class Completion(BaseModel):
    assignment_id: uuid.UUID
    title: str
    deadline: datetime
    enrolled: int
    submitted: int
    pending: int  # not submitted, deadline not reached
    overdue: int  # not submitted, deadline passed
    published: int  # submissions with a published grade
    rate: float  # submitted / enrolled
    average_score: float | None  # mean published score, 0..1


class OverdueItem(BaseModel):
    student_id: uuid.UUID
    student_name: str
    assignment_id: uuid.UUID
    assignment_title: str
    deadline: datetime


class TrendPoint(BaseModel):
    assignment_id: uuid.UUID
    title: str
    deadline: datetime
    earned: float
    possible: float
    score: float  # 0..1


class StudentSummary(BaseModel):
    student_id: uuid.UUID
    student_name: str
    student_email: str
    comprehension: float | None  # None until a grade is published
    graded: int
    submitted: int
    overdue: int


class AIAgreement(BaseModel):
    """How faculty decisions compare with the AI's marks (published grades)."""

    reviewed_answers: int
    exact_agreement: float | None  # share with final == AI marks
    within_half_mark: float | None
    mean_abs_difference: float | None  # in marks
    overrides: int
    flagged: int
    flagged_overridden: int  # flags that faculty went on to change


class CourseAnalytics(BaseModel):
    course_id: uuid.UUID
    gap_threshold: float
    enrolled: int
    assignments: int
    comprehension: float | None  # class-wide, over published grades
    completion_rate: float | None  # submissions / (enrolled x assignments)
    topics: list[TopicMastery]  # weakest first
    completion: list[Completion]  # by deadline
    students: list[StudentSummary]  # weakest first, ungraded last
    overdue: list[OverdueItem]
    agreement: AIAgreement


AssignmentState = Literal[
    "graded", "under_review", "submitted", "overdue", "pending", "failed"
]


class StudentAssignmentProgress(BaseModel):
    assignment_id: uuid.UUID
    title: str
    deadline: datetime
    state: AssignmentState
    score: float | None  # 0..1 once graded


class StudentProgress(BaseModel):
    course_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    gap_threshold: float
    comprehension: float | None
    topics: list[TopicMastery]  # weakest first
    trend: list[TrendPoint]  # by deadline
    assignments: list[StudentAssignmentProgress]
