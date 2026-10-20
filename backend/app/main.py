"""ReMatch FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.router import api_router
from app.core.config import get_settings
from app.db.session import configure_engine, get_engine


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Reuse an engine already configured by tests/CLI; otherwise build from settings.
    from app.db import session as db_session

    if db_session.engine is None:
        configure_engine()
    get_engine()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description=(
            "ReMatch API — seeded synthetic match catalogue, events, frames, "
            "and deterministic decision analysis with evidence verification. "
            "Synthetic demo data only; no LLM or Foundry integration."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    origins = settings.cors_origin_list()
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Accept", "Content-Type"],
        )

    @application.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail and "message" in detail:
            payload = {"error": detail}
        else:
            payload = {
                "error": {
                    "code": "http_error",
                    "message": str(detail),
                }
            }
        return JSONResponse(status_code=exc.status_code, content=payload)

    @application.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Request validation failed",
                    "details": exc.errors(),
                }
            },
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(
        _request: Request,
        _exc: Exception,
    ) -> JSONResponse:
        # Never leak stack traces or DB internals to clients.
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred",
                }
            },
        )

    application.include_router(api_router)
    return application


app = create_app()
