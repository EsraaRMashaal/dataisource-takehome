"""
Module: app.db.repositories.document_repository

Responsibility:
    All database read/write operations for documents, keywords, and entities.
    Hides SQLAlchemy query construction from the service and endpoint layers.

Why it exists:
    Repository pattern: callers express intent, not ORM mechanics.

Architecture fit:
    Each function accepts an AsyncSession injected by the caller so that
    transaction boundaries (commit / rollback) are owned by the endpoint.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.sqlite.base import Document, ExtractedEntity, ExtractedKeyword


async def list_documents(session: AsyncSession) -> list[Document]:
    result = await session.execute(
        select(Document).order_by(Document.created_at.desc())
    )
    return list(result.scalars().all())


async def get_by_sha256(session: AsyncSession, sha256: str) -> Document | None:
    result = await session.execute(
        select(Document).where(Document.source_sha256 == sha256)
    )
    return result.scalar_one_or_none()


async def get_by_id(session: AsyncSession, doc_id: str) -> Document | None:
    result = await session.execute(
        select(Document).where(Document.id == doc_id)
    )
    return result.scalar_one_or_none()


async def create_document(session: AsyncSession, document: Document) -> Document:
    session.add(document)
    await session.flush()
    return document


async def delete_document(session: AsyncSession, document: Document) -> None:
    # Keywords and entities cascade via ORM relationship (delete-orphan).
    await session.delete(document)
    await session.flush()


async def bulk_create_keywords(
    session: AsyncSession,
    keywords: list[ExtractedKeyword],
) -> None:
    session.add_all(keywords)
    await session.flush()


async def bulk_create_entities(
    session: AsyncSession,
    entities: list[ExtractedEntity],
) -> None:
    session.add_all(entities)
    await session.flush()


async def get_keywords_by_doc(
    session: AsyncSession,
    doc_id: str,
) -> list[ExtractedKeyword]:
    result = await session.execute(
        select(ExtractedKeyword)
        .where(ExtractedKeyword.document_id == doc_id)
        .order_by(ExtractedKeyword.score.desc())
    )
    return list(result.scalars().all())


async def get_entities_by_doc(
    session: AsyncSession,
    doc_id: str,
) -> list[ExtractedEntity]:
    result = await session.execute(
        select(ExtractedEntity)
        .where(ExtractedEntity.document_id == doc_id)
        .order_by(ExtractedEntity.entity_type)
    )
    return list(result.scalars().all())


async def count_documents_by_status(session: AsyncSession) -> dict[str, int]:
    """Return a mapping of processing_status → row count."""
    rows = await session.execute(
        select(Document.processing_status, func.count())
        .group_by(Document.processing_status)
    )
    return {status: count for status, count in rows.all()}


async def count_keywords(session: AsyncSession) -> int:
    result = await session.execute(select(func.count()).select_from(ExtractedKeyword))
    return result.scalar_one()


async def count_entities(session: AsyncSession) -> int:
    result = await session.execute(select(func.count()).select_from(ExtractedEntity))
    return result.scalar_one()
