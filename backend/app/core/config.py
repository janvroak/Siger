from functools import cached_property
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Siger API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"

    postgres_user: str = "siger"
    postgres_password: str = Field(default="siger_password", repr=False)
    postgres_db: str = "siger_db"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    database_url: str | None = None

    jwt_secret_key: SecretStr
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=30, gt=0)

    # OpenRouter serves both chat completions and embeddings (OpenAI-compatible).
    openrouter_api_key: SecretStr | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    chat_model: str = "openai/gpt-4o-mini"
    embedding_model: str = "openai/text-embedding-3-small"
    embedding_dimensions: int = Field(default=1536, gt=0)
    llm_timeout_seconds: float = Field(default=60, gt=0)

    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "course_chunks"

    chunk_size: int = Field(default=1000, gt=100)
    chunk_overlap: int = Field(default=150, ge=0)
    retrieval_top_k: int = Field(default=5, gt=0)
    # Cosine similarity below this means the course material does not cover the
    # question, so the Teaching node refuses without calling the LLM.
    retrieval_min_score: float = Field(default=0.3, ge=0, le=1)
    max_upload_mb: int = Field(default=20, gt=0)

    @cached_property
    def sqlalchemy_database_uri(self) -> str:
        if self.database_url:
            return self.database_url

        return (
            "postgresql+asyncpg://"
            f"{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


settings = Settings()
