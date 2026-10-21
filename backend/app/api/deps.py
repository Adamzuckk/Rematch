from collections.abc import Generator

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db

authorization_header = APIKeyHeader(
    name="Authorization",
    scheme_name="BearerAuth",
    description="Bearer token configured on the ReMatch API server.",
    auto_error=False,
)


def get_settings_dep() -> Settings:
    return get_settings()


def get_db_dep() -> Generator[Session, None, None]:
    yield from get_db()


def require_api_auth(
    authorization: str | None = Security(authorization_header),
    settings: Settings = Depends(get_settings_dep),
) -> None:
    if settings.accepts_bearer_token(authorization):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A valid bearer token is required",
        headers={"WWW-Authenticate": "Bearer"},
    )
