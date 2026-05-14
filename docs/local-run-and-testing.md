# Local Run and Testing

The application and tests are runnable live during the interview using the steps below.

Two browser entry points cover everything — no terminal needed after the container starts:

| URL | Purpose |
|-----|---------|
| `http://localhost:8800/index.html` | Full SPA — upload, WebSocket, news, DB explorer |
| `http://localhost:8800/docs` | Swagger UI — interactive REST testing for every endpoint |

---

## 1. Create the Environment File

Copy `sample.env` to `.env` before starting anything:

```bash
cp sample.env .env
```

On Windows:
```powershell
Copy-Item sample.env .env
```

`.env` is read by the container at startup via `env_file` in `docker-compose.yml`.  
Do not commit `.env` to source control — it is listed in `.gitignore`.

The file controls:

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `local` | Environment name |
| `PORT` | `8800` | API listen port |
| `LOG_LEVEL` | `INFO` | Python log level |
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins |
| `SQLITE_DB_PATH` | `/app/data/DataISource-takehome.sqlite3` | Database path inside container |
| `MONITOR_SOURCE` | `gdelt` | News monitoring source |
| `GDELT_QUERY` | *(10 comma-separated topics)* | Topics sampled on each poll run |
| `POLL_INTERVAL_SECONDS` | `300` | Background poll interval in seconds |
| `CONFIDENCE_WEIGHT_PATTERN` | `0.5` | NLP confidence weight |
| `CONFIDENCE_WEIGHT_VALIDATION` | `0.3` | NLP confidence weight |
| `CONFIDENCE_WEIGHT_CONTEXT` | `0.2` | NLP confidence weight |

---

## 2. Start the API with Docker

```bash
docker compose up --build
```

Wait for:
```
INFO:     Application startup complete.
```

Then open both tabs in the browser. The SQLite database persists in `./data/` on the host as a mounted volume — survives restarts.

Tear down:
```bash
docker compose down
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
- Enter any channel URL and click **Connect** — status indicator turns green
- Watch incoming events appear in real time in the message log
- Switch channels to test channel isolation (`/documents`, `/alerts`, `/records`, or `/events` for all)
- Trigger messages by uploading a document in a second tab — events stream in immediately

Successful connection:
```
● Connected — ws://localhost:8800/api/v1/ws/events
```

Then after a document upload:
```json
{"channel": "documents", "event": "document.completed", "timestamp": "...", "data": {...}}
```

---

#### 2. API Tests (🧪)

**What it is:** A built-in REST testing harness — like a lightweight Postman — that lets you fire requests at every endpoint directly from the browser.

**How to open it:**
1. Go to `http://localhost:8800/index.html`
2. Click **API Tests** (🧪) in the left sidebar

**What it lets you do:**
- Select any endpoint from a pre-built list
- Fill in path parameters and request body
- Click **Send** — response status, headers, and JSON body shown inline
- Test happy-path and error cases (duplicate → 409, missing ID → 404) without writing curl

---

### Backend Automated Tests (pytest)

Four test files, run entirely inside the Docker container. Each test uses an isolated in-memory SQLite database. GDELT is mocked — no network calls.

```bash
docker compose run --rm api pytest -v
```

| File | Tests | What is covered |
|------|-------|----------------|
| `test_health.py` | 2 | `/health` returns `200`, response shape |
| `test_documents.py` | 31 | list, upload success + shape + type; duplicate `409`, empty `422`, whitespace `422`, bad MIME `415`, non-UTF-8 `422`, long filename `422`, path traversal `422`; get/delete; keywords + entities list, shape, totals, not-found; UTC `created_at` |
| `test_news.py` | 12 | alerts list/get/delete; poll mocked success (empty + with alert); GDELT failure → `500` |
| `test_tables.py` | 17 | list all 6 tables + row counts; get rows (valid, invalid, shape, columns, pagination, beyond data); clear table; delete single row |

Single file:
```bash
docker compose run --rm api pytest app/tests/test_documents.py -v
```

---

## Live Demo Path (Interview)

```bash
cp sample.env .env
docker compose up --build
```

Open both tabs — everything below is done in the browser.

---

## Ingest the Sample Document

**Via SPA** (`http://localhost:8800/index.html`):
1. Click **Upload Document** in the left sidebar
2. Click **Choose File** → select `docs/manufacturing_rfq_sample.txt`
3. Click **Upload**
4. Extracted keywords and entities render inline with confidence scores

**Via Swagger** (`http://localhost:8800/docs`):
1. Expand **POST /api/v1/documents** → **Try it out**
2. Upload `docs/manufacturing_rfq_sample.txt` → **Execute**
3. Response `201` with the document record

---

## Verify Extracted Keywords and Entities

**Via SPA**: the Upload result panel lists every keyword with score and every entity with type, value, and confidence. Click **Dashboard** for aggregate counts.

**Via Swagger**: copy the `id` from the upload response, then:
- **GET /api/v1/documents/{id}/keywords** → **Try it out** → paste `id` → **Execute**
- **GET /api/v1/documents/{id}/entities** → same steps

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
1. Click **WebSocket Test** (⚡) in the left sidebar
2. URL field is pre-filled with `ws://localhost:8800/api/v1/ws/events`
3. Click **Connect** — status indicator turns green
4. No authentication or subscription payload required

Available channels:
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
2. Click **Upload Document** → upload `docs/manufacturing_rfq_sample.txt`
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

Monitored topic set is configured in `.env` via `GDELT_QUERY` (comma-separated):

```
shipping delays, factory shutdown, steel shortage, logistics crisis,
port congestion, freight disruption, raw material shortage,
manufacturing delays, transport strike, industrial shutdown
```

3 topics are sampled randomly on each poll run. The background scheduler starts automatically when the container starts (every `POLL_INTERVAL_SECONDS=300`).

**One-shot trigger via SPA**:
1. Click **News Monitor** in the left sidebar
2. Click **Run Poll Now** — wait 5–15 s
3. Alert cards populate the list with title, URL, matched terms, and detected time
4. If the WebSocket tab is open, `alert.detected` events stream in simultaneously

**One-shot trigger via Swagger**: **POST /api/v1/news/poll** → **Try it out** → **Execute**

Response `201`:
```json
{"poll_run_id": "<uuid>", "status": "completed", "items_seen": 9, "alerts_created": 9}
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
| Folder | `static/` |
| Start | `docker compose up --build` |
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

The built-in DB Explorer lets you browse and clean any SQLite table — useful for resetting state between demo runs.

**How to open it:**
1. Navigate to `http://localhost:8800/index.html`
2. Click **DB Explorer** (🗄️) in the left sidebar

**What it shows:**
- Dropdown listing every table with its current row count
- Selecting a table loads a paginated row view with all columns visible
- Tables: `documents`, `extracted_keywords`, `extracted_entities`, `alert_events`, `poll_runs`, `websocket_messages`

**Delete options** *(for testing and interview purposes)*:

| Action | How |
|--------|-----|
| Delete a single row | Click the **Delete** button on that row |
| Clear an entire table | Click **Clear Table** at the top of the table view |

Use this to:
- Clear `alert_events` before a fresh GDELT poll to demonstrate `alerts_created > 0`
- Remove a document to test re-upload or 404 behaviour
- Reset any table to a clean state without restarting the container

> Full database reset: `docker compose down -v && docker compose up --build`
