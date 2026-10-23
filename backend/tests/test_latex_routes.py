import base64

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import PdfValidation, ResumeDocument
from app.services.latex.compile import CompileOutcome

client = TestClient(app)

DOCUMENT = {
    "id": "resume_routes",
    "contact": {
        "full_name": "Synthetic Candidate",
        "email": "candidate@example.com",
    },
    "summary": "Synthetic fixture for route tests.",
    "skills": [{"name": "Python"}],
}


def payload() -> dict:
    document = ResumeDocument.model_validate(DOCUMENT)
    return {"document": document.model_dump(mode="json"), "template": "ats"}


def test_render_route_returns_source() -> None:
    response = client.post("/api/latex/render", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body["template"] == "ats"
    assert body["source"].startswith(r"\documentclass")
    assert "Synthetic Candidate" in body["source"]


def test_render_route_rejects_unknown_template() -> None:
    response = client.post("/api/latex/render", json={"document": DOCUMENT, "template": "nope"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_template"


def test_render_route_rejects_invalid_document() -> None:
    response = client.post("/api/latex/render", json={"document": {"id": "resume_empty"}})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_compile_returns_unavailable_with_source_when_no_engine(monkeypatch) -> None:
    monkeypatch.setattr("app.api.routes.latex.detect_latex_engine", lambda: None)
    response = client.post("/api/latex/compile", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["source"].startswith(r"\documentclass")
    assert body["pdf_base64"] is None
    assert body["errors"]


def test_compile_accepts_raw_source(monkeypatch) -> None:
    monkeypatch.setattr("app.api.routes.latex.detect_latex_engine", lambda: None)
    source = "\\documentclass{article}\\begin{document}Synthetic\\end{document}"
    response = client.post("/api/latex/compile", json={"source": source})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["source"] == source


def test_compile_returns_base64_pdf_on_success(monkeypatch) -> None:
    pdf_bytes = b"%PDF-1.4 synthetic"

    monkeypatch.setattr("app.api.routes.latex.detect_latex_engine", lambda: "tectonic")
    monkeypatch.setattr(
        "app.api.routes.latex.compile_latex",
        lambda source, engine=None: CompileOutcome(engine="tectonic", pdf_bytes=pdf_bytes, log="ok"),
    )
    monkeypatch.setattr(
        "app.api.routes.latex.validate_pdf_bytes",
        lambda data, document: PdfValidation(ran=True, text_extracted=True),
    )

    response = client.post("/api/latex/compile", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["engine"] == "tectonic"
    assert body["size_bytes"] == len(pdf_bytes)
    assert body["validation"]["text_extracted"] is True
    assert base64.b64decode(body["pdf_base64"]) == pdf_bytes


def test_compile_requires_exactly_one_source() -> None:
    assert client.post("/api/latex/compile", json={}).status_code == 422
    assert client.post("/api/latex/compile", json={"document": DOCUMENT, "source": "x"}).status_code == 422
