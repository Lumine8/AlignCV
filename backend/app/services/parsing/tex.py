"""LaTeX resume source parser.

Ports the browser parser so server-side uploads produce the same conservative
structured reconstruction. The original source is preserved for LaTeX-authoring
mode; no content is invented.
"""

from __future__ import annotations

import re
from typing import Any

from ...errors import ParseFailed
from ...schemas.common import SourceType
from ...schemas.resume import ContactInformation
from .common import (
    ParsedItem,
    ParsedResume,
    build_contact,
    build_document,
    latex_to_text,
    parse_dates,
    parse_n_args,
    split_title_dates,
    strip_comments,
)

SECTION_KIND_MAP: list[tuple[tuple[str, ...], str]] = [
    (("experience", "employment", "work history", "professional experience", "relevant experience"), "experience"),
    (("education", "academic"), "education"),
    (("project", "projects", "personal projects", "selected projects"), "project"),
    (("publication", "publications", "research", "papers"), "publication"),
    (("patent", "patents"), "patent"),
    (("certification", "certifications", "certificates", "licenses"), "certification"),
    (("award", "awards", "honors", "honours", "achievements"), "award"),
    (("skill", "skills", "technical skills", "technologies", "competencies"), "skill"),
    (("summary", "objective", "profile", "about"), "summary"),
]
CONTACT_HINTS = ("contact", "personal", "profile")


def _classify_section(title: str) -> str:
    lowered = (title or "").strip().lower()
    if not lowered:
        return "other"
    for keys, kind in SECTION_KIND_MAP:
        if any(key in lowered for key in keys):
            return kind
    if any(hint in lowered for hint in CONTACT_HINTS):
        return "contact"
    return "other"


def _find_sections(text: str) -> list[dict[str, Any]]:
    candidates: list[tuple[int, int, str]] = []
    for pattern in (
        re.compile(r"\\(?:section|subsection)\*?\s*\{([^{}]*)\}"),
        re.compile(r"\\cvsection\s*\{([^{}]*)\}"),
    ):
        for match in pattern.finditer(text):
            candidates.append((match.start(), match.end(), match.group(1)))
    if not candidates:
        return []
    candidates.sort(key=lambda entry: entry[0])
    document_end = text.find("\\end{document}")
    sections: list[dict[str, Any]] = []
    for index, (start, end, raw_title) in enumerate(candidates):
        next_start = candidates[index + 1][0] if index + 1 < len(candidates) else len(text)
        if index + 1 == len(candidates) and document_end > end:
            next_start = document_end
        title = latex_to_text(raw_title)
        sections.append(
            {
                "title": title,
                "kind": _classify_section(title),
                "content": text[end:next_start],
                "line_start": text[:start].count("\n") + 1,
            }
        )
    return sections


def _item(kind: str, **fields: Any) -> ParsedItem:
    return ParsedItem(kind=kind, **fields)


def _extract_cventry_items(content: str, kind: str) -> list[ParsedItem]:
    items: list[ParsedItem] = []
    for match in re.finditer(r"\\cventry\s*\{", content):
        args, _ = parse_n_args(content, match.end() - 1, 6)
        if not args or len(args) < 6:
            continue
        start_text = latex_to_text(args[0])
        title = latex_to_text(args[1])
        organization = latex_to_text(args[2])
        location = latex_to_text(args[3])
        description = latex_to_text(args[5])
        bullets = [part.strip() for part in re.split(r"\.\s+(?=[A-Z])", description) if part.strip()]
        items.append(
            _item(
                kind,
                title=title,
                organization=organization,
                location=location,
                date_text=start_text,
                dates=parse_dates(start_text),
                description=bullets,
            )
        )
    return items


def _split_project_title(value: str) -> tuple[str, str]:
    parts = [part.strip() for part in re.split(r"\s*[\u2013\u2014|]\s*|\s{2,}|\$\\cdot\$", value) if part.strip()]
    if not parts:
        return value, ""
    return parts[0], ", ".join(parts[1:])


