"""Assignments and their answer keys.

Answer-key isolation: the only endpoints that return model answers or key
points are the professor-only ones (`/key`, create, replace). Everything a
student can reach is serialized with StudentAssignmentRead, which has no
answer fields at all.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import course_for_member, owned_course
from app.auth.dependencies import get_current_professor, get_current_user
from app.db.session import get_db_session
from app.models.assignment import Assignment
from app.models.user import User, UserRole
from app.schemas.assignment import (
    AssignmentIn,
    AssignmentRead,
    AssignmentSummary,
    StudentAssignmentRead,
)
from app.services.assignments import (
    create_assignment,
    delete_assignment,
    get_assignment,
    list_assignments,
    replace_assignment,
)
from app.services.submissions import has_submissions

router = APIRouter(prefix="/courses", tags=["assignments"])


@router.post(
    "/{course_id}/assignments",
    response_model=AssignmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an assignment with its answer key",
)
async def create_assignment_endpoint(
    course_id: uuid.UUID,
    data: AssignmentIn,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Assignment:
    course = await owned_course(session, course_id, professor)
    return await create_assignment(session, course, professor, data)


@router.get(
    "/{course_id}/assignments",
    response_model=list[AssignmentSummary],
    summary="List a course's assignments",
)
async def read_assignments(
    course_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[AssignmentSummary]:
    course = await course_for_member(session, course_id, user)
    student_id = user.id if user.role == UserRole.STUDENT else None
    return await list_assignments(session, course.id, student_id)


@router.get(
    "/{course_id}/assignments/{assignment_id}",
    response_model=StudentAssignmentRead,
    summary="An assignment's questions (never the answer key)",
)
async def read_assignment(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Assignment:
    course = await course_for_member(session, course_id, user)
    return await get_course_assignment(session, course.id, assignment_id)


@router.get(
    "/{course_id}/assignments/{assignment_id}/key",
    response_model=AssignmentRead,
    summary="An assignment with its answer key (course professor only)",
)
async def read_assignment_key(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Assignment:
    course = await owned_course(session, course_id, professor)
    return await get_course_assignment(session, course.id, assignment_id)


@router.put(
    "/{course_id}/assignments/{assignment_id}",
    response_model=AssignmentRead,
    summary="Replace an assignment and its answer key",
)
async def replace_assignment_endpoint(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    data: AssignmentIn,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Assignment:
    course = await owned_course(session, course_id, professor)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    if await has_submissions(session, assignment.id):
        # Submissions are graded against this key; changing it would make
        # existing and future grades inconsistent.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Students have already submitted; the assignment can no longer "
            "be edited",
        )
    return await replace_assignment(session, assignment, data)


@router.delete(
    "/{course_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an assignment",
)
async def delete_assignment_endpoint(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    course = await owned_course(session, course_id, professor)
    assignment = await get_course_assignment(session, course.id, assignment_id)
    await delete_assignment(session, assignment)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def get_course_assignment(
    session: AsyncSession, course_id: uuid.UUID, assignment_id: uuid.UUID
) -> Assignment:
    assignment = await get_assignment(session, course_id, assignment_id)
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    return assignment
