"""PDF validation for rendered resumes.

The goal is practical: confirm the compiled PDF still contains the information
the user entered and that text is extractable by an ATS. This is not a renderer
quality score and never claims to represent a specific ATS.
"""

from __future__ import annotations

import io

from pypdf import PdfReader

from ...schemas.analysis import PdfValidation
from ...schemas.resume import ResumeDocument

SECTION_TITLES = {
    "education": "Education",
    "experience": "Experience",
    "projects": "Projects",
    "skills": "Skills",
    "publications": "Publications",
    "certifications": "Certifications",
}


def _normalize(text: str) -> str:
    return " ".join(text.split()).lower()


def _has_section(document: ResumeDocument, key: str) -> bool:
    if key == "skills":
        return any(skill.name.strip() for skill in document.skills)
    return bool(getattr(document, key))


def validate_text(text: str, document: ResumeDocument, page_count: int | None = None) -> PdfValidation:
    """Check extracted PDF text against the structured document."""
    validation = PdfValidation(ran=True, text_extracted=bool((text or "").strip()))
    if not validation.text_extracted:
        validation.warnings.append(
            "The PDF contains no extractable text. Scanned or outlined output may be rejected by ATS filters."
        )
        return validation

    normalized = _normalize(text)
    missing: list[str] = []

    name = document.contact.full_name.strip()
    if name and _normalize(name) not in normalized:
        missing.append("name")

    email = document.contact.email.strip()
    if email and _normalize(email) not in normalized:
        missing.append("email")

    phone = document.contact.phone.strip()
    if phone and _normalize(phone) not in normalized:
        missing.append("phone")

    for key, title in SECTION_TITLES.items():
        if _has_section(document, key) and _normalize(title) not in normalized:
            missing.append(f"section:{key}")

    if any(skill.name.strip() for skill in document.skills):
        present = [skill.name for skill in document.skills if _normalize(skill.name) in normalized]
        if not present:
            missing.append("skills")

    validation.missing_fields = missing

    duplicated: list[str] = []
    if email and normalized.count(_normalize(email)) > 1:
        duplicated.append("email")
    if phone and normalized.count(_normalize(phone)) > 1:
        duplicated.append("phone")
    validation.duplicated_fields = duplicated

    if missing:
        validation.warnings.append(
            "Some expected content was not found in the PDF text: " + ", ".join(missing) + "."
        )
    if duplicated:
        validation.warnings.append(
            "Contact details appear more than once in the PDF: " + ", ".join(duplicated) + "."
        )
    if page_count is not None:
        if page_count > 3:
            validation.warnings.append(
                f"The PDF is {page_count} pages. Long resumes are often truncated by ATS filters."
            )
    return validation


def validate_pdf_bytes(pdf_bytes: bytes, document: ResumeDocument) -> PdfValidation:
    """Extract text from compiled PDF bytes and validate it against the document."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:  # pypdf raises several unrelated exception types
        return PdfValidation(
            ran=True,
            text_extracted=False,
            warnings=[f"The PDF could not be read for validation: {exc}"],
        )
    return validate_text(text, document, page_count=page_count)
