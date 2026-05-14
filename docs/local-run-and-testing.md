# Local Run and Testing

The application and tests are runnable live during the interview using the steps below.

Two browser entry points cover everything — no terminal needed after the container starts:

| URL | Purpose |
|-----|---------|
| `http://localhost:8800/index.html` | Full SPA — upload, WebSocket, news, DB explorer |
| `http://localhost:8800/docs` | Swagger UI — interactive REST testing for every endpoint |

---

## Start the API

```bash
docker compose -f app/docker-compose.yml up --build
```

Wait for:
```
INFO:     Application startup complete.
```

Open both tabs in the browser. The SQLite database persists in `./data/` on the host as a mounted volume — survives restarts.

Tear down:
```bash
docker compose -f app/docker-compose.yml down
```

---

## Tests

There are two types of tests: two interactive test views built into the SPA, and one automated backend pytest suite.

---

### SPA Test Views (browser-based)

Both views are accessible from `http://localhost:8800/index.html` via the left sidebar — no terminal required.

#### 1. WebSocket Test (⚡)

**What it is:** A live WebSocket client built into the SPA for testing real-time event delivery end-to-end.

**How to open it:**
1. Go to `http://localhost:8800/index.html`
2. Click **WebSocket Test** (⚡) in the left sidebar

**What it lets you do:**
- Enter any channel URL and click **Connect** — the status indicator turns green when the connection is established
- Watch incoming events appear in real time in the message log
- Each message shows the channel, event name, timestamp, and full JSON payload
- Switch channels mid-session to test channel isolation (`/documents`, `/alerts`, `/records`, or `/events` for all)
- Trigger messages by uploading a document or running a GDELT poll in a second tab — events stream into this view immediately

**What a successful connection looks like:**

```
● Connected — ws://localhost:8800/api/v1/ws/events
```

Then after a document upload:
```json
{"channel": "documents", "event": "document.completed", "timestamp": "...", "data": {...}}
```

---

#### 2. API Tests (🧪)

**What it is:** A built-in REST testing harness — like a lightweight Postman — that lets you fire requests at every endpoint directly from the browser without any external tooling.

**How to open it:**
1. Go to `http://localhost:8800/index.html`
2. Click **API Tests** (🧪) in the left sidebar

**What it lets you do:**
- Select any endpoint from a pre-built list (health, documents, keywords, entities, alerts, poll, tables)
- Fill in path parameters and request body if needed
- Click **Send** — the raw request, response status, headers, and JSON body are shown inline
- Test both happy-path flows and error cases (duplicate upload → 409, missing ID → 404, etc.) without writing any curl commands

**Difference from Swagger (`/docs`):** the API test harness stays within the SPA context and shows responses alongside the rest of the UI, making it easier to correlate REST results with live WebSocket events in the same browser window.

---

### Backend Automated Tests (pytest)

Four test files, run entirely inside the Docker container. Each test gets an isolated in-memory SQLite database. GDELT is mocked — no network calls are made.

```bash
docker compose -f app/docker-compose.yml run --rm api pytest -v
```

| File | Tests | What is covered |
|------|-------|----------------|
| `test_health.py` | 2 | `/health` returns `200`, response shape (`status`, `database`) |
| `test_documents.py` | 31 | list (empty, after upload, multiple); upload success + response shape + document type; upload validation: duplicate `409`, empty `422`, whitespace-only `422`, unsupported MIME `415`, non-UTF-8 `422`, oversized filename `422`, path traversal `422`; get by ID found/not-found; delete + gone + removed from list + not found; keywords list + shape + total matches + not found; entities list + shape + total matches + not found; UTC timezone on `created_at` |
| `test_news.py` | 12 | alerts list empty/seeded/multiple; get alert found/not-found/required fields/status; delete all alerts `204` + removes data + idempotent; poll mocked success empty result; poll mocked success with alert; poll GDELT failure → `500` |
| `test_tables.py` | 17 | list all 6 tables with row counts; row count increments after upload; get table rows valid/invalid/shape/columns/pagination defaults/custom/beyond data/data visible after upload; clear table `204` + empties rows + invalid name `404`; delete single row invalid table/not-found/removes document |

