from fastapi import APIRouter, File, UploadFile

from ...config import get_settings
from ...errors import FileTooLarge, UnsupportedFileType
from ...schemas.parsing import ParsedResumeResponse
from ...services.parsing.pdf import parse_pdf_bytes
from ...services.parsing.tex import parse_tex

router = APIRouter(prefix="/resumes", tags=["resumes"])

ALLOWED_EXTENSIONS = {".tex": "tex", ".pdf": "pdf"}


def _extension(filename: str) -> str:
    lowered = filename.lower()
    for extension in ALLOWED_EXTENSIONS:
        if lowered.endswith(extension):
            return extension
    raise UnsupportedFileType("Only .tex and .pdf files can be imported.")


@router.post("/parse", response_model=ParsedResumeResponse)
async def parse_resume(file: UploadFile = File(...)) -> ParsedResumeResponse:
    settings = get_settings()
    filename = (file.filename or "resume").strip() or "resume"
    extension = _extension(filename)
    data = await file.read(settings.max_upload_bytes + 1)
    await file.close()
    if len(data) > settings.max_upload_bytes:
        raise FileTooLarge(
            f"The file exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB import limit."
        )
    if not data:
        raise UnsupportedFileType("The uploaded file is empty.")

    if extension == ".tex":
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1", "replace")
        parsed = parse_tex(text, filename=filename)
    else:
        parsed = parse_pdf_bytes(data, filename=filename)

    return ParsedResumeResponse(
        document=parsed.document,
        source_type=parsed.source_type,
        filename=parsed.filename,
        original_text=parsed.original_text,
        raw_tex=parsed.raw_tex,
        parse_confidence=parsed.parse_confidence,
        warnings=parsed.warnings,
    )
