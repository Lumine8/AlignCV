from typing import Any


class AlignCVError(Exception):
    """Base class for actionable, client-safe errors."""

    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details or {}

    def to_payload(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}


class UnsupportedFileType(AlignCVError):
    status_code = 415
    code = "unsupported_file_type"


class ParseFailed(AlignCVError):
    status_code = 422
    code = "parse_failed"


class FileTooLarge(AlignCVError):
    status_code = 413
    code = "file_too_large"


class InvalidJobUrl(AlignCVError):
    status_code = 400
    code = "invalid_job_url"


class UnsafeUrl(AlignCVError):
    status_code = 400
    code = "unsafe_url"


class JobFetchFailed(AlignCVError):
    status_code = 422
    code = "job_fetch_failed"


class CompilationUnavailable(AlignCVError):
    status_code = 503
    code = "compilation_unavailable"


class CompilationFailed(AlignCVError):
    status_code = 422
    code = "compilation_failed"


class InvalidTemplate(AlignCVError):
    status_code = 400
    code = "invalid_template"


class NotFound(AlignCVError):
    status_code = 404
    code = "not_found"
