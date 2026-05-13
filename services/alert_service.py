"""
Module: app.services.alert_service

Responsibility:
    Create, persist, retrieve, and broadcast monitoring alerts.

    This module:
        - orchestrates complete poll cycles (run_poll)
        - creates and deduplicates AlertEvent rows
        - broadcasts websocket events
        - exposes list / get / delete query helpers

    No upstream GDELT HTTP logic lives here.
"""

import json
import logging
import time
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ws.connection_manager import manager
from app.db.sqlite.base import AlertEvent, PollRun

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_poll(db: AsyncSession) -> list[AlertEvent]:
    """
    Orchestrate a complete GDELT poll cycle.

    Creates the poll run record, fetches articles, persists alerts,
    and marks the run complete (or failed).  All error handling is
    centralised here so endpoints stay thin.
    """
    from app.services import gdelt_service  # local import avoids circular dep

    poll_run = await create_poll_run("configured_monitor_topics", db)
    logger.info("Poll run started id='%s'", poll_run.id)
    started = time.monotonic()

    try:
        items = await gdelt_service.poll()
        alerts = await create_alerts(poll_run, items, db)
        await _finish_poll_run(poll_run, "completed", len(items), len(alerts), db)
        logger.info(
            "Poll run completed id='%s' items=%d alerts=%d elapsed=%.2fs",
            poll_run.id, len(items), len(alerts), time.monotonic() - started,
        )
        return alerts
    except Exception as exc:
        await _finish_poll_run(poll_run, "failed", 0, 0, db, error=str(exc))
        logger.error("Poll run failed id='%s' error=%s", poll_run.id, exc)
        raise


async def create_poll_run(query_text: str, db: AsyncSession) -> PollRun:
    poll_run = PollRun(
        id=str(uuid4()),
        source_name="gdelt",
        query_text=query_text,
        run_status="started",
        started_at=datetime.now(UTC),
        items_seen=0,
        alerts_created=0,
    )
    db.add(poll_run)
    await db.commit()
    return poll_run


async def create_alerts(
    poll_run: PollRun,
    items: list[dict],
    db: AsyncSession,
) -> list[AlertEvent]:
    """
    Persist one AlertEvent per item, skipping duplicates.

    Uses savepoints (begin_nested) so a duplicate-key error on one row
    only rolls back that savepoint — the outer transaction (and the
    poll_run object) stays intact.  A single commit at the end persists
    all successfully inserted alerts.
    """
    created: list[AlertEvent] = []

    for item in items:
        alert = _build_alert(poll_run.id, item)
        try:
            async with db.begin_nested():
                db.add(alert)
        except IntegrityError:
            logger.warning("Duplicate alert skipped url='%s'", item["url"])
            continue
        except Exception:
            logger.exception("Failed persisting alert url='%s'", item["url"])
            continue

        created.append(alert)
        await _try_broadcast(alert, item["matched_terms"])

    if created:
        await db.commit()

    logger.info(
        "Persisted %d new alert(s) for poll_run='%s'", len(created), poll_run.id
    )
    return created


async def list_alerts(
    db: AsyncSession,
    limit: int | None = None,
) -> list[AlertEvent]:
    stmt = select(AlertEvent).order_by(AlertEvent.detected_at.desc())
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_alert(alert_id: str, db: AsyncSession) -> AlertEvent:
    result = await db.execute(select(AlertEvent).where(AlertEvent.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise ValueError(f"Alert '{alert_id}' not found")
    return alert


async def delete_all_alerts(db: AsyncSession) -> int:
    """Delete every AlertEvent row. Returns the number of rows removed."""
    count = (await db.execute(select(func.count()).select_from(AlertEvent))).scalar_one()
    await db.execute(delete(AlertEvent))
    await db.commit()
    logger.info("Deleted %d alert(s)", count)
    return count


# Thin wrappers kept for any callers that use them directly
async def complete_poll_run(
    poll_run: PollRun, items_seen: int, alerts_created: int, db: AsyncSession
) -> None:
    await _finish_poll_run(poll_run, "completed", items_seen, alerts_created, db)


async def fail_poll_run(poll_run: PollRun, error: str, db: AsyncSession) -> None:
    await _finish_poll_run(poll_run, "failed", 0, 0, db, error=error)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _build_alert(poll_run_id: str, item: dict) -> AlertEvent:
    return AlertEvent(
        id=str(uuid4()),
        poll_run_id=poll_run_id,
        source_name=item["source_name"],
        source_item_id=item["source_item_id"],
        article_url=item["url"],
        article_title=item["title"],
        published_at=item["published_at"],
        matched_terms_json=json.dumps(item["matched_terms"]),
        payload_json=json.dumps(item["raw_payload"]),
        alert_status="detected",
        detected_at=datetime.now(UTC),
    )


async def _try_broadcast(alert: AlertEvent, matched_terms: list[str]) -> None:
    """Fire-and-forget WebSocket broadcast; logs on failure, never raises."""
    try:
        await manager.broadcast(
            {
                "event": "alert.detected",
                "channel": "alerts",
                "alert_id": alert.id,
                "title": alert.article_title,
                "url": alert.article_url,
                "matched_terms": matched_terms,
                "detected_at": alert.detected_at.isoformat(),
            },
            "alerts",
        )
    except Exception:
        logger.exception("WS broadcast failed alert_id='%s'", alert.id)


async def _finish_poll_run(
    poll_run: PollRun,
    status: str,
    items_seen: int,
    alerts_created: int,
    db: AsyncSession,
    *,
    error: str | None = None,
) -> None:
    poll_run.run_status = status
    poll_run.completed_at = datetime.now(UTC)
    poll_run.items_seen = items_seen
    poll_run.alerts_created = alerts_created
    if error is not None:
        poll_run.error_message = error
    await db.commit()
