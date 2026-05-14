# AWS, Governance, and Quality Notes

This document covers the production AWS target, data governance posture,
and code quality approach for the DataISource backend platform.

---

## 1. AWS Service Selection

### Compute — ECS Fargate

The FastAPI application runs as an ECS Fargate task. Fargate removes EC2 fleet management
while keeping the deployment model familiar (Docker image → task definition → service).

The in-process AsyncIO scheduler runs inside the same task in local and single-instance
deployments. For multi-instance production, the scheduler is extracted to an EventBridge
Scheduled Rule that invokes a separate Fargate task — this prevents duplicate poll runs
when multiple replicas are active.

| Layer | Dev / Local | Production |
|---|---|---|
| Runtime | Docker Compose | ECS Fargate |
| Replicas | 1 | 2+ (rolling deploy) |
| Scheduler | In-process AsyncIO loop | EventBridge → dedicated Fargate task |
| Image registry | Local build | ECR |

### Networking — ALB + WAF + VPC

```
Internet → AWS WAF → Application Load Balancer (HTTPS :443 / WSS)
                         ↓
              ECS Fargate tasks (private subnet, no public IP)
                         ↓
              RDS PostgreSQL (isolated subnet, no internet route)
```

- ALB handles HTTPS termination and WebSocket upgrade (`Upgrade: websocket`)
- AWS WAF sits in front of the ALB: rate-limiting per IP, geo-block, common rule groups
- Fargate tasks live in private subnets with no direct internet egress except through a NAT Gateway
- GDELT API calls route outbound through the NAT Gateway — only port 443 egress is allowed by the security group

### Database — SQLite (dev) → RDS PostgreSQL (prod)

SQLite with aiosqlite is used locally. The async SQLAlchemy layer abstracts the driver:
swapping to `asyncpg` and pointing `DATABASE_URL` at RDS requires no application code change.

| Concern | SQLite (local) | RDS PostgreSQL (prod) |
|---|---|---|
| Concurrency | Single-writer, WAL mode | Full MVCC |
| Horizontal scale | Not supported | Supported with read replicas |
| Backups | Manual volume snapshot | Automated daily snapshots, PITR 7 days |
| Encryption at rest | EFS volume encryption | AES-256 managed by RDS |
| Connection pooling | Not needed | PgBouncer sidecar or RDS Proxy |

### Storage — EFS (dev SQLite) → S3 (raw documents, prod)

In local Docker the SQLite file is mounted via a host volume. In production, raw uploaded
document content is stored in S3 with server-side encryption (SSE-S3). The `documents`
table stores the S3 key, not the raw text blob, keeping the database row compact.

### Config and Secrets — SSM Parameter Store

All runtime configuration is injected via environment variables resolved from SSM Parameter
Store at task startup. No secrets are baked into the Docker image or passed as plain-text
ECS environment variables.

| Parameter | Type | Rotation |
|---|---|---|
| `SQLITE_DB_PATH` / `DATABASE_URL` | String | On migration |
| `GDELT_QUERY` | String | On demand |
| `POLL_INTERVAL_SECONDS` | String | On demand |
| `CORS_ORIGINS` | String | On demand |
| `LOG_LEVEL` | String | On demand |
| DB credentials (prod) | SecureString | 90-day forced rotation via Secrets Manager |

### Observability — CloudWatch

| Signal | Implementation |
|---|---|
| Structured logs | JSON emitted to stdout; captured by ECS and forwarded to CloudWatch Logs |
| Log groups | One group per environment: `/datasource/api/prod`, `/datasource/api/dev` |
| Metrics | ECS-native CPU and memory; custom metric namespace via EMF for alerts_created per poll run |
| Alarms | P99 response time > 2s, error rate > 1%, ECS task count < desired |
| Alerting | CloudWatch Alarm → SNS → PagerDuty or email |
| Tracing | AWS X-Ray via the OpenTelemetry SDK middleware (FastAPI middleware shim) |

### CI/CD — GitHub Actions → ECR → ECS

