from pydantic import Field

from .common import AlignCVModel, SourceType
from .resume import ResumeDocument


class ParsedResumeResponse(AlignCVModel):
    document: ResumeDocument
    source_type: SourceType
    filename: str
    original_text: str
    raw_tex: str = ""
    parse_confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)
