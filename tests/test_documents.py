"""
Tests for the /api/v1/documents endpoints.

Coverage:
    GET  /documents            — list (empty, after upload)
    POST /documents            — success, duplicate, empty file, whitespace-only,
                                 unsupported MIME, non-UTF-8, oversized filename,
                                 path-traversal filename
    GET  /documents/{id}       — found, not found
    DELETE /documents/{id}     — success, not found, gone after delete
    GET  /documents/{id}/keywords — found, not found, total matches list length
    GET  /documents/{id}/entities — found, not found, total matches list length
    Response datetime fields carry UTC offset.
"""

PLAIN_TEXT = b"Aluminium 6061-T6 bar stock, quantity 50 pieces, tolerance +/-0.05mm."
FILENAME = "rfq_sample.txt"
MIME = "text/plain"


def _upload_file(content: bytes = PLAIN_TEXT, filename: str = FILENAME, mime: str = MIME):
    return {"file": (filename, content, mime)}


async def _upload(client, **kwargs):
    return await client.post("/api/v1/documents", files=_upload_file(**kwargs))


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


async def test_list_empty(async_client):
    resp = await async_client.get("/api/v1/documents")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["documents"] == []


async def test_list_after_upload(async_client):
    await _upload(async_client)
    body = (await async_client.get("/api/v1/documents")).json()
    assert body["total"] == 1
    assert len(body["documents"]) == 1


async def test_list_multiple_uploads(async_client):
    await _upload(async_client, content=b"First document text content.")
    await _upload(async_client, content=b"Second document text content.")
    body = (await async_client.get("/api/v1/documents")).json()
    assert body["total"] == 2


# ---------------------------------------------------------------------------
# Upload — success
# ---------------------------------------------------------------------------


async def test_upload_returns_201(async_client):
    resp = await _upload(async_client)
    assert resp.status_code == 201


async def test_upload_response_shape(async_client):
    body = (await _upload(async_client)).json()
    assert "id" in body
    assert body["source_filename"] == FILENAME
    assert body["source_mime_type"] == MIME
    assert body["processing_status"] == "processed"
    assert body["upload_origin"] == "local"
    assert "created_at" in body


async def test_upload_document_type_set(async_client):
    body = (await _upload(async_client)).json()
    assert body["document_type"] != "pending"


async def test_upload_octet_stream_mime(async_client):
    resp = await _upload(async_client, mime="application/octet-stream")
    assert resp.status_code == 201


async def test_upload_markdown_mime(async_client):
    resp = await _upload(
        async_client,
        content=b"# Title\n\nSome markdown body.",
        mime="text/markdown",
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Upload — validation errors
# ---------------------------------------------------------------------------


async def test_upload_duplicate_returns_409(async_client):
    await _upload(async_client)
    resp = await _upload(async_client)
    assert resp.status_code == 409


async def test_upload_empty_file_returns_422(async_client):
    resp = await _upload(async_client, content=b"")
    assert resp.status_code == 422


async def test_upload_whitespace_only_returns_422(async_client):
    resp = await _upload(async_client, content=b"   \n\t  ")
    assert resp.status_code == 422


async def test_upload_unsupported_mime_returns_415(async_client):
    resp = await _upload(async_client, mime="application/pdf")
    assert resp.status_code == 415


async def test_upload_non_utf8_returns_422(async_client):
    resp = await _upload(async_client, content=b"\xff\xfe invalid utf-8 bytes")
    assert resp.status_code == 422


async def test_upload_long_filename_returns_422(async_client):
    resp = await _upload(async_client, filename="a" * 256 + ".txt")
    assert resp.status_code == 422


async def test_upload_path_traversal_filename_returns_422(async_client):
    resp = await _upload(async_client, filename="../etc/passwd")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Get by ID
# ---------------------------------------------------------------------------


async def test_get_document_found(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    resp = await async_client.get(f"/api/v1/documents/{doc_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == doc_id


async def test_get_document_not_found(async_client):
    resp = await async_client.get("/api/v1/documents/does-not-exist")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_document_returns_204(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    resp = await async_client.delete(f"/api/v1/documents/{doc_id}")
    assert resp.status_code == 204


async def test_delete_document_gone_afterwards(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    await async_client.delete(f"/api/v1/documents/{doc_id}")
    assert (await async_client.get(f"/api/v1/documents/{doc_id}")).status_code == 404


async def test_delete_document_removed_from_list(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    await async_client.delete(f"/api/v1/documents/{doc_id}")
    assert (await async_client.get("/api/v1/documents")).json()["total"] == 0


async def test_delete_document_not_found(async_client):
    resp = await async_client.delete("/api/v1/documents/does-not-exist")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Keywords
# ---------------------------------------------------------------------------


async def test_get_keywords_returns_200(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    assert (await async_client.get(f"/api/v1/documents/{doc_id}/keywords")).status_code == 200


async def test_get_keywords_response_shape(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    body = (await async_client.get(f"/api/v1/documents/{doc_id}/keywords")).json()
    assert body["document_id"] == doc_id
    assert isinstance(body["total"], int)
    assert isinstance(body["keywords"], list)


async def test_get_keywords_total_matches_list(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    body = (await async_client.get(f"/api/v1/documents/{doc_id}/keywords")).json()
    assert body["total"] == len(body["keywords"])


async def test_get_keywords_not_found(async_client):
    assert (
        await async_client.get("/api/v1/documents/does-not-exist/keywords")
    ).status_code == 404


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------


async def test_get_entities_returns_200(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    assert (await async_client.get(f"/api/v1/documents/{doc_id}/entities")).status_code == 200


async def test_get_entities_response_shape(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    body = (await async_client.get(f"/api/v1/documents/{doc_id}/entities")).json()
    assert body["document_id"] == doc_id
    assert isinstance(body["total"], int)
    assert isinstance(body["entities"], list)


async def test_get_entities_total_matches_list(async_client):
    doc_id = (await _upload(async_client)).json()["id"]
    body = (await async_client.get(f"/api/v1/documents/{doc_id}/entities")).json()
    assert body["total"] == len(body["entities"])


async def test_get_entities_not_found(async_client):
    assert (
        await async_client.get("/api/v1/documents/does-not-exist/entities")
    ).status_code == 404


# ---------------------------------------------------------------------------
# Datetime fields carry timezone info
# ---------------------------------------------------------------------------


async def test_created_at_has_utc_offset(async_client):
    body = (await _upload(async_client)).json()
    assert body["created_at"].endswith("+00:00") or body["created_at"].endswith("Z")
