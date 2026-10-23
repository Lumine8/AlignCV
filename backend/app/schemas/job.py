from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import AlignCVModel, new_id


class RequirementCategory(str, Enum):
    SKILL = "skill"
    RESPONSIBILITY = "responsibility"
    EDUCATION = "education"
    EXPERIENCE = "experience"
    CERTIFICATION = "certification"
    DOMAIN = "domain"
    CONSTRAINT = "constraint"
    OTHER = "other"


class RequirementImportance(str, Enum):
    REQUIRED = "required"
    PREFERRED = "preferred"
    OPTIONAL = "optional"


class ExtractionMethod(str, Enum):
    PASTE = "paste"
    HTML = "html"
    JSON_LD = "json_ld"
    ATS_API = "ats_api"
    PLAYWRIGHT = "playwright"


class ExtractionStatus(str, Enum):
    OK = "ok"
    SEARCH_RESULTS = "search_results"
    AUTH_REQUIRED = "auth_required"
    BLOCKED = "blocked"
    UNSUPPORTED = "unsupported"
    MISSING_DESCRIPTION = "missing_description"
    AMBIGUOUS = "ambiguous"
    FETCH_FAILED = "fetch_failed"


class JobRequirement(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("req_"))
    text: str
    category: RequirementCategory = RequirementCategory.OTHER
    importance: RequirementImportance = RequirementImportance.PREFERRED
    must_have: bool = False
    critical: bool = False
    min_years: float | None = Field(default=None, ge=0, le=60)
    keywords: list[str] = Field(default_factory=list)
    source_excerpt: str = ""

    @field_validator("keywords")
    @classmethod
    def _clean_keywords(cls, values: list[str]) -> list[str]:
        seen: list[str] = []
        for value in values:
            cleaned = value.strip()
            if cleaned and cleaned.lower() not in {item.lower() for item in seen}:
                seen.append(cleaned)
        return seen


class ExtractionMetadata(AlignCVModel):
    method: ExtractionMethod = ExtractionMethod.PASTE
    status: ExtractionStatus = ExtractionStatus.OK
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    platform: str | None = None
    source_url: str | None = None
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: list[str] = Field(default_factory=list)


class JobProfile(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("job_"))
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""
    canonical_url: str | None = None
    responsibilities: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    education_requirements: list[str] = Field(default_factory=list)
    experience_requirements: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    domain_knowledge: list[str] = Field(default_factory=list)
    requirements: list[JobRequirement] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    extraction: ExtractionMetadata = Field(default_factory=ExtractionMetadata)

    @property
    def has_meaningful_description(self) -> bool:
        return len(self.description.strip()) >= 120


class JobUrlRequest(AlignCVModel):
    url: str
    allow_playwright: bool = False


class JobTextRequest(AlignCVModel):
    text: str
    title: str = ""
    company: str = ""
    source_url: str | None = None

    @field_validator("text")
    @classmethod
    def _require_text(cls, value: str) -> str:
        if len(value.strip()) < 40:
            raise ValueError("the pasted job description is too short")
        return value


class JobExtractRequest(AlignCVModel):
    url: str | None = None
    text: str | None = None
    title: str = ""
    company: str = ""

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "JobExtractRequest":
        has_url = bool((self.url or "").strip())
        has_text = bool((self.text or "").strip())
        if has_url == has_text:
            raise ValueError("provide either a job posting URL or pasted description text")
        if has_text and len((self.text or "").strip()) < 40:
            raise ValueError("the pasted job description is too short")
        return self


class JobCandidate(AlignCVModel):
    title: str = ""
    company: str = ""
    url: str
    external_id: str | None = None


class JobExtractionResult(AlignCVModel):
    status: Literal["ok", "select", "error"] = "ok"
    job: JobProfile | None = None
    candidates: list[JobCandidate] = Field(default_factory=list)
    error_code: str | None = None
    message: str = ""
