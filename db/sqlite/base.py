"""
Module: app.db.sqlite.base

Responsibility:
    Declares all SQLAlchemy ORM models for this service.
    Each class maps 1-to-1 with a table in the SQLite schema defined
    in assets/db/sqlite_schema.sql, preserving column types, constraints,
    CHECK rules, foreign keys, and indexes.

Why it exists:
    A single source of truth for the data model. Repositories and
    services import these classes; they never construct raw SQL.

Architecture fit:
    Imports Base from app.db.database so all models share the same
    metadata registry. server.py calls Base.metadata.create_all()
    on startup to initialise the schema from these definitions.
"""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

# ---------------------------------------------------------------------------
# documents
# ---------------------------------------------------------------------------

class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_filename: Mapped[str] = mapped_column(String, nullable=False)
    source_mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
    # SHA-256 hex digest — enforces upload idempotency
    source_sha256: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    document_type: Mapped[str] = mapped_column(String, nullable=False)
    upload_origin: Mapped[str] = mapped_column(String, nullable=False, default="local")
    processing_status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    keywords: Mapped[list["ExtractedKeyword"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    entities: Mapped[list["ExtractedEntity"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "processing_status IN ('pending', 'processed', 'failed')",
            name="ck_documents_processing_status",
        ),
    )

# ---------------------------------------------------------------------------
# extracted_keywords
# ---------------------------------------------------------------------------

class ExtractedKeyword(Base):
    __tablename__ = "extracted_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    keyword: Mapped[str] = mapped_column(String, nullable=False)
    normalized_keyword: Mapped[str] = mapped_column(String, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    source_method: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    document: Mapped["Document"] = relationship(back_populates="keywords")

    __table_args__ = (
        # One normalised keyword per document — prevents duplicate extraction runs
        UniqueConstraint(
            "document_id",
            "normalized_keyword",
            name="ux_extracted_keywords_document_keyword",
        ),
    )

# ---------------------------------------------------------------------------
# extracted_entities
# ---------------------------------------------------------------------------

class ExtractedEntity(Base):
    __tablename__ = "extracted_entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_value: Mapped[str] = mapped_column(String, nullable=False)
    normalized_value: Mapped[str | None] = mapped_column(String, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String, nullable=True)
    start_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    document: Mapped["Document"] = relationship(back_populates="entities")

    __table_args__ = (
        Index("ix_extracted_entities_document_id", "document_id"),
        Index("ix_extracted_entities_type", "entity_type"),
    )

# ---------------------------------------------------------------------------
# poll_runs
# ---------------------------------------------------------------------------

class PollRun(Base):
    __tablename__ = "poll_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_name: Mapped[str] = mapped_column(String, nullable=False)
    query_text: Mapped[str] = mapped_column(String, nullable=False)
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_status: Mapped[str] = mapped_column(String, nullable=False)
    items_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    alerts_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    alert_events: Mapped[list["AlertEvent"]] = relationship(
        back_populates="poll_run", cascade="save-update, merge"
    )

    __table_args__ = (
        CheckConstraint(
            "run_status IN ('started', 'completed', 'failed')",
            name="ck_poll_runs_run_status",
        ),
    )

# ---------------------------------------------------------------------------
# alert_events
# ---------------------------------------------------------------------------

class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    poll_run_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("poll_runs.id", ondelete="SET NULL"), nullable=True
    )
    source_name: Mapped[str] = mapped_column(String, nullable=False)
    source_item_id: Mapped[str | None] = mapped_column(String, nullable=True)
    article_url: Mapped[str] = mapped_column(String, nullable=False)
    article_title: Mapped[str] = mapped_column(String, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # JSON-serialised list of matched monitoring terms
    matched_terms_json: Mapped[str] = mapped_column(Text, nullable=False)
    # Full raw GDELT item payload as JSON for auditability
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    alert_status: Mapped[str] = mapped_column(String, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_error: Mapped[str | None] = mapped_column(String, nullable=True)

    poll_run: Mapped["PollRun | None"] = relationship(back_populates="alert_events")

    __table_args__ = (
        CheckConstraint(
            "alert_status IN ('detected', 'notified', 'duplicate', 'failed')",
            name="ck_alert_events_alert_status",
        ),
        # Partial unique index: deduplicate by source_item_id only when present
        Index(
            "ux_alert_events_source_item",
            "source_name",
            "source_item_id",
            unique=True,
            sqlite_where=text("source_item_id IS NOT NULL"),
        ),
        # Always deduplicate by URL within a source
        UniqueConstraint(
            "source_name",
            "article_url",
            name="ux_alert_events_source_url",
        ),
    )

# ---------------------------------------------------------------------------
# websocket_messages  (audit log of all broadcasted WS events)
# ---------------------------------------------------------------------------

class WebsocketMessage(Base):
    __tablename__ = "websocket_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_name: Mapped[str] = mapped_column(String, nullable=False)
    event_name: Mapped[str] = mapped_column(String, nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    message_json: Mapped[str] = mapped_column(Text, nullable=False)
    emitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_websocket_messages_channel_name", "channel_name"),
    )
