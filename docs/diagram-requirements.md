# Diagram And Architecture Requirements

Provide diagrams that explain your implementation and your proposed production direction.

---

## Legend

| Marker | Meaning |
|---|---|
| `VALIDATE` | Input validation — Pydantic schemas, MIME whitelist, size limits, channel gating, SHA256 dedup |
| `BIZ LOGIC` | Business logic — extraction pipeline, dedup strategy, retry/backoff, response normalisation |
| `PERSIST` | Write to SQLite via SQLAlchemy async ORM |
| `ASYNC` | asyncio coroutines, background tasks, `asyncio.gather` fan-out |
| Trust boundary | Annotated on connections that cross between untrusted and trusted zones |

---

## 1. System Architecture View

Shows all runtime components: client entry points, AWS services, FastAPI service boundary,
REST surface, WebSocket surface, polling worker, DB storage, background async handling,
and the external GDELT news source. Trust boundaries are marked on every cross-zone connection.

```mermaid
graph TB
    subgraph INTERNET["INTERNET — Untrusted Zone"]
        BROWSER["Browser\nHTML · JS · CSS served from /app/static/"]
        APICLI["Swagger UI / curl / REST Client"]
        GDELT_EXT["GDELT Document 2.0 API\napi.gdeltproject.org\nexternal news source"]
    end

    subgraph AWS["AWS Cloud"]
        subgraph PUB["Public Subnet  trust boundary  Private Subnet"]
            WAF["AWS WAF\nDDoS · rate-limit · geo-block"]
            ALB["Application Load Balancer\nHTTPS :443  |  WSS upgrade"]
        end

        subgraph PRIV["Private Subnet"]
            subgraph FARGATE["ECS Fargate Task — FastAPI Service Boundary"]

                subgraph REST_SURF["REST Surface   /api/v1/"]
                    R1["POST   /documents          upload + extract\nGET    /documents          list\nGET    /documents/{id}     detail\nDELETE /documents/{id}     delete\nGET    /documents/{id}/keywords\nGET    /documents/{id}/entities\nVALIDATE: Pydantic UploadFile schema"]
                    R2["POST   /news/poll           trigger GDELT poll\nGET    /news/alerts         list alerts\nGET    /news/alerts/{id}   detail\nDELETE /news/alerts         bulk delete\nGET    /tables  GET /health"]
                end

                subgraph WS_SURF["WebSocket Surface   /api/v1/ws/"]
                    WS1["WS /ws/events\naggregate — all channels"]
                    WS2["WS /ws/events/{channel}\nchannels: documents, alerts, records\nVALIDATE: close 4001 if unknown channel"]
                end

                subgraph BIZ_LAYER["Business / Service Layer — business logic boundary"]
                    DOCSVC["DocumentService\nVALIDATE: MIME whitelist, size 10 MB max\nUTF-8 decodable, SHA256 dedup\nBIZ: orchestrate ingest pipeline\npublish progress events"]
                    EXTSVC["ExtractionService + ExtractionEngine\nBIZ: spaCy tokenize, detect_type()\nextract_metadata(), extract_keywords()\nextract_entities(), confidence scoring\ndedup + sort DESC"]
                    ALERTSVC["AlertService\nBIZ: savepoint-based dedup on IntegrityError\nalert status lifecycle\nbroadcast on new alert"]
                    POLLSVC["PollService\nBIZ: PollRun lifecycle\nstarted to completed or failed\ndelegate to GdeltService + AlertService"]
                    GDELTCLI["GdeltService\nBIZ: sample 3 of 10 topics, semaphore fetch\nretry x3, exp backoff\ndeduplicate by URL, normalise response"]
                end

                subgraph ASYNC_LAYER["Async / Background Layer — async behavior"]
                    SCHED["AsyncIO Scheduler\nasyncio.ensure_future(_loop())\nloop: run_poll_cycle() then sleep(POLL_INTERVAL_SECONDS)"]
                    WORKER["PollingWorker coroutine\nisolated AsyncSession per run"]
                    EB["EventBus  in-process pub/sub\n_subs: dict channel to list of handlers\nasyncio.gather, return_exceptions=True"]
                    CM["ConnectionManager  singleton\n_channels: dict str to set of WebSocket\nbroadcast to channel + all\nprune dead conns on each send"]
                end

                subgraph PERSIST_LAYER["Persistence Layer — persistence boundary"]
                    REPOS["DocumentRepository\nAlertRepository, PollRepository"]
                    ORM["SQLAlchemy 2.0 async  aiosqlite\nWAL mode, FK enforcement\nexpire_on_commit=False"]
                end

            end

            subgraph STORE["Storage"]
                SQLITE["SQLite on EFS volume\n/app/data/DataISource-takehome.sqlite3\ndev / single-instance"]
                RDS["RDS PostgreSQL + asyncpg\nprod recommendation — enables horizontal scale"]
            end

            SSM["SSM Parameter Store\nAPP_ENV, SQLITE_DB_PATH\nPOLL_INTERVAL_SECONDS, GDELT_QUERY\nCONFIDENCE_WEIGHT_*, CORS_ORIGINS, LOG_LEVEL"]
        end

        subgraph OBS["Observability"]
            CWLOG["CloudWatch Logs  JSON structured in prod"]
            CWALM["CloudWatch Alarms to SNS to PagerDuty"]
        end

        ECR["ECR  Container Registry"]
        CICD["GitHub Actions\nbuild, test, push, ecs update-service"]
    end

    BROWSER  -->|HTTPS trust boundary| WAF
    APICLI   -->|HTTPS trust boundary| WAF
    WAF --> ALB
    ALB -->|HTTP routing| REST_SURF
    ALB -->|WebSocket upgrade| WS_SURF

    REST_SURF --> DOCSVC
    REST_SURF --> ALERTSVC
    REST_SURF --> POLLSVC
    WS_SURF  <-->|JSON frames| CM

    DOCSVC  --> EXTSVC
    DOCSVC  --> REPOS
    DOCSVC  -->|publish events| EB
    ALERTSVC --> REPOS
    ALERTSVC -->|publish events| EB
    POLLSVC --> GDELTCLI
    POLLSVC --> ALERTSVC
    POLLSVC --> REPOS

    GDELTCLI -->|HTTPS retry/backoff trust boundary| GDELT_EXT

    EB -->|asyncio.gather fan-out| CM
    CM -->|broadcast JSON, prune dead conns| WS_SURF

    SCHED -->|async tick| WORKER
    WORKER --> POLLSVC

    REPOS --> ORM
    ORM   --> SQLITE
    ORM   -.->|prod swap| RDS

    FARGATE --> SSM
    FARGATE -->|stdout JSON| CWLOG
    CWLOG   --> CWALM

    CICD --> ECR
    CICD -->|rolling deploy| FARGATE
    ECR  -->|pull on task start| FARGATE
```

