import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.course_material import MaterialStatus


class MaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    filename: str
    status: MaterialStatus
    page_count: int
    chunk_count: int
    error: str | None
    created_at: datetime
    # Internal location of the original PDF; only whether it exists is exposed.
    stored_path: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_file(self) -> bool:
        return self.stored_path is not None
