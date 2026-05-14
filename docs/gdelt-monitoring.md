# GDELT Monitoring

![GDELT](https://img.shields.io/badge/GDELT-Global_Database_of_Events-FF6B35?style=flat-square)

## Overview

DataISource integrates with the [GDELT Document 2.0 API](https://api.gdeltproject.org) to continuously monitor global news for supply-chain disruptions. A background asyncio scheduler runs a full poll cycle every `POLL_INTERVAL_SECONDS` (default 300 s).

---

## Accessing from the SPA

Open the app at `http://localhost:8800/index.html` and click **News Monitor** in the left sidebar.

| ![News Monitor](screenshoots/news-monitor.png) | ![Alert Detail](screenshoots/news-details.png) |
|---|---|
| Alerts list with matched terms | Full article detail |

From the News Monitor view you can:
- Browse all detected `AlertEvent` records with matched topics and article URLs
- Click any alert to expand its full detail and payload
- Press **Trigger Poll** to run an on-demand GDELT poll cycle without waiting for the scheduler

---

## Accessing from Swagger

Open `http://localhost:8800/docs` and expand the **news** section.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/news/poll` | Trigger one-shot poll cycle immediately |
| `GET` | `/api/v1/news/alerts` | List all stored alert events |
| `GET` | `/api/v1/news/alerts/{id}` | Fetch a single alert by ID |
| `DELETE` | `/api/v1/news/alerts` | Delete all alerts |

Click **Try it out → Execute** on `POST /api/v1/news/poll` to fire an immediate poll and watch the response for `items_seen` and `alerts_created` counts.

---

## Monitor Topics

The default topics polled from GDELT:

> shipping delays · factory shutdown · steel shortage · logistics crisis · port congestion · freight disruption · raw material shortage · manufacturing delays · transport strike · industrial shutdown

**To customise topics**, set the `GDELT_QUERY` environment variable in your `.env` file as a comma-separated list:

```env
GDELT_QUERY=semiconductor shortage,chip supply crisis,rare earth shortage,energy crisis
```

You can also tune the polling interval:

```env
POLL_INTERVAL_SECONDS=120
```

Both variables are read at startup via `settings.py` (`gdelt_query` / `poll_interval_seconds`). No code changes needed.

---

## Poll Cycle

1. **Sample** 3 topics randomly from the configured monitor list
2. **Fetch** up to 3 articles per topic concurrently (semaphore `max_concurrent=3`, stagger delay)
3. **Deduplicate** by article URL across topics and across previous poll runs
4. **Persist** new `AlertEvent` rows; skip duplicates via unique constraints
5. **Publish** `alert.detected` events to the WebSocket event bus
6. **Record** the full poll run in `poll_runs` with status, counts, and timing

## Retry Strategy

| Condition | Backoff |
|-----------|---------|
| Network error | 1 s → 2 s → 4 s (×3) |
| HTTP 429 (rate-limit) | `Retry-After` header, then 3 s → 6 s → 12 s |

## GDELT API Endpoint

```
GET https://api.gdeltproject.org/api/v2/doc/doc
  ?query=<topic>
  &timespan=7days
  &maxrecords=3
  &format=json
```

## Data Model

See `alert_events` table in the [README Database Schema](../README.md#database-schema).

Unique constraints prevent duplicate articles:
- `(source_name, article_url)` — URL-level dedup across all poll runs
- Partial unique on `(source_name, source_item_id)` where `source_item_id IS NOT NULL`

## On-Demand Trigger (curl)

```bash
curl -X POST http://localhost:8800/api/v1/news/poll
```

## WebSocket Events

Subscribe to the `alerts` channel to receive real-time push notifications:

```bash
wscat -c ws://localhost:8800/api/v1/ws/events/alerts
```

Event envelope:
```json
{
  "channel": "alerts",
  "event": "alert.detected",
  "data": {
    "id": "...",
    "article_title": "...",
    "article_url": "...",
    "matched_terms": ["shipping delays"]
  }
}
```
