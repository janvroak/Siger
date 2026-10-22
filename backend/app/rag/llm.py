import asyncio
import json
from contextlib import suppress
from datetime import UTC, datetime
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


class LLMRateLimitError(LLMError):
    """The provider's request quota is used up (e.g. OpenRouter's free daily cap)."""

    def __init__(self, message: str, retry_after: datetime | None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def _rate_limited(exc: openai.RateLimitError) -> LLMRateLimitError:
    # OpenRouter reports when the quota resets in X-RateLimit-Reset (epoch ms).
    reset: datetime | None = None
    body = exc.body if isinstance(exc.body, dict) else {}
    headers = (body.get("metadata") or {}).get("headers") or {}
    with suppress(KeyError, TypeError, ValueError, OverflowError):
        reset = datetime.fromtimestamp(int(headers["X-RateLimit-Reset"]) / 1000, UTC)
    return LLMRateLimitError(f"Rate limit reached: {body.get('message', exc)}", reset)


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


def describe_rate_limit(exc: LLMRateLimitError) -> str:
    """A user-facing explanation of a quota error."""
    if exc.retry_after is None:
        return (
            "The AI provider's request limit has been reached. Please try again later."
        )
    local = exc.retry_after.astimezone().strftime("%d %b %H:%M %Z")
    return (
        "The AI provider's daily request limit has been reached. "
        f"Please try again after {local}."
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
        except openai.RateLimitError as exc:
            raise _rate_limited(exc) from exc
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


class _TransientLLMError(LLMError):
    """A failure worth retrying: timeout, provider 5xx, or an empty reply."""


# Free-tier providers drop or empty out replies under load, so every caller
# shares a small number of parallel chat calls.
_chat_slots: asyncio.Semaphore | None = None


def _slots() -> asyncio.Semaphore:
    global _chat_slots
    if _chat_slots is None:
        _chat_slots = asyncio.Semaphore(settings.llm_max_parallel)
    return _chat_slots


async def chat_json(system: str, user: str) -> dict[str, Any]:
    """Run one chat completion that must return a JSON object.

    Transient failures (timeouts, provider errors, empty or malformed replies)
    are retried with a short backoff; rate limits and request errors are not.
    """
    attempts = settings.llm_max_attempts
    for attempt in range(1, attempts + 1):
        try:
            async with _slots():
                # A hard deadline: OpenRouter keeps slow requests alive with
                # keep-alive bytes, so the client's read timeout never fires.
                async with asyncio.timeout(settings.llm_timeout_seconds):
                    return await _chat_json_once(system, user)
        except (_TransientLLMError, LLMOutputError, TimeoutError):
            if attempt == attempts:
                raise _TransientLLMError(
                    f"No usable reply from the AI provider after {attempts} attempts"
                ) from None
            await asyncio.sleep(2**attempt)
    raise AssertionError("unreachable")


async def _chat_json_once(system: str, user: str) -> dict[str, Any]:
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
    except openai.RateLimitError as exc:
        raise _rate_limited(exc) from exc
    except (openai.APIConnectionError, openai.InternalServerError) as exc:
        # APITimeoutError is an APIConnectionError.
        raise _TransientLLMError(f"Chat completion failed: {exc}") from exc
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
