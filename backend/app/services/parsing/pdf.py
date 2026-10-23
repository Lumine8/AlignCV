"""PDF resume extraction with pypdf.

Text-based PDFs are reconstructed into the structured model. Scanned or
image-only PDFs have no extractable text and produce an honest error rather
than fabricated content.
"""

from __future__ import annotations

import io
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from ...errors import ParseFailed
from ...schemas.common import SourceType
from .common import (
    ParsedItem,
    ParsedResume,
    build_contact,
    build_document,
    parse_dates,
    split_title_dates,
)

SECTION_HEADINGS: dict[str, tuple[str, ...]] = {
    "experience": (
        "experience", "work experience", "professional experience", "employment",
        "employment history", "work history",
    ),
    "education": ("education", "academic background", "academics"),
    "project": ("projects", "personal projects", "selected projects", "key projects"),
    "publication": ("publications", "research", "papers", "conference papers"),
    "patent": ("patents",),
    "certification": ("certifications", "certificates", "licenses"),
    "award": ("awards", "honors", "honours", "achievements", "awards & honors"),
    "skill": (
        "skills", "technical skills", "skills & interests", "technologies",
        "competencies", "technical proficiencies",
    ),
    "summary": ("summary", "professional summary", "objective", "profile", "about me", "about"),
    "contact": ("contact", "contact information"),
}

_BULLET_PREFIX = re.compile(r"^\s*[\u2022\u2023\u25E6\u2043\u2219\-*\u00b7]\s+")
_DATE_LINE = re.compile(
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}"
    r"|\d{4}\s*[-\u2013\u2014]\s*(?:present|\d{4})"
    r"|\d{1,2}/\d{4}\s*[-\u2013\u2014]\s*(?:\d{1,2}/\d{4}|present))",
    re.IGNORECASE,
)


def _classify_heading(line: str) -> str | None:
    candidate = (line or "").strip().rstrip(":").lower()
    if not candidate or len(candidate) > 40:
        return None
    for kind, keys in SECTION_HEADINGS.items():
        for key in keys:
            if candidate == key or candidate == f"{key}s":
                return kind
    stripped = line.strip()
    if stripped == stripped.upper() and 3 <= len(stripped) <= 40:
        for kind, keys in SECTION_HEADINGS.items():
            if any(key in candidate for key in keys):
                return kind
    return None


def _skill_tokens(text: str) -> list[str]:
    result: list[str] = []
    for chunk in re.split(r"[,;:\n\u2022]|\s{2,}", text):
        chunk = chunk.strip(" .\t")
        word_count = len(chunk.split())
        if 1 <= word_count <= 6 and len(chunk) <= 60:
            result.append(chunk)
    return list(dict.fromkeys(result))


def _looks_like_heading(line: str) -> bool:
    if len(line) > 100:
        return False
    word_count = len(line.split())
    return 1 <= word_count <= 12 and (
        bool(re.search(r"[A-Z]", line)) or "\u2013" in line or "|" in line
    )


def _split_heading_dates(line: str) -> tuple[str, str]:
    match = _DATE_LINE.search(line)
    if not match:
        return line.strip(), ""
    title = re.sub(r"[\s\-|\u2013\u2014]+$", "", line[: match.start()]).strip()
    return title or line.strip(), line[match.start() :].strip()


def _items_from_block(block: list[str], kind: str) -> list[ParsedItem]:
    items: list[ParsedItem] = []
    current: dict[str, object] | None = None

    def finalize() -> None:
        nonlocal current
        if current is None:
            return
        title = str(current.get("title") or "")
        organization = str(current.get("organization") or "")
        dates_text = str(current.get("date_text") or "")
        description = [str(value) for value in current.get("description", [])]  # type: ignore[union-attr]
        technologies = [str(value) for value in current.get("technologies", [])]  # type: ignore[union-attr]
        if title or organization or description:
            items.append(
                ParsedItem(
                    kind=kind,
                    title=title,
                    organization=organization,
                    date_text=dates_text,
                    dates=parse_dates(dates_text),
                    description=description,
                    technologies=technologies,
                )
            )
        current = None

    for raw in block:
        line = raw.strip()
        if not line:
            continue
        is_bullet = bool(_BULLET_PREFIX.match(raw))
        has_date = bool(_DATE_LINE.search(line))
        title_case = line == re.sub(r"\b\w", lambda match: match.group(0).upper(), line)
        if not is_bullet and (has_date or (_looks_like_heading(line) and title_case)):
            if current is not None and not current["description"]:
                if has_date and not current["date_text"]:
                    date_title, dates_text = _split_heading_dates(line)
                    current["date_text"] = dates_text
                    if date_title and not current["title"]:
                        current["title"] = date_title
                    continue
                if not has_date and not current["organization"]:
                    if kind == "project" and "," in line and len(line) <= 80:
                        current["technologies"] = [
                            part.strip() for part in line.split(",") if part.strip()
                        ]
                    else:
                        current["organization"] = line
                    continue
            finalize()
            title, dates_text = _split_heading_dates(line)
            current = {
                "title": title,
                "organization": "",
                "date_text": dates_text,
                "description": [],
                "technologies": [],
            }
        else:
            text = _BULLET_PREFIX.sub("", line).strip()
            if current is None:
                current = {
                    "title": "",
                    "organization": "",
                    "date_text": "",
                    "description": [],
                    "technologies": [],
                }
            if text:
                current["description"].append(text)  # type: ignore[union-attr]
    finalize()
    return items


