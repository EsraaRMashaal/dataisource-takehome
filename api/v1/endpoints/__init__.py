"""
Package: app.api.v1.endpoints

Responsibility:
    Contains one module per logical resource group.
    Each module defines an APIRouter with route handlers for that resource.

Why it exists:
    Splitting endpoints by resource (health, documents, news, websocket)
    keeps files small, makes code review easier, and allows independent
    development of each resource area.

Architecture fit:
    Routers defined here are collected by app.api.v1 and mounted
    onto the main FastAPI app. Handlers call into app.services.*
    and never access the database directly.
"""
