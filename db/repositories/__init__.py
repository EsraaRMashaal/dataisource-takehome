"""
Package: app.db.repositories

Responsibility:
    Repository modules, one per aggregate root (document, keyword,
    entity, alert_event, poll_run). Each module exposes typed CRUD
    and query functions that hide SQLAlchemy session handling from
    the service layer.

Why it exists:
    The repository pattern decouples service logic from ORM details.
    Services express intent (get_alerts_by_severity) rather than
    constructing queries inline, making both sides unit-testable
    with simple stubs.

Architecture fit:
    Called only by app.services.*. Each function accepts a Session
    argument injected by the caller, enabling transaction control
    at the service level rather than inside the repository.

    Repository modules:
        document_repository.py  — document records, keywords, entities, aggregate counts
        alert_repository.py     — alert events, status updates, bulk delete
        poll_repository.py      — poll run records, status updates
"""
