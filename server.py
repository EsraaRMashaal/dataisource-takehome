"""
Module: app.server

Responsibility:
    Constructs and configures the FastAPI application instance.
    Registers all versioned routers, middleware, lifespan handlers,
    and exception handlers in one authoritative place.

Why it exists:
    Centralising app creation here (the "app factory" pattern) keeps
    server wiring separate from business logic and makes the app
    testable without starting a real server process.

Architecture fit:
    - Imported by the ASGI entrypoint (e.g. uvicorn app.server:app).
    - Mounts api/v1 router after importing from app.api.v1.
    - Registers lifespan hooks that start/stop background workers
      defined in app.workers.
    - Applies settings from app.settings and structured logging
      configured in app.logger.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.api.v1.ws.connection_manager import manager as ws_manager
from app.ui import router as ui_router
from app.db.database import Base, engine
from app.logger import configure_logging, get_logger
from app.settings import settings
# Import models so SQLAlchemy registers them on Base.metadata before create_all
import app.db.sqlite.base  # noqa: F401

configure_logging()
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────

    # Ensure the data directory exists before SQLite tries to create the file.
    # Critical for local runs outside Docker where /app/data/ may not exist.
    db_dir = Path(settings.sqlite_db_path).parent
    db_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Database directory ready: %s", db_dir)

    logger.info("Creating database tables")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    ws_manager.subscribe_to_event_bus()

    # TODO: start background polling scheduler (app.workers.scheduler)

    logger.info("Application ready — env=%s", settings.app_env)
    yield

    # ── Shutdown ─────────────────────────────────────────────────────────
    # TODO: stop background polling scheduler

    await engine.dispose()
    logger.info("Database engine disposed — shutdown complete")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DataISource Backend Service",
    description="Document ingestion, entity extraction, and GDELT monitoring API.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(v1_router, prefix="/api/v1")
app.include_router(ui_router)