def _extract_subheading_items(content: str, kind: str) -> list[ParsedItem]:
    items: list[ParsedItem] = []
    commands = {
        "resumeSubheading": 4,
        "resumeSubSubheading": 2,
        "resumeProjectHeading": 2,
        "resumeProjectHeadingCustom": 2,
    }
    positions: list[tuple[int, int, str, int]] = []
    for command, nargs in commands.items():
        for match in re.finditer(rf"\\{command}\b", content):
            positions.append((match.start(), match.end(), command, nargs))
    positions.sort(key=lambda entry: entry[0])
    for index, (position, arg_start, command, nargs) in enumerate(positions):
        args, _ = parse_n_args(content, arg_start, nargs)
        if not args:
            continue
        end = positions[index + 1][0] if index + 1 < len(positions) else len(content)
        body = content[position:end]
        bullets = []
        for item_match in re.finditer(r"\\resumeItem\s*\{([^{}]*)\}", body):
            text = latex_to_text(item_match.group(1))
            if text:
                bullets.append(text)
        if command in {"resumeSubheading", "resumeSubSubheading"}:
            if nargs == 4:
                organization = latex_to_text(args[0])
                location = latex_to_text(args[1])
                title = latex_to_text(args[2])
                dates_text = latex_to_text(args[3])
            else:
                organization = location = ""
                title = latex_to_text(args[0])
                dates_text = latex_to_text(args[1])
            items.append(
                _item(
                    kind,
                    title=title,
                    organization=organization,
                    location=location,
                    date_text=dates_text,
                    dates=parse_dates(dates_text),
                    description=bullets,
                )
            )
        else:
            project = latex_to_text(args[0])
            dates_text = latex_to_text(args[1]) if len(args) > 1 else ""
            title, technologies = _split_project_title(project)
            items.append(
                _item(
                    kind,
                    title=title,
                    technologies=[technologies] if technologies else [],
                    date_text=dates_text,
                    dates=parse_dates(dates_text),
                    description=bullets,
                )
            )
    return items


def _extract_generic_items(content: str, kind: str) -> list[ParsedItem]:
    items: list[ParsedItem] = []
    current: dict[str, Any] | None = None

    def finalize() -> None:
        nonlocal current
        if current is not None:
            items.append(
                _item(
                    kind,
                    title=current.get("title", ""),
                    date_text=current.get("date_text", ""),
                    dates=parse_dates(current.get("date_text", "")),
                    description=[value for value in current.get("description", []) if value],
                )
            )
            current = None

    for raw in content.split("\n"):
        line = raw.strip()
        if not line:
            continue
        bold = re.match(r"^\\(?:textbf|large|Large|textsc)\s*\{([^{}]*)\}", line)
        item = re.match(r"^\\item\s*(?:\[[^\]]*\])?\s*(.*)$", line)
        macro_item = re.match(r"^\\(?:resumeItem|cvitem|cvlistitem|award|honor)\s*\{([^{}]*)\}", line)
        if macro_item and not item:
            text = latex_to_text(macro_item.group(1))
            if current is None:
                current = {"title": "", "date_text": "", "description": []}
            if text:
                current["description"].append(text)
        elif bold and not item:
            finalize()
            heading = latex_to_text(bold.group(1))
            rest = latex_to_text(line[bold.end():])
            title, dates_text = split_title_dates(heading or rest)
            current = {"title": title, "date_text": dates_text, "description": []}
        elif item:
            text = latex_to_text(item.group(1))
            if current is None:
                current = {"title": "", "date_text": "", "description": []}
            if text:
                current["description"].append(text)
        elif current is not None and not line.startswith("\\"):
            text = latex_to_text(line)
            if text:
                current["description"].append(text)
    finalize()
    return items


def _extract_skills(content: str) -> list[str]:
    text = latex_to_text(content)
    text = re.sub(r"(?:^|\n)\s*[A-Za-z][A-Za-z /&]{1,30}:\s*", "\n", text)
    candidates: list[str] = []
    for chunk in re.split(r"[,;:\n]|\s*&\s*|\s*\\(?:quad|hspace)\s*", text):
        chunk = chunk.strip(" .\t")
        if not chunk or len(chunk) > 60:
            continue
        chunk = re.sub(r"^[A-Za-z][A-Za-z /&]+:\s*", "", chunk)
        if 1 <= len(chunk.split()) <= 6:
            candidates.append(chunk)
    seen: set[str] = set()
    skills: list[str] = []
    for candidate in candidates:
        key = candidate.lower()
        if key not in seen:
            seen.add(key)
            skills.append(candidate)
    return skills


def _header_region(text: str) -> str:
    marker = "\\begin{document}"
    index = text.find(marker)
    start = index + len(marker) if index != -1 else 0
    section = re.search(r"\\(?:section|subsection)\*?\s*\{", text[start:])
    end = start + section.start() if section else start + 1500
    return latex_to_text(text[start:end])


