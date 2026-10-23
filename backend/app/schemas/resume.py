from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from .common import AlignCVModel, DateFormat, DatePoint, DateRange, SourceType, new_id

DEFAULT_SECTION_ORDER = (
    "summary",
    "education",
    "experience",
    "projects",
    "skills",
    "publications",
    "certifications",
    "custom",
)

CUSTOM_SECTION_TYPES = {
    "awards",
    "leadership",
    "volunteer",
    "research",
    "languages",
    "patents",
    "interests",
    "custom",
}


def _clean_str_list(values: list[str]) -> list[str]:
    return [value.strip() for value in values if value and value.strip()]


class ContactInformation(AlignCVModel):
    full_name: str = ""
    professional_title: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    website: str = ""
    linkedin: str = ""
    github: str = ""
    links: list[str] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        value = value.strip()
        if value and ("@" not in value or " " in value):
            raise ValueError("email must be a valid address or empty")
        return value

    @field_validator("website", "linkedin", "github")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith(("http://", "https://")):
            raise ValueError("URLs must start with http:// or https://")
        return value

    @field_validator("links")
    @classmethod
    def _validate_links(cls, values: list[str]) -> list[str]:
        cleaned = _clean_str_list(values)
        for value in cleaned:
            if not value.startswith(("http://", "https://")):
                raise ValueError("links must start with http:// or https://")
        return cleaned


class EducationEntry(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("edu_"))
    institution: str = ""
    degree: str = ""
    field_of_study: str = ""
    location: str = ""
    dates: DateRange | None = None
    grade: str = ""
    coursework: list[str] = Field(default_factory=list)
    description: str = ""


class ExperienceEntry(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("exp_"))
    employer: str = ""
    job_title: str = ""
    location: str = ""
    employment_type: str = ""
    dates: DateRange | None = None
    responsibilities: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)


class ProjectEntry(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("proj_"))
    name: str = ""
    summary: str = ""
    problem: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)
    contributions: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    repository_url: str = ""
    live_url: str = ""
    dates: DateRange | None = None

    @field_validator("repository_url", "live_url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith(("http://", "https://")):
            raise ValueError("URLs must start with http:// or https://")
        return value


class SkillEntry(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("skill_"))
    name: str
    category: str = "technical"
    level: str = ""


class PublicationEntry(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("pub_"))
    title: str = ""
    authors: list[str] = Field(default_factory=list)
    venue: str = ""
    year: int | None = Field(default=None, ge=1950, le=2100)
    url: str = ""
    description: str = ""


class CertificationEntry(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("cert_"))
    name: str = ""
    issuer: str = ""
    issue_date: DatePoint | None = None
    expiry_date: DatePoint | None = None
    credential_url: str = ""


class CustomEntry(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("item_"))
    title: str = ""
    subtitle: str = ""
    dates: DateRange | None = None
    bullets: list[str] = Field(default_factory=list)
    url: str = ""
    description: str = ""


class CustomSection(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("sec_"))
    title: str
    section_type: str = "custom"
    items: list[CustomEntry] = Field(default_factory=list)

    @field_validator("section_type")
    @classmethod
    def _validate_type(cls, value: str) -> str:
        if value not in CUSTOM_SECTION_TYPES:
            raise ValueError(f"section_type must be one of {sorted(CUSTOM_SECTION_TYPES)}")
        return value


class ResumeMetadata(AlignCVModel):
    template: str = "ats"
    date_format: DateFormat = DateFormat.MMM_YYYY
    section_order: list[str] = Field(default_factory=lambda: list(DEFAULT_SECTION_ORDER))
    authoring_mode: Literal["structured", "latex"] = "structured"
    notes: str = ""

    @field_validator("section_order")
    @classmethod
    def _validate_order(cls, values: list[str]) -> list[str]:
        if not values:
            raise ValueError("section_order must not be empty")
        if len(set(values)) != len(values):
            raise ValueError("section_order must not contain duplicates")
        unknown = [value for value in values if value not in DEFAULT_SECTION_ORDER]
        if unknown:
            raise ValueError(f"unknown sections in section_order: {unknown}")
        return values


class ResumeDocument(AlignCVModel):
    schema_version: int = 1
    id: str = Field(default_factory=lambda: new_id("resume_"))
    source_type: SourceType = SourceType.CREATED
    contact: ContactInformation = Field(default_factory=ContactInformation)
    summary: str = ""
    education: list[EducationEntry] = Field(default_factory=list)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    projects: list[ProjectEntry] = Field(default_factory=list)
    skills: list[SkillEntry] = Field(default_factory=list)
    publications: list[PublicationEntry] = Field(default_factory=list)
    certifications: list[CertificationEntry] = Field(default_factory=list)
    custom_sections: list[CustomSection] = Field(default_factory=list)
    metadata: ResumeMetadata = Field(default_factory=ResumeMetadata)
    original_source: str | None = None
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _reject_empty_resume(self) -> "ResumeDocument":
        if not self.contact.full_name and not any(
            [
                self.summary,
                self.education,
                self.experience,
                self.projects,
                self.skills,
                self.publications,
                self.certifications,
                self.custom_sections,
            ]
        ):
            raise ValueError("a resume must contain at least a name or some content")
        return self


class ResumeVersion(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("ver_"))
    resume_id: str
    label: str = "Original"
    parent_id: str | None = None
    authoritative: Literal["structured", "latex"] = "structured"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    document: ResumeDocument
    metadata: dict[str, Any] = Field(default_factory=dict)
