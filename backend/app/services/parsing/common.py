"""Shared helpers for turning uploaded resumes into the structured model."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ...schemas.common import DatePoint, DateRange, SourceType
from ...schemas.resume import (
    CertificationEntry,
    ContactInformation,
    CustomEntry,
    CustomSection,
    EducationEntry,
    ExperienceEntry,
    ProjectEntry,
    PublicationEntry,
    ResumeDocument,
    ResumeMetadata,
    SkillEntry,
)

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7,
    "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9,
    "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

_DATE_RE = re.compile(
    r"(?:(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|"
    r"aug|august|sep|sept|september|oct|october|nov|november|dec|december)"
    r"[\s.,]*)?((?:19|20)\d{2})",
    re.IGNORECASE,
)
_PRESENT_RE = re.compile(r"\b(present|current|now|ongoing)\b", re.IGNORECASE)


def parse_dates(text: str | None) -> DateRange | None:
    """Parse the date phrases commonly found on resumes into a DateRange.

    A single explicit date is treated as a point-in-time range (start == end);
    ``Present``/``Current`` keeps the end open. Years outside 1950-2100 are
    ignored by the schema, so they are filtered here.
    """
    if not text:
        return None
    lowered = text.lower()
    points: list[DatePoint] = []
    for match in _DATE_RE.finditer(lowered):
        month_name, year_text = match.groups()
        year = int(year_text)
        if year < 1950 or year > 2100:
            continue
        month = MONTHS.get(month_name or "", None)
        points.append(DatePoint(year=year, month=month))
    if not points:
        return None
    points.sort(key=lambda point: point.sort_key())
    start = points[0]
    if _PRESENT_RE.search(lowered):
        return DateRange(start=start, present=True)
    if len(points) == 1:
        return DateRange(start=start, end=start)
    return DateRange(start=start, end=points[-1])


def strip_comments(text: str) -> str:
    lines = []
    for line in text.split("\n"):
        index = 0
        cut = -1
        while True:
            position = line.find("%", index)
            if position == -1:
                break
            backslashes = 0
            cursor = position - 1
            while cursor >= 0 and line[cursor] == "\\":
                backslashes += 1
                cursor -= 1
            if backslashes % 2 == 0:
                cut = position
                break
            index = position + 1
        lines.append(line if cut == -1 else line[:cut])
    return "\n".join(lines)


def latex_to_text(value: str | None) -> str:
    if not value:
        return ""
    text = value
    text = re.sub(
        r"\\(textbf|textit|emph|underline|textsc|texttt|mbox|text|mathrm|mathbf)\s*\{([^{}]*)\}",
        r"\2",
        text,
    )
    text = re.sub(r"\\href\s*\{([^{}]*)\}\s*\{([^{}]*)\}", r"\2 (\1)", text)
    text = re.sub(r"\\url\s*\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\(small|large|Large|tiny|huge|Huge|vspace|vskip)\*?\s*\{[^{}]*\}", " ", text)
    text = re.sub(
        r"\\(centering|noindent|bigskip|medskip|smallskip|hfill|hspace|vspace|vfill|newline|linebreak)\*?\b(\{[^{}]*\})?",
        " ",
        text,
    )
    text = re.sub(r"\\item\b\s*(\[[^\]]*\])?", " ", text)
    text = re.sub(r"\\[a-zA-Z@]+\*?", " ", text)
    for escaped, plain in (
        (r"\&", "&"), (r"\%", "%"), (r"\_", "_"), (r"\#", "#"),
        (r"\$", "$"), (r"\{", "{"), (r"\}", "}"),
    ):
        text = text.replace(escaped, plain)
    text = text.replace("~", " ").replace("\\\\", " ")
    text = re.sub(r"[{}]", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text)
    return text.strip()


def read_braced(text: str, start: int) -> tuple[str | None, int]:
    cursor = start
    while cursor < len(text) and text[cursor] in " \t\r\n":
        cursor += 1
    if cursor >= len(text) or text[cursor] != "{":
        return None, start
    depth = 0
    begin = cursor
    while cursor < len(text):
        char = text[cursor]
        if char == "\\":
            cursor += 2
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[begin + 1 : cursor], cursor + 1
        cursor += 1
    return None, start


def parse_n_args(text: str, brace_index: int, count: int) -> tuple[list[str] | None, int]:
    position = brace_index
    args: list[str] = []
    for _ in range(count):
        arg, next_position = read_braced(text, position)
        if arg is None:
            return (args or None), position
        args.append(arg)
        position = next_position
    return args, position


_DATE_SHAPE = re.compile(
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}"
    r"|\d{4}\s*[-\u2013\u2014]\s*(?:present|\d{4})"
    r"|(?:19|20)\d{2})",
    re.IGNORECASE,
)


def split_title_dates(text: str) -> tuple[str, str]:
    if not text:
        return "", ""
    match = _DATE_SHAPE.search(text)
    if not match:
        return text.strip(), ""
    title = re.sub(r"[\s\-|\u2013\u2014]+$", "", text[: match.start()]).strip()
    return title or text.strip(), text[match.start() :].strip()


@dataclass
class ParsedItem:
    kind: str
    title: str = ""
    organization: str = ""
    location: str = ""
    dates: DateRange | None = None
    date_text: str = ""
    description: list[str] = field(default_factory=list)
    technologies: list[str] = field(default_factory=list)
    achievements: list[str] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    section_title: str = ""


@dataclass
class ParsedResume:
    document: ResumeDocument
    source_type: SourceType
    filename: str
    original_text: str
    raw_tex: str = ""
    parse_confidence: float = 1.0
    warnings: list[str] = field(default_factory=list)


def _http_links(values: list[str]) -> list[str]:
    seen: list[str] = []
    for value in values:
        cleaned = (value or "").strip()
        if cleaned.startswith(("http://", "https://")) and cleaned not in seen:
            seen.append(cleaned)
    return seen


def build_contact(
    *,
    name: str = "",
    email: str = "",
    phone: str = "",
    location: str = "",
    links: list[str] | None = None,
) -> ContactInformation:
    website = linkedin = github = ""
    extra: list[str] = []
    for url in _http_links(links or []):
        lowered = url.lower()
        if "linkedin.com" in lowered and not linkedin:
            linkedin = url
        elif "github.com" in lowered and not github:
            github = url
        elif not website:
            website = url
        else:
            extra.append(url)
    return ContactInformation(
        full_name=name.strip(),
        email=email.strip(),
        phone=phone.strip(),
        location=location.strip(),
        website=website,
        linkedin=linkedin,
        github=github,
        links=extra,
    )


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = (value or "").strip()
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            result.append(cleaned)
    return result


def _custom_section(kind: str, title: str) -> tuple[str, str]:
    lowered = (title or kind).lower()
    if kind == "award" or "award" in lowered or "honor" in lowered:
        return "Awards", "awards"
    if kind == "patent" or "patent" in lowered:
        return "Patents", "patents"
    if "research" in lowered:
        return "Research", "research"
    if "leadership" in lowered:
        return "Leadership", "leadership"
    if "volunteer" in lowered:
        return "Volunteer", "volunteer"
    if "language" in lowered:
        return "Languages", "languages"
    if "interest" in lowered:
        return "Interests", "interests"
    return (title or kind.title() or "Additional"), "custom"


def _dates_or_none(item: ParsedItem) -> DateRange | None:
    return item.dates


def build_document(
    *,
    source_type: SourceType,
    filename: str,
    raw_source: str,
    original_text: str,
    contact: ContactInformation,
    summary: str,
    items: dict[str, list[ParsedItem]],
    skills: list[str],
    warnings: list[str],
    template: str = "ats",
    confidence: float = 1.0,
) -> ParsedResume:
    experience = [
        ExperienceEntry(
            employer=item.organization,
            job_title=item.title,
            location=item.location,
            dates=_dates_or_none(item),
            responsibilities=item.description,
            achievements=item.achievements,
            technologies=item.technologies,
        )
        for item in items.get("experience", [])
        if item.title or item.organization or item.description
    ]

    education = []
    for item in items.get("education", []):
        if not (item.title or item.organization or item.description):
            continue
        if item.organization:
            degree, institution = item.title, item.organization
        else:
            degree, institution = "", item.title
        education.append(
            EducationEntry(
                institution=institution,
                degree=degree,
                location=item.location,
                dates=_dates_or_none(item),
                description="\n".join(item.description),
            )
        )

    projects = [
        ProjectEntry(
            name=item.title,
            description="\n".join(item.description),
            technologies=item.technologies,
            repository_url=item.links[0] if item.links else "",
            dates=_dates_or_none(item),
        )
        for item in items.get("project", [])
        if item.title or item.description
    ]

    publications = [
        PublicationEntry(
            title=item.title,
            venue=item.organization,
            year=item.dates.start.year if item.dates else None,
            url=item.links[0] if item.links else "",
            description="\n".join(item.description),
        )
        for item in items.get("publication", [])
        if item.title or item.description
    ]

    certifications = [
        CertificationEntry(
            name=item.title,
            issuer=item.organization,
            issue_date=item.dates.start if item.dates else None,
        )
        for item in items.get("certification", [])
        if item.title
    ]

    grouped: dict[tuple[str, str], list[CustomEntry]] = {}
    for kind in ("award", "patent", "other"):
        for item in items.get(kind, []):
            if not (item.title or item.description):
                continue
            section_title, section_type = _custom_section(kind, item.section_title)
            grouped.setdefault((section_title, section_type), []).append(
                CustomEntry(
                    title=item.title,
                    subtitle=item.organization,
                    dates=_dates_or_none(item),
                    bullets=item.description,
                    url=item.links[0] if item.links else "",
                )
            )
    custom_sections = [
        CustomSection(title=title, section_type=section_type, items=entries)
        for (title, section_type), entries in grouped.items()
    ]

    cleaned_skills = _dedupe(skills)
    document = ResumeDocument(
        source_type=source_type,
        contact=contact,
        summary=summary.strip(),
        education=education,
        experience=experience,
        projects=projects,
        skills=[SkillEntry(name=name) for name in cleaned_skills],
        publications=publications,
        certifications=certifications,
        custom_sections=custom_sections,
        metadata=ResumeMetadata(
            template=template if template in {"ats", "classic"} else "ats",
            authoring_mode="latex" if source_type == SourceType.TEX else "structured",
        ),
        original_source=raw_source or None,
        warnings=_dedupe(warnings),
    )
    return ParsedResume(
        document=document,
        source_type=source_type,
        filename=filename,
        original_text=original_text,
        raw_tex=raw_source if source_type == SourceType.TEX else "",
        parse_confidence=max(0.0, min(1.0, confidence)),
        warnings=list(document.warnings),
    )
