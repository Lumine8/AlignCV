from app.services.parsing.common import (
    latex_to_text,
    parse_dates,
    read_braced,
    split_title_dates,
    strip_comments,
)


def test_parse_dates_range_and_present() -> None:
    date_range = parse_dates("Jan 2022 -- Present")
    assert date_range is not None
    assert (date_range.start.year, date_range.start.month) == (2022, 1)
    assert date_range.present is True
    assert date_range.end is None

    date_range = parse_dates("2018 - 2021")
    assert date_range is not None
    assert date_range.start.year == 2018
    assert date_range.end is not None and date_range.end.year == 2021
    assert date_range.present is False


def test_parse_dates_single_point_is_collapsed() -> None:
    date_range = parse_dates("2024")
    assert date_range is not None
    assert date_range.start.year == 2024
    assert date_range.end is not None and date_range.end.year == 2024
    assert date_range.present is False


def test_parse_dates_ignores_out_of_range_years() -> None:
    assert parse_dates("1899") is None
    assert parse_dates("") is None


def test_strip_comments_respects_escaped_percent() -> None:
    source = "keep % drop\n100\\% keep\n"
    assert strip_comments(source) == "keep \n100\\% keep\n"


def test_latex_to_text_handles_common_macros() -> None:
    source = r"\textbf{Built} \href{https://example.com}{site} \& shipped"
    assert latex_to_text(source) == "Built site (https://example.com) & shipped"


def test_read_braced_and_split_title_dates() -> None:
    text = r" \textbf{Hello {nested}} rest"
    content, end = read_braced(text, text.index("{"))
    assert content == "Hello {nested}"
    assert text[end:] == " rest"
    assert split_title_dates("Software Engineer Jan 2022 - Present") == (
        "Software Engineer",
        "Jan 2022 - Present",
    )
