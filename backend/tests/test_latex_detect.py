import shutil

from app.services.latex.compile import detect_latex_engine, latex_available


def test_detect_latex_engine_matches_shutil() -> None:
    expected = next((name for name in ("tectonic", "pdflatex") if shutil.which(name)), None)
    assert detect_latex_engine() == expected


def test_latex_available_is_boolean() -> None:
    assert isinstance(latex_available(), bool)
