import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db_session
from app.models.user import User

# The login endpoint accepts the OAuth2 password form and issues bearer tokens.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
        subject = payload.get("sub")
        user_id = uuid.UUID(subject) if isinstance(subject, str) else None
    except (jwt.InvalidTokenError, ValueError):
        raise credentials_exception from None

    if user_id is None:
        raise credentials_exception

    user = await session.get(User, user_id)
    if user is None:
        raise credentials_exception

    return user


async def get_current_professor(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role.value != "professor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor access is required",
        )
    return current_user


async def get_current_student(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role.value != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access is required",
        )
    return current_user
