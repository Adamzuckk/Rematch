import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.deps import get_db_dep
from app.core.config import Settings, get_settings
from app.main import create_app


def test_default_cors_allows_vite_primary_and_fallback_ports(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    settings = Settings(_env_file=None)

    assert settings.cors_origin_list() == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]


def test_external_auth_fails_closed_without_token():
    with pytest.raises(ValidationError, match="API_BEARER_TOKEN is required"):
        Settings(_env_file=None, require_api_auth=True)


def test_external_auth_requires_valid_bearer_and_advertises_security(
    seeded_db, monkeypatch
):
    token = "local-development-token-0123456789"
    monkeypatch.setenv("REQUIRE_API_AUTH", "true")
    monkeypatch.setenv("API_BEARER_TOKEN", token)
    get_settings.cache_clear()

    app = create_app()

    def override_db():
        yield seeded_db

    app.dependency_overrides[get_db_dep] = override_db
    with TestClient(app) as client:
        unauthorized = client.get("/api/v1/health")
        assert unauthorized.status_code == 401
        assert unauthorized.headers["www-authenticate"] == "Bearer"

        wrong_token = client.get(
            "/api/v1/health", headers={"Authorization": "Bearer wrong"}
        )
        assert wrong_token.status_code == 401

        authorized = client.get(
            "/api/v1/matches",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert authorized.status_code == 200

        schema = client.get("/openapi.json").json()
        assert schema["components"]["securitySchemes"]["BearerAuth"] == {
            "type": "apiKey",
            "description": "Bearer token configured on the ReMatch API server.",
            "in": "header",
            "name": "Authorization",
        }
        assert schema["paths"]["/api/v1/health"]["get"]["security"] == [
            {"BearerAuth": []}
        ]
        assert token not in str(schema)
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def test_production_disables_public_api_documentation(seeded_db, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()

    app = create_app()

    def override_db():
        yield seeded_db

    app.dependency_overrides[get_db_dep] = override_db
    with TestClient(app) as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(path).status_code == 404

    app.dependency_overrides.clear()
    get_settings.cache_clear()


def test_external_auth_rejects_short_token():
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(
            _env_file=None,
            require_api_auth=True,
            api_bearer_token="too-short",
        )
