import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class QuestionScore(Base):
    """The evaluation of one question of one submission.

    Everything that explains the grade is kept: the answer that was graded,
    key points hit and missed, the rationale, the similarity signal and how
    far it agreed with the LLM (confidence).
    """

    __tablename__ = "question_scores"
    __table_args__ = (
        UniqueConstraint(
            "submission_id",
            "question_id",
            name="uq_question_scores_submission_question",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    # Cosine similarity between the student's and the model answer; None when
    # the student gave no answer.
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_marks: Mapped[float] = mapped_column(Float, nullable=False)
    # Set when faculty approve or override; only this is shown to students.
    final_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    key_points_hit: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    key_points_missed: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    incorrect_points: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    # 1 - |similarity-implied score - LLM score|; low means the signals disagree.
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rechecked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    feedback: Mapped[str] = mapped_column(Text, nullable=False)
    # Lecture-slide passages the feedback points to: [{filename, page}].
    feedback_sources: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
