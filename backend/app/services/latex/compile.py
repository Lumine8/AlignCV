import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from ...config import get_settings
from ...errors import CompilationFailed, CompilationUnavailable

SUPPORTED_ENGINES = ("tectonic", "pdflatex")


@dataclass
class CompileOutcome:
    engine: str
    pdf_bytes: bytes | None
    log: str
    errors: list[str] = field(default_factory=list)


def detect_latex_engine() -> str | None:
    """Return the first available LaTeX engine, or None."""
    for engine in SUPPORTED_ENGINES:
        if shutil.which(engine):
            return engine
    return None


def latex_available() -> bool:
    return detect_latex_engine() is not None


def _minimal_env() -> dict[str, str]:
    keep = ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "LANG")
    return {key: os.environ[key] for key in keep if key in os.environ}


def compile_latex(source: str, *, engine: str | None = None) -> CompileOutcome:
    settings = get_settings()
    if len(source.encode("utf-8")) > settings.latex_max_source_bytes:
        raise CompilationFailed("The LaTeX source exceeds the configured size limit.")

    chosen = engine or detect_latex_engine()
    if not chosen:
        raise CompilationUnavailable(
            "No LaTeX engine is installed on the server. The .tex source can still be downloaded."
        )
    if chosen not in SUPPORTED_ENGINES:
        raise CompilationUnavailable(f"Unsupported LaTeX engine: {chosen}")

    with tempfile.TemporaryDirectory(prefix="aligncv-tex-") as tmp:
        workdir = Path(tmp)
        tex_name = "resume.tex"
        (workdir / tex_name).write_text(source, encoding="utf-8")

        if chosen == "tectonic":
            cmd = [chosen, "--outdir", str(workdir), "--keep-logs", tex_name]
        else:
            cmd = [
                chosen,
                "-no-shell-escape",
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-output-directory",
                str(workdir),
                tex_name,
            ]

        try:
            proc = subprocess.run(
                cmd,
                cwd=workdir,
                capture_output=True,
                timeout=settings.latex_timeout_seconds,
                shell=False,
                env=_minimal_env(),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise CompilationFailed(
                f"LaTeX compilation timed out after {settings.latex_timeout_seconds} seconds."
            ) from exc

        log = (proc.stdout or b"").decode("utf-8", "replace") + (proc.stderr or b"").decode("utf-8", "replace")
        pdf_path = workdir / "resume.pdf"

        if proc.returncode != 0 or not pdf_path.exists():
            return CompileOutcome(
                engine=chosen,
                pdf_bytes=None,
                log=log[-8000:],
                errors=[f"The {chosen} engine reported an error. See the log for details."],
            )

        return CompileOutcome(engine=chosen, pdf_bytes=pdf_path.read_bytes(), log=log[-8000:])
