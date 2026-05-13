"""
Module: app.api.v1.endpoints.websocket

Responsibility:
    Exposes two WebSocket endpoints that push real-time events to
    connected browser or API clients.

    Endpoints:
        WS /api/v1/ws/events              — all channels aggregated
        WS /api/v1/ws/events/{channel}    — single channel subscription
                                            (documents | alerts | records)

    Event envelope (JSON):
        {
            "event":   "<noun>.<verb>",   // e.g. "document.completed"
            "channel": "<channel>",       // source channel
            ...payload fields...
        }

    Document events:
        document.progress   {doc_id, stage, pct, message}
        document.completed  {doc_id, document_type, keywords, entities, processed_at}
        document.failed     {doc_id, error}
        document.deleted    {doc_id, timestamp}

    Alert events:
        alert.detected      {alert_id, title, url, matched_terms, detected_at}

    Record events:
        record.created      {table, id, timestamp}

Why it exists:
    REST polling is inefficient for real-time updates.  WebSocket lets
    the UI (or any client) receive push notifications instantly without
    polling /documents/{id} in a loop.

Architecture fit:
    Delegates all connection tracking and fan-out to ConnectionManager.
    No business logic lives here — endpoints are pure transport glue.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.v1.ws.connection_manager import VALID_CHANNELS, manager

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/events")
async def ws_all_channels(websocket: WebSocket) -> None:
    """Subscribe to every channel (documents + alerts + records)."""
    await manager.connect(websocket, "all")
    try:
        while True:
            text = await websocket.receive_text()
            await websocket.send_json({
                "type": "text",
                "message": f"Received: {text}"
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket, "all")


@router.websocket("/ws/events/{channel}")
async def ws_single_channel(websocket: WebSocket, channel: str) -> None:
    """
    Subscribe to a single named channel.
    Closes with code 4001 if the channel name is not recognised.
    """
    if channel not in VALID_CHANNELS:
        await websocket.accept()
        await websocket.close(
            code=4001,
            reason=f"Unknown channel '{channel}'. Valid channels: {sorted(VALID_CHANNELS)}",
        )
        return

    await manager.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)
