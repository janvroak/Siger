import os

import pytest

# Settings require a JWT secret; tests never issue real tokens.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