def extract_pdf_text(data: bytes) -> tuple[str, list[str], int, bool]:
    try:
        reader = PdfReader(io.BytesIO(data))
    except (PdfReadError, ValueError, OSError) as exc:
        raise ParseFailed("This file could not be read as a PDF. It may be damaged or password-protected.") from exc

    if reader.is_encrypted:
        try:
            unlocked = reader.decrypt("")
        except Exception as exc:  # pypdf raises several exception types
            raise ParseFailed("This PDF is password-protected and cannot be read.") from exc
        if not unlocked:
            raise ParseFailed("This PDF is password-protected and cannot be read.")

    links: list[str] = []
    pages_text: list[str] = []
    scrambled = False
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages_text.append(text)
        for line in text.split("\n"):
            if line.strip() and len(line.strip()) < 24:
                scrambled = True
                break
        try:
            annotations = page.get("/Annots") or []
            for reference in annotations:
                annotation = reference.get_object()
                action = annotation.get("/A")
                uri = action.get("/URI") if action else None
                if uri:
                    links.append(str(uri))
        except Exception:
            pass
    full_text = "\n".join(pages_text)
    return full_text, list(dict.fromkeys(links)), len(reader.pages), scrambled


def parse_pdf_text(
    text: str,
    links: list[str] | None = None,
    page_count: int = 0,
    scrambled: bool = False,
    filename: str = "resume.pdf",
) -> ParsedResume:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if len(re.sub(r"\s", "", text)) < 120:
        raise ParseFailed(
            "This PDF has little or no extractable text. It may be scanned or image-only; "
            "upload a text-based PDF or the original .tex source instead."
        )

    warnings: list[str] = []
    name = email = phone = ""
    email_match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    if email_match:
        email = email_match.group(0)
    phone_match = re.search(r"(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}|\+\d[\d\s().\-]{7,})", text)
    if phone_match:
        phone = phone_match.group(0).strip()
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped and not re.search(r"\d", stripped) and "@" not in stripped and len(stripped) < 60:
            name = stripped
            break

    lines = text.split("\n")
    headings: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        kind = _classify_heading(line)
        if kind:
            headings.append((index, kind))

    items: dict[str, list[ParsedItem]] = {}
    skills: list[str] = []
    summary_parts: list[str] = []
    confidence = 1.0

    if not headings:
        warnings.append(
            "No clear section headings were detected in the PDF. Content was placed under a generic "
            "section; review before optimizing."
        )
        confidence = 0.4
        description = [line.strip() for line in lines if line.strip()]
        items["other"] = [
            ParsedItem(kind="other", title="Imported PDF content", description=description, section_title="Additional")
        ]
    else:
        for order, (line_number, kind) in enumerate(headings):
            start = line_number + 1
            end = headings[order + 1][0] if order + 1 < len(headings) else len(lines)
            block = lines[start:end]
            section_title = lines[line_number].strip().rstrip(":")
            if kind == "skill":
                skills.extend(_skill_tokens(" ".join(block)))
                continue
            if kind in {"summary", "contact"}:
                joined = " ".join(line.strip() for line in block if line.strip())
                if joined:
                    summary_parts.append(joined)
                continue
            parsed_items = _items_from_block(block, kind)
            for item in parsed_items:
                item.section_title = section_title
            if parsed_items:
                items.setdefault(kind, []).extend(parsed_items)

    if scrambled:
        warnings.append(
            "Some pages appear to use columns or unusual layouts; reading order may be imperfect. "
            "Review the reconstructed sections."
        )
        confidence = min(confidence, 0.6)
    if page_count:
        warnings.append(f"Extracted {page_count} page(s) of text.")
    structured_kinds = {"experience", "education", "project", "publication", "certification", "award", "patent"}
    if not any(kind in items for kind in structured_kinds):
        confidence = min(confidence, 0.4)

    contact = build_contact(name=name, email=email, phone=phone, links=links or [])
    return build_document(
        source_type=SourceType.PDF,
        filename=filename,
        raw_source="",
        original_text=text,
        contact=contact,
        summary="\n".join(part for part in summary_parts if part).strip(),
        items=items,
        skills=list(dict.fromkeys(skills)),
        warnings=warnings,
        confidence=confidence,
    )


def parse_pdf_bytes(data: bytes, filename: str = "resume.pdf") -> ParsedResume:
    text, links, page_count, scrambled = extract_pdf_text(data)
    return parse_pdf_text(text, links, page_count, scrambled, filename)
