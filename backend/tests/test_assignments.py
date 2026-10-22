"""Assignment API, run against the real Postgres with fake embedding/Qdrant.

The key property: no endpoint a student can reach ever returns model answers
or key points.
"""

import pytest

from app.rag.llm import LLMError
from app.services import assignments as assignment_service
from tests.api_world import (
    SECRET_ANSWER,
    SECRET_POINT,
    assignment_body,
)
from tests.api_world import create_assignment as create

pytestmark = pytest.mark.anyio


async def test_professor_creates_assignment_with_answer_key(world) -> None:
    created = await create(world)

    assert [q["position"] for q in created["questions"]] == [1, 2]
    first = created["questions"][0]
    assert first["model_answer"] == SECRET_ANSWER
    # Blank key points are dropped.
    assert first["key_points"] == [SECRET_POINT, "Avoids update anomalies"]
    assert created["answer_keys_indexed"] is True
    assert world.indexed[created["id"]] == [q["id"] for q in created["questions"]]


async def test_student_never_sees_the_answer_key(world) -> None:
    created = await create(world)

    async with world.client(world.student) as client:
        listing = await client.get(world.base)
        detail = await client.get(f"{world.base}/{created['id']}")
        key = await client.get(f"{world.base}/{created['id']}/key")

    assert listing.status_code == 200
    assert listing.json()[0]["question_count"] == 2
    assert listing.json()[0]["total_marks"] == 7.5

    assert detail.status_code == 200
    question = detail.json()["questions"][0]
    assert question["text"] == "Why do we normalize a schema?"
    assert "model_answer" not in question and "key_points" not in question
    for response in (listing, detail):
        assert "SECRET" not in response.text

    assert key.status_code == 403


async def test_only_the_course_professor_manages_assignments(world) -> None:
    created = await create(world)
    url = f"{world.base}/{created['id']}"

    async with world.client(world.other_professor) as client:
        assert (
            await client.post(world.base, json=assignment_body())
        ).status_code == 403
        assert (await client.get(f"{url}/key")).status_code == 403
        assert (await client.delete(url)).status_code == 403

    async with world.client(world.student) as client:
        assert (
            await client.post(world.base, json=assignment_body())
        ).status_code == 403
        assert (await client.put(url, json=assignment_body())).status_code == 403

    async with world.client(world.outsider) as client:
        assert (await client.get(world.base)).status_code == 403
        assert (await client.get(url)).status_code == 403


async def test_replace_and_delete(world) -> None:
    created = await create(world)
    url = f"{world.base}/{created['id']}"
    body = assignment_body(title="Quiz v2")
    body["questions"] = body["questions"][:1]

    async with world.client(world.professor) as client:
        replaced = await client.put(url, json=body)
        assert replaced.status_code == 200, replaced.text
        assert replaced.json()["title"] == "Quiz v2"
        assert len(replaced.json()["questions"]) == 1
        assert world.indexed[created["id"]] == [replaced.json()["questions"][0]["id"]]

        assert (await client.delete(url)).status_code == 204
        assert (await client.get(url)).status_code == 404

    assert created["id"] not in world.indexed


async def test_assignment_is_saved_even_if_indexing_fails(world, monkeypatch) -> None:
    async def failing_embed(texts):
        raise LLMError("rate limited")

    monkeypatch.setattr(assignment_service.llm, "embed", failing_embed)
    created = await create(world)
    assert created["answer_keys_indexed"] is False
    assert len(created["questions"]) == 2


@pytest.mark.parametrize(
    "overrides",
    [
        {"questions": []},
        {"title": "   "},
        {"deadline": "2030-01-01T10:00:00"},  # no timezone
        {
            "questions": [
                {"text": "q", "model_answer": "a", "max_marks": 0, "topic": "t"}
            ]
        },
        {
            "questions": [
                {
                    "text": "q",
                    "model_answer": "a",
                    "max_marks": 1,
                    "topic": "t",
                    "key_points": ["1", "2", "3", "4", "5", "6"],
                }
            ]
        },
    ],
)
async def test_invalid_assignments_are_rejected(world, overrides) -> None:
    async with world.client(world.professor) as client:
        response = await client.post(world.base, json=assignment_body(**overrides))
    assert response.status_code == 422