---

## 2. REST Data Flow Zoomed View

End-to-end flow for document upload, extraction, persistence, and retrieval.
Annotations mark exactly where validation, business logic, and persistence occur.

```mermaid
sequenceDiagram
    participant C  as Client
    participant EP as documents.py endpoint
    participant DS as DocumentService
    participant ES as ExtractionService
    participant EE as ExtractionEngine spaCy
    participant DR as DocumentRepository
    participant DB as SQLite async
    participant EB as EventBus
    participant CM as ConnectionManager

    Note over EP: VALIDATE Pydantic UploadFile schema

    C->>EP: POST /api/v1/documents multipart/form-data
    EP->>DS: ingest(file)

    Note over DS: VALIDATE MIME type in text/* whitelist
    Note over DS: VALIDATE content length 10 MB max
    Note over DS: VALIDATE UTF-8 decodable, non-empty

    DS->>DS: sha256 = SHA256(raw_bytes)
    DS->>DR: get_by_sha256(sha256)
    DR->>DB: SELECT Document WHERE sha256=?
    DB-->>DR: None
    DR-->>DS: None no duplicate proceed

    Note over DS,DB: PERSIST create Document row
    DS->>DR: create_document(filename, sha256, raw_text, status=pending)
    DR->>DB: INSERT Document status=pending
    DB-->>DS: Document id=N

    DS->>EB: publish documents event document.progress pct 20 stage storing
    Note over EB: ASYNC asyncio.gather fan-out
    EB->>CM: _on_documents(event)
    CM-->>C: WS broadcast document.progress 20%

    DS->>EB: publish documents event document.uploaded
    CM-->>C: WS broadcast document.uploaded

    DS->>EB: publish documents event document.progress pct 45 stage extracting
    CM-->>C: WS broadcast document.progress 45%

    Note over DS,EE: BIZ LOGIC NLP extraction pipeline
    DS->>ES: analyze(raw_text)
    ES->>EE: detect_type(doc) returns rfq or specification or document
    ES->>EE: extract_metadata(doc) returns reference, buyer, dates, currency, incoterm
    ES->>EE: extract_keywords(doc) returns keyword, score, source_method
    ES->>EE: extract_entities(doc) returns type, value, quantity, unit, offsets
    ES->>ES: promote metadata fields to entities list
    ES->>ES: dedup + sort by confidence DESC
    ES-->>DS: ExtractionResult doc_type, keywords, entities

    DS->>EB: publish documents event document.progress pct 70 stage indexing
    CM-->>C: WS broadcast document.progress 70%

    Note over DS,DB: PERSIST bulk write extracted data
    DS->>DR: bulk_create_keywords(doc_id, keywords)
    DR->>DB: INSERT ExtractedKeyword batch
    DS->>DR: bulk_create_entities(doc_id, entities)
    DR->>DB: INSERT ExtractedEntity batch

    DS->>EB: publish documents event document.progress pct 90 stage committing
    CM-->>C: WS broadcast document.progress 90%

    DS->>DB: COMMIT transaction
    DS->>DR: update Document status=completed

    DS->>EB: publish documents event document.completed doc_id N
    DS->>EB: publish records event record.created table documents
    CM-->>C: WS broadcast document.completed
    CM-->>C: WS broadcast record.created

    DS-->>EP: DocumentResponse
    EP-->>C: 201 Created DocumentResponse

    Note over C,DB: Retrieval Flows

    C->>EP: GET /api/v1/documents
    EP->>DR: list_documents()
    DR->>DB: SELECT Document ORDER BY created_at DESC
    DB-->>EP: list of Document
    EP-->>C: 200 DocumentListResponse total and documents

    C->>EP: GET /api/v1/documents/{id}/keywords
    EP->>DR: get_keywords_by_doc(doc_id)
    DR->>DB: SELECT ExtractedKeyword WHERE document_id=?
    DB-->>DR: list of ExtractedKeyword
    EP-->>C: 200 list of KeywordResponse

    C->>EP: GET /api/v1/documents/{id}/entities
    EP->>DR: get_entities_by_doc(doc_id)
    DR->>DB: SELECT ExtractedEntity WHERE document_id=?
    DB-->>DR: list of ExtractedEntity
    EP-->>C: 200 list of EntityResponse
```

