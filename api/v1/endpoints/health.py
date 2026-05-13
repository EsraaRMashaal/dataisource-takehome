"""
Module: app.api.v1.endpoints.health

Responsibility:
    Exposes the /api/v1/health liveness and readiness endpoints.
    Returns service status, version, and DB connectivity state.

Why it exists:
    Health endpoints are required by load balancers, container
    orchestrators (ECS, EKS), and monitoring systems to determine
    whether the service is ready to accept traffic.

Architecture fit:
    Stateless route handler — performs a lightweight DB ping via
    the database module and returns a structured HealthResponse.
    No service layer needed; direct DB check is intentional for speed.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    """Liveness + readiness check. Verifies the DB is reachable."""
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}
