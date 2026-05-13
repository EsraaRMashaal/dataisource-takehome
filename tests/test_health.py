"""Tests for GET /api/v1/health."""


async def test_health_returns_200(async_client):
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200


async def test_health_body(async_client):
    body = (await async_client.get("/api/v1/health")).json()
    assert body["status"] == "ok"
    assert body["database"] == "reachable"
