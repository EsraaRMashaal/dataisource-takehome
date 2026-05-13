"""
Package: app.api.v1.models

Responsibility:
    Contains Pydantic models that define the public API contract
    for v1: request bodies, response shapes, and shared field types.

Why it exists:
    Keeping API models in their own package prevents coupling between
    the transport layer and the ORM/DB layer. SQLAlchemy models live
    in app.db; Pydantic API models live here.

Architecture fit:
    Imported by endpoint modules for request validation and response
    serialisation. Never imported by services or db modules, which
    use their own internal data structures.
"""
