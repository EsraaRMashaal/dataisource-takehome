"""
Module: app.api.v1.endpoints.news

Responsibility:
    Thin monitoring route handlers — trigger GDELT polling,
    expose stored alert events, and return normalized responses.

    No business logic lives here.

    Routes:
        POST   /api/v1/news/poll          — run one-shot GDELT polling
        GET    /api/v1/news/alerts        — list stored alerts
        GET    /api/v1/news/alerts/{id}   — fetch single alert
        DELETE /api/v1/news/alerts        — delete all alerts
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.models.response_models import AlertListResponse, AlertResponse
from app.db.database import get_db
from app.services import alert_service, poll_service

router = APIRouter(tags=["news"])


@router.post(
    "/news/poll",
    response_model=AlertListResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run one-shot GDELT monitoring poll",
)
async def poll_news(db: AsyncSession = Depends(get_db)) -> AlertListResponse:
    try:
        alerts = await poll_service.run_poll(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Monitoring poll failed") from exc
    return _alert_list_response(alerts)


@router.get(
    "/news/alerts",
    response_model=AlertListResponse,
    summary="List stored monitoring alerts",
)
async def list_alerts(db: AsyncSession = Depends(get_db)) -> AlertListResponse:
    return _alert_list_response(await alert_service.list_alerts(db))


@router.get(
    "/news/alerts/{alert_id}",
    response_model=AlertResponse,
    summary="Get a single stored alert event",
)
async def get_alert(alert_id: str, db: AsyncSession = Depends(get_db)) -> AlertResponse:
    try:
        alert = await alert_service.get_alert(alert_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AlertResponse.model_validate(alert)


@router.delete(
    "/news/alerts",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete all stored monitoring alerts",
)
async def delete_all_alerts(db: AsyncSession = Depends(get_db)) -> None:
    await alert_service.delete_all_alerts(db)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _alert_list_response(alerts: list) -> AlertListResponse:
    return AlertListResponse(
        total=len(alerts),
        alerts=[AlertResponse.model_validate(a) for a in alerts],
    )
