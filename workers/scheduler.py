"""
Module: app.workers.scheduler

Responsibility:
    Configures and manages an asyncio-based background task that
    triggers polling_worker on the configured interval.
    Handles graceful start and shutdown integrated with the FastAPI
    lifespan hook.

Why it exists:
    The scheduler is the clock that drives the monitoring service.
    Keeping scheduling configuration here avoids scattering interval
    logic across the codebase.

Architecture fit:
    Started in server.py lifespan on startup, shut down on teardown.
    Reads the poll interval from app.settings. Delegates work to
    polling_worker.run_poll_cycle().
"""

import asyncio
import logging

from app.settings import settings
from app.workers.polling_worker import run_poll_cycle

logger = logging.getLogger(__name__)

_task: asyncio.Task | None = None


async def _loop() -> None:
    """Run poll cycles on the configured interval until cancelled."""
    logger.info(
        "Background scheduler started — interval=%ds", settings.poll_interval_seconds
    )
    while True:
        await run_poll_cycle()
        await asyncio.sleep(settings.poll_interval_seconds)


def start() -> None:
    """Schedule the polling loop as an asyncio background task."""
    global _task
    if _task is not None and not _task.done():
        logger.warning("Scheduler already running — ignoring start()")
        return
    _task = asyncio.ensure_future(_loop())
    logger.info("Polling scheduler task created")


async def stop() -> None:
    """Cancel the polling loop and wait for it to finish cleanly."""
    global _task
    if _task is None or _task.done():
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    logger.info("Polling scheduler stopped")
