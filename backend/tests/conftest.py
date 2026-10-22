import os

import pytest

# Settings require a JWT secret; tests never issue real tokens.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# Imported after the environment is set up, since importing the app reads settings.
from tests.api_world import grader, world  # noqa: E402, F401  (shared fixtures)
