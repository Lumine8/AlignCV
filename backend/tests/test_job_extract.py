import pytest

from app.errors import InvalidJobUrl, UnsafeUrl
from app.schemas.job import ExtractionMethod, JobProfile, RequirementCategory
from app.services.jobs.extract import extract_job_from_text, structure_job
from app.services.jobs.fetch import clean_html, parse_ats_url, validate_public_url
from app.services.jobs import fetch as fetch_module

TEXT = """Senior Software Engineer at Acme

Responsibilities
- Build APIs with Python and FastAPI.
- Design reliable services.

Requirements
- Must have 5+ years of experience with Python.
- Experience with React and TypeScript.
- Nice to have AWS and Docker.
- Bachelor's degree in Computer Science.
- AWS Certified Solutions Architect is a plus.

Benefits
- Health insurance.
"""


def test_structure_job_extracts_requirements_and_skills() -> None:
    job = structure_job(TEXT)

    assert job.title == "Senior Software Engineer"
    assert job.company == "Acme"
    assert job.extraction.method == ExtractionMethod.PASTE
    assert job.extraction.status.value == "ok"
    assert job.extraction.confidence >= 0.5
    assert len(job.responsibilities) == 2
    assert "Python" in job.required_skills
    assert "React" in job.required_skills
    assert "TypeScript" in job.required_skills
    assert "AWS" in job.preferred_skills
    assert "Docker" in job.preferred_skills
    assert job.education_requirements
    assert job.certifications
    assert all("Health insurance" not in requirement.text for requirement in job.requirements)


def test_structure_job_categories_and_importance() -> None:
    job = structure_job(TEXT)
    categories = {requirement.text: requirement for requirement in job.requirements}

    years = categories["Must have 5+ years of experience with Python."]
    assert years.category == RequirementCategory.EXPERIENCE
    assert years.must_have is True
    assert years.min_years == 5
    assert years.critical is True

    preferred = categories["Nice to have AWS and Docker."]
    assert preferred.category == RequirementCategory.SKILL
    assert preferred.must_have is False

    education = categories["Bachelor's degree in Computer Science."]
    assert education.category == RequirementCategory.EDUCATION

    certification = categories["AWS Certified Solutions Architect is a plus."]
    assert certification.category == RequirementCategory.CERTIFICATION


def test_structure_job_handles_short_text() -> None:
    job = extract_job_from_text("Tiny posting.")
    assert job.requirements == []
    assert job.extraction.confidence == 0.2
    assert job.warnings


def test_parse_ats_urls() -> None:
    greenhouse = parse_ats_url("https://boards.greenhouse.io/acme/jobs/12345")
    assert greenhouse is not None
    assert greenhouse.kind == "greenhouse"
    assert greenhouse.company == "acme"
    assert greenhouse.id == "12345"
    assert "boards-api.greenhouse.io" in greenhouse.api_url

    embed = parse_ats_url("https://boards.greenhouse.io/embed/job_app?for=acme&token=987")
    assert embed is not None and embed.id == "987"

    lever = parse_ats_url("https://jobs.lever.co/acme/abc-123")
    assert lever is not None and lever.kind == "lever" and lever.id == "abc-123"

    ashby = parse_ats_url("https://jobs.ashbyhq.com/acme/job-1")
    assert ashby is not None and ashby.kind == "ashby"

    smart = parse_ats_url("https://jobs.smartrecruiters.com/Acme/744000012345-senior-engineer")
    assert smart is not None
    assert smart.kind == "smartrecruiters"
    assert smart.id == "744000012345"

    assert parse_ats_url("https://example.com/jobs/1") is None


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/jobs/1",
        "http://127.0.0.1/jobs/1",
        "http://[::1]/jobs/1",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/jobs/1",
        "http://192.168.1.10/jobs/1",
        "http://0.0.0.0/jobs/1",
        "https://user:secret@example.com/jobs/1",
        "https://example.com:8080/jobs/1",
        "ftp://example.com/jobs/1",
    ],
)
def test_validate_public_url_blocks_unsafe_targets(url: str) -> None:
    with pytest.raises((UnsafeUrl, InvalidJobUrl)):
        validate_public_url(url)


def test_validate_public_url_accepts_public_literal() -> None:
    assert validate_public_url("http://93.184.216.34/jobs/1#frag") == "http://93.184.216.34/jobs/1"


def test_clean_html_extracts_json_ld_and_description() -> None:
    body = " ".join(["Build reliable APIs with Python and FastAPI."] * 20)
    html = f"""<html><head>
    <title>Careers - Acme</title>
    <meta property="og:site_name" content="Acme">
    <script type="application/ld+json">{{
      "@type": "JobPosting",
      "title": "Senior Engineer",
      "hiringOrganization": {{"name": "Acme"}},
      "jobLocation": {{"address": {{"addressLocality": "Berlin", "addressRegion": "BE"}}}}
    }}</script>
    </head><body>
    <nav>Home</nav>
    <main><h1>Senior Engineer</h1>
      <div class="job-description"><p>{body}</p><ul><li>Ship features.</li></ul></div>
    </main>
    <script>alert(1)</script>
    </body></html>"""
    cleaned, has_json_ld = clean_html(html)
    assert has_json_ld is True
    assert cleaned["title"] == "Senior Engineer"
    assert cleaned["company"] == "Acme"
    assert cleaned["location"] == "Berlin, BE"
    assert "Build reliable APIs" in cleaned["text"]
    assert "Ship features." in cleaned["text"]
    assert "alert(1)" not in cleaned["text"]
    assert "Home" not in cleaned["text"]


def test_extract_job_from_text_matches_structure() -> None:
    job = extract_job_from_text(TEXT, title="Custom Title", company="Custom Co")
    assert job.title == "Custom Title"
    assert job.company == "Custom Co"
    assert isinstance(job, JobProfile)


def test_extract_job_from_url_uses_html_pipeline(monkeypatch) -> None:
    body = " ".join(["Build reliable APIs with Python and FastAPI."] * 20)
    html = f"""<html><head><title>Platform Engineer - Acme</title></head>
    <body><main><h1>Platform Engineer</h1>
    <div class="job-description"><p>{body}</p>
    <ul><li>Must have Python experience.</li></ul></div></main></body></html>"""

    def fake_fetch(url: str, *, accept: str = "") -> tuple[str, str, str]:
        return html, url, "text/html; charset=utf-8"

    monkeypatch.setattr(fetch_module, "fetch_text", fake_fetch)
    job = fetch_module.extract_job_from_url("http://93.184.216.34/jobs/1")

    assert job.title == "Platform Engineer"
    assert job.extraction.method.value == "html"
    assert job.canonical_url == "http://93.184.216.34/jobs/1"
    assert "Python" in job.required_skills
