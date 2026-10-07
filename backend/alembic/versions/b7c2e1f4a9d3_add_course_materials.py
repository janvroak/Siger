"""add course materials

Revision ID: b7c2e1f4a9d3
Revises: a94f69cd8d66
Create Date: 2026-10-08 10:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b7c2e1f4a9d3"
down_revision: str | None = "a94f69cd8d66"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    material_status = postgresql.ENUM(
        "processing", "ready", "failed", name="material_status"
    )
    material_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "course_materials",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column("uploaded_by_id", sa.UUID(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "processing",
                "ready",
                "failed",
                name="material_status",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["uploaded_by_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_course_materials_course_id"),
        "course_materials",
        ["course_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_course_materials_course_id"), table_name="course_materials"
    )
    op.drop_table("course_materials")
    postgresql.ENUM(name="material_status").drop(op.get_bind(), checkfirst=True)