```
git push main
  → GitHub Actions: ruff lint + mypy + pytest (62 tests)
  → docker build + push to ECR
  → aws ecs update-service --force-new-deployment
  → ECS rolling deploy (min 50% healthy, max 200%)
  → smoke test: GET /health on new task before draining old
```

No image is pushed to ECR unless all tests pass. The ECS rolling update ensures zero
downtime deployments by keeping at least one old task healthy until the new task passes
its ALB target group health check.

---

## 2. Production Architecture Change: WebSocket Scaling

The current `ConnectionManager` is an in-memory singleton. With a single Fargate task
this is correct. With two or more tasks, a client on task A would not receive an event
published by a request handled on task B.

Production fix: replace the in-process `EventBus` pub/sub with ElastiCache Redis
Pub/Sub. Each task subscribes to the Redis channel at startup. Every publish call
writes to Redis instead of the local `_subs` dict. All tasks receive the message and
fan-out to their local WebSocket connections.

The `EventBus` interface (`publish`, `subscribe`) does not change. Only the backing
implementation is swapped. Application code and tests require no changes.

---

## 3. Data Governance

### Data Classification

| Data | Classification | Storage | Retention |
|---|---|---|---|
| Uploaded document text | Internal — potentially sensitive | S3 (prod), SQLite blob (dev) | 90 days default, configurable |
| Extracted keywords and entities | Internal | RDS / SQLite | Same as parent document |
| GDELT article metadata | Public (sourced from public API) | RDS / SQLite | 30 days, then archive to S3 Glacier |
| WebSocket audit log (`websocket_messages`) | Internal — operational | RDS / SQLite | 7 days rolling |
| Poll run records | Internal — operational | RDS / SQLite | 90 days |
| CloudWatch logs | Internal — operational | CloudWatch | 30 days log group retention |

### Access Control

- ECS task role uses an IAM execution role with least-privilege policies: `ssm:GetParameter`
  for its own parameter paths, `s3:PutObject` and `s3:GetObject` for its own bucket prefix only
- RDS is in an isolated subnet with a security group that allows inbound 5432 only from the
  ECS task security group — no public access
- S3 bucket policy blocks all public access; no `s3:GetObject` without a signed URL
- No customer PII is ingested by design; the system processes manufacturing specification
  documents and public news metadata only

### Encryption

| Layer | Mechanism |
|---|---|
| In-transit (API) | TLS 1.2+ enforced at ALB; HTTP is redirected to HTTPS |
| In-transit (DB) | `sslmode=require` on the asyncpg connection string |
| In-transit (S3) | HTTPS only; bucket policy denies `aws:SecureTransport = false` |
| At-rest (RDS) | AES-256, RDS managed key |
| At-rest (S3) | SSE-S3 default encryption on the bucket |
| At-rest (EFS dev) | EFS encryption at rest enabled on the volume |
| Secrets | SSM SecureString encrypted with a customer-managed KMS key |

### Audit Trail

- Every WebSocket message emitted is written to the `websocket_messages` table
  (channel, event name, correlation ID, payload, timestamp) — this creates an immutable
  audit log of all real-time events without external infrastructure
- CloudTrail is enabled at the AWS account level: all API calls to SSM, ECR, ECS, RDS,
  and S3 are logged with actor identity and source IP
- Application logs include a `correlation_id` field on every structured log line,
  making it possible to trace a single document upload across ingest, extraction,
  persistence, and WebSocket delivery

### Deduplication and Idempotency

- Document uploads: SHA-256 of the file content is stored in a unique column;
  a second upload of the same file returns `409 DUPLICATE_DOCUMENT` without re-processing
- Alert events: `(source_name, source_item_id)` and `(source_name, article_url)` carry
  unique constraints; duplicate GDELT articles are rejected at the DB savepoint level
  without rolling back the entire poll transaction
- Poll runs: each run creates a `PollRun` record with a unique ID and status lifecycle
  (`started → completed / failed`); partial failures are recoverable without data loss

---

## 4. Code Quality

### Testing

62 automated tests across four files. Every test gets an isolated in-memory SQLite
database. GDELT is mocked — no network calls during test runs.

