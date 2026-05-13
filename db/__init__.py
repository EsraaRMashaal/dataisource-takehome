"""
Package: app.db

Responsibility:
    Database layer: engine and session management, ORM models,
    and repository abstractions for all persistence operations.

Why it exists:
    Grouping all DB concerns under one package enforces a hard
    boundary between business logic and storage. Swapping SQLite
    for Postgres requires changes only within this package.

Architecture fit:
    app.db.database manages the SQLAlchemy engine and session factory.
    app.db.repositories exposes typed repository functions used by
    services. app.db.sqlite holds SQLite-specific configuration or
    migration tooling.
"""