---

## 3. WebSocket Data Flow Zoomed View

Shows how a local client connects, how channel validation enforces the trust boundary,
how events are produced by services and delivered through EventBus to ConnectionManager to clients,
and how dead connections are pruned automatically.

```mermaid
sequenceDiagram
    participant C   as Browser Client
    participant EP  as websocket.py endpoint
    participant CM  as ConnectionManager
    participant EB  as EventBus
    participant DS  as DocumentService example publisher

    Note over C,EP: Connection Handshake  trust boundary client enters VPC

    C->>EP: HTTP GET /api/v1/ws/events/documents  Upgrade websocket

    Note over EP: VALIDATE channel in VALID_CHANNELS = frozenset documents alerts records

    alt unknown channel
        EP-->>C: close 4001 Unknown channel x. Valid channels: alerts, documents, records
    end

    EP->>CM: connect(ws, channel=documents)
    Note over CM: ASYNC await ws.accept()
    CM->>CM: _channels[documents].add(ws)
    CM-->>C: send_json event connected channel documents

    Note over C,DS: Event Production  concurrent request uploads a document

    DS->>EB: publish documents event document.progress doc_id 7 pct 45 stage extracting

    Note over EB: ASYNC asyncio.gather return_exceptions=True
    Note over EB: BIZ LOGIC each handler exception isolated one broken subscriber does not block others

    EB->>CM: _on_documents event document.progress doc_id 7 pct 45

    Note over CM: ASYNC broadcast to _channels[documents] union _channels[all]

    loop for each WebSocket in targets
        CM->>CM: check ws.client_state == WebSocketState.CONNECTED
        alt connected
            CM-->>C: send_json event document.progress channel documents doc_id 7 pct 45
        else dead connection
            CM->>CM: disconnect(ws, channel) remove from _channels
        end
    end

    DS->>EB: publish documents event document.completed doc_id 7
    EB->>CM: _on_documents(event)
    CM-->>C: send_json event document.completed channel documents doc_id 7

    DS->>EB: publish records event record.created table documents
    EB->>CM: _on_records(event)
    CM-->>C: send_json event record.created channel records table documents

    Note over C,CM: Disconnect clean or dead-prune
    C->>EP: close WebSocket
    EP->>CM: disconnect(ws, channel=documents)
    CM->>CM: _channels[documents].discard(ws)
```

