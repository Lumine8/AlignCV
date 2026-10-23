from fastapi import APIRouter

from ...config import get_settings
from ...services.latex.compile import detect_latex_engine

router = APIRouter(tags=["health"])


def health_payload() -> dict:
    settings = get_settings()
    compiler = detect_latex_engine()
    return {
        "status": "ok",
        "version": settings.version,
        "environment": settings.environment,
        "capabilities": {
            "semantic_backend": "lexical-embedding",
            "transformers_enabled": False,
            "latex_compilation_available": compiler is not None,
            "latex_compiler": compiler or "unavailable",
            "playwright_enabled": settings.enable_playwright,
        },
    }


@router.get("/health")
def health() -> dict:
    return health_payload()
