"""
Module: app.api.v1.models.response_models

Responsibility:
    Pydantic models for outbound API responses.
    Defines the public contract for every v1 endpoint.

Why it exists:
    Explicit response models prevent internal ORM fields from leaking
    to clients and drive the OpenAPI schema automatically.

Architecture fit:
    Endpoint handlers build these from ORM objects via model_validate().
    Never imported by services or repositories.
"""

from datetime import datetime, timezone

from pydantic import BaseModel, model_validator


# ---------------------------------------------------------------------------
# Shared base — ensures every datetime field carries UTC timezone info.
#
# SQLite has no native timezone type; SQLAlchemy reads datetimes back as
# naive objects even when they were written as UTC-aware.  This validator
# runs after all fields are populated and stamps tzinfo=UTC on any naive
# datetime, so the serialised JSON always includes "+00:00".
# ---------------------------------------------------------------------------

class _UTCModel(BaseModel):
    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _ensure_utc(self) -> "Self":  # type: ignore[name-defined]
        for name in type(self).model_fields:
            val = getattr(self, name)
            if isinstance(val, datetime) and val.tzinfo is None:
                setattr(self, name, val.replace(tzinfo=timezone.utc))
        return self


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    database: str


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class DocumentResponse(_UTCModel):
    id: str
    source_filename: str
    source_mime_type: str | None
    document_type: str
    processing_status: str
    upload_origin: str
    created_at: datetime
    processed_at: datetime | None


class KeywordResponse(_UTCModel):
    id: int
    keyword: str
    normalized_keyword: str
    score: float
    source_method: str
    created_at: datetime


class KeywordListResponse(BaseModel):
    document_id: str
    total: int
    keywords: list["KeywordResponse"]


class EntityResponse(_UTCModel):
    id: int
    entity_type: str
    entity_value: str
    normalized_value: str | None
    confidence: float
    quantity_value: float | None
    unit: str | None
    created_at: datetime


class EntityListResponse(BaseModel):
    document_id: str
    total: int
    entities: list["EntityResponse"]


class DocumentListResponse(BaseModel):
    total: int
    documents: list["DocumentResponse"]


# ---------------------------------------------------------------------------
# Monitoring / Alerts
# ---------------------------------------------------------------------------

class AlertResponse(_UTCModel):
    id: str
    poll_run_id: str | None
    source_name: str
    source_item_id: str | None
    article_url: str
    article_title: str
    published_at: datetime | None
    matched_terms_json: str
    payload_json: str
    alert_status: str
    detected_at: datetime
    notified_at: datetime | None
    processing_error: str | None


class AlertListResponse(BaseModel):
    total: int
    alerts: list["AlertResponse"]


class PollRunResponse(_UTCModel):
    id: str
    source_name: str
    query_text: str
    window_start: datetime | None
    window_end: datetime | None
    run_status: str
    items_seen: int
    alerts_created: int
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None


# ---------------------------------------------------------------------------
# Errors  (machine-readable envelope returned on 4xx / 5xx)
# ---------------------------------------------------------------------------

class ErrorDetail(BaseModel):
    code: str
    detail: str
