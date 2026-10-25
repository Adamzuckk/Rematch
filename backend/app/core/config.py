from functools import lru_cache
from secrets import compare_digest
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LlmProvider = Literal["openai", "azure_openai", "openai_compatible", "gemini"]

# Currently supported Gemini Developer API model (override with GEMINI_MODEL).
# gemini-2.5-flash is closed to many new projects; 3.5 Flash-Lite is the
# documented cost-efficient default for new Gemini Developer API usage.
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"


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

    # Optional external LLM enrichment (server-side only — never expose to Vite).
    llm_enabled: bool = Field(default=False, alias="LLM_ENABLED")
    llm_provider: LlmProvider = Field(default="openai", alias="LLM_PROVIDER")
    llm_api_key: SecretStr | None = Field(default=None, alias="LLM_API_KEY")
    llm_base_url: str | None = Field(default=None, alias="LLM_BASE_URL")
    llm_model: str = Field(default="gpt-4o-mini", alias="LLM_MODEL")
    llm_azure_deployment: str | None = Field(default=None, alias="LLM_AZURE_DEPLOYMENT")
    llm_azure_api_version: str = Field(
        default="2024-10-21",
        alias="LLM_AZURE_API_VERSION",
    )
    llm_timeout_seconds: float = Field(
        default=20.0,
        alias="LLM_TIMEOUT_SECONDS",
        gt=0,
        le=120,
    )
    llm_max_tokens: int = Field(default=1200, alias="LLM_MAX_TOKENS", ge=256, le=4096)
    llm_max_retries: int = Field(default=2, alias="LLM_MAX_RETRIES", ge=0, le=5)
    llm_cache_max_entries: int = Field(
        default=128,
        alias="LLM_CACHE_MAX_ENTRIES",
        ge=0,
        le=10_000,
    )
    llm_cache_ttl_seconds: float = Field(
        default=3600.0,
        alias="LLM_CACHE_TTL_SECONDS",
        ge=0,
        le=86_400,
    )

    # Google Gemini Developer API — key is read only from GEMINI_API_KEY.
    gemini_api_key: SecretStr | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default=DEFAULT_GEMINI_MODEL, alias="GEMINI_MODEL")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def normalize_cors(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("llm_provider", mode="before")
    @classmethod
    def normalize_llm_provider(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    def cors_origin_list(self) -> list[str]:
        if not self.cors_origins.strip():
            return []
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def docs_enabled(self) -> bool:
        """Keep interactive API documentation local-only by default."""
        return self.app_env.lower() not in {"production", "prod"}

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def resolved_llm_model(self) -> str:
        """Return the active chat model for the configured provider."""
        if self.llm_provider == "gemini":
            return self.gemini_model.strip() or DEFAULT_GEMINI_MODEL
        return self.llm_model.strip()

    def resolved_llm_api_key(self) -> str | None:
        """Return the provider secret without logging it.

        Gemini uses GEMINI_API_KEY exclusively. Other providers use LLM_API_KEY.
        """
        if self.llm_provider == "gemini":
            if self.gemini_api_key is None:
                return None
            key = self.gemini_api_key.get_secret_value().strip()
            return key or None
        if self.llm_api_key is None:
            return None
        key = self.llm_api_key.get_secret_value().strip()
        return key or None

    @model_validator(mode="after")
    def validate_api_auth(self) -> "Settings":
        if self.api_bearer_token is not None and len(self.api_bearer_token.get_secret_value()) < 32:
            raise ValueError("API_BEARER_TOKEN must contain at least 32 characters")
        if self.require_api_auth and self.api_bearer_token is None:
            raise ValueError("API_BEARER_TOKEN is required when REQUIRE_API_AUTH=true")
        return self

    @model_validator(mode="after")
    def validate_llm_settings(self) -> "Settings":
        """When LLM_ENABLED=true, require the secrets/endpoints for the chosen provider.

        Leaving LLM_ENABLED=false keeps the deterministic briefing path with no
        outbound calls. Partial env (enabled without a key) fails closed at boot.
        """
        if not self.llm_enabled:
            return self
        if self.llm_provider == "gemini":
            if self.gemini_api_key is None or not self.gemini_api_key.get_secret_value().strip():
                raise ValueError("GEMINI_API_KEY is required when LLM_ENABLED=true and LLM_PROVIDER=gemini")
            if not self.resolved_llm_model():
                raise ValueError("GEMINI_MODEL is required when LLM_ENABLED=true and LLM_PROVIDER=gemini")
            return self
        if self.llm_api_key is None or not self.llm_api_key.get_secret_value().strip():
            raise ValueError("LLM_API_KEY is required when LLM_ENABLED=true")
        if not self.llm_model.strip():
            raise ValueError("LLM_MODEL is required when LLM_ENABLED=true")
        if self.llm_provider == "azure_openai":
            if not (self.llm_base_url or "").strip():
                raise ValueError(
                    "LLM_BASE_URL (Azure OpenAI endpoint) is required when "
                    "LLM_PROVIDER=azure_openai"
                )
            if not (self.llm_azure_deployment or "").strip():
                raise ValueError(
                    "LLM_AZURE_DEPLOYMENT is required when LLM_PROVIDER=azure_openai"
                )
        if self.llm_provider == "openai_compatible":
            if not (self.llm_base_url or "").strip():
                raise ValueError(
                    "LLM_BASE_URL is required when LLM_PROVIDER=openai_compatible"
                )
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
