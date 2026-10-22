"""Faculty review and publishing (human in the loop), against the real Postgres."""

import pytest

from tests.api_world import submit_and_grade

pytestmark = pytest.mark.anyio


async def graded(world) -> tuple[str, str, list[dict]]:
    """A submission graded by the fake grader: Q1 3/5 (AI), Q2 0/2.5 (no answer)."""
    url, submission_id = await submit_and_grade(world)
    async with world.client(world.professor) as client:
        result = (await client.get(f"{url}/submissions/{submission_id}")).json()
    assert result["submission"]["status"] == "under_review"
    return url, submission_id, result["questions"]


def decision(questions, marks, feedback=None, publish=False) -> dict:
    return {
        "questions": [
            {
                "question_id": q["question_id"],
                "final_marks": m,
                "feedback": (feedback or {}).get(q["position"], q["feedback"]),
            }
            for q, m in zip(questions, marks, strict=True)
        ],
        "publish": publish,
    }


async def test_nothing_is_visible_to_the_student_before_publishing(
    world, grader
) -> None:
    url, submission_id, questions = await graded(world)

    async with world.client(world.professor) as client:
        draft = await client.put(
            f"{url}/submissions/{submission_id}/review",
            json=decision(questions, [3, 2]),
        )
    assert draft.status_code == 200, draft.text
    body = draft.json()
    assert body["submission"]["status"] == "under_review"
    assert [q["final_marks"] for q in body["questions"]] == [3, 2]
    assert [(e["action"], e["question_position"]) for e in body["review_log"]] == [
        ("approve", 1),  # same as the AI
        ("override", 2),  # AI gave 0
    ]

    async with world.client(world.student) as client:
        assert (await client.get(f"{url}/submission/result")).status_code == 404
        [listed] = (await client.get(world.base)).json()
        assert listed["my_status"] == "under_review" and listed["my_score"] is None


async def test_publish_shows_the_final_grade_to_the_student(world, grader) -> None:
    url, submission_id, questions = await graded(world)

    async with world.client(world.professor) as client:
        published = await client.put(
            f"{url}/submissions/{submission_id}/review",
            json=decision(questions, [3, 1.5], {2: "Answer every question."}, True),
        )
        assert published.status_code == 200, published.text
        assert published.json()["submission"]["status"] == "published"
        assert published.json()["published_at"]
        roster = (await client.get(f"{url}/submissions")).json()
        assert roster["students"][0]["final_marks"] == 4.5
        assert roster["students"][0]["ai_marks"] == 3
        assert roster["total_marks"] == 7.5

    async with world.client(world.student) as client:
        result = await client.get(f"{url}/submission/result")
        assert result.status_code == 200
        grade = result.json()
        assert (grade["total_marks"], grade["max_marks"]) == (4.5, 7.5)
        q1, q2 = grade["questions"]
        assert (q1["marks"], q2["marks"]) == (3, 1.5)
        assert q2["feedback"] == "Answer every question."
        assert q1["key_points_missed"] == ["update anomalies"]
        # AI internals stay with faculty.
        for hidden in ("ai_marks", "confidence", "similarity", "rationale", "flagged"):
            assert hidden not in result.text
        [listed] = (await client.get(world.base)).json()
        assert listed["my_status"] == "published" and listed["my_score"] == 4.5


async def test_published_grade_can_be_corrected_and_is_logged(world, grader) -> None:
    url, submission_id, questions = await graded(world)
    review_url = f"{url}/submissions/{submission_id}/review"

    async with world.client(world.professor) as client:
        await client.put(review_url, json=decision(questions, [3, 0], publish=True))
        corrected = await client.put(
            review_url, json=decision(questions, [4, 0], publish=True)
        )

    log = [
        (e["action"], e["question_position"]) for e in corrected.json()["review_log"]
    ]
    # First pass: two approvals and one publish; then only the changed question.
    assert log.count(("publish", None)) == 1
    assert log[-1] == ("override", 1)
    assert corrected.json()["submission"]["status"] == "published"


@pytest.mark.parametrize(
    ("make_body", "expected"),
    [
        (lambda q: decision(q[:1], [3]), 422),  # a question left out
        (lambda q: decision(q, [6, 0]), 422),  # more than the maximum (5)
        (lambda q: decision(q, [-1, 0]), 422),  # negative
        (lambda q: {**decision(q, [3, 0]), "questions": []}, 422),
    ],
)
async def test_invalid_reviews_are_rejected(world, grader, make_body, expected) -> None:
    url, submission_id, questions = await graded(world)
    async with world.client(world.professor) as client:
        response = await client.put(
            f"{url}/submissions/{submission_id}/review", json=make_body(questions)
        )
        assert response.status_code == expected
        after = (await client.get(f"{url}/submissions/{submission_id}")).json()
    # A rejected review changes nothing.
    assert after["review_log"] == []
    assert all(q["final_marks"] is None for q in after["questions"])


async def test_only_the_course_professor_reviews(world, grader) -> None:
    url, submission_id, questions = await graded(world)
    review_url = f"{url}/submissions/{submission_id}/review"
    body = decision(questions, [5, 2.5], publish=True)
    for user in (world.student, world.other_professor):
        async with world.client(user) as client:
            assert (await client.put(review_url, json=body)).status_code == 403


async def test_failed_grading_cannot_be_reviewed(world, grader) -> None:
    grader.fail_scoring = True
    url, submission_id = await submit_and_grade(world)
    async with world.client(world.professor) as client:
        response = await client.put(
            f"{url}/submissions/{submission_id}/review",
            json={
                "questions": [
                    {
                        "question_id": "00000000-0000-0000-0000-000000000000",
                        "final_marks": 1,
                        "feedback": "x",
                    }
                ],
                "publish": True,
            },
        )
    assert response.status_code == 409
