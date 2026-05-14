# AWS, Governance, and Quality Notes

---

## AWS Service Mapping (Production)

| Component | Local (Dev) | Production |
|-----------|-------------|------------|
| API runtime | Docker Compose | ECS Fargate — rolling deploy, min 50% healthy |
| Entry point | `localhost:8800` | ALB (HTTPS/WSS) + AWS WAF |
| Background scheduler | In-process asyncio loop | EventBridge Scheduled Rule → dedicated Fargate task |
| Database | SQLite + aiosqlite (host volume) | RDS PostgreSQL + asyncpg (driver swap only, no code change) |
| Document storage | SQLite `raw_text` column | S3 (SSE-S3); S3 key stored in DB row |
| Config / secrets | `.env` file | SSM Parameter Store SecureString (KMS-encrypted) |
| Container registry | Local build | ECR (immutable tags, commit SHA) |
| Logs | stdout plain-text | CloudWatch Logs (JSON structured, 30-day retention) |
| Alerts | None | CloudWatch Alarms → SNS → PagerDuty |

```
Internet → AWS WAF → ALB (HTTPS/WSS :443)
                          ↓
           ECS Fargate tasks  (private subnet, no public IP)
                          ↓
           RDS PostgreSQL  (isolated subnet, port 5432 open to ECS SG only)
```

---

## WebSocket Scaling

The current `ConnectionManager` is **in-process**. Correct for one replica; breaks at two because events published on task A do not reach connections held on task B.

**Production fix:** replace `EventBus` with **ElastiCache Redis Pub/Sub**. Each Fargate task subscribes at startup; every `publish()` call writes to Redis; all tasks fan out locally. The `EventBus.publish` / `subscribe` interface is unchanged — only the backing implementation is swapped.

---

## Data Governance

### Retention

| Table | Data classification | Retention |
|-------|---------------------|-----------|
| `documents` | Internal — manufacturing specs | 90 days |
| `extracted_keywords`, `extracted_entities` | Internal | Deleted with parent document (CASCADE) |
| `alert_events` | Public (GDELT metadata) | 30 days → S3 Glacier |
| `poll_runs` | Operational | 90 days |
| `websocket_messages` | Operational audit log | 7 days rolling |

### Access Control

- ECS task IAM role: `ssm:GetParameter` scoped to its own path prefix; `s3:PutObject/GetObject` scoped to its own prefix only
- RDS security group: port 5432 open to ECS SG only — no public access
- S3 bucket: public access block on; no `GetObject` without signed URL
- No PII ingested — system processes manufacturing specs and public news metadata only

---

## Database Deduplication (from ORM)

Constraints are defined in [app/db/sqlite/base.py](../db/sqlite/base.py).

| Boundary | ORM constraint | Behaviour |
|----------|---------------|-----------|
| Document upload | `UNIQUE (source_sha256)` on `documents` | Returns `409 DUPLICATE_DOCUMENT` |
| Keyword extraction | `UNIQUE (document_id, normalized_keyword)` on `extracted_keywords` | Skips on re-process |
| Alert — by URL | `UNIQUE (source_name, article_url)` on `alert_events` | Rejected at DB savepoint — does not abort poll transaction |
| Alert — by GDELT ID | Partial `UNIQUE (source_name, source_item_id) WHERE source_item_id IS NOT NULL` | Same savepoint pattern |
| Poll run lifecycle | `CHECK run_status IN ('started', 'completed', 'failed')` | Stuck `started` rows detectable via monitoring query |

---

## Test Quality

62 tests across 4 files. Each test uses an isolated temp-file SQLite. GDELT is mocked — no network.

| File | Tests | Coverage |
|------|-------|---------|
| `test_health.py` | 2 | Status, DB reachability |
| `test_documents.py` | 31 | Upload, dedup, extraction, retrieval, delete, keywords, entities, all 7 validation failures |
| `test_news.py` | 12 | Alert CRUD, poll lifecycle, GDELT mock success and failure |
| `test_tables.py` | 17 | Table list, pagination, row counts, clear, delete single row |

Validation failures tested: duplicate `409` · empty `422` · whitespace-only `422` · unsupported MIME `415` · non-UTF-8 `422` · oversized filename `422` · path traversal `422`

All error responses return machine-readable JSON:
```json
{"detail": "A document with this content already exists.", "error_code": "DUPLICATE_DOCUMENT", "document_id": "..."}
```

---

## Assumptions and Trade-offs

| Decision | Trade-off |
|----------|-----------|
| SQLite in dev | Zero setup, WAL mode handles concurrent reads. Not horizontally scalable — migrate to RDS for multi-replica. ORM abstraction makes this a config-only change. |
| In-process asyncio scheduler | Single container simplicity. Does not survive a mid-poll crash. Mitigation: alarm on `poll_runs` rows stuck in `started` for > 2× `POLL_INTERVAL_SECONDS`. |
| spaCy blank pipeline | No model download, deterministic, small image. Lower recall on non-RFQ documents. Upgrade path: swap in `en_core_web_sm` behind the same `ExtractionService` interface. |
| GDELT as news source | Public, no auth, no SLA. Mitigated by retry with exponential backoff. If unavailable, `PollRun` is marked `failed` — no data loss, next cycle retries. |
| In-memory WebSocket fan-out | Correct for one replica. Production fix is Redis Pub/Sub (see above) with no application code changes. |
