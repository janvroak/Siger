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
    # Chat calls are retried on timeouts, provider errors and empty replies.
    llm_max_attempts: int = Field(default=3, gt=0)
    # Chat calls in flight at once across the app (free tiers drop bursts).
    llm_max_parallel: int = Field(default=3, gt=0)

    qdrant_url: str = "http://localhost:6333"
    # Lecture material (the "slides" collection); the only one the chatbot searches.
    qdrant_collection: str = "course_chunks"
    # Teacher model answers, used only for grading.
    qdrant_answer_key_collection: str = "answer_keys"

    chunk_size: int = Field(default=1000, gt=100)
    chunk_overlap: int = Field(default=150, ge=0)
    retrieval_top_k: int = Field(default=5, gt=0)
    # Cosine similarity below this means the course material does not cover the
    # question, so the Teaching node refuses without calling the LLM.
    retrieval_min_score: float = Field(default=0.3, ge=0, le=1)
    # Grading. Embedding similarity is turned into an expected score by mapping
    # [low, high] onto [0, 1]; these depend on the embedding model. Measured for
    # nvidia/nemotron-3-embed-1b: wrong ~0.43, partial ~0.49, correct ~0.62-0.70.
    grading_similarity_low: float = Field(default=0.35, ge=0, le=1)
    grading_similarity_high: float = Field(default=0.70, ge=0, le=1)
    # Confidence below this means similarity and LLM marks disagree: the
    # question is re-checked once, then flagged for faculty.
    grading_min_confidence: float = Field(default=0.6, ge=0, le=1)
    # Submissions graded at the same time (each makes several LLM calls).
    grading_concurrency: int = Field(default=2, gt=0)
    # A grading still running after this is stopped and marked failed.
    grading_timeout_seconds: int = Field(default=900, gt=0)
    # A topic whose mastery is below this is reported as a learning gap.
    learning_gap_threshold: float = Field(default=0.5, ge=0, le=1)
    max_upload_mb: int = Field(default=20, gt=0)
    # Original course PDFs; served only through the authorized material endpoint.
    upload_dir: Path = BACKEND_DIR / "uploads"

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
