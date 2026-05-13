"""
Module: app.db.database

Responsibility:
    Creates and owns the SQLAlchemy async engine, session factory, and
    declarative base. Exposes get_db() as a FastAPI dependency that
    opens a session per request and closes it when the response is sent.

Why it exists:
    A single engine instance avoids connection pool exhaustion and
    ensures all parts of the application share the same SQLite file.

Architecture fit:
    Imported by all repository modules to obtain sessions.
    Imported by server.py to initialise the schema on startup.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.settings import settings
from app.db.sqlite import apply_pragmas

# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

engine = create_async_engine(
    settings.database_url,
    # echo=True logs every SQL statement to stdout — useful during development
    # to verify queries, but should be set to False in production to avoid
    # leaking sensitive data and flooding log aggregators.
    echo=settings.app_env == "local",
)

# Register WAL mode and foreign-key enforcement on every new connection.
apply_pragmas(engine)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

# expire_on_commit=False keeps ORM objects usable after the session commits,
# which is necessary for async code where lazy-loading is not available.
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ---------------------------------------------------------------------------
# Declarative base — shared by all ORM models
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass

# ---------------------------------------------------------------------------
# FastAPI dependency
#
#   Request
#     ↓
#   Open DB   — session is created before the route handler runs
#     ↓
#   Use DB    — route handler (or repository) executes queries
#     ↓
#   Close DB  — async_sessionmaker context manager closes on exit
#
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
