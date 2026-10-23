import base64

from fastapi import APIRouter

from ...config import get_settings
from ...errors import CompilationFailed, CompilationUnavailable, InvalidTemplate
from ...schemas.analysis import CompilationResult, CompilationStatus, PdfValidation
from ...schemas.latex import CompileLatexRequest, RenderResumeRequest, RenderResumeResult
from ...services.latex.compile import compile_latex, detect_latex_engine
from ...services.latex.render import render_resume
from ...services.latex.validate import validate_pdf_bytes

router = APIRouter(prefix="/latex", tags=["latex"])


def _render(document, template: str | None):
    try:
        return render_resume(document, template)
    except ValueError as exc:
        raise InvalidTemplate(str(exc)) from exc


@router.post("/render", response_model=RenderResumeResult)
def render(payload: RenderResumeRequest) -> RenderResumeResult:
    """Render a structured resume to LaTeX source without compiling it."""
    rendered = _render(payload.document, payload.template)
    return RenderResumeResult(
        source=rendered.source,
        template=rendered.template,
        warnings=rendered.warnings,
    )


@router.post("/compile", response_model=CompilationResult)
def compile_resume(payload: CompileLatexRequest) -> CompilationResult:
    """Render (or accept) LaTeX source, compile it, and validate the PDF.

    Returns HTTP 200 for every compilation outcome so the client always receives
    the generated source: `unavailable` when no engine is installed, `failed` when
    the engine reported an error, and `success` with base64 PDF bytes otherwise.
    """
    settings = get_settings()

    if payload.source is not None and payload.source.strip():
        source = payload.source
        template = payload.template
    else:
        rendered = _render(payload.document, payload.template)
        source = rendered.source
        template = rendered.template

    if len(source.encode("utf-8")) > settings.latex_max_source_bytes:
        raise CompilationFailed("The LaTeX source exceeds the configured size limit.")

    engine = detect_latex_engine()
    if engine is None:
        return CompilationResult(
            status=CompilationStatus.UNAVAILABLE,
            source=source,
            template=template,
            errors=[
                "No LaTeX engine is installed on the server. "
                "Download the .tex source and compile it locally or on Overleaf."
            ],
        )

    try:
        outcome = compile_latex(source, engine=engine)
    except (CompilationFailed, CompilationUnavailable) as exc:
        return CompilationResult(
            status=CompilationStatus.FAILED,
            engine=engine,
            source=source,
            template=template,
            errors=[exc.message],
        )

    if outcome.pdf_bytes is None:
        return CompilationResult(
            status=CompilationStatus.FAILED,
            engine=outcome.engine,
            source=source,
            template=template,
            log=outcome.log,
            errors=outcome.errors or ["The LaTeX engine produced no PDF output."],
        )

    validation = PdfValidation()
    if payload.run_validation and payload.document is not None:
        validation = validate_pdf_bytes(outcome.pdf_bytes, payload.document)

    return CompilationResult(
        status=CompilationStatus.SUCCESS,
        engine=outcome.engine,
        size_bytes=len(outcome.pdf_bytes),
        log=outcome.log,
        source=source,
        template=template,
        validation=validation,
        pdf_base64=base64.b64encode(outcome.pdf_bytes).decode("ascii"),
    )
