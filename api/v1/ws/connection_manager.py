"""
Module: app.api.v1.ws.connection_manager

Responsibility:
    Tracks active WebSocket connections grouped by channel and provides
    broadcast fan-out.  Bridges the internal event bus to connected clients.

    Channels:
        "documents"  — document processing progress & completion
        "alerts"     — monitoring / GDELT alert notifications
        "records"    — newly stored records (any table)
        "all"        — receives every event from every channel

Why it exists:
    FastAPI has no built-in connection registry or fan-out mechanism.
    Centralising it here keeps endpoint and service code free of transport
    concerns.  The module-level `manager` singleton is the single point of
    truth for which clients are currently connected.

Architecture fit:
    websocket.py endpoints call connect() / disconnect().
    server.py lifespan calls subscribe_to_event_bus() once at startup so
    that internal service events flow through to WS clients automatically.
"""

import json
from collections import defaultdict

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.logger import get_logger

logger = get_logger(__name__)

VALID_CHANNELS: frozenset[str] = frozenset({"documents", "alerts", "records"})


class ConnectionManager:
    def __init__(self) -> None:
        # channel -> set of active WebSocket connections
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self, ws: WebSocket, channel: str) -> None:
        await ws.accept()
        self._channels[channel].add(ws)
        await self._send(ws, {"event": "connected", "channel": channel})
        logger.info("WS client connected  channel=%s  total=%d",
                    channel, self._channel_count(channel))

    def disconnect(self, ws: WebSocket, channel: str) -> None:
        self._channels[channel].discard(ws)
        logger.info("WS client disconnected  channel=%s  remaining=%d",
                    channel, self._channel_count(channel))

    # ------------------------------------------------------------------
    # Broadcasting
    # ------------------------------------------------------------------

    async def broadcast(self, event: dict, channel: str) -> None:
        """
        Send *event* to every client subscribed to *channel*, and also to
        every client on the aggregate "all" channel.  Dead connections are
        pruned silently.
        """
        payload = json.dumps(event, default=str)
        targets = (
            list(self._channels.get(channel, set()))
            + list(self._channels.get("all", set()))
        )
        dead: list[tuple[WebSocket, str]] = []

        for ws in targets:
            ch = "all" if ws in self._channels.get("all", set()) and ws not in self._channels.get(channel, set()) else channel
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(payload)
            except Exception:
                dead.append((ws, ch))

        for ws, ch in dead:
            self.disconnect(ws, ch)

    # ------------------------------------------------------------------
    # Event bus wiring  (called once at startup)
    # ------------------------------------------------------------------

    def subscribe_to_event_bus(self) -> None:
        from app.services.event_bus import subscribe
        subscribe("documents", self._on_documents)
        subscribe("alerts",    self._on_alerts)
        subscribe("records",   self._on_records)
        logger.info("ConnectionManager subscribed to event bus channels: documents, alerts, records")

    async def _on_documents(self, event: dict) -> None:
        await self.broadcast(event, "documents")

    async def _on_alerts(self, event: dict) -> None:
        await self.broadcast(event, "alerts")

    async def _on_records(self, event: dict) -> None:
        await self.broadcast(event, "records")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _channel_count(self, channel: str) -> int:
        return len(self._channels.get(channel, set()))

    async def _send(self, ws: WebSocket, data: dict) -> None:
        try:
            await ws.send_text(json.dumps(data))
        except Exception:
            pass


# Module-level singleton imported by endpoints and server.py
manager = ConnectionManager()
