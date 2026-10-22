"""Dashboard numbers, checked against a small hand-computed dataset."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models.assignment import Assignment, Question
from app.models.course import Enrollment
from app.models.question_score import QuestionScore
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from tests.api_world import TAG

pytestmark = pytest.mark.anyio

NOW = datetime.now(UTC)


async def build(world) -> dict:
    """
    Students: s1 (world.student), s2, s3 - all enrolled.
    A1 (closed): Normalization 4 marks, Keys 2 marks.
      s1 published: Norm AI 4 -> final 3 (flagged, overridden), Keys 2 -> 2.
      s2 under review (does not count). s3 never submitted (overdue).
    A2 (open): Transactions 5, Normalization 5.
      s1 published: Trans 1 -> 1, Norm 5 -> 5. s2, s3 pending.
    """
    async with world.sessions() as db:
        tag = uuid.uuid4().hex[:6]
        s2 = User(
            full_name="Bea",
            email=f"{TAG}-b-{tag}@example.com",
            hashed_password="x",
            role=UserRole.STUDENT,
        )
        s3 = User(
            full_name="Cal",
            email=f"{TAG}-c-{tag}@example.com",
            hashed_password="x",
            role=UserRole.STUDENT,
        )
        db.add_all([s2, s3])
        await db.flush()
        db.add_all(
            [
                Enrollment(student_id=s2.id, course_id=world.course.id),
                Enrollment(student_id=s3.id, course_id=world.course.id),
            ]
        )

        def assignment(title, deadline, questions):
            return Assignment(
                course_id=world.course.id,
                created_by_id=world.professor.id,
                title=title,
                deadline=deadline,
                questions=[
                    Question(
                        position=i,
                        text=f"q{i}",
                        model_answer="a",
                        max_marks=m,
                        topic=t,
                        key_points=[],
                    )
                    for i, (t, m) in enumerate(questions, start=1)
                ],
            )

        a1 = assignment(
            "A1", NOW - timedelta(days=2), [("Normalization", 4), ("Keys", 2)]
        )
        a2 = assignment(
            "A2", NOW + timedelta(days=2), [("Transactions", 5), ("Normalization", 5)]
        )
        db.add_all([a1, a2])
        await db.flush()

        def submission(assignment_, student, status, marks):
            sub = Submission(
                assignment_id=assignment_.id,
                student_id=student.id,
                filename="a.pdf",
                stored_path="submissions/none.pdf",
                page_count=1,
                status=status,
            )
            db.add(sub)
            return sub, marks

        graded = [
            submission(
                a1,
                world.student,
                SubmissionStatus.PUBLISHED,
                [(4, 3, True), (2, 2, False)],
            ),
            submission(
                a1,
                s2,
                SubmissionStatus.UNDER_REVIEW,
                [(1, None, False), (1, None, False)],
            ),
            submission(
                a2,
                world.student,
                SubmissionStatus.PUBLISHED,
                [(1, 1, False), (5, 5, False)],
            ),
        ]
        await db.flush()
        for (sub, marks), assignment_ in zip(graded, [a1, a1, a2], strict=True):
            for question, (ai, final, flagged) in zip(
                assignment_.questions, marks, strict=True
            ):
                db.add(
                    QuestionScore(
                        submission_id=sub.id,
                        question_id=question.id,
                        student_answer="x",
                        similarity=0.5,
                        ai_marks=ai,
                        final_marks=final,
                        key_points_hit=[],
                        key_points_missed=[],
                        incorrect_points=[],
                        rationale="r",
                        confidence=0.9,
                        flagged=flagged,
                        rechecked=flagged,
                        feedback="f",
                        feedback_sources=[],
                    )
                )
        await db.commit()
        return {"s2": s2, "s3": s3, "a1": a1, "a2": a2}


async def test_class_dashboard_numbers(world) -> None:
    await build(world)
    async with world.client(world.professor) as client:
        response = await client.get(f"/courses/{world.course.id}/analytics")
    assert response.status_code == 200, response.text
    a = response.json()

    assert (a["enrolled"], a["assignments"]) == (3, 2)
    assert a["comprehension"] == pytest.approx(11 / 16, abs=1e-4)
    assert a["completion_rate"] == pytest.approx(3 / 6, abs=1e-4)

    # Weakest first; Transactions (1/5) is a learning gap.
    assert [(t["topic"], t["is_gap"]) for t in a["topics"]] == [
        ("Transactions", True),
        ("Normalization", False),
        ("Keys", False),
    ]
    assert a["topics"][1]["mastery"] == pytest.approx(8 / 9, abs=1e-4)

    a1, a2 = a["completion"]
    assert (a1["submitted"], a1["pending"], a1["overdue"], a1["published"]) == (
        2,
        0,
        1,
        1,
    )
    assert a1["average_score"] == pytest.approx(5 / 6, abs=1e-4)
    assert (a2["submitted"], a2["pending"], a2["overdue"]) == (1, 2, 0)

    assert [(o["student_name"], o["assignment_title"]) for o in a["overdue"]] == [
        ("Cal", "A1")
    ]

    students = {s["student_name"]: s for s in a["students"]}
    assert a["students"][0]["student_id"] == str(world.student.id)  # only graded one
    assert students["Bea"]["comprehension"] is None  # under review does not count
    assert students["Cal"]["overdue"] == 1

    agreement = a["agreement"]
    assert agreement["reviewed_answers"] == 4
    assert agreement["exact_agreement"] == 0.75
    assert agreement["mean_abs_difference"] == 0.25
    assert (
        agreement["overrides"],
        agreement["flagged"],
        agreement["flagged_overridden"],
    ) == (1, 1, 1)


async def test_student_sees_only_their_own_progress(world) -> None:
    data = await build(world)
    base = f"/courses/{world.course.id}/analytics"
    async with world.client(world.student) as client:
        mine = (await client.get(f"{base}/me")).json()
        assert (await client.get(base)).status_code == 403
        other = await client.get(f"{base}/students/{data['s2'].id}")
        assert other.status_code == 403

    assert mine["comprehension"] == pytest.approx(11 / 16, abs=1e-4)
    assert [round(p["score"], 4) for p in mine["trend"]] == [round(5 / 6, 4), 0.6]
    assert mine["topics"][0] == {
        "topic": "Transactions",
        "mastery": 0.2,
        "earned": 1.0,
        "possible": 5.0,
        "graded_answers": 1,
        "is_gap": True,
    }
    assert [s["state"] for s in mine["assignments"]] == ["graded", "graded"]


async def test_professor_drills_into_a_student(world) -> None:
    data = await build(world)
    base = f"/courses/{world.course.id}/analytics/students"
    async with world.client(world.professor) as client:
        cal = (await client.get(f"{base}/{data['s3'].id}")).json()
        bea = (await client.get(f"{base}/{data['s2'].id}")).json()
        outsider = await client.get(f"{base}/{world.outsider.id}")
    assert [s["state"] for s in cal["assignments"]] == ["overdue", "pending"]
    assert cal["comprehension"] is None and cal["trend"] == []
    assert [s["state"] for s in bea["assignments"]] == ["under_review", "pending"]
    assert outsider.status_code == 404

    async with world.client(world.other_professor) as client:
        assert (
            await client.get(f"/courses/{world.course.id}/analytics")
        ).status_code == 403


async def test_empty_course_has_no_numbers_yet(world) -> None:
    async with world.client(world.professor) as client:
        a = (await client.get(f"/courses/{world.course.id}/analytics")).json()
    assert a["comprehension"] is None and a["completion_rate"] is None
    assert a["topics"] == [] and a["completion"] == []
    assert a["agreement"]["reviewed_answers"] == 0
    assert a["agreement"]["exact_agreement"] is None
