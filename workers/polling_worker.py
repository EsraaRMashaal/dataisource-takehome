"""
Module: app.workers.polling_worker

Responsibility:
    Implements the async coroutine that executes a single GDELT
    polling cycle on each scheduled tick. Calls poll_service to
    run the full fetch → deduplicate → persist pipeline and logs
    the outcome (items fetched, new alerts created, errors).

Why it exists:
    Separating the worker coroutine from the scheduler lets the
    polling logic be invoked both on schedule (via scheduler.py)
    and on demand (via the REST trigger endpoint) with identical
    behaviour.

Architecture fit:
    Instantiated and managed by scheduler.py. Calls
    app.services.poll_service.run_poll(). Structured log
    output here feeds monitoring dashboards and alerting rules.
"""

import logging

from app.db.database import AsyncSessionLocal
from app.services import poll_service

logger = logging.getLogger(__name__)


async def run_poll_cycle() -> None:
    """Execute one GDELT poll cycle with its own DB session."""
    logger.info("Scheduled poll cycle starting")
    try:
        async with AsyncSessionLocal() as db:
            alerts = await poll_service.run_poll(db)
        logger.info("Scheduled poll cycle finished — new_alerts=%d", len(alerts))
    except Exception as exc:
        logger.error("Scheduled poll cycle failed: %s", exc)
