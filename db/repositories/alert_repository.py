"""
Module: app.db.repositories.alert_repository

All database operations for AlertEvent records.

Why it exists:
    Repository pattern — callers express intent (list_alerts, get_alert_by_id)
    rather than constructing ORM queries inline.  Services own transaction
    boundaries (commit/rollback); this module owns query construction only.

Architecture fit:
    Called only by app.services.alert_service.
    Every function accepts an AsyncSession injected by the caller.
"""

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.sqlite.base import AlertEvent


async def insert_alert(session: AsyncSession, alert: AlertEvent) -> None:
    """Stage *alert* for insertion.  The caller controls flushing and savepoints."""
    session.add(alert)


async def get_alert_by_id(
    session: AsyncSession,
    alert_id: str,
) -> AlertEvent | None:
    result = await session.execute(
        select(AlertEvent).where(AlertEvent.id == alert_id)
    )
    return result.scalar_one_or_none()


async def list_alerts(
    session: AsyncSession,
    limit: int | None = None,
    status: str | None = None,
) -> list[AlertEvent]:
    stmt = select(AlertEvent).order_by(AlertEvent.detected_at.desc())
    if status is not None:
        stmt = stmt.where(AlertEvent.alert_status == status)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def set_alert_status(
    session: AsyncSession,
    alert_id: str,
    new_status: str,
    notified_at: datetime | None = None,
) -> None:
    """Update the alert_status (and optionally notified_at) for a single alert."""
    values: dict = {"alert_status": new_status}
    if notified_at is not None:
        values["notified_at"] = notified_at
    await session.execute(
        update(AlertEvent)
        .where(AlertEvent.id == alert_id)
        .values(**values)
    )


async def count_alerts(session: AsyncSession) -> int:
    result = await session.execute(select(func.count()).select_from(AlertEvent))
    return result.scalar_one()


async def delete_all_alerts(session: AsyncSession) -> int:
    """Delete every AlertEvent row and return the number removed."""
    count = await count_alerts(session)
    await session.execute(delete(AlertEvent))
    return count
