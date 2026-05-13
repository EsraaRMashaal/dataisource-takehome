"""
Module: app.db.repositories.ws_message_repository

Insert operations for the websocket_messages audit log.

Why it exists:
    Every event broadcast through the WebSocket manager is persisted
    here for auditability, replay analysis, and the DB Explorer view.

Architecture fit:
    Called only by ConnectionManager._persist_message().
    Uses a caller-supplied session so transaction control stays outside.
"""

import json
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.sqlite.base import WebsocketMessage


async def insert_message(
    session: AsyncSession,
    *,
    channel_name: str,
    event_name: str,
    message_json: str,
    correlation_id: str | None = None,
) -> None:
    """Persist one broadcast event to the websocket_messages table."""
    session.add(WebsocketMessage(
        channel_name=channel_name,
        event_name=event_name,
        correlation_id=correlation_id,
        message_json=message_json,
        emitted_at=datetime.now(UTC),
    ))
    await session.commit()


def extract_correlation_id(event: dict) -> str | None:
    """
    Pull a correlation identifier from whichever key the event uses.
    Returns the first non-None value found, or None.
    """
    for key in ("doc_id", "alert_id", "id", "correlation_id"):
        val = event.get(key)
        if val is not None:
            return str(val)
    return None


def serialize_event(event: dict) -> str:
    return json.dumps(event, default=str)
