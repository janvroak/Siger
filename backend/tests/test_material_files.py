import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.config import settings
from app.models.course_material import CourseMaterial, MaterialStatus
from app.schemas.material import MaterialRead
from app.services.materials import material_file


@pytest.fixture
def upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "upload_dir", tmp_path / "uploads")
    (tmp_path / "uploads" / "materials").mkdir(parents=True)
    (tmp_path / "secret.txt").write_text("not course material")
    return tmp_path / "uploads"


def material(stored_path: str | None) -> CourseMaterial:
    return CourseMaterial(
        id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        uploaded_by_id=uuid.uuid4(),
        filename="notes.pdf",
        status=MaterialStatus.READY,
        page_count=1,
        chunk_count=1,
        stored_path=stored_path,
        created_at=datetime.now(UTC),
    )


def test_resolves_a_stored_pdf(upload_dir: Path) -> None:
    (upload_dir / "materials" / "a.pdf").write_bytes(b"%PDF-1.4")
    assert (
        material_file(material("materials/a.pdf"))
        == (upload_dir / "materials" / "a.pdf").resolve()
    )


@pytest.mark.parametrize(
    "stored_path",
    [None, "materials/missing.pdf", "../secret.txt", "/etc/passwd"],
    ids=["no-file-recorded", "missing", "traversal", "absolute"],
)
def test_never_serves_files_outside_uploads(upload_dir: Path, stored_path) -> None:
    assert material_file(material(stored_path)) is None


def test_schema_exposes_has_file_but_not_the_path() -> None:
    body = MaterialRead.model_validate(material("materials/a.pdf")).model_dump()
    assert body["has_file"] is True
    assert "stored_path" not in body
    assert MaterialRead.model_validate(material(None)).model_dump()["has_file"] is False
