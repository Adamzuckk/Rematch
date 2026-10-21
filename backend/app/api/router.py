from fastapi import APIRouter, Depends

from app.api.deps import require_api_auth
from app.api.routes import decisions, health, matches

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_api_auth)])
api_router.include_router(health.router)
api_router.include_router(matches.router)
api_router.include_router(decisions.router)
