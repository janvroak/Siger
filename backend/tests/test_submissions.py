"""Student submissions, run against the real Postgres (see tests/api_world.py)."""

import io
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pypdf import PdfWriter

from app.core.config import settings
from tests.api_world import assignment_body, create_assignment

pytestmark = pytest.mark.anyio

ANSWERS_PDF = (
    Path(__file__).resolve().parents[1] / "demo_data" / "db201_course_notes.pdf"
).read_bytes()


def blank_pdf() -> bytes:
    """A valid PDF with no text layer, like a scan."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def pdf_upload(data: bytes = ANSWERS_PDF, name: str = "answers.pdf") -> dict:
    return {"file": (name, data, "application/pdf")}


def past_deadline() -> str:
    return (datetime.now(UTC) - timedelta(hours=1)).isoformat()


async def test_student_submits_and_tracks_status(world) -> None:
    assignment = await create_assignment(world)
    url = f"{world.base}/{assignment['id']}/submission"

    async with world.client(world.student) as client:
        assert (await client.get(url)).json() == {"submission": None}

        created = await client.post(url, files=pdf_upload())
        assert created.status_code == 201, created.text
        assert created.json()["status"] == "submitted"
        assert created.json()["filename"] == "answers.pdf"

        mine = (await client.get(url)).json()["submission"]
        assert mine["id"] == created.json()["id"]
        # Grading was scheduled for the new submission.
        assert [str(i) for i in world.graded] == [mine["id"]]

        pdf = await client.get(f"{url}/file")
        assert pdf.status_code == 200 and pdf.content == ANSWERS_PDF

        [listed] = (await client.get(world.base)).json()
        assert listed["my_status"] == "submitted"
        assert listed["submission_count"] is None  # not shown to students

    async with world.client(world.professor) as client:
        [listed] = (await client.get(world.base)).json()
        assert listed["submission_count"] == 1 and listed["my_status"] is None

    stored = list(Path(settings.upload_dir, "submissions").iterdir())
    assert len(stored) == 1


async def test_only_one_submission_per_student(world) -> None:
    assignment = await create_assignment(world)
    url = f"{world.base}/{assignment['id']}/submission"
    async with world.client(world.student) as client:
        assert (await client.post(url, files=pdf_upload())).status_code == 201
        again = await client.post(url, files=pdf_upload(name="v2.pdf"))
    assert again.status_code == 409
    assert len(list(Path(settings.upload_dir, "submissions").iterdir())) == 1


async def test_no_submissions_after_the_deadline(world) -> None:
    assignment = await create_assignment(world, deadline=past_deadline())
    async with world.client(world.student) as client:
        response = await client.post(
            f"{world.base}/{assignment['id']}/submission", files=pdf_upload()
        )
    assert response.status_code == 409
    assert "deadline" in response.json()["detail"]


@pytest.mark.parametrize(
    ("upload", "expected"),
    [
        (pdf_upload(b"not a pdf", "answers.pdf"), 422),
        (pdf_upload(ANSWERS_PDF, "answers.docx"), 415),
        (pdf_upload(blank_pdf()), 422),  # scanned: no text to grade
    ],
)
async def test_unusable_files_are_rejected(world, upload, expected) -> None:
    assignment = await create_assignment(world)
    async with world.client(world.student) as client:
        response = await client.post(
            f"{world.base}/{assignment['id']}/submission", files=upload
        )
    assert response.status_code == expected
    assert not Path(settings.upload_dir, "submissions").exists()


async def test_only_enrolled_students_submit(world) -> None:
    assignment = await create_assignment(world)
    url = f"{world.base}/{assignment['id']}/submission"
    async with world.client(world.outsider) as client:
        assert (await client.post(url, files=pdf_upload())).status_code == 403
    async with world.client(world.professor) as client:
        assert (await client.post(url, files=pdf_upload())).status_code == 403


async def test_roster_shows_every_enrolled_student(world) -> None:
    open_assignment = await create_assignment(world)
    closed_assignment = await create_assignment(world, deadline=past_deadline())

    async with world.client(world.student) as client:
        await client.post(
            f"{world.base}/{open_assignment['id']}/submission", files=pdf_upload()
        )
        # Students cannot see the class roster.
        roster_url = f"{world.base}/{open_assignment['id']}/submissions"
        assert (await client.get(roster_url)).status_code == 403

    async with world.client(world.professor) as client:
        roster = (
            await client.get(f"{world.base}/{open_assignment['id']}/submissions")
        ).json()
        assert (roster["enrolled"], roster["submitted"], roster["overdue"]) == (1, 1, 0)
        [row] = roster["students"]
        assert row["student_id"] == str(world.student.id)
        assert row["state"] == "submitted"

        pdf = await client.get(
            f"{world.base}/{open_assignment['id']}/submissions/"
            f"{row['submission']['id']}/file"
        )
        assert pdf.status_code == 200 and pdf.content == ANSWERS_PDF

        closed = (
            await client.get(f"{world.base}/{closed_assignment['id']}/submissions")
        ).json()
        assert closed["overdue"] == 1
        assert closed["students"][0]["state"] == "overdue"

    async with world.client(world.other_professor) as client:
        url = f"{world.base}/{open_assignment['id']}/submissions"
        assert (await client.get(url)).status_code == 403


async def test_answer_key_is_locked_once_students_submit(world) -> None:
    assignment = await create_assignment(world)
    url = f"{world.base}/{assignment['id']}"
    async with world.client(world.student) as client:
        await client.post(f"{url}/submission", files=pdf_upload())
    async with world.client(world.professor) as client:
        response = await client.put(url, json=assignment_body(title="changed"))
    assert response.status_code == 409


async def test_deleting_an_assignment_removes_submission_files(world) -> None:
    assignment = await create_assignment(world)
    url = f"{world.base}/{assignment['id']}"
    async with world.client(world.student) as client:
        await client.post(f"{url}/submission", files=pdf_upload())
    assert len(list(Path(settings.upload_dir, "submissions").iterdir())) == 1

    async with world.client(world.professor) as client:
        assert (await client.delete(url)).status_code == 204
    assert not list(Path(settings.upload_dir, "submissions").iterdir())
