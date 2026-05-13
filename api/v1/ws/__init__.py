"""
Package: app.api.v1.ws

Responsibility:
    WebSocket infrastructure for v1: connection lifecycle management
    and message broadcasting utilities.

Why it exists:
    Isolating WebSocket plumbing from the endpoint handler keeps the
    endpoint thin and makes connection management independently testable.

Architecture fit:
    The websocket endpoint module imports the ConnectionManager from here.
    Services that need to push events (alert_service, news_processor) call
    into the manager without needing to know about HTTP or WebSocket internals.
"""
