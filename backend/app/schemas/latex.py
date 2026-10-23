"""Request/response models for LaTeX rendering and compilation."""

from pydantic import Field, model_validator

from .common import AlignCVModel
from .resume import ResumeDocument


class RenderResumeRequest(AlignCVModel):
    document: ResumeDocument
    template: str | None = None


class RenderResumeResult(AlignCVModel):
    source: str
    template: str
    warnings: list[str] = Field(default_factory=list)


class CompileLatexRequest(AlignCVModel):
    document: ResumeDocument | None = None
    source: str | None = None
    template: str | None = None
    run_validation: bool = True

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "CompileLatexRequest":
        has_document = self.document is not None
        has_source = self.source is not None and self.source.strip() != ""
        if has_document == has_source:
            raise ValueError("provide exactly one of document or source")
        return self
