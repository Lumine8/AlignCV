from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.routes import health, jobs, latex, resumes
from .config import get_settings
from .errors import AlignCVError


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        debug=settings.debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Accept", "Content-Type"],
        max_age=600,
    )

    app.include_router(health.router, prefix="/api")
    app.include_router(latex.router, prefix="/api")
    app.include_router(resumes.router, prefix="/api")
    app.include_router(jobs.router, prefix="/api")

    @app.get("/health", include_in_schema=False)
    def root_health() -> dict:
        return health.health_payload()

    @app.exception_handler(AlignCVError)
    async def _aligncv_error(_: Request, exc: AlignCVError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_payload())

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        issues = [
            {key: value for key, value in issue.items() if key != "ctx"}
            for issue in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "The request payload was invalid.",
                    "details": {"issues": issues},
                }
            },
        )

    return app


app = create_app()
