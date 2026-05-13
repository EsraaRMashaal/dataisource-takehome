"""
Module: app.services.alert_service

CRUD operations for AlertEvent and PollRun records.

Responsibilities:
    - Create and persist AlertEvent rows (with duplicate skipping via savepoints)
    - Create, update, and query PollRun records
    - Broadcast alert events through the event bus (never touches WS directly)
    - List, retrieve, update status, and bulk-delete alerts

No GDELT HTTP logic and no poll orchestration live here.
See poll_service for the complete poll cycle coordinator.
"""

import json
import logging
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import alert_repository as alert_repo
from app.db.repositories import poll_repository as poll_repo
from app.db.sqlite.base import AlertEvent, PollRun
from app.services import event_bus

logger = logging.getLogger(__name__)

_VALID_ALERT_STATUSES = frozenset({"detected", "notified", "duplicate", "failed"})


# ---------------------------------------------------------------------------
# Poll run lifecycle
# ---------------------------------------------------------------------------

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
    await poll_repo.insert_poll_run(db, poll_run)
    await db.commit()
    return poll_run


async def complete_poll_run(
    poll_run: PollRun,
    items_seen: int,
    alerts_created: int,
    db: AsyncSession,
) -> None:
    await _finish_poll_run(poll_run, "completed", items_seen, alerts_created, db)


async def fail_poll_run(poll_run: PollRun, error: str, db: AsyncSession) -> None:
    await _finish_poll_run(poll_run, "failed", 0, 0, db, error=error)


async def list_poll_runs(db: AsyncSession, limit: int = 50) -> list[PollRun]:
    return await poll_repo.list_poll_runs(db, limit=limit)


async def get_poll_run(run_id: str, db: AsyncSession) -> PollRun | None:
    return await poll_repo.get_poll_run_by_id(db, run_id)


# ---------------------------------------------------------------------------
# Alert creation
# ---------------------------------------------------------------------------

async def create_alerts(
    poll_run: PollRun,
    items: list[dict],
    db: AsyncSession,
) -> list[AlertEvent]:
    """
    Persist one AlertEvent per item, skipping duplicates.

    Uses savepoints (begin_nested) so a duplicate-key IntegrityError on one
    row only rolls back that savepoint — the outer transaction (and the
    poll_run object) stays intact.  A single commit at the end persists all
    successfully inserted alerts.
    """
    created: list[AlertEvent] = []

    for item in items:
        alert = _build_alert(poll_run.id, item)
        try:
            async with db.begin_nested():
                await alert_repo.insert_alert(db, alert)
        except IntegrityError:
            logger.warning("Duplicate alert skipped url='%s'", item.get("url"))
            continue
        except Exception:
            logger.exception("Failed persisting alert url='%s'", item.get("url"))
            continue

        created.append(alert)
        await _broadcast_alert(alert, item.get("matched_terms", []))

    if created:
        await db.commit()

    logger.info("Persisted %d new alert(s) for poll_run='%s'", len(created), poll_run.id)
    return created


# ---------------------------------------------------------------------------
# Alert queries
# ---------------------------------------------------------------------------

async def list_alerts(
    db: AsyncSession,
    limit: int | None = None,
    status: str | None = None,
) -> list[AlertEvent]:
    return await alert_repo.list_alerts(db, limit=limit, status=status)


async def get_alert(alert_id: str, db: AsyncSession) -> AlertEvent:
    alert = await alert_repo.get_alert_by_id(db, alert_id)
    if alert is None:
        raise ValueError(f"Alert '{alert_id}' not found")
    return alert


async def update_alert_status(
    alert_id: str,
    new_status: str,
    db: AsyncSession,
) -> AlertEvent:
    """Change the status of an existing alert. Raises ValueError on bad input."""
    if new_status not in _VALID_ALERT_STATUSES:
        raise ValueError(
            f"Invalid status '{new_status}'. Must be one of: {sorted(_VALID_ALERT_STATUSES)}"
        )
    alert = await get_alert(alert_id, db)
    notified_at = datetime.now(UTC) if new_status == "notified" else None
    await alert_repo.set_alert_status(db, alert_id, new_status, notified_at=notified_at)
    await db.commit()
    await db.refresh(alert)
    logger.info("Alert '%s' status → '%s'", alert_id, new_status)
    return alert


async def delete_all_alerts(db: AsyncSession) -> int:
    """Delete every AlertEvent row. Returns the number of rows removed."""
    count = await alert_repo.delete_all_alerts(db)
    await db.commit()
    logger.info("Deleted %d alert(s)", count)
    return count


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _build_alert(poll_run_id: str, item: dict) -> AlertEvent:
    return AlertEvent(
        id=str(uuid4()),
        poll_run_id=poll_run_id,
        source_name=item["source_name"],
        source_item_id=item.get("source_item_id"),
        article_url=item["url"],
        article_title=item["title"],
        published_at=item.get("published_at"),
        matched_terms_json=json.dumps(item.get("matched_terms", [])),
        payload_json=json.dumps(item.get("raw_payload", {})),
        alert_status="detected",
        detected_at=datetime.now(UTC),
    )


async def _broadcast_alert(alert: AlertEvent, matched_terms: list[str]) -> None:
    """Publish alert event through the event bus — no direct WS coupling."""
    await event_bus.publish("alerts", {
        "event": "alert.detected",
        "channel": "alerts",
        "alert_id": alert.id,
        "title": alert.article_title,
        "url": alert.article_url,
        "matched_terms": matched_terms,
        "detected_at": alert.detected_at.isoformat(),
    })


async def _finish_poll_run(
    poll_run: PollRun,
    status: str,
    items_seen: int,
    alerts_created: int,
    db: AsyncSession,
    *,
    error: str | None = None,
) -> None:
    await poll_repo.update_poll_run_fields(
        db,
        poll_run,
        run_status=status,
        completed_at=datetime.now(UTC),
        items_seen=items_seen,
        alerts_created=alerts_created,
        error_message=error,
    )
    await db.commit()
