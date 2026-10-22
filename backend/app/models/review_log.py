import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReviewAction(enum.StrEnum):
    APPROVE = "approve"  # faculty kept the AI marks
    OVERRIDE = "override"  # faculty changed the AI marks
    PUBLISH = "publish"  # the grade became visible to the student


class ReviewLog(Base):
    """An audit trail of faculty decisions on AI grades.

    Approve and override rows keep both marks, so how often faculty agree with
    the AI can be measured directly.
    """

    __tablename__ = "review_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    faculty_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # None for a publish, which applies to the whole submission.
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=True,
    )
    action: Mapped[ReviewAction] = mapped_column(
        Enum(
            ReviewAction,
            name="review_action",
            values_callable=lambda enum_type: [member.value for member in enum_type],
        ),
        nullable=False,
    )
    ai_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    final_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
