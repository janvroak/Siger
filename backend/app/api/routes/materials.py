import uuid
from pathlib import PurePath
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import course_for_member
from app.auth.dependencies import get_current_professor, get_current_user
from app.core.config import settings
from app.db.session import get_db_session
from app.models.course import Course
from app.models.course_material import MaterialStatus
from app.models.user import User, UserRole
from app.rag.llm import (
    LLMError,
    LLMNotConfiguredError,
    LLMRateLimitError,
    describe_rate_limit,
)
from app.rag.pdf import InvalidPDFError
from app.rag.vector_store import VectorStoreError
from app.schemas.material import MaterialRead
from app.services.materials import (
    DuplicateMaterialError,
    get_course_material,
    ingest_pdf,
    list_materials,
    material_file,
)

router = APIRouter(prefix="/courses", tags=["course materials"])


@router.post(
    "/{course_id}/materials",
    response_model=MaterialRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF to the course knowledge base",
)
async def upload_material(
    course_id: uuid.UUID,
    file: UploadFile,
    professor: Annotated[User, Depends(get_current_professor)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MaterialRead:
    course = await session.get(Course, course_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )
    if course.professor_id != professor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only upload material to your own courses",
        )

    filename = PurePath(file.filename or "material.pdf").name[:255]
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are supported",
        )

    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"PDF must be at most {settings.max_upload_mb} MB",
        )

    try:
        return await ingest_pdf(
            session, course=course, uploader=professor, filename=filename, data=data
        )
    except InvalidPDFError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from None
    except DuplicateMaterialError as exc:
        uploaded = exc.existing.created_at.strftime("%d %b %Y")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"“{exc.existing.filename}” is already in this course's knowledge "
                f"base (uploaded {uploaded}). It was not added again."
            ),
        ) from None
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The embedding service is not configured",
        ) from None
    except LLMRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=describe_rate_limit(exc),
        ) from None
    except LLMError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The embedding service failed; please try again",
        ) from None
    except VectorStoreError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The course knowledge base is unavailable; please try again",
        ) from None


@router.get(
    "/{course_id}/materials",
    response_model=list[MaterialRead],
    summary="List a course's uploaded material",
)
async def read_materials(
    course_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[MaterialRead]:
    course = await course_for_member(session, course_id, user)
    return await list_materials(session, course.id)


@router.get(
    "/{course_id}/materials/{material_id}/file",
    response_class=FileResponse,
    summary="Download the original PDF of a course material",
)
async def read_material_file(
    course_id: uuid.UUID,
    material_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> FileResponse:
    course = await course_for_member(session, course_id, user)
    material = await get_course_material(session, course.id, material_id)
    # Students only see material that is ready, matching the course page.
    if material is None or (
        user.role == UserRole.STUDENT and material.status != MaterialStatus.READY
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        )

    path = material_file(material)
    if path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The original PDF is not available for this material",
        )
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=material.filename,
        content_disposition_type="inline",
    )