Run a single file:
```bash
docker compose -f app/docker-compose.yml run --rm api pytest app/tests/test_documents.py -v
```

---

## Live Demo Path (Interview)

Start the container, open both browser tabs. Everything below is done in the browser — no terminal required after startup.

---

## Ingest the Sample Document

**Via SPA** (`http://localhost:8800/index.html`):

1. Click **Upload Document** in the left sidebar
2. Click **Choose File** → select `assets/input/manufacturing_rfq_sample.txt`
3. Click **Upload**
4. Extracted keywords and entities render inline with confidence scores

**Via Swagger** (`http://localhost:8800/docs`):

1. Expand **POST /api/v1/documents** → **Try it out**
2. Upload `assets/input/manufacturing_rfq_sample.txt` → **Execute**
3. Response `201` with the document record

---

## Verify Extracted Keywords and Entities

**Via SPA**: the Upload result panel lists every keyword with score and every entity with type, value, and confidence. Click **Dashboard** to see aggregate counts.

**Via Swagger**:

1. Copy the `id` from the upload response
2. **GET /api/v1/documents/{doc_id}/keywords** → **Try it out** → paste `id` → **Execute**
3. **GET /api/v1/documents/{doc_id}/entities** → same steps

Sample keywords:
```json
[
  {"keyword": "SS316L",        "score": 0.95, "source_method": "material_grade_pattern"},
  {"keyword": "ISO 9001",      "score": 0.90, "source_method": "keyword_section"},
  {"keyword": "CNC machining", "score": 0.85, "source_method": "process_pattern"}
]
```

Sample entities:
```json
[
  {"entity_type": "material",      "entity_value": "SS316L",   "confidence": 0.95},
  {"entity_type": "quantity",      "entity_value": "500 pcs",  "quantity_value": 500, "unit": "pcs", "confidence": 0.88},
  {"entity_type": "tolerance",     "entity_value": "±0.05mm",  "confidence": 0.92},
  {"entity_type": "certification", "entity_value": "ISO 9001", "confidence": 0.90},
  {"entity_type": "incoterm",      "entity_value": "DDP",      "confidence": 0.85}
]
```

---

## Connect to the WebSocket Endpoint

**Via SPA** (`http://localhost:8800/index.html`):

1. Click **WebSocket Test** in the left sidebar
2. URL field is pre-filled with `ws://localhost:8800/api/v1/ws/events`
3. Click **Connect** — status indicator turns green
4. No authentication or subscription payload required

Available channel URLs:

```
ws://localhost:8800/api/v1/ws/events            ← all channels
ws://localhost:8800/api/v1/ws/events/documents  ← documents only
ws://localhost:8800/api/v1/ws/events/alerts     ← alerts only
ws://localhost:8800/api/v1/ws/events/records    ← records only
```

The **Live Events** panel on the right side of every view also streams events automatically.

---

## Trigger a WebSocket Message

With the WebSocket Test view connected:

1. Open a **second browser tab** at `http://localhost:8800/index.html`
2. Click **Upload Document** → upload `assets/input/manufacturing_rfq_sample.txt`
3. Switch back to the first tab — two events appear:

`document.started`:
```json
{
  "channel": "documents",
  "event": "document.started",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {"document_id": "<uuid>", "filename": "manufacturing_rfq_sample.txt", "status": "pending"}
}
```

`document.completed`:
```json
{
  "channel": "documents",
  "event": "document.completed",
  "timestamp": "2024-01-15T10:30:01Z",
  "data": {"document_id": "<uuid>", "document_type": "rfq", "keywords_count": 12, "entities_count": 8, "status": "processed"}
}
```

---

## Configure and Trigger GDELT Polling

