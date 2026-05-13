"""
Tests for the /api/v1/news endpoints.

Coverage:
    GET    /news/alerts           — empty list, list with seeded data, multiple records
    GET    /news/alerts/{id}      — found (fields + status), not found
    DELETE /news/alerts           — 204 when empty, removes data, idempotent
    POST   /news/poll             — mocked success (empty result, with alert),
                                    mocked failure → 500

GDELT network calls are never made: `poll_service.run_poll` is patched at the
import site inside the news endpoint module.
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.sqlite.base import AlertEvent, PollRun


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _make_poll_run() -> PollRun:
    return PollRun(
        id=str(uuid.uuid4()),
        source_name="gdelt",
        query_text="manufacturing supply chain disruption",
        run_status="completed",
        items_seen=1,
        alerts_created=1,
        started_at=datetime.now(timezone.utc),
    )


def _make_alert(poll_run_id: str, *, title: str = "Test Alert") -> AlertEvent:
    return AlertEvent(
        id=str(uuid.uuid4()),
        poll_run_id=poll_run_id,
        source_name="gdelt",
        source_item_id=str(uuid.uuid4()),
        article_url=f"https://example.com/news/{uuid.uuid4()}",
        article_title=title,
        matched_terms_json=json.dumps(["shipping delay"]),
        payload_json=json.dumps({"key": "value"}),
        alert_status="detected",
        detected_at=datetime.now(timezone.utc),
    )


async def _seed_alert(engine) -> tuple[str, str]:
    """Insert one PollRun + one AlertEvent. Returns (alert_id, alert_title)."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        poll_run = _make_poll_run()
        session.add(poll_run)
        await session.commit()

        alert = _make_alert(poll_run.id)
        session.add(alert)
        await session.commit()

        return alert.id, alert.article_title


# ---------------------------------------------------------------------------
# GET /news/alerts — list
# ---------------------------------------------------------------------------


async def test_list_alerts_empty(async_client):
    resp = await async_client.get("/api/v1/news/alerts")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["alerts"] == []


async def test_list_alerts_response_shape(async_client):
    body = (await async_client.get("/api/v1/news/alerts")).json()
    assert "total" in body
    assert "alerts" in body


async def test_list_alerts_with_seeded_data(async_client, engine):
    alert_id, _ = await _seed_alert(engine)
    body = (await async_client.get("/api/v1/news/alerts")).json()
    assert body["total"] == 1
    assert body["alerts"][0]["id"] == alert_id


async def test_list_alerts_multiple_records(async_client, engine):
    await _seed_alert(engine)
    await _seed_alert(engine)
    body = (await async_client.get("/api/v1/news/alerts")).json()
    assert body["total"] == 2


# ---------------------------------------------------------------------------
# GET /news/alerts/{id} — single
# ---------------------------------------------------------------------------


async def test_get_alert_not_found(async_client):
    assert (await async_client.get("/api/v1/news/alerts/no-such-id")).status_code == 404


async def test_get_alert_found(async_client, engine):
    alert_id, title = await _seed_alert(engine)
    resp = await async_client.get(f"/api/v1/news/alerts/{alert_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == alert_id
    assert body["article_title"] == title


async def test_get_alert_required_fields_present(async_client, engine):
    alert_id, _ = await _seed_alert(engine)
    body = (await async_client.get(f"/api/v1/news/alerts/{alert_id}")).json()
    required = {
        "id", "source_name", "article_url", "article_title",
        "matched_terms_json", "payload_json", "alert_status", "detected_at",
    }
    assert required.issubset(body.keys())


async def test_get_alert_status_is_detected(async_client, engine):
    alert_id, _ = await _seed_alert(engine)
    body = (await async_client.get(f"/api/v1/news/alerts/{alert_id}")).json()
    assert body["alert_status"] == "detected"


# ---------------------------------------------------------------------------
# DELETE /news/alerts — bulk delete
# ---------------------------------------------------------------------------


async def test_delete_all_alerts_empty_returns_204(async_client):
    assert (await async_client.delete("/api/v1/news/alerts")).status_code == 204


async def test_delete_all_alerts_removes_data(async_client, engine):
    await _seed_alert(engine)
    await async_client.delete("/api/v1/news/alerts")
    assert (await async_client.get("/api/v1/news/alerts")).json()["total"] == 0


async def test_delete_all_alerts_idempotent(async_client):
    await async_client.delete("/api/v1/news/alerts")
    assert (await async_client.delete("/api/v1/news/alerts")).status_code == 204


# ---------------------------------------------------------------------------
# POST /news/poll — GDELT mocked
# ---------------------------------------------------------------------------


async def test_poll_success_returns_201(async_client):
    with patch(
        "app.api.v1.endpoints.news.poll_service.run_poll",
        new_callable=AsyncMock,
        return_value=[],
    ):
        assert (await async_client.post("/api/v1/news/poll")).status_code == 201


async def test_poll_success_empty_result(async_client):
    with patch(
        "app.api.v1.endpoints.news.poll_service.run_poll",
        new_callable=AsyncMock,
        return_value=[],
    ):
        body = (await async_client.post("/api/v1/news/poll")).json()
    assert body["total"] == 0
    assert body["alerts"] == []


async def test_poll_success_with_alerts(async_client, engine):
    alert_id, _ = await _seed_alert(engine)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(select(AlertEvent).where(AlertEvent.id == alert_id))
        real_alert = result.scalar_one()

    with patch(
        "app.api.v1.endpoints.news.poll_service.run_poll",
        new_callable=AsyncMock,
        return_value=[real_alert],
    ):
        body = (await async_client.post("/api/v1/news/poll")).json()

    assert body["total"] == 1
    assert body["alerts"][0]["id"] == alert_id


async def test_poll_gdelt_failure_returns_500(async_client):
    with patch(
        "app.api.v1.endpoints.news.poll_service.run_poll",
        new_callable=AsyncMock,
        side_effect=RuntimeError("GDELT unreachable"),
    ):
        assert (await async_client.post("/api/v1/news/poll")).status_code == 500
