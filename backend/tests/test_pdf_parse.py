import pytest

from app.errors import ParseFailed
from app.schemas.common import SourceType
from app.services.parsing.pdf import parse_pdf_bytes, parse_pdf_text

TEXT = """Jane Doe
jane@example.com | +1 (555) 987-6543

EXPERIENCE
Software Engineer
Acme Corp
Jan 2022 - Present
- Built scalable APIs in Python and FastAPI.
- Improved reliability by 25% with automated tests.

EDUCATION
BSc Computer Science
University College London
2018 - 2021
- Graduated with honors.

PROJECTS
AlignCV
Python, React
2024
- Resume analyzer with LaTeX export.

SKILLS
Python, SQL, Docker, AWS
"""


def test_parse_pdf_text_builds_document() -> None:
    parsed = parse_pdf_text(TEXT, links=["https://example.com/jane"], page_count=1)
    document = parsed.document

    assert parsed.source_type == SourceType.PDF
    assert document.contact.full_name == "Jane Doe"
    assert document.contact.email == "jane@example.com"
    assert document.contact.phone
    assert document.contact.website == "https://example.com/jane"

    assert len(document.experience) == 1
    experience = document.experience[0]
    assert experience.job_title == "Software Engineer"
    assert experience.employer == "Acme Corp"
    assert experience.dates is not None and experience.dates.present is True
    assert len(experience.responsibilities) == 2

    assert len(document.education) == 1
    assert document.education[0].degree == "BSc Computer Science"
    assert document.education[0].institution == "University College London"
    assert document.education[0].dates is not None
    assert document.education[0].dates.end.year == 2021

    assert len(document.projects) == 1
    assert document.projects[0].name == "AlignCV"
    assert document.projects[0].technologies == ["Python", "React"]

    assert [skill.name for skill in document.skills] == ["Python", "SQL", "Docker", "AWS"]
    assert any("1 page" in warning for warning in parsed.warnings)
    assert parsed.original_text.startswith("Jane Doe")


def test_parse_pdf_text_without_headings_keeps_content() -> None:
    text = "Jane Doe\njane@example.com\n" + ("Built reliable systems with Python. " * 20)
    parsed = parse_pdf_text(text, page_count=1)
    assert parsed.document.custom_sections
    assert any("No clear section headings" in warning for warning in parsed.warnings)
    assert parsed.parse_confidence <= 0.4


def test_parse_pdf_text_rejects_scanned_document() -> None:
    with pytest.raises(ParseFailed):
        parse_pdf_text("tiny")


def test_parse_pdf_bytes_rejects_invalid_pdf() -> None:
    with pytest.raises(ParseFailed):
        parse_pdf_bytes(b"not a pdf", filename="resume.pdf")