Monitored topic set (sampled randomly, 3 topics per poll run):

- shipping delays, factory shutdowns, port closures, raw material shortages
- logistics disruptions, trade sanctions, quality recalls, supplier bankruptcy

Configuration in `app/.env`:
```env
MONITOR_SOURCE=gdelt
GDELT_QUERY=manufacturing supply chain disruption
POLL_INTERVAL_SECONDS=300        # background auto-poll every 5 min
```

The background scheduler starts automatically when the container starts.

**One-shot trigger via SPA**:

1. Click **News Monitor** in the left sidebar
2. Click **Run Poll Now** — wait 5–15 s
3. Alert cards populate the list with title, URL, matched terms, and detected time
4. If the WebSocket tab is open, `alert.detected` events stream in simultaneously

**One-shot trigger via Swagger**: **POST /api/v1/news/poll** → **Try it out** → **Execute**

Response `201`:
```json
{
  "poll_run_id": "<uuid>",
  "status": "completed",
  "items_seen": 9,
  "alerts_created": 9
}
```

**Duplicate handling**: trigger the poll a second time — same URLs are rejected by a unique constraint on `(source_name, article_url)`. Response shows `alerts_created: 0`. Container logs confirm:
```
INFO  alert_service - skipping duplicate: url=https://...
```

**GDELT fallback** (if API is unavailable during interview): all prior alerts, poll runs, and WebSocket audit records remain visible in the DB Explorer — the demo runs entirely from persisted data.

---

## Frontend Assets

| Detail | Value |
|--------|-------|
| Folder | `app/static/` |
| Start | `docker compose -f app/docker-compose.yml up --build` |
| URL | `http://localhost:8800/index.html` |

---

## REST Validation Flows — via Swagger (`http://localhost:8800/docs`)

**Happy path**:

| Step | Endpoint | Expected |
|------|----------|---------|
| Upload | POST /api/v1/documents | `201` |
| List | GET /api/v1/documents | `200` array |
| Keywords | GET /api/v1/documents/{id}/keywords | `200` |
| Entities | GET /api/v1/documents/{id}/entities | `200` |
| Delete | DELETE /api/v1/documents/{id} | `204` |
| Confirm gone | GET /api/v1/documents/{id} | `404` |

**Validation failures**:

| Scenario | How to reproduce | Expected |
|----------|-----------------|---------|
| Duplicate file | Upload same file twice | `409` — `DUPLICATE_DOCUMENT` |
| Empty file | Upload a 0-byte file | `422` — `EMPTY_FILE` |
| Binary file | Upload a `.png` | `415` — `UNSUPPORTED_MEDIA_TYPE` |
| Missing ID | GET with random UUID | `404` — `Document not found` |

---

## DB Explorer (SPA)

The built-in DB Explorer lets you browse and clean any SQLite table directly in the browser — useful for resetting state between demo runs during the interview.

**How to open it:**

1. Navigate to `http://localhost:8800/index.html`
2. Click **DB Explorer** (🗄️) in the left sidebar

**What it shows:**

- A dropdown listing every table with its current row count
- Selecting a table loads a paginated row view with all columns visible
- Tables available: `documents`, `extracted_keywords`, `extracted_entities`, `alert_events`, `poll_runs`, `websocket_messages`

**Delete options** *(for testing and interview purposes)*:

| Action | How |
|--------|-----|
| Delete a single row | Click the **Delete** button on that row |
| Clear an entire table | Click **Clear Table** at the top of the table view |

This lets you:
- Remove a document to test re-upload or 404 behaviour
- Clear `alert_events` before running a fresh GDELT poll to demonstrate `alerts_created > 0`
- Wipe `websocket_messages` to start the audit log from scratch
- Reset any table to a clean state without restarting the container

> **Note:** these delete operations are destructive and intended only for local demo and interview use. The volume-mounted database is restored to a clean state by running `docker compose down -v && docker compose up --build`.
