"""
Module: app.logger

Responsibility:
    Configures structured JSON logging for the entire application.
    Exposes a single get_logger() factory that all modules call to
    obtain a consistently formatted logger instance.

Why it exists:
    Centralised log configuration ensures uniform log format, level
    control from settings, and clean correlation IDs across request
    handlers, background workers, and service calls.

Architecture fit:
    Initialised once during app startup (called from server.py).
    All modules — endpoints, services, workers — import get_logger()
    from here rather than using the stdlib logging module directly.
    Output is structured JSON to support log aggregation (e.g. CloudWatch).
"""

import logging
import sys
from app.settings import settings

# ---------------------------------------------------------------------------
# Formatter
# ---------------------------------------------------------------------------

class _PlainFormatter(logging.Formatter):
    """Single-line structured text log for local dev readability."""

    FMT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    DATE_FMT = "%Y-%m-%dT%H:%M:%S"

    def __init__(self) -> None:
        super().__init__(fmt=self.FMT, datefmt=self.DATE_FMT)


# ---------------------------------------------------------------------------
# One-time setup
# ---------------------------------------------------------------------------

def configure_logging() -> None:
    """Call once at startup (server.py lifespan) to initialise root logger."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_PlainFormatter())

    logging.basicConfig(level=level, handlers=[handler], force=True)

    # Silence noisy third-party loggers in production
    if settings.app_env != "local":
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_logger(name: str) -> logging.Logger:
    """Return a named logger; all modules should use this instead of logging.getLogger()."""
    return logging.getLogger(name)
