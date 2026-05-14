# AWS, Governance, and Quality Notes

---

## 1. AWS Service Selection

| Layer | Dev / Local | Production |
|---|---|---|
| Runtime | Docker Compose (single container) | ECS Fargate — rolling deploy, min 50% healthy |
| Entry point | localhost:8800 | ALB (HTTPS :443 / WSS) behind AWS WAF |
| Scheduler | In-process AsyncIO loop | EventBridge Scheduled Rule → dedicated Fargate task |
| Database | SQLite + aiosqlite on host volume | RDS PostgreSQL + asyncpg (driver swap only, no code change) |
| Raw docs | SQLite blob | S3 (SSE-S3), S3 key stored in DB row |
| Config | `.env` file | SSM Parameter Store — SecureString for credentials |
| Image registry | Local build | ECR (immutable tags, commit SHA) |
| Logs | stdout plain-text | CloudWatch Logs JSON, 30-day retention |
| Alerts | None | CloudWatch Alarms → SNS → PagerDuty |

**Networking topology:**
```
Internet → AWS WAF → ALB (HTTPS/WSS)
                       ↓
          ECS Fargate tasks (private subnet, no public IP)
                       ↓
          RDS PostgreSQL (isolated subnet, port 5432 open to ECS SG only)
```

---

## 2. WebSocket Scaling Note

The current `ConnectionManager` is in-memory. Correct for one replica; breaks at two
because events published on task A do not reach connections held on task B.

**Production fix:** replace the in-process `EventBus` with ElastiCache Redis Pub/Sub.
Each task subscribes at startup; every `publish()` call writes to Redis; all tasks fan-out
locally. The `EventBus` interface (`publish`, `subscribe`) does not change — only the
backing implementation is swapped. No application or test changes required.

---

## 3. Data Governance

### Data Classification and Retention

| Data | Classification | Storage | Retention |
|---|---|---|---|
| Uploaded document text | Internal | S3 (prod) / SQLite blob (dev) | 90 days |
| Extracted keywords and entities | Internal | RDS / SQLite | Same as parent document |
| GDELT article metadata | Public | RDS / SQLite | 30 days → S3 Glacier |
| WebSocket audit log | Operational | RDS / SQLite | 7 days rolling |
| Poll run records | Operational | RDS / SQLite | 90 days |
| CloudWatch logs | Operational | CloudWatch | 30 days |

### Encryption

| Layer | Mechanism |
|---|---|
| In-transit API | TLS 1.2+ at ALB; HTTP redirected to HTTPS |
| In-transit DB | `sslmode=require` on asyncpg connection string |
| In-transit S3 | HTTPS only; bucket policy denies non-secure transport |
| At-rest RDS | AES-256, RDS managed key |
| At-rest S3 | SSE-S3 default bucket encryption |
| Secrets | SSM SecureString — customer-managed KMS key |

### Access Control

- ECS task IAM role: `ssm:GetParameter` scoped to its own paths, `s3:PutObject/GetObject` scoped to its own prefix only
- RDS security group: port 5432 inbound from ECS task SG only, no public access
- S3 bucket: public access block enabled, no `GetObject` without signed URL
- No PII ingested by design — system processes manufacturing specs and public news metadata only

### Deduplication and Idempotency

| Boundary | Mechanism |
|---|---|
| Document upload | SHA-256 unique column — second upload of same file returns `409 DUPLICATE_DOCUMENT` |
| Alert creation | `(source_name, source_item_id)` and `(source_name, article_url)` unique constraints — rejected at DB savepoint without rolling back the poll transaction |
| Poll runs | Each run creates a `PollRun` with `started → completed / failed` lifecycle — partial failures are recoverable |

### Audit Trail

- Every WebSocket message is written to `websocket_messages` (channel, event, correlation ID, payload, timestamp)
- CloudTrail enabled at account level: all calls to SSM, ECR, ECS, RDS, S3 logged with actor identity and source IP
- All structured log lines carry a `correlation_id` — traceable from upload through extraction, persistence, and WebSocket delivery

---

## 4. Code Quality

### Tests

62 tests across 4 files. Each test uses an isolated in-memory SQLite. GDELT is mocked — no network.

| File | Tests | What is covered |
|---|---|---|
| `test_health.py` | 2 | Status shape, DB reachability |
| `test_documents.py` | 31 | Upload, dedup, extraction, retrieval, delete, keywords, entities, all validation failures |
| `test_news.py` | 12 | Alert CRUD, poll lifecycle, GDELT mock success and failure |
| `test_tables.py` | 17 | Table list, pagination, row counts, clear, delete single row |

Validation failures tested explicitly: duplicate `409`, empty `422`, whitespace-only `422`, unsupported MIME `415`, non-UTF-8 `422`, oversized filename `422`, path traversal `422`.

### Static Analysis

| Tool | Purpose | CI gate |
|---|---|---|
| `ruff` | Lint + import order | Fail on any violation |
| `mypy` | Static type checking | Fail on type errors |
| `pytest-asyncio` | Async test runner | Required for all async endpoints |

### Error Contract

All validation failures return machine-readable JSON with an `error_code` field:

```json
{"detail": "A document with this content already exists.", "error_code": "DUPLICATE_DOCUMENT", "document_id": "..."}
```

HTTP codes used correctly: `409` conflict · `415` media type · `422` validation · `404` not found · `500` server fault.

---

## 5. Assumptions and Trade-offs

| Decision | Trade-off |
|---|---|
| SQLite in dev / single-instance prod | Zero setup; WAL mode handles concurrent reads. Not horizontally scalable — migrate to RDS for multi-replica. SQLAlchemy ORM abstracts the driver so the migration is a config change only. |
| In-process AsyncIO scheduler | Single container simplicity. Does not survive a mid-poll process crash. Mitigation: alarm on `PollRun` records stuck in `started` state for longer than two poll intervals. |
| spaCy blank pipeline | No model download, deterministic output, small image. Lower recall on documents outside the RFQ pattern set. Upgrade path: swap in `en_core_web_sm` or a fine-tuned NER behind the same `ExtractionService` interface. |
| GDELT as news source | Public, no auth, no SLA. Mitigated by retry logic and exponential backoff. If unavailable, `PollRun` is marked `failed` and next cycle retries from scratch — no data is lost. |
| In-memory WebSocket fan-out | Correct for one replica; breaks at two. Production fix is Redis Pub/Sub with no application code changes (see section 2). |
