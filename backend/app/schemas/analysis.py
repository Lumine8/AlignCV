from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import Field

from .common import AlignCVModel, new_id


class MatchType(str, Enum):
    EXACT = "exact"
    ALIAS = "alias"
    PHRASE = "phrase"
    PARTIAL = "partial"
    SEMANTIC = "semantic"
    MISSING = "missing"
    UNCERTAIN = "uncertain"


class EvidenceStrength(str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"
    NONE = "none"


class MatchEvidence(AlignCVModel):
    requirement_id: str
    requirement_text: str
    match_type: MatchType
    resume_excerpt: str = ""
    evidence_strength: EvidenceStrength = EvidenceStrength.NONE
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    explanation: str = ""
    uncertainty: str = ""
    contradicted: bool = False


class MatchMetrics(AlignCVModel):
    traditional: float = Field(ge=0.0, le=1.0)
    semantic: float = Field(ge=0.0, le=1.0)
    hybrid: float = Field(ge=0.0, le=1.0)
    parseability: float = Field(ge=0.0, le=1.0)
    evidence_confidence: float = Field(ge=0.0, le=1.0)


class RequirementCoverage(AlignCVModel):
    required_total: int = Field(ge=0)
    required_matched: int = Field(ge=0)
    preferred_total: int = Field(ge=0)
    preferred_matched: int = Field(ge=0)


class MatchWeights(AlignCVModel):
    traditional: float = Field(default=0.4, ge=0.0, le=1.0)
    semantic: float = Field(default=0.6, ge=0.0, le=1.0)


class MatchReport(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("analysis_"))
    resume_id: str
    job_id: str
    metrics: MatchMetrics
    coverage: RequirementCoverage
    evidence: list[MatchEvidence] = Field(default_factory=list)
    hard_requirement_warnings: list[str] = Field(default_factory=list)
    disagreements: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    weights: MatchWeights = Field(default_factory=MatchWeights)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SuggestionSection(str, Enum):
    SUMMARY = "summary"
    SKILLS = "skills"
    EXPERIENCE = "experience"
    PROJECTS = "projects"
    ORDERING = "ordering"


class SuggestionStatus(str, Enum):
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EDITED = "edited"


class OptimizationSuggestion(AlignCVModel):
    id: str = Field(default_factory=lambda: new_id("sug_"))
    section: SuggestionSection
    target_id: str = ""
    original: str = ""
    suggested: str = ""
    reason: str = ""
    requirement_id: str = ""
    evidence: str = ""
    unsupported_claim_risk: bool = False
    status: SuggestionStatus = SuggestionStatus.PROPOSED


class CompilationStatus(str, Enum):
    SUCCESS = "success"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"


class PdfValidation(AlignCVModel):
    ran: bool = False
    text_extracted: bool = False
    missing_fields: list[str] = Field(default_factory=list)
    duplicated_fields: list[str] = Field(default_factory=list)
    reading_order_concerns: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CompilationResult(AlignCVModel):
    status: CompilationStatus
    engine: str | None = None
    artifact_id: str | None = None
    size_bytes: int | None = None
    log: str = ""
    errors: list[str] = Field(default_factory=list)
    validation: PdfValidation = Field(default_factory=PdfValidation)
    source: str = ""
    template: str | None = None
    pdf_base64: str | None = None
