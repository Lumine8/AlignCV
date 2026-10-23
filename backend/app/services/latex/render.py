"""LaTeX rendering for the shared structured resume model.

The renderer is intentionally conservative: it produces clean, single-column,
ATS-friendly source and never invents content. Templates only change typography
and margins, not the information that appears in the document.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ...schemas.common import DateFormat, DatePoint, DateRange
from ...schemas.resume import (
    DEFAULT_SECTION_ORDER,
    CertificationEntry,
    CustomEntry,
    EducationEntry,
    ExperienceEntry,
    ProjectEntry,
    PublicationEntry,
    ResumeDocument,
)


@dataclass(frozen=True)
class Template:
    name: str
    document_class: str
    margin: str
    section_format: str


TEMPLATES: dict[str, Template] = {
    "ats": Template(
        name="ats",
        document_class=r"\documentclass[11pt,a4paper]{article}",
        margin="0.75in",
        section_format=r"\titleformat{\section}{\large\bfseries}{}{0em}{}[\vspace{-4pt}\hrule\vspace{4pt}]",
    ),
    "classic": Template(
        name="classic",
        document_class=r"\documentclass[10pt,a4paper]{article}",
        margin="0.9in",
        section_format=(
            r"\titleformat{\section}{\large\scshape\bfseries}{}{0em}{}"
            r"[\vspace{-4pt}\hrule\vspace{4pt}]"
        ),
    ),
}

DEFAULT_TEMPLATE = "ats"

SECTION_TITLES = {
    "summary": "Summary",
    "education": "Education",
    "experience": "Experience",
    "projects": "Projects",
    "skills": "Skills",
    "publications": "Publications",
    "certifications": "Certifications",
    "custom": "Additional",
}

_MONTHS_ABBR = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)
_MONTHS_FULL = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

_SPECIALS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


@dataclass
class RenderedResume:
    source: str
    template: str
    warnings: list[str] = field(default_factory=list)


def escape_latex(text: str | None) -> str:
    """Escape user text so it cannot change LaTeX structure."""
    if not text:
        return ""
    return "".join(_SPECIALS.get(char, char) for char in str(text))


def _format_value(value: DateFormat | str) -> str:
    return value.value if isinstance(value, DateFormat) else str(value)


def format_date_point(point: DatePoint | None, date_format: DateFormat | str) -> str:
    if point is None:
        return ""
    label = _format_value(date_format)
    month = point.month
    if label == DateFormat.MMMM_YYYY.value:
        return f"{_MONTHS_FULL[month - 1]} {point.year}" if month else str(point.year)
    if label == DateFormat.MM_YYYY.value:
        return f"{month:02d}/{point.year}" if month else str(point.year)
    if label == DateFormat.YYYY_MM.value:
        return f"{point.year}-{month:02d}" if month else str(point.year)
    if label == DateFormat.YYYY.value:
        return str(point.year)
    return f"{_MONTHS_ABBR[month - 1]} {point.year}" if month else str(point.year)


def format_date_range(
    date_range: DateRange | None,
    date_format: DateFormat | str,
    present_label: str = "Present",
) -> str:
    if date_range is None:
        return ""
    start = format_date_point(date_range.start, date_format)
    if not date_range.present and date_range.end is not None:
        end = format_date_point(date_range.end, date_format)
        if end == start:
            return start
    else:
        end = present_label if date_range.present else ""
    if start and end:
        return f"{start} -- {end}"
    return start or end


def _safe_url(url: str | None) -> str | None:
    if not url:
        return None
    cleaned = re.sub(r"[\s{}\\]", "", str(url))
    if not cleaned:
        return None
    if re.match(r"^(https?://|mailto:)", cleaned, re.IGNORECASE):
        return cleaned
    if ":" in cleaned or "." not in cleaned:
        return None
    return f"https://{cleaned}"


def _display_link(url: str) -> str:
    cleaned = re.sub(r"^(https?://|mailto:)", "", url, flags=re.IGNORECASE)
    return re.sub(r"/$", "", cleaned)


def _link(url: str | None, label: str | None = None) -> str:
    target = _safe_url(url)
    if target is None:
        return ""
    text = escape_latex(label or _display_link(target))
    if not text:
        return ""
    return rf"\href{{{target}}}{{{text}}}"


def _paragraphs(text: str | None) -> list[str]:
    if not text:
        return []
    return [escape_latex(line.strip()) for line in str(text).splitlines() if line.strip()]


def _bullets(items: list[str]) -> list[str]:
    cleaned = [escape_latex(item) for item in items if item and item.strip()]
    if not cleaned:
        return []
    return [r"\begin{itemize}", *[rf"  \item {item}" for item in cleaned], r"\end{itemize}"]


def _heading(title: str, organization: str = "", location: str = "", dates: str = "") -> str:
    parts = []
    if title:
        parts.append(rf"\textbf{{{escape_latex(title)}}}")
    if organization:
        parts.append(escape_latex(organization))
    line = " --- ".join(parts)
    if location:
        line = f"{line}, {escape_latex(location)}" if line else escape_latex(location)
    if dates:
        line = f"{line} \\hfill {dates}" if line else rf"\hfill {dates}"
    return line


def _render_education(entries: list[EducationEntry], date_format: DateFormat | str) -> list[str]:
    lines: list[str] = []
    for entry in entries:
        title = entry.degree or entry.institution
        organization = entry.institution if entry.degree and entry.institution else ""
        lines.append(_heading(title, organization, entry.location, format_date_range(entry.dates, date_format)))
        details = []
        if entry.field_of_study:
            details.append(escape_latex(entry.field_of_study))
        if entry.grade:
            details.append(f"Grade: {escape_latex(entry.grade)}")
        if entry.coursework:
            details.append(f"Coursework: {escape_latex(', '.join(entry.coursework))}")
        if details:
            lines.append("; ".join(details))
        lines.extend(_paragraphs(entry.description))
    return lines


def _render_experience(entries: list[ExperienceEntry], date_format: DateFormat | str) -> list[str]:
    lines: list[str] = []
    for entry in entries:
        title = entry.job_title or entry.employer
        organization = entry.employer if entry.job_title and entry.employer else ""
        lines.append(_heading(title, organization, entry.location, format_date_range(entry.dates, date_format)))
        if entry.employment_type:
            lines.append(rf"\textit{{{escape_latex(entry.employment_type)}}}")
        if entry.technologies:
            lines.append(rf"\textit{{{escape_latex(', '.join(entry.technologies))}}}")
        lines.extend(_bullets(entry.responsibilities))
        lines.extend(_bullets(entry.achievements))
    return lines


def _render_projects(entries: list[ProjectEntry], date_format: DateFormat | str) -> list[str]:
    lines: list[str] = []
    for entry in entries:
        lines.append(_heading(entry.name, "", "", format_date_range(entry.dates, date_format)))
        if entry.technologies:
            lines.append(rf"\textit{{{escape_latex(', '.join(entry.technologies))}}}")
        for text in (entry.summary, entry.problem, entry.description):
            lines.extend(_paragraphs(text))
        lines.extend(_bullets(entry.contributions))
        lines.extend(_bullets(entry.achievements))
        links = [link for link in (_link(entry.repository_url), _link(entry.live_url)) if link]
        if links:
            lines.append(" | ".join(links))
    return lines


def _render_publications(entries: list[PublicationEntry]) -> list[str]:
    lines: list[str] = []
    for entry in entries:
        lines.append(_heading(entry.title, entry.venue, "", str(entry.year) if entry.year else ""))
        if entry.authors:
            lines.append(rf"\textit{{{escape_latex(', '.join(entry.authors))}}}")
        lines.extend(_paragraphs(entry.description))
        link = _link(entry.url)
        if link:
            lines.append(link)
    return lines


def _render_certifications(entries: list[CertificationEntry], date_format: DateFormat | str) -> list[str]:
    lines: list[str] = []
    for entry in entries:
        issued = format_date_point(entry.issue_date, date_format)
        lines.append(_heading(entry.name, entry.issuer, "", issued))
        link = _link(entry.credential_url)
        if link:
            lines.append(link)
    return lines


def _render_custom_entry(entry: CustomEntry, date_format: DateFormat | str) -> list[str]:
    lines = [_heading(entry.title, entry.subtitle, "", format_date_range(entry.dates, date_format))]
    lines.extend(_paragraphs(entry.description))
    lines.extend(_bullets(entry.bullets))
    link = _link(entry.url)
    if link:
        lines.append(link)
    return lines


def _render_skills(document: ResumeDocument) -> list[str]:
    names = [escape_latex(skill.name) for skill in document.skills if skill.name and skill.name.strip()]
    if not names:
        return []
    return [", ".join(names)]


def _render_section(key: str, document: ResumeDocument, date_format: DateFormat | str) -> list[str]:
    if key == "summary":
        return _paragraphs(document.summary)
    if key == "education":
        return _render_education(document.education, date_format)
    if key == "experience":
        return _render_experience(document.experience, date_format)
    if key == "projects":
        return _render_projects(document.projects, date_format)
    if key == "skills":
        return _render_skills(document)
    if key == "publications":
        return _render_publications(document.publications)
    if key == "certifications":
        return _render_certifications(document.certifications, date_format)
    if key == "custom":
        lines: list[str] = []
        for section in document.custom_sections:
            items: list[str] = []
            for entry in section.items:
                items.extend(_render_custom_entry(entry, date_format))
            if not items:
                continue
            if lines:
                lines.append("")
            lines.append(rf"\section*{{{escape_latex(section.title)}}}")
            lines.extend(items)
        return lines
    return []


def _render_header(document: ResumeDocument) -> list[str]:
    contact = document.contact
    lines: list[str] = []
    if contact.full_name:
        lines.append(rf"{{\LARGE \bfseries {escape_latex(contact.full_name)}}}")
    if contact.professional_title:
        lines.append(rf"\textit{{{escape_latex(contact.professional_title)}}}")
    details = [escape_latex(value) for value in (contact.location, contact.phone, contact.email) if value]
    if details:
        lines.append(" | ".join(details))
    links = [
        link
        for link in (
            _link(contact.website),
            _link(contact.linkedin),
            _link(contact.github),
            *[_link(url) for url in contact.links],
        )
        if link
    ]
    if links:
        lines.append(" | ".join(links[:6]))
    if not lines:
        return []
    return [r"\begin{center}", *[line + r" \\" for line in lines[:-1]], lines[-1], r"\end{center}"]


def render_resume(document: ResumeDocument, template: str | None = None) -> RenderedResume:
    """Render a structured resume to LaTeX source using the named template."""
    name = template or document.metadata.template or DEFAULT_TEMPLATE
    if name not in TEMPLATES:
        raise ValueError(f"unknown template: {name}")

    chosen = TEMPLATES[name]
    warnings: list[str] = []
    if not document.contact.full_name:
        warnings.append("The resume has no name in the header.")
    if not document.contact.email:
        warnings.append("The resume has no email address.")

    body: list[str] = _render_header(document)
    seen: set[str] = set()
    order = [key for key in document.metadata.section_order if key in SECTION_TITLES]
    order.extend(key for key in DEFAULT_SECTION_ORDER if key not in order)

    for key in order:
        if key in seen:
            continue
        seen.add(key)
        content = _render_section(key, document, document.metadata.date_format)
        if not content:
            continue
        if body:
            body.append("")
        body.append(rf"\section*{{{SECTION_TITLES[key]}}}")
        body.extend(content)

    preamble = [
        chosen.document_class,
        r"\usepackage[T1]{fontenc}",
        r"\usepackage[utf8]{inputenc}",
        rf"\usepackage[margin={chosen.margin}]{{geometry}}",
        r"\usepackage[hidelinks]{hyperref}",
        r"\usepackage{enumitem}",
        r"\usepackage{titlesec}",
        chosen.section_format,
        r"\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt}",
        r"\pagestyle{empty}",
        r"\begin{document}",
    ]
    source = "\n".join([*preamble, *body, r"\end{document}", ""])
    return RenderedResume(source=source, template=chosen.name, warnings=warnings)
