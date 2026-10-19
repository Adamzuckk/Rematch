from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine: Engine | None = None
SessionLocal: sessionmaker[Session] | None = None
_sqlite_pragma_registered = False


def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # noqa: ARG001
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def configure_engine(database_url: str | None = None) -> Engine:
    """Create (or recreate) the SQLAlchemy engine and session factory."""
    global engine, SessionLocal, _sqlite_pragma_registered

    settings = get_settings()
    url = database_url or settings.database_url
    connect_args: dict = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    if engine is not None:
        engine.dispose()

    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)

    if url.startswith("sqlite") and not _sqlite_pragma_registered:
        event.listen(Engine, "connect", _set_sqlite_pragma)
        _sqlite_pragma_registered = True

    SessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        class_=Session,
    )
    return engine


def get_engine() -> Engine:
    if engine is None:
        configure_engine()
    assert engine is not None
    return engine


def get_session_factory() -> sessionmaker[Session]:
    if SessionLocal is None:
        configure_engine()
    assert SessionLocal is not None
    return SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()