def _extract_contact(text: str) -> ContactInformation:
    name = email = phone = location = ""
    name_match = re.search(r"\\name\s*\{([^{}]*)\}", text)
    if name_match:
        name = latex_to_text(name_match.group(1))
    email_match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    if email_match:
        email = email_match.group(0)
    phone_match = re.search(r"(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}|\+\d[\d\s().\-]{7,})", text)
    if phone_match:
        phone = phone_match.group(0).strip()

    if not name or not location:
        for line in _header_region(text).split("\n"):
            candidate = line.strip()
            if not candidate:
                continue
            if "@" in candidate or "http" in candidate or re.search(r"\d{3}[\s.\-]?\d{4}", candidate):
                continue
            words = candidate.split()
            if (
                not name
                and 2 <= len(words) <= 4
                and all(re.fullmatch(r"[A-Za-z.'\-]+", word) for word in words)
            ):
                name = candidate
            elif not location and re.search(r"[A-Za-z]", candidate) and len(candidate) < 60:
                location = candidate
            if name and location:
                break

    address = re.search(r"\\address\s*\{([^{}]*)\}", text)
    if address:
        location = latex_to_text(address.group(1))
    else:
        location_match = re.search(r"\\location\s*\{([^{}]*)\}", text)
        if location_match:
            location = latex_to_text(location_match.group(1))

    links: list[str] = []
    for match in re.finditer(r"\\href\s*\{([^{}]*)\}\s*\{([^{}]*)\}", text):
        target = match.group(1).strip()
        if target.startswith("http"):
            links.append(target)
        elif target.startswith("mailto:") and not email:
            email = target[7:]
    for match in re.finditer(r"\\url\s*\{([^{}]*)\}", text):
        links.append(match.group(1).strip())
    return build_contact(name=name, email=email, phone=phone, location=location, links=links)


def detect_template(text: str) -> str:
    for name in ("moderncv", "altacv", "awesome-cv", "resume", "deedy", "fontawesome"):
        if re.search(rf"\\documentclass(\[[^\]]*\])?\{{{name}", text):
            return name
    if "\\resumeSubheading" in text or "\\resumeItem" in text:
        return "jakes-resume"
    return "auto"


def parse_tex(text: str, filename: str = "resume.tex") -> ParsedResume:
    if not text or not text.strip():
        raise ParseFailed("The LaTeX file is empty.")

    cleaned = strip_comments(text)
    original_text = latex_to_text(cleaned)
    contact = _extract_contact(cleaned)
    sections = _find_sections(cleaned)
    warnings: list[str] = []
    items: dict[str, list[ParsedItem]] = {}
    summary_parts: list[str] = []
    skills: list[str] = []
    confidence = 1.0

    if not sections:
        warnings.append(
            "No standard \\section headings were detected. Falling back to a text-based parse of the document body."
        )
        confidence = 0.6
        body = cleaned[cleaned.find("\\begin{document}") + len("\\begin{document}") :] if "\\begin{document}" in cleaned else cleaned
        fallback_items = _extract_generic_items(body, "other")
        for item in fallback_items:
            item.section_title = "Additional"
        items["other"] = fallback_items
        if not fallback_items and not skills:
            plain = original_text.strip()
            if plain:
                summary_parts.append(plain[:1500])
                warnings.append("Content was kept as a plain-text summary; review the structure before optimizing.")
            else:
                raise ParseFailed("No readable text could be extracted from this LaTeX file.")

    for section in sections:
        kind = section["kind"]
        content = section["content"]
        if kind == "skill":
            skills.extend(_extract_skills(content))
            continue
        if kind == "summary":
            text_value = latex_to_text(content).strip()
            if text_value:
                summary_parts.append(text_value)
            continue
        if kind in {"contact", "other"}:
            continue

        section_items: list[ParsedItem] = []
        if "\\cventry" in content:
            section_items = _extract_cventry_items(content, kind)
        if not section_items and ("\\resumeSubheading" in content or "\\resumeProjectHeading" in content):
            section_items = _extract_subheading_items(content, kind)
        if not section_items:
            section_items = _extract_generic_items(content, kind)

        section_items = [
            item for item in section_items if item.title or item.description or item.organization
        ]
        for item in section_items:
            item.section_title = section["title"]
        if section_items:
            items.setdefault(kind, []).extend(section_items)

    skills = [value for value in dict.fromkeys(value for value in skills if value)]
    summary = "\n".join(part for part in summary_parts if part).strip()

    if sections and not any(kind in items for kind in ("experience", "education", "project", "publication", "certification", "award", "patent")):
        warnings.append("Sections were detected but no entries could be structured.")
        confidence = min(confidence, 0.5)
    if not skills:
        match = re.search(r"Skills?[:\s]*([^\n]{0,300})", original_text, re.IGNORECASE)
        if match:
            skills = [part.strip() for part in re.split(r"[,;]", match.group(1)) if part.strip()]

    template = detect_template(cleaned)
    return build_document(
        source_type=SourceType.TEX,
        filename=filename,
        raw_source=text,
        original_text=original_text,
        contact=contact,
        summary=summary,
        items=items,
        skills=skills,
        warnings=warnings,
        template="ats" if template not in {"ats", "classic"} else template,
        confidence=confidence,
    )
