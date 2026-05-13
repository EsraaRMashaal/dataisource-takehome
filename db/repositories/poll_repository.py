"""
Module: app.db.repositories.poll_repository

All database operations for PollRun records.

Why it exists:
    Repository pattern — hides ORM query construction behind typed intent-
    expressing functions.  Transaction boundaries (commit/rollback) are
    owned by the service layer, not here.

Architecture fit:
    Called only by app.services.alert_service.
    Every function accepts an AsyncSession injected by the caller.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.sqlite.base import PollRun


async def insert_poll_run(session: AsyncSession, poll_run: PollRun) -> None:
    """Stage *poll_run* for insertion.  The caller is responsible for commit."""
    session.add(poll_run)


async def get_poll_run_by_id(
    session: AsyncSession,
    run_id: str,
) -> PollRun | None:
    result = await session.execute(
        select(PollRun).where(PollRun.id == run_id)
    )
    return result.scalar_one_or_none()


async def list_poll_runs(
    session: AsyncSession,
    limit: int = 50,
) -> list[PollRun]:
    result = await session.execute(
        select(PollRun).order_by(PollRun.started_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def update_poll_run_fields(
    session: AsyncSession,
    poll_run: PollRun,
    *,
    run_status: str,
    completed_at: datetime,
    items_seen: int,
    alerts_created: int,
    error_message: str | None = None,
) -> None:
    """
    Apply terminal fields to an in-session PollRun object.

    Uses direct attribute mutation (not a bulk UPDATE) so SQLAlchemy's
    unit-of-work picks up the change on the next flush/commit.
    The caller must call db.commit() afterwards.
    """
    poll_run.run_status     = run_status
    poll_run.completed_at   = completed_at
    poll_run.items_seen     = items_seen
    poll_run.alerts_created = alerts_created
    if error_message is not None:
        poll_run.error_message = error_message
