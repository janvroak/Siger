from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.auth import AccessToken
from app.schemas.user import UserCreate, UserRead
from app.services.auth import (
    authenticate_user,
    create_access_token,
    get_user_by_email,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register an account",
)
async def register(
    user_in: UserCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserRead:
    if await get_user_by_email(session, user_in.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    try:
        return await register_user(session, user_in)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from None


@router.post(
    "/login",
    response_model=AccessToken,
    summary="Log in with email and password",
)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AccessToken:
    user = await authenticate_user(session, form_data.username, form_data.password)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AccessToken(
        access_token=create_access_token(str(user.id)),
        role=user.role,
    )
