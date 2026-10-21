from functools import lru_cache
from secrets import compare_digest

from pydantic import Field, SecretStr, field_validator, model_validator
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

    require_api_auth: bool = Field(default=False, alias="REQUIRE_API_AUTH")
    api_bearer_token: SecretStr | None = Field(default=None, alias="API_BEARER_TOKEN")

    database_url: str = Field(
        default="sqlite:///./rematch.db",
        alias="DATABASE_URL",
    )

    cors_origins: str = Field(
        default=(
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:5174,http://127.0.0.1:5174"
        ),
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

    @model_validator(mode="after")
    def validate_api_auth(self) -> "Settings":
        if self.api_bearer_token is not None and len(self.api_bearer_token.get_secret_value()) < 32:
            raise ValueError("API_BEARER_TOKEN must contain at least 32 characters")
        if self.require_api_auth and self.api_bearer_token is None:
            raise ValueError("API_BEARER_TOKEN is required when REQUIRE_API_AUTH=true")
        return self

    def accepts_bearer_token(self, authorization: str | None) -> bool:
        if not self.require_api_auth:
            return True
        if authorization is None or self.api_bearer_token is None:
            return False
        scheme, separator, token = authorization.partition(" ")
        return (
            bool(separator)
            and scheme.lower() == "bearer"
            and compare_digest(token, self.api_bearer_token.get_secret_value())
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
