# Data Extraction Guide

This document explains how the DataISource platform extracts structured data from manufacturing documents and GDELT news — covering the NLP pipeline, the GDELT poll cycle, API access, and the real-time event flow.

---

## 1. Document NLP Extraction

### How It Works

When a document is uploaded via `POST /api/v1/documents`, the platform runs it through a **rule-based NLP pipeline** backed by spaCy (blank tokenizer — no heavy model download required).

```
POST /api/v1/documents
        │
        ▼
DocumentService.ingest()
        │
        ▼
ExtractionService.run()
        ├── detect_document_type()   → rfq | specification | document
        ├── extract_keywords()       → keyword_section + pattern matching
        └── extract_entities()       → material, quantity, tolerance, cert, incoterm …
        │
        ▼
SQLite  (extracted_keywords + extracted_entities tables)
        │
        ▼
EventBus → WebSocket push  (document.completed)
```

### Document Type Detection

Uses `PhraseMatcher` against known vocabulary:

| Type | Trigger phrases |
|------|----------------|
| `rfq` | "request for quotation", "RFQ", "tender" |
| `specification` | "technical specification", "material spec" |
| `document` | fallback |

### Keyword Extraction

1. **Section-based** — scans for a "Keywords Of Interest" section header and extracts the listed terms.
2. **Pattern-based** — regex patterns for material grades, standards references, and similar codes.

### Entity Types

| Entity | Examples |
|--------|---------|
| `material` | `SS316L`, `EN10025 S355`, `Inconel 625` |
| `quantity` | `500 pcs`, `1000 units` |
| `unit` | `pcs`, `kg`, `mm`, `bar` |
| `tolerance` | `±0.05mm`, `H7`, `IT6` |
| `certification` | `ISO 9001`, `PED 2014/68/EU`, `EN 10204-3.1` |
| `incoterm` | `DDP`, `CIF`, `FOB`, `EXW` |
| `process` | `CNC machining`, `turning`, `milling` |

### Confidence Scoring

```
confidence = (CONFIDENCE_WEIGHT_PATTERN    × pattern_score)
           + (CONFIDENCE_WEIGHT_VALIDATION × validation_score)
           + (CONFIDENCE_WEIGHT_CONTEXT    × context_score)
```

Weights are environment-variable-configurable and must sum to `1.0` (defaults: `0.5 / 0.3 / 0.2`).

### Retrieve Extracted Data

```bash
# Keywords for a document
GET /api/v1/documents/{id}/keywords

# Entities for a document
GET /api/v1/documents/{id}/entities
```

Response example (`/entities`):
```json
[
  {
    "entity_type": "material",
    "entity_value": "SS316L",
    "normalized_value": "ss316l",
    "confidence": 0.92,
    "start_offset": 142,
    "end_offset": 148
  }
]
```

Use the sample file at `docs/manufacturing_rfq_sample.txt` to test the full pipeline end-to-end.

---

## 2. GDELT News Extraction

### How It Works

A background scheduler polls the **GDELT Document 2.0 API** every `POLL_INTERVAL_SECONDS` (default 300 s) and converts matching articles into `AlertEvent` rows.

```
Scheduler (asyncio) ── every POLL_INTERVAL_SECONDS ──►
                                                      PollService.run_poll()
                                                             │
                                               ┌────────────┴────────────┐
                                               │  sample 3 monitor topics│
                                               │  fetch GDELT (async)    │
                                               │  deduplicate by URL     │
                                               │  persist AlertEvents    │
                                               │  publish to EventBus    │
                                               └─────────────────────────┘
```

### GDELT API Query

```
GET https://api.gdeltproject.org/api/v2/doc/doc
  ?query="<topic>" sourcelang:English
  &timespan=7days
  &maxrecords=3
  &mode=artlist
  &format=json
```

Per poll run, **3 topics** are randomly sampled from `GDELT_QUERY`. Requests are issued concurrently (semaphore limit 3, 0.4 s stagger).

### Retry Strategy

| Error | Behaviour |
|-------|-----------|
| Network error | 1 s → 2 s → 4 s exponential backoff (3 attempts) |
| HTTP 429 | Honour `Retry-After` header, then 3 s → 6 s → 12 s |

### Normalized Article Payload

```json
{
  "source_name": "gdelt",
  "source_item_id": "<article_url>",
  "title": "<headline>",
  "url": "<article_url>",
  "published_at": "<UTC ISO-8601>",
  "query": "<matched_topic>",
  "matched_terms": ["<topic>"],
  "raw_payload": { ... }
}
```

### Retrieve Alerts

```bash
# List all stored alerts
GET /api/v1/news/alerts

# Single alert detail
GET /api/v1/news/alerts/{id}

# Trigger an on-demand poll (no wait for scheduler)
POST /api/v1/news/poll
```

### Real-Time Push

Connect to the `alerts` WebSocket channel to receive push events as articles are detected:

```
ws://localhost:8800/api/v1/ws/events/alerts
```

Event envelope:
```json
{
  "channel": "alerts",
  "event": "alert.detected",
  "timestamp": "2024-01-15T10:30:01Z",
  "data": {
    "alert_id": "...",
    "title": "...",
    "url": "...",
    "matched_terms": ["shipping delays"],
    "detected_at": "2024-01-15T10:30:01Z"
  }
}
```

---

## 3. Monitor Topics

Configured via the `GDELT_QUERY` environment variable (comma-separated). Defaults:

```
shipping delays, factory shutdown, steel shortage, logistics crisis,
port congestion, freight disruption, raw material shortage,
manufacturing delays, transport strike, industrial shutdown
```

---

## 4. Database Schema

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

---

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

---

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
| `start_offset` | INTEGER | nullable, char offset in source text |
| `end_offset` | INTEGER | nullable |
| `created_at` | DATETIME | UTC |

---

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
| `matched_terms_json` | TEXT | JSON array of matched topics |
| `payload_json` | TEXT | full GDELT response JSON |
| `alert_status` | TEXT CHECK | `detected` \| `notified` \| `duplicate` \| `failed` |
| `detected_at` | DATETIME | UTC |
| `notified_at` | DATETIME | nullable |
| `processing_error` | TEXT | nullable |

Unique constraints:
- `(source_name, article_url)` — URL-level deduplication
- Partial unique on `(source_name, source_item_id)` where `source_item_id IS NOT NULL`

---

### `poll_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `source_name` | TEXT | `gdelt` |
| `query_text` | TEXT | topics queried or `configured_monitor_topics` |
| `window_start` | DATETIME | nullable |
| `window_end` | DATETIME | nullable |
| `run_status` | TEXT CHECK | `started` \| `completed` \| `failed` |
| `items_seen` | INTEGER | articles fetched |
| `alerts_created` | INTEGER | new alerts persisted |
| `started_at` | DATETIME | UTC |
| `completed_at` | DATETIME | nullable |
| `error_message` | TEXT | nullable |

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

## 5. Key Files

| File | Role |
|------|------|
| `services/extraction_engine.py` | spaCy rule patterns |
| `services/extraction_service.py` | NLP pipeline coordinator |
| `services/gdelt_service.py` | GDELT async HTTP client |
| `services/poll_service.py` | Poll orchestration |
| `services/alert_service.py` | Alert persistence + broadcast |
| `api/v1/endpoints/documents.py` | Document + entity endpoints |
| `api/v1/endpoints/news.py` | News / alert endpoints |
| `settings.py` | All configurable weights and intervals |
| `docs/manufacturing_rfq_sample.txt` | Sample document for testing |
