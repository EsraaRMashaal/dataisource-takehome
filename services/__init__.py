"""
Package: app.services

Business-logic layer.  Each module owns one cohesive domain:

    document_service    — document ingestion, validation, extraction orchestration
    extraction_service  — NLP extraction pipeline (type, keywords, entities)
    extraction_engine   — spaCy pattern matchers (consumed by extraction_service)
    extraction_models   — Pydantic result types for the extraction pipeline
    alert_service       — AlertEvent / PollRun CRUD and event broadcasting
    poll_service        — Complete GDELT poll cycle coordinator
    gdelt_service       — GDELT HTTP client (fetch, normalize, retry)
    event_bus           — In-process async pub/sub bus

Architecture contract:
    Services sit between app.api.v1.endpoints and app.db.repositories.
    They accept typed inputs, apply domain logic, call repositories for
    persistence, and return typed outputs.

    Services MUST NOT import from app.api.*.
    Cross-service communication goes through event_bus, not direct calls
    to WebSocket or HTTP transport objects.
"""
