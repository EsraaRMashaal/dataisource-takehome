"""
Package: app.api

Responsibility:
    Namespace package for all API versions.
    Provides a clean boundary between transport-layer concerns
    (routing, request parsing, response serialisation) and
    the application's service and persistence layers.

Why it exists:
    Grouping all API code under a single package makes it
    straightforward to add future versions (v2, v3) without
    touching service or database code.

Architecture fit:
    Sits between server.py (which mounts routers) and
    app.api.v1 (which defines the concrete routes).
"""
