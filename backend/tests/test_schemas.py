import pytest
from pydantic import ValidationError

from app.schemas import (
    DatePoint,
    DateRange,
    JobProfile,
    JobRequirement,
    MatchMetrics,
    RequirementCoverage,
    ResumeDocument,
    ResumeMetadata,
)


def minimal_resume() -> dict:
    return {
        "id": "resume_test",
        "contact": {
            "full_name": "Synthetic Candidate",
            "email": "candidate@example.com",
            "website": "https://example.com",
        },
        "summary": "Synthetic test fixture, not a real person.",
        "skills": [{"name": "Python"}, {"name": "SQL"}],
    }


def test_resume_accepts_valid_document_and_round_trips() -> None:
    resume = ResumeDocument.model_validate(minimal_resume())
    restored = ResumeDocument.model_validate_json(resume.model_dump_json())
    assert restored.contact.full_name == "Synthetic Candidate"
    assert len(restored.skills) == 2


def test_resume_rejects_empty_document() -> None:
    with pytest.raises(ValidationError):
        ResumeDocument.model_validate({"id": "resume_empty"})


def test_resume_rejects_invalid_email() -> None:
    payload = minimal_resume()
    payload["contact"]["email"] = "not-an-email"
    with pytest.raises(ValidationError):
        ResumeDocument.model_validate(payload)


def test_date_range_requires_end_unless_present() -> None:
    start = DatePoint(year=2024, month=1)
    with pytest.raises(ValidationError):
        DateRange(start=start)


def test_date_range_allows_present_without_end() -> None:
    result = DateRange(start=DatePoint(year=2024, month=1), present=True)
    assert result.end is None


def test_date_range_rejects_reversed_order() -> None:
    with pytest.raises(ValidationError):
        DateRange(
            start=DatePoint(year=2025, month=6),
            end=DatePoint(year=2024, month=6),
        )


def test_date_range_rejects_end_when_present() -> None:
    with pytest.raises(ValidationError):
        DateRange(
            start=DatePoint(year=2024, month=1),
            end=DatePoint(year=2025, month=1),
            present=True,
        )


def test_metadata_rejects_unknown_sections() -> None:
    with pytest.raises(ValidationError):
        ResumeMetadata(section_order=["summary", "hobbies"])


def test_job_requirement_deduplicates_keywords() -> None:
    requirement = JobRequirement(text="SQL", keywords=["SQL", "sql", " Python ", ""])
    assert requirement.keywords == ["SQL", "Python"]


def test_job_profile_requires_meaningful_description() -> None:
    short = JobProfile(description="Too short.")
    long = JobProfile(description="x" * 200)
    assert short.has_meaningful_description is False
    assert long.has_meaningful_description is True


def test_match_metrics_reject_out_of_range_scores() -> None:
    with pytest.raises(ValidationError):
        MatchMetrics(traditional=1.4, semantic=0.5, hybrid=0.5, parseability=0.9, evidence_confidence=0.7)


def test_coverage_rejects_negative_counts() -> None:
    with pytest.raises(ValidationError):
        RequirementCoverage(required_total=-1, required_matched=0, preferred_total=0, preferred_matched=0)
