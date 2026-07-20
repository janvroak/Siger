from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password
from app.models.user import User, UserRole
from app.schemas.auth import UserRegister


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    statement = select(User).where(User.email == email.lower())
    return await session.scalar(statement)


async def create_user(session: AsyncSession, user_in: UserRegister) -> User:
    user = User(
        full_name=user_in.full_name.strip(),
        email=user_in.email.lower(),
        hashed_password=hash_password(user_in.password),
        role=UserRole.STUDENT,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user
