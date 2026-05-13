"""
Package: app.api.v1

Responsibility:
    Assembles all v1 routers into a single APIRouter.
    server.py imports only `router` from here — it never names
    individual endpoint modules.

Why it exists:
    Version isolation: adding v2 means creating app.api.v2 without
    touching v1 or server.py.
"""

from fastapi import APIRouter

from app.api.v1.endpoints.documents import router as documents_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.news import router as news_router
from app.api.v1.endpoints.tables import router as tables_router
from app.api.v1.endpoints.websocket import router as ws_router

router = APIRouter()

router.include_router(health_router)
router.include_router(documents_router)
router.include_router(news_router)
router.include_router(tables_router)
router.include_router(ws_router)