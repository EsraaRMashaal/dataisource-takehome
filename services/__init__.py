"""
Package: app.services

Responsibility:
    Business logic layer. Each module encapsulates one coherent domain
    operation: GDELT fetching, news normalisation, AI-assisted analysis,
    and alert lifecycle management.

Why it exists:
    Keeping business logic out of endpoint handlers and repository
    functions makes the core behaviour independently testable and
    reusable across HTTP handlers, background workers, and CLI tools.

Architecture fit:
    Services sit between the API layer (app.api.v1.endpoints) and the
    persistence layer (app.db.repositories). They receive typed inputs,
    apply domain logic, call repositories for persistence, and return
    typed outputs. They should not import from app.api.*.
"""
