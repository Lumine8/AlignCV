from app.schemas import ResumeDocument
from app.services.latex.validate import validate_pdf_bytes, validate_text

FULL_TEXT = """
Synthetic Candidate
candidate@example.com
+1 555 0100
Summary
Education
Experience
Projects
Skills
Python
SQL
"""


def sample_document() -> ResumeDocument:
    return ResumeDocument.model_validate(
        {
            "id": "resume_validate",
            "contact": {
                "full_name": "Synthetic Candidate",
                "email": "candidate@example.com",
                "phone": "+1 555 0100",
            },
            "summary": "Synthetic fixture.",
            "education": [{"institution": "Synthetic University", "degree": "BSc"}],
            "experience": [{"employer": "Synthetic Labs", "job_title": "Data Analyst"}],
            "projects": [{"name": "Synthetic Pipeline"}],
            "skills": [{"name": "Python"}, {"name": "SQL"}],
        }
    )


def test_validate_text_passes_for_complete_extraction() -> None:
    result = validate_text(FULL_TEXT, sample_document(), page_count=1)
    assert result.ran is True
    assert result.text_extracted is True
    assert result.missing_fields == []
    assert result.duplicated_fields == []
    assert result.warnings == []


def test_validate_text_reports_missing_fields_and_skills() -> None:
    text = FULL_TEXT.replace("candidate@example.com", "").replace("Python", "").replace("SQL", "")
    result = validate_text(text, sample_document())
    assert "email" in result.missing_fields
    assert "skills" in result.missing_fields
    assert result.warnings


def test_validate_text_reports_duplicated_contact_details() -> None:
    text = FULL_TEXT + "\ncandidate@example.com\n+1 555 0100\n"
    result = validate_text(text, sample_document())
    assert result.duplicated_fields == ["email", "phone"]


def test_validate_text_without_extractable_text() -> None:
    result = validate_text("   ", sample_document())
    assert result.text_extracted is False
    assert result.warnings


def test_validate_text_warns_for_long_documents() -> None:
    result = validate_text(FULL_TEXT, sample_document(), page_count=5)
    assert any("5 pages" in warning for warning in result.warnings)


def test_validate_pdf_bytes_handles_unreadable_input() -> None:
    result = validate_pdf_bytes(b"not a pdf", sample_document())
    assert result.ran is True
    assert result.text_extracted is False
    assert result.warnings
