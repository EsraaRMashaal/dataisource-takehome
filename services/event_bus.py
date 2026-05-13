"""
Module: app.services.event_bus

In-process async pub/sub bus.  Services publish events by channel;
the WebSocket connection manager (and any future subscriber) registers
handlers called for every matching publish.

Channels used in this project:
    "documents"  — document lifecycle events (progress, completed, deleted)
    "alerts"     — monitoring alert events (detected, updated)
    "records"    — generic new-record notifications

Why it exists:
    Keeps the service layer decoupled from the WebSocket transport layer.
    Services call publish(); they never import WebSocket classes directly.

Architecture fit:
    Module-level singleton (_subs dict).  subscribe() is called once at
    startup by the connection manager.  publish() is called by
    document_service and alert_service during normal request handling.
    All handlers run concurrently via asyncio.gather.
"""

import asyncio
from collections import defaultdict
from typing import Awaitable, Callable

from app.logger import get_logger

logger = get_logger(__name__)

Handler = Callable[[dict], Awaitable[None]]

_subs: dict[str, list[Handler]] = defaultdict(list)


def subscribe(channel: str, handler: Handler) -> None:
    """Register *handler* to be called whenever *channel* receives an event."""
    _subs[channel].append(handler)
    logger.debug("Subscribed handler=%s to channel=%s", handler.__qualname__, channel)


def unsubscribe(channel: str, handler: Handler) -> None:
    """Remove *handler* from *channel*.  Silent no-op if not registered."""
    try:
        _subs[channel].remove(handler)
        logger.debug("Unsubscribed handler=%s from channel=%s", handler.__qualname__, channel)
    except ValueError:
        pass


async def publish(channel: str, event: dict) -> None:
    """
    Deliver *event* to every handler subscribed to *channel*.

    Handler exceptions are caught and logged individually so one broken
    subscriber cannot block delivery to the rest.
    """
    handlers = list(_subs.get(channel, []))
    if not handlers:
        return

    results = await asyncio.gather(*[h(event) for h in handlers], return_exceptions=True)

    for handler, result in zip(handlers, results):
        if isinstance(result, Exception):
            logger.error(
                "Event handler error — channel=%s event=%s handler=%s error=%r",
                channel,
                event.get("event", "?"),
                handler.__qualname__,
                result,
            )


async def publish_many(channel: str, events: list[dict]) -> None:
    """Publish a batch of events to *channel* sequentially."""
    for event in events:
        await publish(channel, event)


def active_channels() -> list[str]:
    """Return the names of channels that have at least one subscriber."""
    return [ch for ch, handlers in _subs.items() if handlers]
