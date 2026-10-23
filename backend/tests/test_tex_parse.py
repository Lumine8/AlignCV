import pytest

from app.errors import ParseFailed
from app.schemas.common import SourceType
from app.services.parsing.tex import detect_template, parse_tex

SOURCE = r"""
\documentclass[11pt]{article}
\usepackage{enumitem}
\newcommand{\resumeItem}[1]{\item #1}
\newcommand{\resumeSubheading}[4]{
  \item
    \textbf{#3} \hfill #4 \\
    #1 \hfill #2
}
\address{London, UK}
\begin{document}
\begin{center}
  {\Huge \textbf{Ada Lovelace}}\\
  ada@example.com | +1 (555) 123-4567 | London, UK
\end{center}

\section{Summary}
Mathematician and programmer.

\section{Education}
\resumeSubheading
  {University of London}{London, UK}
  {BSc Computer Science}{2018 -- 2021}
  \resumeItem{GPA: 3.9}

\section{Experience}
\resumeSubheading
  {Acme Corp}{Remote}
  {Software Engineer}{Jan 2022 -- Present}
  \resumeItem{Built APIs in Python and FastAPI.}
  \resumeItem{Led a team of 3 engineers.}

\section{Projects}
\resumeProjectHeading
  {\textbf{AlignCV} | Python, React}{2024}
  \resumeItem{Resume analyzer with LaTeX export.}

\section{Skills}
\textbf{Languages:} Python, JavaScript, SQL
\end{document}
"""


def test_parse_tex_builds_structured_document() -> None:
    parsed = parse_tex(SOURCE, filename="ada.tex")
    document = parsed.document

    assert parsed.source_type == SourceType.TEX
    assert parsed.raw_tex == SOURCE
    assert document.contact.full_name == "Ada Lovelace"
    assert document.contact.email == "ada@example.com"
    assert document.contact.phone
    assert document.contact.location == "London, UK"
    assert document.metadata.authoring_mode == "latex"

    assert len(document.experience) == 1
    experience = document.experience[0]
    assert experience.job_title == "Software Engineer"
    assert experience.employer == "Acme Corp"
    assert experience.location == "Remote"
    assert experience.dates is not None and experience.dates.present is True
    assert experience.dates.start.year == 2022
    assert experience.responsibilities == [
        "Built APIs in Python and FastAPI.",
        "Led a team of 3 engineers.",
    ]

    assert len(document.education) == 1
    education = document.education[0]
    assert education.institution == "University of London"
    assert education.degree == "BSc Computer Science"
    assert education.dates is not None and education.dates.end.year == 2021
    assert education.description == "GPA: 3.9"

    assert len(document.projects) == 1
    project = document.projects[0]
    assert project.name == "AlignCV"
    assert project.technologies == ["Python, React"]
    assert project.dates is not None and project.dates.start.year == 2024

    assert [skill.name for skill in document.skills] == ["Python", "JavaScript", "SQL"]
    assert document.summary == "Mathematician and programmer."


def test_parse_tex_strips_comments_and_detects_template() -> None:
    source = "% comment\n\\documentclass{moderncv}\n\\begin{document}\nAda Lovelace\n\\end{document}\n"
    parsed = parse_tex(source)
    assert detect_template(source) == "moderncv"
    assert parsed.raw_tex == source
    assert "% comment" not in parsed.original_text


def test_parse_tex_falls_back_when_no_sections() -> None:
    source = (
        "\\documentclass{article}\n\\begin{document}\nJohn Doe\n"
        "john@example.com\nBuilt tools with Python.\n\\end{document}\n"
    )
    parsed = parse_tex(source)
    assert parsed.document.contact.full_name == "John Doe"
    assert parsed.document.contact.email == "john@example.com"
    assert "Python" in parsed.document.summary
    assert any("No standard" in warning for warning in parsed.warnings)


def test_parse_tex_rejects_empty_source() -> None:
    with pytest.raises(ParseFailed):
        parse_tex("   \n% only a comment\n")
