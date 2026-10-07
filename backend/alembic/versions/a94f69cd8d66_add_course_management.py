"""add course management

Revision ID: a94f69cd8d66
Revises: d11db9cd3ed8
Create Date: 2026-07-20 23:55:49.395038

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'a94f69cd8d66'
down_revision: str | None = 'd11db9cd3ed8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("semester", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("professor_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["professor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_courses_code"), "courses", ["code"], unique=True)
    op.create_table(
        "enrollments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column(
            "enrolled_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "student_id", "course_id", name="uq_enrollments_student_course"
        ),
    )


def downgrade() -> None:
    op.drop_table("enrollments")
    op.drop_index(op.f("ix_courses_code"), table_name="courses")
    op.drop_table("courses")
