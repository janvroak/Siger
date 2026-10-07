import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=5000)
    semester: str = Field(min_length=1, max_length=100)


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    code: str
    description: str
    semester: str
    created_at: datetime
    professor_id: uuid.UUID


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    enrolled_at: datetime
