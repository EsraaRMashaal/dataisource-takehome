# GDELT Monitoring

![GDELT](https://img.shields.io/badge/GDELT-Global_Database_of_Events-FF6B35?style=flat-square)

## Overview

DataISource integrates with the [GDELT Document 2.0 API](https://api.gdeltproject.org) to continuously monitor global news for supply-chain disruptions. A background asyncio scheduler runs a full poll cycle every `POLL_INTERVAL_SECONDS` (default 300 s).

## Poll Cycle

1. **Sample** 3 topics randomly from the configured monitor list
2. **Fetch** up to 3 articles per topic concurrently (semaphore `max_concurrent=3`, stagger delay)
3. **Deduplicate** by article URL across topics and across previous poll runs
4. **Persist** new `AlertEvent` rows; skip duplicates via unique constraints
5. **Publish** `alert.detected` events to the WebSocket event bus
6. **Record** the full poll run in `poll_runs` with status, counts, and timing

## Monitor Topics

Shipping delays · factory shutdowns · port closures · raw material shortages · logistics disruptions · sanctions · quality recalls · freight disruption · manufacturing delays · transport strikes

## Retry Strategy

| Condition | Backoff |
|-----------|---------|
| Network error | 1 s → 2 s → 4 s (×3) |
| HTTP 429 (rate-limit) | `Retry-After` header, then 3 s → 6 s → 12 s |

## API Endpoint

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

## On-Demand Trigger

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
