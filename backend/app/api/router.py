from fastapi import APIRouter

from app.api.routes import decisions, health, matches

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(matches.router)
api_router.include_router(decisions.router)
