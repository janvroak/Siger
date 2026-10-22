"""Upload -> background grading -> results, against the real Postgres.

The LLM, embeddings and Qdrant are faked; the graph, services, routes and
database are real.
"""

from pathlib import Path

import pytest

from app.agents.evaluation import nodes
from app.api.routes import submissions as submission_routes
from app.rag.llm import LLMRateLimitError
from app.services import grading
from tests.api_world import create_assignment

pytestmark = pytest.mark.anyio

ANSWERS_PDF = (
    Path(__file__).resolve().parents[1] / "demo_data" / "db201_course_notes.pdf"
).read_bytes()


class FakeGrader:
    def __init__(self) -> None:
        self.fail_scoring = False

    async def chat_json(self, system: str, user: str) -> dict:
        if system.startswith("You split"):
            return {
                "answers": [
                    {"question": 1, "answer": "Normalization reduces redundancy."},
                    {"question": 2, "answer": ""},
                ]
            }
        if system.startswith("You are a fair"):
            if self.fail_scoring:
                raise LLMRateLimitError("quota", None)
            return {
                "covered": ["reduces redundancy"],
                "missing": ["update anomalies"],
                "incorrect": [],
                "marks": 3,
                "rationale": "Mentions redundancy but not anomalies.",
            }
        if system.startswith("You write personalised"):
            return {
                "feedback": [
                    {
                        "question": 1,
                        "text": "Also cover anomalies.",
                        "cited_excerpts": [],
                    }
                ]
            }
        raise AssertionError(system[:30])

    async def embed(self, texts):
        return [[1.0, 0.1] for _ in texts]


@pytest.fixture
def grader(world, monkeypatch):
    fake = FakeGrader()
    monkeypatch.setattr(submission_routes, "grade_submission", grading.grade_submission)
    monkeypatch.setattr(grading, "session_factory", world.sessions)
    monkeypatch.setattr(nodes.llm, "chat_json", fake.chat_json)
    monkeypatch.setattr(nodes.llm, "embed", fake.embed)

    async def key_vectors(ids):
        return {i: [1.0, 0.0] for i in ids}

    async def no_slides(**_):
        return []

    monkeypatch.setattr(nodes.vector_store, "get_answer_key_vectors", key_vectors)
    monkeypatch.setattr(nodes.vector_store, "search", no_slides)
    return fake


async def submit(world) -> tuple[str, str]:
    assignment = await create_assignment(world)
    url = f"{world.base}/{assignment['id']}"
    async with world.client(world.student) as client:
        # The ASGI test transport runs background tasks before returning.
        response = await client.post(
            f"{url}/submission",
            files={"file": ("answers.pdf", ANSWERS_PDF, "application/pdf")},
        )
    assert response.status_code == 201, response.text
    return url, response.json()["id"]


async def test_upload_is_graded_in_the_background(world, grader) -> None:
    url, submission_id = await submit(world)

    async with world.client(world.professor) as client:
        result = (await client.get(f"{url}/submissions/{submission_id}")).json()

    assert result["submission"]["status"] == "under_review"
    assert result["total_ai_marks"] == 3 and result["total_marks"] == 7.5
    q1, q2 = result["questions"]
    assert q1["ai_marks"] == 3 and q1["final_marks"] is None
    assert q1["key_points_missed"] == ["update anomalies"]
    assert q1["feedback"] == "Also cover anomalies."
    assert q1["similarity"] is not None and 0 <= q1["confidence"] <= 1
    # The unanswered question scores 0 and still gets feedback.
    assert q2["ai_marks"] == 0 and q2["feedback"] == "This question was not answered."
    nodes_run = [step["node"] for step in result["grading_trace"]]
    assert nodes_run[0] == "extract_text" and nodes_run[-1] == "save_results"

    # Before faculty publish, the student sees only the status.
    async with world.client(world.student) as client:
        assert (
            await client.get(f"{url}/submissions/{submission_id}")
        ).status_code == 403
        mine = (await client.get(f"{url}/submission")).json()["submission"]
        assert mine["status"] == "under_review"
        assert "ai_marks" not in str(mine)


async def test_failed_grading_is_recorded_and_can_be_retried(world, grader) -> None:
    grader.fail_scoring = True
    url, submission_id = await submit(world)

    async with world.client(world.professor) as client:
        failed = (await client.get(f"{url}/submissions/{submission_id}")).json()
        assert failed["submission"]["status"] == "failed"
        assert "request limit" in failed["error"]
        roster = (await client.get(f"{url}/submissions")).json()
        assert roster["students"][0]["state"] == "failed"

        grader.fail_scoring = False
        retried = await client.post(f"{url}/submissions/{submission_id}/grade")
        assert retried.status_code == 202

        done = (await client.get(f"{url}/submissions/{submission_id}")).json()
        assert done["submission"]["status"] == "under_review"
        assert done["error"] is None and len(done["questions"]) == 2

        # A graded submission is not graded again by accident.
        again = await client.post(f"{url}/submissions/{submission_id}/grade")
        assert again.status_code == 409


async def test_interrupted_grading_is_recovered_at_startup(world, grader) -> None:
    from sqlalchemy import update

    from app.models.submission import Submission, SubmissionStatus

    url, submission_id = await submit(world)
    async with world.sessions() as db:
        await db.execute(
            update(Submission)
            .where(Submission.id == submission_id)
            .values(status=SubmissionStatus.EVALUATING)
        )
        await db.commit()

    assert await grading.recover_interrupted() >= 1

    async with world.client(world.professor) as client:
        result = (await client.get(f"{url}/submissions/{submission_id}")).json()
    assert result["submission"]["status"] == "failed"
    assert "interrupted" in result["error"]
