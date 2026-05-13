"""
Module: app.api.v1.endpoints.documents

Responsibility:
    Thin route handlers — parse input, call document_service, return response.
    No business logic here.

    Routes:
        POST   /api/v1/documents                    — upload & extract
        GET    /api/v1/documents/{doc_id}           — fetch record
        DELETE /api/v1/documents/{doc_id}           — delete record + data
        GET    /api/v1/documents/{doc_id}/keywords  — extracted keywords
        GET    /api/v1/documents/{doc_id}/entities  — extracted entities
"""

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.models.response_models import (
    DocumentListResponse,
    DocumentResponse,
    EntityListResponse,
    KeywordListResponse,
)
from app.db.database import get_db
from app.services import document_service

router = APIRouter(tags=["documents"])

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/documents",
    response_model=DocumentListResponse,
    summary="List all ingested documents, newest first",
)
async def list_documents(
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    docs = await document_service.list_all(db)
    return DocumentListResponse(
        total=len(docs),
        documents=[DocumentResponse.model_validate(d) for d in docs],
    )


@router.post(
    "/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document for extraction and persistence",
)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    document = await document_service.ingest(
        filename=file.filename or "upload",
        content_type=file.content_type,
        content=await file.read(),
        db=db,
    )
    return DocumentResponse.model_validate(document)


@router.get(
    "/documents/{doc_id}",
    response_model=DocumentResponse,
    summary="Get a document record by ID",
)
async def get_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    return DocumentResponse.model_validate(
        await document_service.get_by_id(doc_id, db)
    )


@router.delete(
    "/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document and all its extracted data",
)
async def delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    await document_service.remove(doc_id, db)


@router.get(
    "/documents/{doc_id}/keywords",
    response_model=KeywordListResponse,
    summary="Get extracted keywords for a document",
)
async def get_keywords(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
) -> KeywordListResponse:
    keywords = await document_service.get_keywords(doc_id, db)
    return KeywordListResponse(document_id=doc_id, total=len(keywords), keywords=keywords)


@router.get(
    "/documents/{doc_id}/entities",
    response_model=EntityListResponse,
    summary="Get extracted entities for a document",
)
async def get_entities(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
) -> EntityListResponse:
    entities = await document_service.get_entities(doc_id, db)
    return EntityListResponse(document_id=doc_id, total=len(entities), entities=entities)
