"""
Shared test fixtures.

Strategy:
- Each test gets a fresh file-based SQLite database (temp file) for full isolation.
- ASGITransport is used so the ASGI lifespan is NOT triggered, which means we must
  create the schema ourselves in the `engine` fixture.
- `get_db` is overridden via dependency_overrides so every route handler uses
  the test session factory pointing at the temp database.
- Tests that need to seed rows directly take the `engine` fixture and open their own
  short-lived session before issuing HTTP requests.
"""

import os
import tempfile

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.database import Base, get_db
from app.server import app


@pytest_asyncio.fixture
async def engine():
    """Per-test async engine backed by a temporary SQLite file."""
    fd, path = tempfile.mkstemp(suffix=".test.db")
    os.close(fd)

    eng = create_async_engine(f"sqlite+aiosqlite:///{path}", echo=False)

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield eng

    await eng.dispose()
    try:
        os.unlink(path)
    except OSError:
        pass


@pytest_asyncio.fixture
async def async_client(engine):
    """HTTP test client with get_db overridden to use the test engine."""
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine, expire_on_commit=False
    )

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()
