from app.core.config import Settings


def test_default_cors_allows_vite_primary_and_fallback_ports(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    settings = Settings(_env_file=None)

    assert settings.cors_origin_list() == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
