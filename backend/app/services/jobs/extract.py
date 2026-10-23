"""Deterministic job-description structuring.

Extracted requirements keep the source wording; categories and importance are
heuristics, never claims about the candidate. Skill keywords are canonicalized
through the shared dictionary.
"""

from __future__ import annotations

import re

from ...schemas.job import (
    ExtractionMetadata,
    ExtractionMethod,
    ExtractionStatus,
    JobProfile,
    JobRequirement,
    RequirementCategory,
    RequirementImportance,
)
from ..skills import canonical_skill, is_known_skill

SECTION_HEADINGS: list[tuple[tuple[str, ...], str]] = [
    (("responsibilities", "what you'll do", "what you will do", "the role", "duties"), "responsibility"),
    (
        ("requirements", "qualifications", "required", "minimum qualifications",
         "what we're looking for", "basic qualifications"),
        "qualification",
    ),
    (("preferred", "nice to have", "bonus", "desired", "plus"), "preferred"),
    (("education",), "education"),
    (("benefits", "perks", "about us", "equal opportunity"), "ignore"),
]

PREFERRED_HINT = re.compile(r"\b(preferred|nice to have|bonus|a plus|desired|plus\b)", re.I)
REQUIRED_HINT = re.compile(
    r"\b(required|must|minimum|at least|strong|proficien|expert|demonstrated|experience with|solid)\b",
    re.I,
)
RESPONSIBILITY_HINT = re.compile(
    r"^(design|build|develop|lead|collaborate|own|drive|implement|maintain|create|manage|"
    r"partner|contribute|write|research|deliver|work)\b",
    re.I,
)
EDUCATION_HINT = re.compile(r"\b(bachelor|master|phd|ph\.d|degree|b\.s|m\.s|mba|gpa|university|major)\b", re.I)
CERT_HINT = re.compile(r"\b(certified|certification|certificate|aws certified|pmp|security\+)\b", re.I)
YEARS_HINT = re.compile(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:or more\s*)?years?", re.I)
LOCATION_HINT = re.compile(
    r"\b(remote|hybrid|on-?site|relocat|authorized to work|work authorization|visa)\b",
    re.I,
)
BULLET_SPLIT = re.compile(r"(?:\r?\n)+|\u2022|\u2023|\u25E6|\u00b7")
BULLET_PREFIX = re.compile(r"^\s*[-*\u2022\u2023\u25E6\u2043\u2219\u00b7]\s+")
TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.]+")
PHRASE_RE = re.compile(r"[a-z][a-z0-9+#. ]{2,40}")
CAPITALIZED_RE = re.compile(r"\b[A-Z][A-Za-z0-9+#.]{1,20}\b")

CATEGORY_MAP = {
    "education": RequirementCategory.EDUCATION,
    "certification": RequirementCategory.CERTIFICATION,
    "location": RequirementCategory.CONSTRAINT,
    "experience": RequirementCategory.EXPERIENCE,
    "preferred": RequirementCategory.SKILL,
    "responsibility": RequirementCategory.RESPONSIBILITY,
    "qualification": RequirementCategory.SKILL,
    "skill": RequirementCategory.SKILL,
}


def _looks_like_bullet(line: str) -> bool:
    stripped = line.strip()
    if len(stripped) < 3 or len(stripped) > 400:
        return False
    return not stripped.endswith(":")


def _classify_line(line: str, current_section: str) -> tuple[str, bool]:
    if EDUCATION_HINT.search(line):
        return "education", False
    if CERT_HINT.search(line):
        return "certification", False
    if LOCATION_HINT.search(line):
        return "location", False
    if YEARS_HINT.search(line) and re.search(r"\b(experience|years)\b", line, re.I):
        must = bool(REQUIRED_HINT.search(line)) and not bool(PREFERRED_HINT.search(line))
        return "experience", must
    if PREFERRED_HINT.search(line):
        return "preferred", False
    if current_section in {"responsibility", "qualification", "preferred", "education"}:
        must = current_section == "qualification" and bool(REQUIRED_HINT.search(line))
        return current_section, must
    if RESPONSIBILITY_HINT.search(line.strip()):
        return "responsibility", False
    if REQUIRED_HINT.search(line):
        return "qualification", True
    return "skill", False


