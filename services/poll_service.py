"""
Module: app.services.poll_service

Orchestrates a complete GDELT poll cycle end-to-end.

Responsibilities:
    - Create a PollRun record before fetching
    - Delegate HTTP fetching to gdelt_service
    - Delegate persistence/deduplication to alert_service
    - Mark the run completed or failed
    - Log timing and outcome

This is the coordinator that polling_worker.py calls on each scheduled tick
and that the /news/poll endpoint calls for on-demand polling.

Why it exists:
    Separating orchestration from CRUD (alert_service) and from HTTP
    (gdelt_service) keeps each module testable in isolation and makes the
    polling cycle easy to invoke from multiple callers (scheduler, REST,
    CLI) with identical behaviour.
"""

import logging
import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.sqlite.base import AlertEvent
from app.services import alert_service, gdelt_service

logger = logging.getLogger(__name__)


async def run_poll(db: AsyncSession) -> list[AlertEvent]:
    """
    Run a complete GDELT poll cycle.

    Steps:
        1. Create a PollRun record (status = "started")
        2. Fetch articles from GDELT via gdelt_service.poll()
        3. Persist new AlertEvent rows via alert_service.create_alerts()
        4. Mark the PollRun "completed" (or "failed" on exception)

    Returns:
        List of newly created AlertEvent objects.

    Raises:
        Re-raises any exception from gdelt_service after recording the
        failure in the PollRun row.
    """
    poll_run = await alert_service.create_poll_run("configured_monitor_topics", db)
    logger.info("Poll run started id='%s'", poll_run.id)
    started = time.monotonic()

    try:
        items = await gdelt_service.poll()
        alerts = await alert_service.create_alerts(poll_run, items, db)
        await alert_service.complete_poll_run(poll_run, len(items), len(alerts), db)
        elapsed = time.monotonic() - started
        logger.info(
            "Poll run completed id='%s' items=%d alerts=%d elapsed=%.2fs",
            poll_run.id, len(items), len(alerts), elapsed,
        )
        return alerts

    except Exception as exc:
        await alert_service.fail_poll_run(poll_run, str(exc), db)
        logger.error("Poll run failed id='%s' error=%s", poll_run.id, exc)
        raise
