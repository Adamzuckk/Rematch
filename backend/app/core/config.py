from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-based application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="ReMatch API", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    debug: bool = Field(default=False, alias="DEBUG")

    database_url: str = Field(
        default="sqlite:///./rematch.db",
        alias="DATABASE_URL",
    )

    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ORIGINS",
    )

    default_page_limit: int = Field(default=50, alias="DEFAULT_PAGE_LIMIT", ge=1)
    max_page_limit: int = Field(default=100, alias="MAX_PAGE_LIMIT", ge=1)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def normalize_cors(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value)

    def cors_origin_list(self) -> list[str]:
        if not self.cors_origins.strip():
            return []
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
