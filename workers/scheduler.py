"""
Module: app.workers.scheduler

Responsibility:
    Configures and manages the APScheduler (or asyncio-based) job
    scheduler that triggers polling_worker on the configured interval.
    Handles graceful start and shutdown integrated with the FastAPI
    lifespan hook.

Why it exists:
    The scheduler is the clock that drives the monitoring service.
    Keeping scheduling configuration here (interval, jitter, misfire
    handling) avoids scattering cron-like logic across the codebase.

Architecture fit:
    Started in server.py lifespan on startup, shut down on teardown.
    Reads the poll interval from app.settings. Registers the
    polling_worker coroutine as the job target. In production,
    this layer would be replaced by an external trigger (EventBridge,
    SQS, or a dedicated scheduler container).
"""