def extract_keywords(line: str) -> list[str]:
    keywords: list[str] = []
    lowered = line.lower()
    for token in TOKEN_RE.findall(lowered):
        if is_known_skill(token):
            keywords.append(canonical_skill(token))
    for phrase in PHRASE_RE.findall(lowered):
        cleaned = phrase.strip()
        if is_known_skill(cleaned):
            keywords.append(canonical_skill(cleaned))
    for capitalized in CAPITALIZED_RE.findall(line):
        if capitalized in {"The", "And", "You", "We", "Our", "This", "That", "With", "For"}:
            continue
        if is_known_skill(capitalized):
            keywords.append(canonical_skill(capitalized))
    return list(dict.fromkeys(keywords))


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def structure_job(
    text: str,
    *,
    url: str | None = None,
    method: ExtractionMethod = ExtractionMethod.PASTE,
    title: str = "",
    company: str = "",
    location: str = "",
    platform: str | None = None,
    confidence: float | None = None,
    notes: list[str] | None = None,
) -> JobProfile:
    text = (text or "").strip()[:60000]
    warnings: list[str] = []
    if len(text) < 60:
        warnings.append("The job description is very short; scoring may be unreliable.")

    if not title:
        first_line = text.split("\n")[0] if text else ""
        match = re.match(r"^(.{3,80}?)\s+(?:at|@)\s+(.{2,60})$", first_line, re.I)
        if match:
            title = match.group(1).strip()
            company = company or match.group(2).strip()
        elif first_line and len(first_line) <= 120:
            title = re.sub(r"\s*[|\u2013\u2014]\s*.*$", "", first_line).strip()

    requirements: list[JobRequirement] = []
    seen: set[str] = set()
    current_section = ""
    title_line = text.split("\n")[0].strip() if text else ""
    for raw in BULLET_SPLIT.split(text):
        line = BULLET_PREFIX.sub("", raw.strip()).strip()
        if not line:
            continue
        if line == title_line and not requirements and not current_section:
            continue
        lowered = re.sub(r"[:\s]+$", "", line.lower())
        heading_kind = None
        words = lowered.split()
        contains_skill = any(is_known_skill(word.strip(".,;")) for word in words)
        if len(lowered) < 60 and not contains_skill:
            for keys, kind in SECTION_HEADINGS:
                if any(
                    lowered == key
                    or (lowered.startswith(key) and len(words) <= 4)
                    for key in keys
                ):
                    heading_kind = kind
                    break
        if heading_kind:
            current_section = heading_kind
            continue
        if current_section == "ignore":
            continue
        if not _looks_like_bullet(line):
            continue
        category_key, must = _classify_line(line, current_section)
        key = re.sub(r"\s+", " ", line.lower())[:120]
        if key in seen:
            continue
        seen.add(key)
        min_years = None
        years_match = YEARS_HINT.search(line)
        if years_match and category_key in {"experience", "qualification"}:
            try:
                min_years = float(years_match.group(1))
            except ValueError:
                min_years = None
        requirements.append(
            JobRequirement(
                text=line,
                category=CATEGORY_MAP.get(category_key, RequirementCategory.OTHER),
                importance=(
                    RequirementImportance.REQUIRED if must else RequirementImportance.PREFERRED
                ),
                must_have=must,
                critical=must and bool(REQUIRED_HINT.search(line)),
                min_years=min_years,
                keywords=extract_keywords(line),
                source_excerpt=line,
            )
        )

    if len(requirements) > 80:
        requirements = requirements[:80]
        warnings.append("Only the first 80 requirements were structured.")

    responsibilities = [
        requirement.text
        for requirement in requirements
        if requirement.category == RequirementCategory.RESPONSIBILITY
    ]
    required_skills = _dedupe(
        [skill for requirement in requirements if requirement.must_have for skill in requirement.keywords]
    )
    preferred_skills = _dedupe(
        [skill for requirement in requirements if not requirement.must_have for skill in requirement.keywords]
    )
    preferred_skills = [skill for skill in preferred_skills if skill not in required_skills]
    education_requirements = [
        requirement.text
        for requirement in requirements
        if requirement.category == RequirementCategory.EDUCATION
    ]
    experience_requirements = [
        requirement.text
        for requirement in requirements
        if requirement.category == RequirementCategory.EXPERIENCE
    ]
    certifications = [
        requirement.text
        for requirement in requirements
        if requirement.category == RequirementCategory.CERTIFICATION
    ]
    constraints = [
        requirement.text
        for requirement in requirements
        if requirement.category == RequirementCategory.CONSTRAINT
    ]

    if confidence is None:
        confidence = 0.85 if len(requirements) >= 5 else 0.5
        if not requirements:
            confidence = 0.2
            warnings.append("No distinct requirements could be extracted from the text.")

    metadata = ExtractionMetadata(
        method=method,
        status=ExtractionStatus.OK,
        confidence=confidence,
        platform=platform,
        source_url=url,
        notes=notes or [],
    )
    return JobProfile(
        title=title.strip()[:200],
        company=company.strip()[:200],
        location=location.strip()[:200],
        description=text,
        canonical_url=url,
        responsibilities=responsibilities,
        required_skills=required_skills,
        preferred_skills=preferred_skills,
        education_requirements=education_requirements,
        experience_requirements=experience_requirements,
        certifications=certifications,
        constraints=constraints,
        requirements=requirements,
        warnings=warnings,
        extraction=metadata,
    )


def extract_job_from_text(text: str, title: str = "", company: str = "") -> JobProfile:
    return structure_job(text, method=ExtractionMethod.PASTE, title=title, company=company)
