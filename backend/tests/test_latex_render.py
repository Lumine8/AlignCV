import pytest

from app.schemas import ResumeDocument
from app.services.latex.render import render_resume

SECTION_ORDER = [
    "summary",
    "education",
    "experience",
    "projects",
    "skills",
    "publications",
    "certifications",
    "custom",
]


def sample_document(**overrides) -> ResumeDocument:
    payload = {
        "id": "resume_render",
        "contact": {
            "full_name": "Synthetic & Co",
            "professional_title": "Data Analyst",
            "email": "candidate@example.com",
            "phone": "+1 555 0100",
            "location": "Remote",
            "website": "https://example.com/profile",
            "linkedin": "https://www.linkedin.com/in/synthetic",
            "github": "https://github.com/synthetic",
            "links": ["https://example.org/work"],
        },
        "summary": "Synthetic fixture; 100% test data with # and _ characters.",
        "education": [
            {
                "institution": "Synthetic University",
                "degree": "BSc Computer Science",
                "field_of_study": "Computer Science",
                "dates": {
                    "start": {"year": 2018, "month": 8},
                    "end": {"year": 2022, "month": 6},
                },
                "grade": "8.5/10",
                "coursework": ["Databases", "Statistics"],
            }
        ],
        "experience": [
            {
                "employer": "Synthetic Labs",
                "job_title": "Data Analyst",
                "location": "Remote",
                "employment_type": "Full-time",
                "dates": {"start": {"year": 2022, "month": 10}, "present": True},
                "responsibilities": ["Built dashboards for operations."],
                "achievements": ["Reduced report turnaround by 20%."],
                "technologies": ["SQL", "Python"],
            }
        ],
        "projects": [
            {
                "name": "Synthetic Pipeline",
                "summary": "A synthetic data pipeline.",
                "technologies": ["Python"],
                "contributions": ["Designed the ingestion layer."],
                "repository_url": "https://example.com/repo",
            }
        ],
        "skills": [{"name": "Python"}, {"name": "SQL & BI"}],
        "publications": [
            {
                "title": "Synthetic Results",
                "authors": ["Synthetic Candidate"],
                "venue": "Journal of Fixtures",
                "year": 2024,
                "url": "https://example.com/paper",
            }
        ],
        "certifications": [
            {
                "name": "Synthetic Certificate",
                "issuer": "Fixture Institute",
                "issue_date": {"year": 2023, "month": 5},
                "credential_url": "https://example.com/cert",
            }
        ],
        "custom_sections": [
            {
                "title": "Awards",
                "section_type": "awards",
                "items": [
                    {
                        "title": "Best Fixture",
                        "subtitle": "Fixture Institute",
                        "bullets": ["Recognized for synthetic data."],
                    }
                ],
            }
        ],
        "metadata": {
            "template": "ats",
            "date_format": "MMM YYYY",
            "section_order": SECTION_ORDER,
        },
    }
    payload.update(overrides)
    return ResumeDocument.model_validate(payload)


def test_render_includes_escaped_content_and_structure() -> None:
    source = render_resume(sample_document()).source

    assert source.startswith(r"\documentclass[11pt,a4paper]{article}")
    assert source.rstrip().endswith(r"\end{document}")
    assert r"Synthetic \& Co" in source
    assert r"100\% test data with \# and \_ characters" in source
    assert "candidate@example.com" in source
    assert "SQL \\& BI" in source
    for heading in ("Summary", "Education", "Experience", "Projects", "Skills", "Publications", "Certifications", "Awards"):
        assert rf"\section*{{{heading}}}" in source
    assert r"\begin{itemize}" in source
    assert r"\href{https://example.com/profile}" in source


def test_render_respects_section_order() -> None:
    document = sample_document()
    document.metadata.section_order = ["experience", "education", "skills", "summary"]
    source = render_resume(document).source

    positions = [source.index(rf"\section*{{{title}}}") for title in ("Experience", "Education", "Skills", "Summary")]
    assert positions == sorted(positions)
    for heading in ("Summary", "Education", "Experience", "Skills", "Projects"):
        assert rf"\section*{{{heading}}}" in source


def test_render_uses_configured_date_format_and_present_label() -> None:
    document = sample_document()
    document.metadata.date_format = "YYYY-MM"
    source = render_resume(document).source

    assert "2022-10 -- Present" in source
    assert "2018-08 -- 2022-06" in source


def test_render_supports_templates_and_rejects_unknown_ones() -> None:
    document = sample_document()

    classic = render_resume(document, "classic")
    assert classic.template == "classic"
    assert r"\documentclass[10pt,a4paper]{article}" in classic.source
    assert r"\usepackage[margin=0.9in]{geometry}" in classic.source

    with pytest.raises(ValueError):
        render_resume(document, "not-a-template")


def test_render_uses_document_template_when_none_is_given() -> None:
    document = sample_document()
    document.metadata.template = "classic"
    assert render_resume(document).template == "classic"


def test_render_omits_empty_sections() -> None:
    document = ResumeDocument.model_validate(
        {
            "id": "resume_minimal",
            "contact": {"full_name": "Synthetic Candidate"},
            "summary": "Only a summary.",
        }
    )
    source = render_resume(document).source
    assert r"\section*{Summary}" in source
    assert r"\section*{Experience}" not in source


def test_render_ignores_unsafe_links() -> None:
    document = sample_document()
    document.custom_sections[0].items[0].url = "javascript:alert(1)"
    source = render_resume(document).source
    assert "javascript" not in source


def test_render_warns_about_missing_contact_details() -> None:
    document = ResumeDocument.model_validate(
        {"id": "resume_noname", "summary": "Content without a name."}
    )
    rendered = render_resume(document)
    assert any("name" in warning for warning in rendered.warnings)
    assert any("email" in warning for warning in rendered.warnings)
