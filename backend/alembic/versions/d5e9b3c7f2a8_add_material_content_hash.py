"""add material content hash

Revision ID: d5e9b3c7f2a8
Revises: c4d8a2b6e1f7
Create Date: 2026-10-08 13:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d5e9b3c7f2a8"
down_revision: str | None = "c4d8a2b6e1f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "course_materials",
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
    )
    # Rows without a hash (uploaded before this column existed) are not
    # constrained, since NULLs never conflict in a unique index.
    op.create_index(
        "uq_course_materials_course_content",
        "course_materials",
        ["course_id", "content_sha256"],
        unique=True,
        postgresql_where=sa.text("status <> 'failed'"),
    )


def downgrade() -> None:
    op.drop_index("uq_course_materials_course_content", table_name="course_materials")
    op.drop_column("course_materials", "content_sha256")
