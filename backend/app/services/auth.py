from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password, verify_password
from app.core.config import settings
from app.models.user import User, UserRole
from app.schemas.user import UserCreate


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    statement = select(User).where(User.email == email.lower())
    return await session.scalar(statement)


async def register_user(session: AsyncSession, user_in: UserCreate) -> User:
    user = User(
        full_name=user_in.full_name.strip(),
        email=user_in.email.lower(),
        hashed_password=hash_password(user_in.password),
        role=UserRole(user_in.role),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def authenticate_user(
    session: AsyncSession, email: str, password: str
) -> User | None:
    user = await get_user_by_email(session, email)
    if user is None or not verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token(subject: str) -> str:
    expires_at = datetime.now(UTC) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": subject, "exp": expires_at},
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
