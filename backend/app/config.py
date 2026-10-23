from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="ALIGNCV_",
        extra="ignore",
    )

    app_name: str = "AlignCV API"
    version: str = "0.1.0"
    environment: str = "development"
    debug: bool = False

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    max_upload_bytes: int = 10 * 1024 * 1024
    job_fetch_timeout_seconds: float = 15.0
    job_fetch_max_bytes: int = 2 * 1024 * 1024
    job_fetch_max_redirects: int = 3

    latex_timeout_seconds: int = 30
    latex_max_source_bytes: int = 512 * 1024

    artifact_ttl_seconds: int = 3600

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    enable_playwright: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
