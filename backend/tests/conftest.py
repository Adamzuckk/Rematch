from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# Defaults before first settings load (overridden per-test with a file DB).
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEBUG", "false")

from app.api.deps import get_db_dep
from app.core.config import get_settings
from app.db import session as db_session_module
from app.db.base import Base
from app.db.session import configure_engine, get_engine, get_session_factory
from app.main import create_app
from app.models import (  # noqa: F401 — register metadata
    Match,
    MatchEvent,
    MatchFrame,
    Player,
    PlayerFramePosition,
    Scenario,
    Team,
)
from app.services.seed import seed_phase4_scenario


def _reset_engine() -> None:
    if db_session_module.engine is not None:
        db_session_module.engine.dispose()
    db_session_module.engine = None
    db_session_module.SessionLocal = None
    get_settings.cache_clear()


@pytest.fixture()
def db_session(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Session:
    db_url = f"sqlite:///{tmp_path / 'rematch-test.db'}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173")
    _reset_engine()
    configure_engine(db_url)
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        _reset_engine()


@pytest.fixture()
def seeded_db(db_session: Session) -> Session:
    seed_phase4_scenario(db_session)
    db_session.commit()
    return db_session


@pytest.fixture()
def client(seeded_db: Session) -> TestClient:
    app = create_app()

    def _override_db():
        try:
            yield seeded_db
        finally:
            pass

    app.dependency_overrides[get_db_dep] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def empty_client(db_session: Session) -> TestClient:
    app = create_app()

    def _override_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db_dep] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
