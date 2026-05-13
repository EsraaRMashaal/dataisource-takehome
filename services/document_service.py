"""
Module: app.services.document_service

Responsibility:
    Business logic for document ingestion, retrieval, and deletion.
    Owns validation, hashing, extraction orchestration, and persistence.

Why it exists:
    Keeps route handlers thin — they parse input and format output only.
    All decisions (deduplication, encoding checks, extraction flow) live here.

Architecture fit:
    Called by documents.py endpoints.
    Calls ai_analyzer for extraction and document_repository for persistence.
    Raises HTTPException directly — acceptable for FastAPI service layers.
"""

import hashlib
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.repositories.document_repository as doc_repo
from app.db.sqlite.base import Document, ExtractedEntity, ExtractedKeyword
from app.logger import get_logger
from app.services.ai_analyzer import analyze
from app.services import event_bus

logger = get_logger(__name__)

_MAX_BYTES        = 10 * 1024 * 1024  # 10 MB
_MAX_FILENAME_LEN = 255
_ALLOWED_MIME     = {
    "text/plain", "text/markdown", "text/x-markdown",
    "text/csv", "text/tab-separated-values",
    "application/octet-stream",   # browsers may send this for plain .txt
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _require_document(document: Document | None, doc_id: str) -> Document:
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "detail": f"No document with id={doc_id}"},
        )
    return document


def _validate_filename(filename: str) -> None:
    if not filename or not filename.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_FILENAME", "detail": "Filename must not be empty"},
        )
    if len(filename) > _MAX_FILENAME_LEN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_FILENAME",
                    "detail": f"Filename exceeds {_MAX_FILENAME_LEN} characters"},
        )
    # Block path traversal and reserved separators
    if any(c in filename for c in ("/", "\\", ":")) or ".." in filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_FILENAME", "detail": "Filename contains invalid characters"},
        )


def _validate_mime(content_type: str | None) -> None:
    if content_type is None:
        return  # missing header is allowed
    mime = content_type.split(";")[0].strip().lower()
    if not (mime.startswith("text/") or mime in _ALLOWED_MIME):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "UNSUPPORTED_MEDIA_TYPE",
                    "detail": f"'{mime}' is not supported — upload a plain-text file"},
        )


def _validate_content(content: bytes) -> str:
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "EMPTY_FILE", "detail": "File must not be empty"},
        )
    if len(content) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "FILE_TOO_LARGE", "detail": "File exceeds the 10 MB limit"},
        )
    try:
        text = content.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_ENCODING", "detail": "File must be UTF-8 encoded text"},
        )
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "EMPTY_CONTENT", "detail": "File contains no readable content"},
        )
    return text


def _check_duplicate(existing: Document | None) -> None:
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DUPLICATE_DOCUMENT",
                    "detail": f"Already ingested as id={existing.id}"},
        )

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def ingest(
    filename: str,
    content_type: str | None,
    content: bytes,
    db: AsyncSession,
) -> Document:
    """Validate, extract, and persist a document. Returns the saved record."""
    _validate_filename(filename)
    _validate_mime(content_type)
    raw_text = _validate_content(content)
    sha256   = hashlib.sha256(content).hexdigest()

    _check_duplicate(await doc_repo.get_by_sha256(db, sha256))

    doc_id = str(uuid.uuid4())
    now    = datetime.now(timezone.utc)

    try:
        await event_bus.publish("documents", {
            "event": "document.progress", "doc_id": doc_id,
            "stage": "storing", "pct": 20,
            "filename": filename, "size_bytes": len(content),
        })

        document = Document(
            id=doc_id,
            source_filename=filename,
            source_mime_type=content_type,
            source_sha256=sha256,
            raw_text=raw_text,
            document_type="pending",
            upload_origin="local",
            processing_status="pending",
            created_at=now,
        )
        await doc_repo.create_document(db, document)

        await event_bus.publish("documents", {
            "event": "document.uploaded",
            "doc_id": doc_id,
            "filename": filename,
            "mime": content_type or "unknown",
            "sha256": sha256[:12] + "…",
        })

        await event_bus.publish("documents", {
            "event": "document.progress", "doc_id": doc_id,
            "stage": "extracting", "pct": 45,
        })

        result = analyze(raw_text)

        await event_bus.publish("documents", {
            "event": "document.progress", "doc_id": doc_id,
            "stage": "indexing", "pct": 70,
            "doc_type": result.document_type,
            "keywords": len(result.keywords),
            "entities": len(result.entities),
        })

        document.document_type     = result.document_type
        document.processing_status = "processed"
        document.processed_at      = datetime.now(timezone.utc)

        if result.keywords:
            await doc_repo.bulk_create_keywords(db, [
                ExtractedKeyword(
                    document_id=doc_id,
                    keyword=kw.keyword,
                    normalized_keyword=kw.normalized_keyword,
                    score=kw.score,
                    source_method=kw.source_method,
                    created_at=now,
                )
                for kw in result.keywords
            ])

        if result.entities:
            await doc_repo.bulk_create_entities(db, [
                ExtractedEntity(
                    document_id=doc_id,
                    entity_type=e.entity_type,
                    entity_value=e.entity_value,
                    normalized_value=e.normalized_value,
                    confidence=e.confidence,
                    quantity_value=e.quantity_value,
                    unit=e.unit,
                    start_offset=e.start_offset,
                    end_offset=e.end_offset,
                    created_at=now,
                )
                for e in result.entities
            ])

        await event_bus.publish("documents", {
            "event": "document.progress", "doc_id": doc_id,
            "stage": "committing", "pct": 90,
        })

        await db.commit()
        await db.refresh(document)

        logger.info("Ingested: id=%s  type=%s  kw=%d  entities=%d",
                    doc_id, result.document_type, len(result.keywords), len(result.entities))

        await event_bus.publish("documents", {
            "event": "document.completed",
            "doc_id": doc_id,
            "doc_type": result.document_type,
            "keywords": len(result.keywords),
            "entities": len(result.entities),
        })
        await event_bus.publish("records", {
            "event": "record.created",
            "table": "documents",
            "id": doc_id,
        })

    except HTTPException:
        await event_bus.publish("documents", {
            "event": "document.failed",
            "doc_id": doc_id,
            "reason": "validation_error",
        })
        raise
    except Exception as exc:
        await event_bus.publish("documents", {
            "event": "document.failed",
            "doc_id": doc_id,
            "reason": str(exc)[:80],
        })
        raise

    return document


async def list_all(db: AsyncSession) -> list[Document]:
    return await doc_repo.list_documents(db)


async def get_by_id(doc_id: str, db: AsyncSession) -> Document:
    return _require_document(await doc_repo.get_by_id(db, doc_id), doc_id)


async def remove(doc_id: str, db: AsyncSession) -> None:
    document = await get_by_id(doc_id, db)
    await doc_repo.delete_document(db, document)
    await db.commit()
    logger.info("Deleted: id=%s", doc_id)
    await event_bus.publish("documents", {
        "event": "document.deleted",
        "doc_id": doc_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


async def get_keywords(doc_id: str, db: AsyncSession) -> list[ExtractedKeyword]:
    await get_by_id(doc_id, db)
    return await doc_repo.get_keywords_by_doc(db, doc_id)


async def get_entities(doc_id: str, db: AsyncSession) -> list[ExtractedEntity]:
    await get_by_id(doc_id, db)
    return await doc_repo.get_entities_by_doc(db, doc_id)
