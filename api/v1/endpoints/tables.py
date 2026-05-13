"""
Module: app.api.v1.endpoints.tables

Routes:
    GET /api/v1/tables                 — list tables with row counts
    GET /api/v1/tables/{table_name}    — paginated rows for a table
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.sqlite.base import (
    AlertEvent,
    Document,
    ExtractedEntity,
    ExtractedKeyword,
    PollRun,
    WebsocketMessage,
)

router = APIRouter(tags=["tables"])

_TABLE_MAP = {
    "documents": Document,
    "extracted_keywords": ExtractedKeyword,
    "extracted_entities": ExtractedEntity,
    "poll_runs": PollRun,
    "alert_events": AlertEvent,
    "websocket_messages": WebsocketMessage,
}


def _pk_col_name(model) -> str:
    pk_cols = list(model.__table__.primary_key.columns)
    return pk_cols[0].name


def _cast_pk(model, raw: str):
    pk_name = _pk_col_name(model)
    col_type = model.__table__.c[pk_name].type
    return int(raw) if isinstance(col_type, Integer) else raw


def _row_to_dict(row) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        result[col.name] = val
    return result


@router.get("/tables", summary="List all database tables with row counts")
async def list_tables(db: AsyncSession = Depends(get_db)):
    tables = []
    for name, model in _TABLE_MAP.items():
        count_result = await db.execute(select(func.count()).select_from(model))
        tables.append({"name": name, "row_count": count_result.scalar() or 0})
    return {"tables": tables}


@router.get("/tables/{table_name}", summary="Fetch paginated rows from a table")
async def get_table_rows(
    table_name: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    model = _TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    offset = (page - 1) * page_size

    total_result = await db.execute(select(func.count()).select_from(model))
    total = total_result.scalar() or 0

    rows_result = await db.execute(select(model).offset(offset).limit(page_size))
    rows = rows_result.scalars().all()

    columns = [col.name for col in model.__table__.columns]

    return {
        "table": table_name,
        "columns": columns,
        "total": total,
        "page": page,
        "page_size": page_size,
        "rows": [_row_to_dict(row) for row in rows],
    }


@router.delete(
    "/tables/{table_name}",
    status_code=204,
    summary="Delete all rows in a table",
)
async def clear_table(
    table_name: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    model = _TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
    await db.execute(sa_delete(model))
    await db.commit()


@router.delete(
    "/tables/{table_name}/{row_id}",
    status_code=204,
    summary="Delete a single row by primary key",
)
async def delete_table_row(
    table_name: str,
    row_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    model = _TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    pk_name = _pk_col_name(model)
    pk_val = _cast_pk(model, row_id)
    pk_attr = getattr(model, pk_name)

    result = await db.execute(select(model).where(pk_attr == pk_val))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Row not found")

    await db.delete(row)
    await db.commit()
