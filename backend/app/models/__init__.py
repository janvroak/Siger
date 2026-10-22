"""SQLAlchemy models for Siger."""

from app.models.assignment import Assignment, Question
from app.models.conversation import ChatMessage, ChatRole, Conversation
from app.models.course import Course, Enrollment
from app.models.course_material import CourseMaterial, MaterialStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole

__all__ = [
    "Assignment",
    "ChatMessage",
    "ChatRole",
    "Conversation",
    "Course",
    "CourseMaterial",
    "Enrollment",
    "MaterialStatus",
    "Question",
    "Submission",
    "SubmissionStatus",
    "User",
    "UserRole",
]