---

## 4. Polling And Monitoring Data Flow Zoomed View

Shows how GDELT data is queried, normalised, stored, deduplicated,
and turned into alert events with real-time WebSocket delivery.

```mermaid
sequenceDiagram
    participant SCHED  as AsyncIO Scheduler
    participant WORKER as PollingWorker
    participant PS     as PollService
    participant GS     as GdeltService
    participant GDELT  as GDELT API external
    participant AS     as AlertService
    participant PR     as PollRepository
    participant AR     as AlertRepository
    participant DB     as SQLite async
    participant EB     as EventBus
    participant CM     as ConnectionManager

    Note over SCHED: ASYNC asyncio.ensure_future(_loop())<br/>loop: run_poll_cycle() then await asyncio.sleep(POLL_INTERVAL_SECONDS=300)

    SCHED->>WORKER: run_poll_cycle()

    Note over WORKER: ASYNC creates own AsyncSession isolated from HTTP request sessions

    WORKER->>PS: run_poll(db)

    Note over PS,DB: PERSIST open PollRun record
    PS->>PR: insert_poll_run source_name=gdelt status=started window_start window_end query=GDELT_QUERY
    PR->>DB: INSERT PollRun
    DB-->>PS: PollRun id=N

    Note over GS: BIZ LOGIC sample TOPICS_PER_POLL=3 from 10 configured topics<br/>shipping delays, factory shutdown, steel shortage, logistics crisis<br/>port congestion, freight disruption, raw material shortage<br/>manufacturing delays, transport strike, industrial shutdown

    PS->>GS: poll(max_records=3)

    Note over GS: ASYNC Semaphore CONCURRENCY=3<br/>asyncio.gather with done_event short-circuit<br/>stops fetching when first topic returns articles

    par bounded concurrent fetch  trust boundary VPC to external GDELT
        GS->>GDELT: GET /api/v2/doc/doc?query=topic1&timespan=7days&maxrecords=3&mode=artlist&format=json
        Note over GS,GDELT: BIZ LOGIC retry x MAX_RETRIES=3<br/>network error backoff 1s 2s 4s<br/>429 rate-limit backoff check Retry-After then 3s 6s 12s
        GDELT-->>GS: articles list with url title seendate domain
        GS->>GDELT: GET same params query=topic2
        GDELT-->>GS: articles list
        GS->>GDELT: GET same params query=topic3
        GDELT-->>GS: articles list
    end

    Note over GS: BIZ LOGIC deduplicate merged results by URL
    Note over GS: BIZ LOGIC normalise each article<br/>source_name=gdelt, source_item_id, title, url<br/>published_at, matched_terms=topic, raw payload JSON

    GS-->>PS: list of GdeltArticle deduplicated and normalised

    PS->>AS: create_alerts(poll_run, items, db)

    loop for each GdeltArticle
        Note over AS: BIZ LOGIC savepoint per insert for fine-grained dedup
        AS->>DB: SAVEPOINT sp_N
        AS->>AR: insert_alert AlertEvent source_name source_item_id article_url title matched_terms_json payload_json status=detected
        AR->>DB: INSERT AlertEvent

        alt IntegrityError unique constraint on source_name+source_item_id or source_name+article_url
            DB-->>AS: IntegrityError
            AS->>DB: ROLLBACK TO SAVEPOINT sp_N
            Note over AS: BIZ LOGIC outer transaction preserved article skipped as duplicate
        else new alert
            DB-->>AS: AlertEvent id=M
            Note over AS,DB: PERSIST row committed with outer transaction
            AS->>EB: publish alerts event alert.detected alert_id M title url matched_terms detected_at
            Note over EB: ASYNC asyncio.gather fan-out exception-isolated
            EB->>CM: _on_alerts(event)
            CM-->>CM: broadcast to _channels[alerts] union _channels[all]
        end
    end

    AS->>DB: COMMIT outer transaction
    AS-->>PS: alerts_created=M

    Note over PS,DB: PERSIST close PollRun
    PS->>PR: update_poll_run id=N status=completed items_seen=K alerts_created=M completed_at=now
    PR->>DB: UPDATE PollRun
    PS-->>WORKER: done

    Note over SCHED: await asyncio.sleep(300) then loop resumes
```