| File | Tests | Coverage area |
|---|---|---|
| `test_health.py` | 2 | Health endpoint shape and DB reachability |
| `test_documents.py` | 31 | Upload success, validation failures, dedup, retrieval, delete, keywords, entities, UTC timestamps |
| `test_news.py` | 12 | Alert CRUD, poll lifecycle, GDELT mock success and failure |
| `test_tables.py` | 17 | Table listing, pagination, row count, clear, delete single row |

Validation failure cases tested explicitly: duplicate `409`, empty file `422`, whitespace-only
`422`, unsupported MIME `415`, non-UTF-8 `422`, oversized filename `422`, path traversal `422`.

Run locally:
```bash
docker compose -f app/docker-compose.yml run --rm api pytest -v
```

### Static Analysis

| Tool | Purpose | Gate |
|---|---|---|
| `ruff` | Lint and import order | CI fail on any violation |
| `mypy` | Static type checking | CI fail on type errors |
| `pytest-asyncio` | Async test runner | Required for all async endpoints |

### Extraction Confidence Model

Entity extraction uses a composite confidence score:

```
confidence = (pattern_weight × 0.5) + (validation_weight × 0.3) + (context_weight × 0.2)
```

All three weights are configurable via `CONFIDENCE_WEIGHT_PATTERN`,
`CONFIDENCE_WEIGHT_VALIDATION`, `CONFIDENCE_WEIGHT_CONTEXT` environment variables.
This allows tuning without a code change — useful when the extraction domain shifts
from manufacturing RFQs to a different document type.

### Error Handling Contract

All validation failures return a machine-readable JSON body with an `error_code` field:

```json
{
  "detail": "A document with this content already exists.",
  "error_code": "DUPLICATE_DOCUMENT",
  "document_id": "..."
}
```

This allows callers to distinguish between a user error, a conflict, and a server fault
without parsing the message string. HTTP status codes are used correctly: `409` for
conflicts, `415` for media type, `422` for validation, `404` for not found, `500` for
unhandled server errors.

---

## 5. Assumptions and Trade-offs

### SQLite in Production (Single Instance)

SQLite is acceptable for a single-replica deployment with low concurrent write volume.
The WAL mode enables concurrent reads during writes. The trade-off is that horizontal
scaling requires a database migration to PostgreSQL. This migration is low-risk because
the SQLAlchemy ORM layer abstracts the driver entirely.

### In-Process Scheduler

The AsyncIO scheduler runs inside the application process rather than as a separate
worker. This keeps the local deployment to a single container. The trade-off is that
the scheduler is not independently scalable and does not survive if the application
process crashes mid-poll. Mitigation: the `PollRun` record captures `started_at` and
`run_status`; a monitoring alarm on stale `started` records (older than two poll intervals)
can detect a stuck scheduler.

### spaCy Blank Pipeline

The extraction engine uses a blank spaCy pipeline with rule-based pattern matchers — no
pretrained model is loaded. This removes a large model download from the Docker build,
keeps image size small, and makes extraction fully deterministic. The trade-off is lower
recall on documents that deviate significantly from the RFQ pattern set. A path to
improvement is plugging in a `en_core_web_sm` or a fine-tuned NER model behind the same
`ExtractionService` interface without changing any other code.

### GDELT as the News Source

GDELT is a public, unauthenticated API with no SLA and rate-limiting behaviour that varies
by time of day. The service handles this with exponential backoff (up to 3 retries per
topic) and a `Semaphore(3)` to limit concurrent outbound requests. If GDELT is unavailable
during a poll cycle, the `PollRun` is marked `failed` and the next scheduled cycle retries
from scratch. No alert data is lost because failures are detected and logged before any
database writes are attempted.

### WebSocket Fan-out at Scale

The in-memory `ConnectionManager` is correct for one replica. It becomes incorrect at two
or more replicas because events published on task A are not visible to connections held on
task B. The production fix (Redis Pub/Sub) is documented above and does not require
application logic changes — only the `EventBus` backing implementation changes.
