import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
