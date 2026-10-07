import json
from functools import lru_cache
from typing import Any

import openai
from openai import AsyncOpenAI

from app.core.config import settings

EMBEDDING_BATCH_SIZE = 64


class LLMError(Exception):
    """The LLM provider is unconfigured, unreachable or returned unusable output."""


class LLMNotConfiguredError(LLMError):
    pass


class LLMOutputError(LLMError):
    """The provider answered, but not with the JSON object we asked for."""


@lru_cache
def _client() -> AsyncOpenAI:
    if settings.openrouter_api_key is None:
        raise LLMNotConfiguredError("OPENROUTER_API_KEY is not set")

    return AsyncOpenAI(
        api_key=settings.openrouter_api_key.get_secret_value(),
        base_url=settings.openrouter_base_url,
        timeout=settings.llm_timeout_seconds,
        default_headers={"X-Title": settings.app_name},
    )


def is_configured() -> bool:
    return settings.openrouter_api_key is not None


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts in batches; one vector per input, in input order."""
    vectors: list[list[float]] = []
    for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[start : start + EMBEDDING_BATCH_SIZE]
        try:
            response = await _client().embeddings.create(
                model=settings.embedding_model, input=batch
            )
        except openai.OpenAIError as exc:
            raise LLMError(f"Embedding request failed: {exc}") from exc

        data = sorted(response.data or [], key=lambda item: item.index)
        if len(data) != len(batch):
            raise LLMError("Embedding response did not match the request size")
        vectors.extend(item.embedding for item in data)

    if vectors and len(vectors[0]) != settings.embedding_dimensions:
        raise LLMError(
            f"Embedding model returned {len(vectors[0])} dimensions, "
            f"expected EMBEDDING_DIMENSIONS={settings.embedding_dimensions}"
        )
    return vectors


async def chat_json(system: str, user: str) -> dict[str, Any]:
    """Run one chat completion that must return a JSON object."""
    try:
        response = await _client().chat.completions.create(
            model=settings.chat_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
    except openai.OpenAIError as exc:
        raise LLMError(f"Chat completion failed: {exc}") from exc

    if not response.choices or not response.choices[0].message.content:
        raise LLMOutputError("Chat completion returned no content")

    return _parse_json_object(response.choices[0].message.content)


def _parse_json_object(content: str) -> dict[str, Any]:
    # Some models wrap JSON in prose or code fences despite response_format.
    start, end = content.find("{"), content.rfind("}")
    if start == -1 or end <= start:
        raise LLMOutputError("Chat completion did not return a JSON object")
    try:
        parsed = json.loads(content[start : end + 1])
    except json.JSONDecodeError as exc:
        raise LLMOutputError("Chat completion returned malformed JSON") from exc
    if not isinstance(parsed, dict):
        raise LLMOutputError("Chat completion did not return a JSON object")
    return parsed
