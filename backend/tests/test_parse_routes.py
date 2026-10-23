from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app

client = TestClient(app)

TEX = r"""
\documentclass{article}
\begin{document}
Ada Lovelace
ada@example.com
\section{Skills}
Python, SQL
\end{document}
"""


def test_parse_tex_upload() -> None:
    response = client.post(
        "/api/resumes/parse",
        files={"file": ("ada.tex", TEX.encode("utf-8"), "application/x-tex")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source_type"] == "tex"
    assert body["filename"] == "ada.tex"
    assert body["document"]["contact"]["full_name"] == "Ada Lovelace"
    assert body["document"]["skills"][0]["name"] == "Python"
    assert body["parse_confidence"] > 0
    assert "raw_tex" in body


def test_parse_rejects_unsupported_extension() -> None:
    response = client.post(
        "/api/resumes/parse",
        files={"file": ("resume.docx", b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported_file_type"


def test_parse_rejects_empty_file() -> None:
    response = client.post(
        "/api/resumes/parse",
        files={"file": ("resume.tex", b"", "application/x-tex")},
    )
    assert response.status_code == 415


def test_parse_rejects_invalid_pdf() -> None:
    response = client.post(
        "/api/resumes/parse",
        files={"file": ("resume.pdf", b"not a pdf", "application/pdf")},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "parse_failed"


def test_parse_enforces_upload_limit(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.routes.resumes.get_settings",
        lambda: Settings(max_upload_bytes=20),
    )
    response = client.post(
        "/api/resumes/parse",
        files={"file": ("resume.tex", b"x" * 21, "application/x-tex")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


SAMPLE_JOB = """Senior Engineer at Acme

Requirements
- Must have 3+ years of experience with Python.
- Experience with React and TypeScript.
- Nice to have AWS.
"""


def test_extract_job_from_text_route() -> None:
    response = client.post("/api/jobs/extract", json={"text": SAMPLE_JOB})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["job"]["title"] == "Senior Engineer"
    assert body["job"]["company"] == "Acme"
    assert "Python" in body["job"]["required_skills"]
    assert body["job"]["extraction"]["method"] == "paste"


def test_extract_job_route_requires_exactly_one_source() -> None:
    assert client.post("/api/jobs/extract", json={}).status_code == 422
    assert client.post("/api/jobs/extract", json={"url": "https://example.com", "text": SAMPLE_JOB}).status_code == 422


def test_extract_job_route_blocks_private_url() -> None:
    response = client.post("/api/jobs/extract", json={"url": "http://127.0.0.1/jobs/1"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsafe_url"


def test_extract_job_route_rejects_non_http_url() -> None:
    response = client.post("/api/jobs/extract", json={"url": "file:///etc/passwd"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_job_url"


def test_extract_job_route_uses_fetch_service(monkeypatch) -> None:
    from app.schemas.job import ExtractionMethod, JobProfile

    def fake_extract(url: str) -> JobProfile:
        return JobProfile(
            title="Imported Role",
            company="Imported Co",
            description="x" * 200,
            canonical_url=url,
            extraction={"method": ExtractionMethod.HTML},
        )

    monkeypatch.setattr("app.api.routes.jobs.extract_job_from_url", fake_extract)
    response = client.post("/api/jobs/extract", json={"url": "https://example.com/jobs/1"})
    assert response.status_code == 200
    assert response.json()["job"]["title"] == "Imported Role"
