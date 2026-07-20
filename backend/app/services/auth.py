from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import verify_password
from app.models.user import User
from app.services.users import get_user_by_email


async def authenticate_user(
    session: AsyncSession, email: str, password: str
) -> User | None:
    user = await get_user_by_email(session, email)
    if user is None or not verify_password(password, user.hashed_password):
        return None
    return user
