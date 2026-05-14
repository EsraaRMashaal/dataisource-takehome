# DataISource — Backend Platform Take-Home

![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.116-009688?style=flat-square&logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white)
![spaCy](https://img.shields.io/badge/spaCy-3.7-09A3D5?style=flat-square&logo=spacy&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-v2-E92063?style=flat-square&logo=pydantic&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-real--time-6C3483?style=flat-square)
![pytest](https://img.shields.io/badge/pytest-8.3-0A9EDC?style=flat-square&logo=pytest&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5-7952B3?style=flat-square&logo=bootstrap&logoColor=white)
![GDELT](https://img.shields.io/badge/GDELT-monitoring-FF6B35?style=flat-square)

A supplier-intelligence backend platform for manufacturing RFQ (Request for Quotation) document analysis. It demonstrates three communication patterns — **REST**, **WebSocket**, and **background polling** — on a single async Python stack.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [WebSocket Channels](#websocket-channels)
- [NLP Extraction Pipeline](#nlp-extraction-pipeline)
- [GDELT Monitoring](#gdelt-monitoring)
- [Getting Started](#getting-started)
- [Frontend SPA](#frontend-spa)
- [Design Decisions](#design-decisions)

---

## Overview

DataISource ingests plain-text manufacturing documents (RFQs, technical specs), extracts structured entities via rule-based NLP, and monitors global news for supply-chain disruptions using the GDELT API. Clients receive real-time push updates over WebSocket as each stage completes.

```
Client ──POST /documents──► FastAPI ──► ExtractionService ──► SQLite
                                │                                  │
                                ▼                                  ▼
                          EventBus ──► WebSocket Manager ──► Client WS
                                │
                          PollScheduler ──► GDELTService ──► AlertEvents ──► Client WS
```

---

## Tech Stack

### Backend

| Layer | Technology | Badge |
|-------|-----------|-------|
| Framework | FastAPI 0.116 + Uvicorn 0.35 | ![FastAPI](https://img.shields.io/badge/FastAPI-0.116-009688?style=flat-square&logo=fastapi&logoColor=white) |
| Language | Python 3.13 | ![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white) |
| Database | SQLite 3 + aiosqlite 0.20 | ![SQLite](https://img.shields.io/badge/SQLite-aiosqlite-003B57?style=flat-square&logo=sqlite&logoColor=white) |
| ORM | SQLAlchemy 2.0 (async) | ![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-D71F00?style=flat-square) |
| Validation | Pydantic v2 + pydantic-settings | ![Pydantic](https://img.shields.io/badge/Pydantic-v2-E92063?style=flat-square) |
| NLP | spaCy 3.7 (blank tokenizer) | ![spaCy](https://img.shields.io/badge/spaCy-3.7-09A3D5?style=flat-square) |
| HTTP Client | httpx 0.28 (async) | ![httpx](https://img.shields.io/badge/httpx-0.28-00897B?style=flat-square) |
| WebSocket | Starlette WebSocket (via FastAPI) | ![WebSocket](https://img.shields.io/badge/WebSocket-real--time-6C3483?style=flat-square) |
| File Upload | python-multipart 0.0.20 | ![multipart](https://img.shields.io/badge/multipart-0.0.20-607D8B?style=flat-square) |
| Scheduling | asyncio-based scheduler | ![asyncio](https://img.shields.io/badge/asyncio-built--in-3776AB?style=flat-square) |

### Frontend

| Layer | Technology | Badge |
|-------|-----------|-------|
| UI Framework | Bootstrap 5 (CDN) | ![Bootstrap](https://img.shields.io/badge/Bootstrap-5-7952B3?style=flat-square&logo=bootstrap&logoColor=white) |
| JavaScript | Vanilla ES6 modules | ![JS](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?style=flat-square&logo=javascript&logoColor=black) |
| Build | None (zero-build static) | ![Static](https://img.shields.io/badge/Build-none-lightgrey?style=flat-square) |
| WebSocket | Browser native API | ![WS](https://img.shields.io/badge/WebSocket-native-6C3483?style=flat-square) |

### Testing & DevOps

| Tool | Version | Badge |
|------|---------|-------|
| pytest | 8.3 | ![pytest](https://img.shields.io/badge/pytest-8.3-0A9EDC?style=flat-square&logo=pytest&logoColor=white) |
| pytest-asyncio | auto mode | ![asyncio](https://img.shields.io/badge/pytest--asyncio-auto-0A9EDC?style=flat-square) |
| Docker | python:3.13-slim | ![Docker](https://img.shields.io/badge/Docker-3.13--slim-2496ED?style=flat-square&logo=docker&logoColor=white) |
| docker-compose | v2 | ![compose](https://img.shields.io/badge/compose-v2-2496ED?style=flat-square&logo=docker&logoColor=white) |

---

## Architecture

### Layered Design

```
┌─────────────────────────────────────────────────┐
│                  HTTP / WebSocket                │
│              (FastAPI routes + ASGI)             │
├─────────────────────────────────────────────────┤
│              API Layer  (api/v1/)                │
│   endpoints/  │  models/  │  ws/                │
├─────────────────────────────────────────────────┤
│             Service Layer  (services/)           │
│  DocumentService │ ExtractionService │ GdeltSvc  │
│  PollService     │ AlertService      │ EventBus  │
├─────────────────────────────────────────────────┤
│           Repository Layer  (db/repositories/)  │
│  DocumentRepo │ AlertRepo │ PollRepo │ WsAudit   │
├─────────────────────────────────────────────────┤
│         Persistence  (SQLite + aiosqlite)        │
│   SQLAlchemy 2.0 async ORM │ WAL mode enabled   │
└─────────────────────────────────────────────────┘
```

### Event-Driven Communication

```
DocumentService ─── publish("document.completed") ──►┐
AlertService    ─── publish("alert.detected")  ──────►│ EventBus
PollService     ─── publish("poll.completed")  ──────►│ (in-process pub/sub)
                                                      │
                    ◄── subscribe(channel) ───────────┘
                    │
              WsConnectionManager
                    │
              ┌─────┴──────────────┐
              │  per-client WS     │  WsMessageRepository
              │  send_json(event)  │  (audit log every broadcast)
              └────────────────────┘
```

### Background Worker Flow

```
Scheduler (asyncio) ─── every POLL_INTERVAL_SECONDS ──►┐
                                                        │
                                                 PollService
                                                        │
                                         ┌──────────────┴──────────────┐
                                         │  sample 3 monitor topics    │
                                         │  fetch GDELT concurrently   │
                                         │  (semaphore + stagger)      │
                                         │  deduplicate by URL         │
                                         │  insert AlertEvents         │
                                         │  publish to EventBus        │
                                         └─────────────────────────────┘
```

---

## Features

### 1. Document Ingestion & NLP Extraction

![Feature](https://img.shields.io/badge/Feature-Document_Ingestion-4CAF50?style=flat-square)

- **Upload** plain-text manufacturing documents via `POST /api/v1/documents`
- **Deduplication** by SHA-256 hash — re-uploading the same file returns `409 Conflict`
- **Document type detection** — classifies as `rfq`, `specification`, or `document`
- **Keyword extraction** — from "Keywords Of Interest" sections or pattern matching
- **Entity extraction** — material grades, quantities, units, tolerances, certifications, incoterms
- **Confidence scoring** — weighted combination of pattern match, validation, and context signals
- **Real-time progress** — WebSocket events fired at each stage (`document.started`, `document.completed`, `document.failed`)

### 2. Real-Time WebSocket Notifications

![Feature](https://img.shields.io/badge/Feature-WebSocket-6C3483?style=flat-square)

- Clients connect to `/api/v1/ws/events` (all channels) or `/api/v1/ws/events/{channel}`
- Four channels: `documents`, `alerts`, `records`, `all`
- Invalid channel name closes connection with code `4001`
- Every broadcast is persisted to `websocket_messages` audit table

### 3. GDELT News Monitoring

![Feature](https://img.shields.io/badge/Feature-GDELT_Monitoring-FF6B35?style=flat-square)

- Background scheduler polls GDELT API every `POLL_INTERVAL_SECONDS` (default 300 s)
- Samples 3 random topics from a configured list (shipping delays, factory shutdowns, supply shortages, etc.)
- Fetches up to 3 articles per topic with concurrency control and stagger delays
- Deduplicates by article URL across topics and across poll runs
- Creates `AlertEvent` records, pushes them to WebSocket subscribers
- Can also be triggered on-demand via `POST /api/v1/news/poll`

### 4. Database Explorer

![Feature](https://img.shields.io/badge/Feature-DB_Explorer-003B57?style=flat-square)

- `GET /api/v1/tables` — list all tables with row counts
- `GET /api/v1/tables/{table_name}` — paginated rows
- `DELETE /api/v1/tables/{table_name}` — clear a table
- `DELETE /api/v1/tables/{table_name}/{row_id}` — delete one row

---

## Project Structure

```
/  (repository root)
├── server.py                 ← FastAPI app factory + lifespan
├── settings.py               ← Pydantic BaseSettings (env-driven config)
├── logger.py                 ← structured logging setup
├── ui.py                     ← static file / partial serving
├── .env                      ← runtime environment variables
├── Dockerfile                ← container definition
├── docker-compose.yml        ← local orchestration
├── requirements.txt          ← pinned Python dependencies
├── pytest.ini                ← asyncio_mode = auto, testpaths = tests
│
├── api/v1/
│   ├── endpoints/
│   │   ├── documents.py      ← upload, list, get, delete, keywords, entities
│   │   ├── news.py           ← poll trigger, alert list/get/delete
│   │   ├── tables.py         ← database explorer endpoints
│   │   ├── health.py         ← liveness + readiness probe
│   │   └── websocket.py      ← WS upgrade handler
│   ├── models/
│   │   ├── request_models.py ← Pydantic request schemas
│   │   └── response_models.py← Pydantic response schemas
│   └── ws/
│       └── connection_manager.py ← WebSocket registry + broadcast
│
├── db/
│   ├── database.py           ← async engine, session factory, get_db dependency
│   ├── sqlite/
│   │   ├── base.py           ← SQLAlchemy ORM models
│   │   └── __init__.py       ← WAL mode + FK pragmas
│   └── repositories/
│       ├── document_repository.py
│       ├── alert_repository.py
│       ├── poll_repository.py
│       └── ws_message_repository.py
│
├── services/
│   ├── document_service.py   ← document ingestion orchestration
│   ├── extraction_service.py ← extraction pipeline coordinator
│   ├── extraction_engine.py  ← spaCy rule-based patterns
│   ├── extraction_models.py  ← extraction dataclasses
│   ├── gdelt_service.py      ← GDELT API async client
│   ├── poll_service.py       ← polling orchestration
│   ├── alert_service.py      ← alert CRUD + lifecycle
│   └── event_bus.py          ← in-process async pub/sub
│
├── workers/
│   ├── polling_worker.py     ← poll cycle executor
│   └── scheduler.py          ← asyncio-based scheduler
│
├── static/
│   ├── index.html            ← SPA shell
│   ├── css/                  ← Bootstrap + custom styles
│   ├── js/                   ← ES6 modules (api/, views, utils)
│   └── partials/             ← HTML fragments (dynamically loaded)
│
├── tests/
│   ├── conftest.py           ← async test fixtures, DB isolation
│   ├── test_documents.py     ← 31 document endpoint tests
│   ├── test_health.py        ← health check tests
│   ├── test_news.py          ← alert + polling tests (mocked GDELT)
│   └── test_tables.py        ← database explorer tests
│
├── docs/
│   ├── diagram-requirements.md
│   ├── local-run-and-testing.md
│   ├── aws-governance-and-quality.md
│   └── manufacturing_rfq_sample.txt  ← sample RFQ document
│
└── data/                     ← SQLite DB written here at runtime (gitignored)
    └── DataISource-takehome.sqlite3
```

---

## Database Schema

### `documents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `source_filename` | TEXT | original filename |
| `source_mime_type` | TEXT | nullable |
| `source_sha256` | TEXT UNIQUE | deduplication hash |
| `raw_text` | TEXT | full document content |
| `document_type` | TEXT | `rfq` \| `specification` \| `document` |
| `upload_origin` | TEXT | default `local` |
| `processing_status` | TEXT CHECK | `pending` \| `processed` \| `failed` |
| `created_at` | DATETIME | UTC |
| `processed_at` | DATETIME | nullable, UTC |

### `extracted_keywords`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | autoincrement |
| `document_id` | TEXT FK | → documents, CASCADE DELETE |
| `keyword` | TEXT | original form |
| `normalized_keyword` | TEXT | lowercase |
| `score` | FLOAT | confidence 0.0 – 1.0 |
| `source_method` | TEXT | e.g. `keyword_section`, `material_grade_pattern` |
| `created_at` | DATETIME | UTC |

Unique constraint: `(document_id, normalized_keyword)`

### `extracted_entities`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | autoincrement |
| `document_id` | TEXT FK | → documents, CASCADE DELETE |
| `entity_type` | TEXT | `material`, `quantity`, `unit`, `tolerance`, `certification`, `incoterm`, … |
| `entity_value` | TEXT | raw extracted text |
| `normalized_value` | TEXT | nullable, standardized |
| `confidence` | FLOAT | 0.0 – 1.0 |
| `quantity_value` | FLOAT | nullable, numeric component |
| `unit` | TEXT | nullable, e.g. `pcs`, `mm` |
| `start_offset` | INTEGER | nullable, char offset |
| `end_offset` | INTEGER | nullable |
| `created_at` | DATETIME | UTC |

### `poll_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `source_name` | TEXT | `gdelt` |
| `query_text` | TEXT | search query or `configured_monitor_topics` |
| `window_start` | DATETIME | nullable |
| `window_end` | DATETIME | nullable |
| `run_status` | TEXT CHECK | `started` \| `completed` \| `failed` |
| `items_seen` | INTEGER | articles fetched |
| `alerts_created` | INTEGER | alerts persisted |
| `started_at` | DATETIME | UTC |
| `completed_at` | DATETIME | nullable |
| `error_message` | TEXT | nullable |

### `alert_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `poll_run_id` | TEXT FK | → poll_runs, SET NULL on delete |
| `source_name` | TEXT | `gdelt` |
| `source_item_id` | TEXT | nullable, GDELT identifier |
| `article_url` | TEXT | source URL |
| `article_title` | TEXT | headline |
| `published_at` | DATETIME | nullable |
| `matched_terms_json` | TEXT | JSON array of matched terms |
| `payload_json` | TEXT | full GDELT response JSON |
| `alert_status` | TEXT CHECK | `detected` \| `notified` \| `duplicate` \| `failed` |
| `detected_at` | DATETIME | UTC |
| `notified_at` | DATETIME | nullable |
| `processing_error` | TEXT | nullable |

Unique constraints:
- `(source_name, article_url)` — URL-level deduplication
- Partial unique on `(source_name, source_item_id)` where `source_item_id IS NOT NULL`

### `websocket_messages` (audit log)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | autoincrement |
| `channel_name` | TEXT | `documents`, `alerts`, `records`, `all` |
| `event_name` | TEXT | e.g. `document.completed`, `alert.detected` |
| `correlation_id` | TEXT | nullable, trace ID |
| `message_json` | TEXT | full JSON payload |
| `emitted_at` | DATETIME | UTC |

---

## API Reference

Base path: `/api/v1`

### Health

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/health` | `200` | Liveness + readiness probe (checks DB) |

**Response:**
```json
{
  "status": "ok",
  "database": {
    "connected": true,
    "path": "/app/data/DataISource-takehome.sqlite3"
  }
}
```

---

### Documents

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/documents` | `200` | List all documents (newest first) |
| `POST` | `/documents` | `201` | Upload file for extraction (multipart) |
| `GET` | `/documents/{id}` | `200` | Fetch single document |
| `DELETE` | `/documents/{id}` | `204` | Delete document + cascaded keywords/entities |
| `GET` | `/documents/{id}/keywords` | `200` | Extracted keywords |
| `GET` | `/documents/{id}/entities` | `200` | Extracted entities |

**Upload validation rules:**

| Rule | HTTP Status |
|------|------------|
| Duplicate file (same SHA-256) | `409 Conflict` |
| Empty file | `422 Unprocessable Entity` |
| Whitespace-only content | `422 Unprocessable Entity` |
| Unsupported MIME type (non-`text/*`) | `415 Unsupported Media Type` |
| Non-UTF-8 encoding | `422 Unprocessable Entity` |
| File exceeds 10 MB | `422 Unprocessable Entity` |
| Path traversal in filename | `422 Unprocessable Entity` |
| Filename exceeds 255 chars | `422 Unprocessable Entity` |

**Upload response example:**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "source_filename": "rfq_001.txt",
  "document_type": "rfq",
  "processing_status": "processed",
  "created_at": "2024-01-15T10:30:00Z",
  "processed_at": "2024-01-15T10:30:01Z"
}
```

---

### News & Alerts

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `POST` | `/news/poll` | `201` | Trigger one-shot GDELT polling cycle |
| `GET` | `/news/alerts` | `200` | List all stored alert events |
| `GET` | `/news/alerts/{id}` | `200` | Fetch single alert |
| `DELETE` | `/news/alerts` | `204` | Delete all alerts |

---

### Database Explorer

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/tables` | `200` | List all tables with row counts |
| `GET` | `/tables/{name}` | `200` | Paginated rows (`?page=1&page_size=50`) |
| `DELETE` | `/tables/{name}` | `204` | Clear all rows in a table |
| `DELETE` | `/tables/{name}/{row_id}` | `204` | Delete one row |

---

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /api/v1/ws/events` | Subscribe to all channels |
| `WS /api/v1/ws/events/{channel}` | Subscribe to one channel |

Close code `4001` is sent for unknown channel names.

---

## WebSocket Channels

| Channel | Events |
|---------|--------|
| `documents` | `document.started`, `document.completed`, `document.failed`, `document.deleted` |
| `alerts` | `alert.detected`, `alert.notified` |
| `records` | `record.created` |
| `all` | All of the above |

**Event envelope:**
```json
{
  "channel": "documents",
  "event": "document.completed",
  "correlation_id": "abc-123",
  "timestamp": "2024-01-15T10:30:01Z",
  "data": { ... }
}
```

---

## NLP Extraction Pipeline

![NLP](https://img.shields.io/badge/NLP-Rule--based_spaCy-09A3D5?style=flat-square)

The pipeline uses **spaCy with a blank tokenizer** — no heavy language model is downloaded.

### Document Type Detection

Uses `PhraseMatcher` against known vocabulary:
- `rfq` — phrases like "request for quotation", "RFQ", "tender"
- `specification` — phrases like "technical specification", "material spec"
- `document` — fallback

### Keyword Extraction

1. **Section-based** — finds "Keywords Of Interest" or similar section headers, extracts listed terms
2. **Pattern-based** — regex patterns for material grades, standards references, etc.

### Entity Types Extracted

| Entity Type | Examples |
|-------------|---------|
| `material` | `SS316L`, `EN10025 S355`, `Inconel 625` |
| `quantity` | `500 pcs`, `1000 units` |
| `unit` | `pcs`, `kg`, `mm`, `bar` |
| `tolerance` | `±0.05mm`, `H7`, `IT6` |
| `certification` | `ISO 9001`, `PED 2014/68/EU`, `EN 10204-3.1` |
| `incoterm` | `DDP`, `CIF`, `FOB`, `EXW` |
| `process` | `CNC machining`, `turning`, `milling` |

### Confidence Scoring

```
confidence = (pattern_weight × pattern_score)
           + (validation_weight × validation_score)
           + (context_weight × context_score)
```

Configurable via environment variables:
- `CONFIDENCE_WEIGHT_PATTERN` (default `0.5`)
- `CONFIDENCE_WEIGHT_VALIDATION` (default `0.3`)
- `CONFIDENCE_WEIGHT_CONTEXT` (default `0.2`)

---

## GDELT Monitoring

![GDELT](https://img.shields.io/badge/GDELT-Global_Database_of_Events-FF6B35?style=flat-square)

The background scheduler runs a full poll cycle every `POLL_INTERVAL_SECONDS`:

1. **Sample** 3 topics randomly from the configured monitor list (shipping delays, factory shutdowns, port closures, raw material shortages, logistics disruptions, sanctions, quality recalls, etc.)
2. **Fetch** up to 3 articles per topic concurrently (semaphore `max_concurrent=3`, stagger delay)
3. **Deduplicate** by article URL across topics and across previous poll runs
4. **Persist** new `AlertEvent` rows; skip duplicates via unique constraints
5. **Publish** `alert.detected` events to the WebSocket event bus
6. **Record** the full poll run in `poll_runs` with status, counts, and timing

Retry logic: exponential backoff with rate-limit handling for GDELT API calls.

---

## Getting Started

Full startup instructions, environment variables, Docker commands, test runner commands, and the live demo walkthrough are in:

**[docs/local-run-and-testing.md](docs/local-run-and-testing.md)**

Quick start:

```bash
cp sample.env .env
docker compose up --build
```

Open `http://localhost:8800/index.html` (SPA) and `http://localhost:8800/docs` (Swagger UI).

---

## Frontend SPA

The zero-build SPA is served from `static/` and loaded by `ui.py`.

### Views

| View | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Aggregate stats — document counts, entity distribution, alert counts |
| Upload | sidebar | File input, drag-and-drop, real-time extraction results with keyword chips and entity confidence bars |
| WebSocket Test | sidebar | Connect to any channel, send/receive raw messages, inspect event envelope |
| News Monitor | sidebar | Alert list, trigger on-demand GDELT poll, view matched terms |
| DB Explorer | sidebar | Browse any table, paginate rows, delete records |
| API Tests | sidebar | Built-in REST testing harness (cURL-like) |

### Live Event Panel

A collapsible right sidebar shows real-time WebSocket events as they arrive, colour-coded by channel:

- 🟢 `documents` — green
- 🟠 `alerts` — orange
- 🔵 `records` — blue

### Module Layout

```
static/js/
├── main.js            ← partial loader + view bootstrap
├── index.js           ← entry point + event delegation
├── constants.js       ← shared constants (channels, API paths)
├── utils.js           ← formatting helpers
├── renderers.js       ← DOM builders for tables and cards
├── toast.js           ← notification toasts
├── notifications.js   ← notification management
├── view-switcher.js   ← show/hide partials
├── ws-panel.js        ← live event feed sidebar
├── ws-test.js         ← WebSocket test view
├── home.js            ← dashboard view
├── upload.js          ← upload view
├── news.js            ← news monitor view
├── tables.js          ← DB explorer view
├── api-test.js        ← REST test harness
└── api.js             ← HTTP fetch wrapper + all API calls (health, documents, news, tables)
```

---

## Design Decisions

### Why SQLite?

SQLite + aiosqlite with SQLAlchemy async keeps the stack self-contained with zero external services. WAL mode is enabled for concurrent read/write. The repository pattern means swapping to PostgreSQL requires only a connection string change and replacing the engine factory.

### Why Rule-Based NLP (no model)?

Manufacturing entity patterns are highly structured (material grade codes like `SS316L`, EN standards, ISO certs) and don't benefit from probabilistic models. A blank spaCy tokenizer with `Matcher` / `PhraseMatcher` is deterministic, fast, zero-download, and testable — which matters for a take-home submission that must run offline.

### Why an Internal Event Bus?

Decoupling services from the WebSocket layer via an in-process pub/sub (EventBus) means services don't need to know about connected clients. Any future consumer (email notifier, webhook sender, metrics) can subscribe to the same events without touching service code.

### Why Deduplication at Multiple Levels?

- **Documents:** SHA-256 catches byte-identical uploads before any processing
- **Keywords:** normalized unique constraint prevents duplicate extraction on re-processing
- **Alerts:** URL-level unique constraint survives across poll runs; `source_item_id` partial unique catches GDELT-level deduplication
- **Savepoint rollback** per alert insertion means one duplicate doesn't abort the whole poll run

### Async Throughout

FastAPI + Uvicorn (ASGI), SQLAlchemy async sessions, httpx async client, and asyncio-based scheduler all share the same event loop. No threading complexity; no blocking I/O in request handlers.

### Production Path (AWS)

For the full AWS service mapping, WebSocket scaling strategy (Redis Pub/Sub), data governance (retention, encryption, access control), deduplication constraints, and assumption trade-offs, see:

**[docs/aws-governance-and-quality.md](docs/aws-governance-and-quality.md)**

---

## Quick Reference

```bash
# Health check
curl http://localhost:8800/api/v1/health

# Upload a document
curl -X POST http://localhost:8800/api/v1/documents \
  -F "file=@assets/input/manufacturing_rfq_sample.txt"

# List documents
curl http://localhost:8800/api/v1/documents

# Get keywords for a document
curl http://localhost:8800/api/v1/documents/{id}/keywords

# Get entities for a document
curl http://localhost:8800/api/v1/documents/{id}/entities

# Trigger GDELT poll
curl -X POST http://localhost:8800/api/v1/news/poll

# List alerts
curl http://localhost:8800/api/v1/news/alerts

# List DB tables
curl http://localhost:8800/api/v1/tables

# WebSocket (wscat)
wscat -c ws://localhost:8800/api/v1/ws/events
wscat -c ws://localhost:8800/api/v1/ws/events/documents
```

---

*Built for the DataISource backend platform engineering take-home assessment.*
