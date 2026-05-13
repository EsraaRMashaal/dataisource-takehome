"""
Tests for the /api/v1/tables admin endpoints.

Coverage:
    GET    /tables                   — lists all 6 tables with row_count
    GET    /tables/{name}            — valid table, invalid name, pagination
    DELETE /tables/{name}            — clears table, invalid name
    DELETE /tables/{name}/{row_id}   — not found, invalid table name, removes row
"""

_ALL_TABLES = {
    "documents",
    "extracted_keywords",
    "extracted_entities",
    "poll_runs",
    "alert_events",
    "websocket_messages",
}

_UPLOAD_FILE = {"file": ("t.txt", b"some text content here", "text/plain")}


# ---------------------------------------------------------------------------
# GET /tables
# ---------------------------------------------------------------------------


async def test_list_tables_status(async_client):
    assert (await async_client.get("/api/v1/tables")).status_code == 200


async def test_list_tables_contains_all_six(async_client):
    tables = (await async_client.get("/api/v1/tables")).json()["tables"]
    assert {t["name"] for t in tables} == _ALL_TABLES


async def test_list_tables_row_counts_initially_zero(async_client):
    tables = (await async_client.get("/api/v1/tables")).json()["tables"]
    for t in tables:
        assert t["row_count"] == 0, f"{t['name']} should start empty"


async def test_list_tables_row_count_increments_after_upload(async_client):
    await async_client.post("/api/v1/documents", files=_UPLOAD_FILE)
    tables = (await async_client.get("/api/v1/tables")).json()["tables"]
    doc_table = next(t for t in tables if t["name"] == "documents")
    assert doc_table["row_count"] == 1


# ---------------------------------------------------------------------------
# GET /tables/{name}
# ---------------------------------------------------------------------------


async def test_get_table_rows_valid_table(async_client):
    assert (await async_client.get("/api/v1/tables/documents")).status_code == 200


async def test_get_table_rows_response_shape(async_client):
    body = (await async_client.get("/api/v1/tables/documents")).json()
    assert body["table"] == "documents"
    assert isinstance(body["columns"], list)
    assert isinstance(body["rows"], list)
    assert isinstance(body["total"], int)
    assert body["page"] == 1


async def test_get_table_rows_columns_correct(async_client):
    body = (await async_client.get("/api/v1/tables/documents")).json()
    expected = {"id", "source_filename", "source_mime_type", "source_sha256",
                "raw_text", "document_type", "upload_origin", "processing_status",
                "created_at", "processed_at"}
    assert expected.issubset(set(body["columns"]))


async def test_get_table_rows_invalid_table_404(async_client):
    assert (await async_client.get("/api/v1/tables/nonexistent_table")).status_code == 404


async def test_get_table_rows_pagination_defaults(async_client):
    body = (await async_client.get("/api/v1/tables/alert_events")).json()
    assert body["page"] == 1
    assert body["page_size"] == 50


async def test_get_table_rows_pagination_custom(async_client):
    body = (await async_client.get("/api/v1/tables/documents?page=2&page_size=10")).json()
    assert body["page"] == 2
    assert body["page_size"] == 10


async def test_get_table_rows_page_beyond_data_returns_empty(async_client):
    body = (await async_client.get("/api/v1/tables/documents?page=9999")).json()
    assert body["rows"] == []


async def test_get_table_rows_data_visible_after_upload(async_client):
    await async_client.post("/api/v1/documents", files=_UPLOAD_FILE)
    body = (await async_client.get("/api/v1/tables/documents")).json()
    assert body["total"] == 1
    assert len(body["rows"]) == 1


# ---------------------------------------------------------------------------
# DELETE /tables/{name}  (clear table)
# ---------------------------------------------------------------------------


async def test_clear_table_returns_204(async_client):
    assert (await async_client.delete("/api/v1/tables/documents")).status_code == 204


async def test_clear_table_empties_rows(async_client):
    await async_client.post("/api/v1/documents", files=_UPLOAD_FILE)
    await async_client.delete("/api/v1/tables/documents")
    body = (await async_client.get("/api/v1/tables/documents")).json()
    assert body["total"] == 0


async def test_clear_table_invalid_name_404(async_client):
    assert (await async_client.delete("/api/v1/tables/nonexistent_table")).status_code == 404


# ---------------------------------------------------------------------------
# DELETE /tables/{name}/{row_id}  (delete single row)
# ---------------------------------------------------------------------------


async def test_delete_row_invalid_table_404(async_client):
    assert (await async_client.delete("/api/v1/tables/nonexistent_table/1")).status_code == 404


async def test_delete_row_not_found_404(async_client):
    assert (await async_client.delete("/api/v1/tables/poll_runs/no-such-id")).status_code == 404


async def test_delete_row_removes_document(async_client):
    doc_id = (
        await async_client.post("/api/v1/documents", files=_UPLOAD_FILE)
    ).json()["id"]

    assert (await async_client.delete(f"/api/v1/tables/documents/{doc_id}")).status_code == 204
    assert (await async_client.get("/api/v1/tables/documents")).json()["total"] == 0
