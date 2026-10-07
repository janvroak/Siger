from pydantic import BaseModel

from app.models.user import UserRole


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
