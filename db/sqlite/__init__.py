"""
Package: app.db.sqlite

Responsibility:
    SQLite-specific configuration, pragmas, and migration utilities.
    Sets WAL journal mode and foreign-key enforcement pragmas on each
    new connection. May also house Alembic environment setup if
    migration tooling is introduced.

Why it exists:
    SQLite requires certain pragmas (PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;) to behave correctly under concurrent
    reads and to enforce relational integrity. Centralising this here
    keeps database.py generic and avoids pragma drift across connection
    points.

Architecture fit:
    Called by database.py after the engine is created — no circular import
    because this module does not import from database.py.
"""

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine


def apply_pragmas(engine: AsyncEngine) -> None:
    """Register SQLite pragmas on every new raw DBAPI connection.

    Must be called once after the async engine is created (database.py).
    Works on the underlying sync engine because DBAPI connect events
    fire at the synchronous driver level before async wrapping.
    """

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        # Enforce declared FOREIGN KEY constraints (OFF by default in SQLite).
        cursor.execute("PRAGMA foreign_keys=ON")
        # WAL mode allows concurrent readers alongside a single writer,
        # improving throughput for mixed read/write workloads.
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()
