"""
Module: app.services.event_bus

Responsibility:
    In-process async pub/sub bus.  Services publish events by channel;
    the WebSocket connection manager (and any future subscriber) registers
    handlers that are called for every matching publish.

    Channels used in this project:
        "documents"  — document lifecycle events (progress, completed, deleted)
        "alerts"     — monitoring alert events (detected, updated)
        "records"    — generic new-record notifications

Why it exists:
    Keeps the service layer decoupled from the WebSocket transport layer.
    Services call publish(); they never import WebSocket classes directly.

Architecture fit:
    Module-level singleton (_subs dict).  subscribe() is called once at
    startup (server.py lifespan) by the connection manager.  publish() is
    called by document_service and alert_service during normal request
    handling.  All handlers run concurrently via asyncio.gather.
"""

import asyncio
from collections import defaultdict
from typing import Awaitable, Callable

Handler = Callable[[dict], Awaitable[None]]

_subs: dict[str, list[Handler]] = defaultdict(list)


def subscribe(channel: str, handler: Handler) -> None:
    """Register *handler* to be called whenever *channel* receives an event."""
    _subs[channel].append(handler)


def unsubscribe(channel: str, handler: Handler) -> None:
    try:
        _subs[channel].remove(handler)
    except ValueError:
        pass


async def publish(channel: str, event: dict) -> None:
    """
    Deliver *event* to every handler subscribed to *channel*.
    Errors in individual handlers are swallowed so one bad subscriber
    cannot block delivery to the rest.
    """
    handlers = list(_subs.get(channel, []))
    if not handlers:
        return
    results = await asyncio.gather(*[h(event) for h in handlers], return_exceptions=True)
    for r in results:
        if isinstance(r, Exception):
            # Don't let a broken handler crash the caller
            pass
