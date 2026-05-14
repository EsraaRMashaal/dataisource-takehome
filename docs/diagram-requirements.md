# Diagram And Architecture Requirements

## Legend

| Marker | Color | Meaning |
|---|---|---|
| `VALIDATE` | Yellow | Pydantic schemas, MIME whitelist, size limits, channel gating, SHA256 dedup |
| `BIZ LOGIC` | Green | Extraction pipeline, dedup strategy, retry/backoff, normalisation |
| `PERSIST` | Blue | Write to SQLite via SQLAlchemy async ORM |
| `ASYNC` | Purple | asyncio coroutines, background tasks, `asyncio.gather` fan-out |
| Trust boundary | Red | Connections crossing between untrusted and trusted zones |

---

## 1. System Architecture View

```mermaid
graph TB
    classDef internet  fill:#FFEBEE,stroke:#C62828,color:#000,stroke-width:2px
    classDef external  fill:#FCE4EC,stroke:#AD1457,color:#000,stroke-width:2px
    classDef ingress   fill:#FFF9C4,stroke:#F9A825,color:#000,stroke-width:2px
    classDef rest      fill:#EDE7F6,stroke:#6A1B9A,color:#000,stroke-width:2px
    classDef ws        fill:#E0F7FA,stroke:#006064,color:#000,stroke-width:2px
    classDef biz       fill:#FFF3E0,stroke:#E65100,color:#000,stroke-width:2px
    classDef async     fill:#F3E5F5,stroke:#6A1B9A,color:#000,stroke-width:2px
    classDef persist   fill:#E3F2FD,stroke:#0D47A1,color:#000,stroke-width:2px
    classDef store     fill:#ECEFF1,stroke:#37474F,color:#000,stroke-width:2px
    classDef config    fill:#F9FBE7,stroke:#827717,color:#000,stroke-width:2px
    classDef obs       fill:#E8F5E9,stroke:#1B5E20,color:#000,stroke-width:2px
    classDef cicd      fill:#FBE9E7,stroke:#BF360C,color:#000,stroke-width:2px

    subgraph INTERNET["INTERNET — Untrusted Zone"]
        BROWSER["Browser\nHTML · JS · CSS from /app/static/"]
        APICLI["Swagger UI / curl / REST Client"]
        GDELT_EXT["GDELT Document 2.0 API\napi.gdeltproject.org"]
    end

    subgraph AWS["AWS Cloud"]
        subgraph PUB["Public Subnet — trust boundary"]
            WAF["AWS WAF\nDDoS · rate-limit · geo-block"]
            ALB["Application Load Balancer\nHTTPS :443  |  WSS upgrade"]
        end

        subgraph PRIV["Private Subnet"]
            subgraph FARGATE["ECS Fargate Task — FastAPI Service Boundary"]

                subgraph REST_SURF["REST Surface   /api/v1/"]
                    R1["POST /documents  upload+extract\nGET  /documents  list\nGET  /documents/{id}  detail\nDELETE /documents/{id}\nGET  /documents/{id}/keywords\nGET  /documents/{id}/entities\nVALIDATE: Pydantic UploadFile"]
                    R2["POST /news/poll  trigger poll\nGET  /news/alerts  list\nGET  /news/alerts/{id}\nDELETE /news/alerts\nGET /tables  GET /health"]
                end

                subgraph WS_SURF["WebSocket Surface   /api/v1/ws/"]
                    WS1["WS /ws/events\naggregate — all channels"]
                    WS2["WS /ws/events/{channel}\nchannels: documents, alerts, records\nVALIDATE: close 4001 if unknown"]
                end

                subgraph BIZ_LAYER["Business / Service Layer — business logic"]
                    DOCSVC["DocumentService\nVALIDATE: MIME · size ≤10MB · UTF-8 · SHA256\nBIZ: orchestrate ingest pipeline"]
                    EXTSVC["ExtractionService + Engine\nBIZ: spaCy tokenize · detect_type()\nextract_keywords() · extract_entities()\nconfidence scoring · sort DESC"]
                    ALERTSVC["AlertService\nBIZ: savepoint dedup on IntegrityError\nalert status lifecycle"]
                    POLLSVC["PollService\nBIZ: PollRun lifecycle\nstarted → completed / failed"]
                    GDELTCLI["GdeltService\nBIZ: sample 3 of 10 topics\nretry x3 · exp backoff · dedup by URL"]
                end

                subgraph ASYNC_LAYER["Async / Background Layer — async behavior"]
                    SCHED["AsyncIO Scheduler\nasyncio.ensure_future(_loop())\nsleep(POLL_INTERVAL_SECONDS)"]
                    WORKER["PollingWorker coroutine\nisolated AsyncSession per run"]
                    EB["EventBus  in-process pub/sub\nasyncio.gather · return_exceptions=True"]
                    CM["ConnectionManager  singleton\n_channels: dict[str → set[WebSocket]]\nbroadcast to channel + all · prune dead"]
                end

                subgraph PERSIST_LAYER["Persistence Layer — persistence"]
                    REPOS["DocumentRepository\nAlertRepository · PollRepository"]
                    ORM["SQLAlchemy 2.0 async  aiosqlite\nWAL mode · FK enforcement"]
                end

            end

            subgraph STORE["Storage"]
                SQLITE["SQLite on EFS\n/app/data/ — dev / single-instance"]
                RDS["RDS PostgreSQL + asyncpg\nprod — horizontal scale"]
            end

            SSM["SSM Parameter Store\nAPP_ENV · DB path · POLL_INTERVAL\nGDELT_QUERY · CORS · LOG_LEVEL"]
        end

        subgraph OBS["Observability"]
            CWLOG["CloudWatch Logs  JSON structured"]
            CWALM["CloudWatch Alarms → SNS"]
        end

        ECR["ECR  Container Registry"]
        CICD["GitHub Actions\nbuild · test · push · ecs deploy"]
    end

    BROWSER  -->|HTTPS  trust boundary| WAF
    APICLI   -->|HTTPS  trust boundary| WAF
    WAF --> ALB
    ALB -->|HTTP| REST_SURF
    ALB -->|WS upgrade| WS_SURF

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

    GDELTCLI -->|HTTPS retry/backoff  trust boundary| GDELT_EXT

    EB -->|asyncio.gather fan-out| CM
    CM -->|broadcast JSON · prune dead| WS_SURF

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

    class BROWSER,APICLI internet
    class GDELT_EXT external
    class WAF,ALB ingress
    class R1,R2 rest
    class WS1,WS2 ws
    class DOCSVC,EXTSVC,ALERTSVC,POLLSVC,GDELTCLI biz
    class SCHED,WORKER,EB,CM async
    class REPOS,ORM persist
    class SQLITE,RDS store
    class SSM config
    class CWLOG,CWALM obs
    class ECR,CICD cicd
```

---

## 2. REST Data Flow Zoomed View

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'background': '#ffffff', 'primaryTextColor': '#000000', 'noteBkgColor': '#fff9c4', 'noteTextColor': '#000000'}}}%%
sequenceDiagram
    participant C  as Client
    participant EP as documents.py
    participant DS as DocumentService
    participant ES as ExtractionService
    participant EE as ExtractionEngine
    participant DR as DocumentRepository
    participant DB as SQLite async
    participant EB as EventBus
    participant CM as ConnectionManager

    rect rgb(255, 236, 80)
        Note over EP: VALIDATE — Pydantic UploadFile schema
        C->>EP: POST /api/v1/documents  multipart/form-data
        EP->>DS: ingest(file)
        Note over DS: VALIDATE — MIME in text/* · size ≤10 MB · UTF-8 · non-empty
    end

    DS->>DS: sha256 = SHA256(raw_bytes)
    DS->>DR: get_by_sha256(sha256)
    DR->>DB: SELECT Document WHERE sha256=?
    DB-->>DS: None — no duplicate, proceed

    rect rgb(100, 181, 246)
        Note over DS,DB: PERSIST — create Document row
        DS->>DR: create_document(status=pending)
        DR->>DB: INSERT Document
        DB-->>DS: Document id=N
    end

    rect rgb(206, 147, 216)
        Note over EB: ASYNC — asyncio.gather fan-out
        DS->>EB: publish documents · document.progress pct=20 stage=storing
        EB->>CM: _on_documents(event)
        CM-->>C: WS broadcast document.progress 20%
        DS->>EB: publish documents · document.uploaded
        CM-->>C: WS broadcast document.uploaded
        DS->>EB: publish documents · document.progress pct=45 stage=extracting
        CM-->>C: WS broadcast document.progress 45%
    end

    rect rgb(102, 187, 106)
        Note over DS,EE: BIZ LOGIC — NLP extraction pipeline
        DS->>ES: analyze(raw_text)
        ES->>EE: detect_type(doc) → rfq | specification | document
        ES->>EE: extract_metadata(doc) → reference · buyer · dates · currency · incoterm
        ES->>EE: extract_keywords(doc) → keyword · score · source_method
        ES->>EE: extract_entities(doc) → type · value · quantity · unit · confidence
        ES->>ES: promote metadata → entities · dedup · sort confidence DESC
        ES-->>DS: ExtractionResult(doc_type, keywords, entities)
    end

    rect rgb(206, 147, 216)
        DS->>EB: publish documents · document.progress pct=70 stage=indexing
        CM-->>C: WS broadcast document.progress 70%
    end

    rect rgb(100, 181, 246)
        Note over DS,DB: PERSIST — bulk write extracted data
        DS->>DR: bulk_create_keywords(doc_id, keywords)
        DR->>DB: INSERT ExtractedKeyword batch
        DS->>DR: bulk_create_entities(doc_id, entities)
        DR->>DB: INSERT ExtractedEntity batch
    end

    rect rgb(206, 147, 216)
        DS->>EB: publish documents · document.progress pct=90 stage=committing
        CM-->>C: WS broadcast document.progress 90%
    end

    rect rgb(100, 181, 246)
        DS->>DB: COMMIT transaction
        DS->>DR: update Document status=completed
    end

    rect rgb(206, 147, 216)
        DS->>EB: publish documents · document.completed doc_id=N
        DS->>EB: publish records · record.created table=documents
        CM-->>C: WS broadcast document.completed
        CM-->>C: WS broadcast record.created
    end

    DS-->>EP: DocumentResponse
    EP-->>C: 201 Created DocumentResponse

    Note over C,DB: Retrieval Flows

    C->>EP: GET /api/v1/documents/{id}/keywords
    EP->>DR: get_keywords_by_doc(doc_id)
    DR->>DB: SELECT ExtractedKeyword WHERE document_id=?
    DB-->>EP: list of ExtractedKeyword
    EP-->>C: 200 KeywordResponse list

    C->>EP: GET /api/v1/documents/{id}/entities
    EP->>DR: get_entities_by_doc(doc_id)
    DR->>DB: SELECT ExtractedEntity WHERE document_id=?
    DB-->>EP: list of ExtractedEntity
    EP-->>C: 200 EntityResponse list
```

---

## 3. WebSocket Data Flow Zoomed View

```mermaid
sequenceDiagram
    participant C   as Browser Client
    participant EP  as websocket.py
    participant CM  as ConnectionManager
    participant EB  as EventBus
    participant DS  as DocumentService

    rect rgb(255, 235, 238)
        Note over C,EP: Connection Handshake — trust boundary, client enters VPC
        C->>EP: HTTP GET /api/v1/ws/events/documents  Upgrade: websocket
    end

    rect rgb(255, 249, 196)
        Note over EP: VALIDATE — channel in frozenset{documents, alerts, records}
        alt unknown channel
            EP-->>C: close(4001) Unknown channel. Valid: alerts, documents, records
        end
    end

    rect rgb(237, 231, 246)
        Note over CM: ASYNC — await ws.accept()
        EP->>CM: connect(ws, channel=documents)
        CM->>CM: _channels[documents].add(ws)
        CM-->>C: send_json {event: connected, channel: documents}
    end

    Note over C,DS: Event Production — concurrent document upload on another request

    DS->>EB: publish documents · document.progress doc_id=7 pct=45

    rect rgb(237, 231, 246)
        Note over EB: ASYNC — asyncio.gather(return_exceptions=True)
        Note over EB: BIZ LOGIC — handler exceptions isolated, one broken sub does not block others
        EB->>CM: _on_documents(event)
        Note over CM: ASYNC — broadcast to _channels[documents] ∪ _channels[all]
        loop for each WebSocket in targets
            CM->>CM: check ws.client_state == CONNECTED
            alt connected
                CM-->>C: send_json {event: document.progress, channel: documents, pct: 45}
            else dead connection
                CM->>CM: disconnect(ws, channel) — prune from _channels
            end
        end
    end

    DS->>EB: publish documents · document.completed doc_id=7
    EB->>CM: _on_documents(event)
    CM-->>C: send_json {event: document.completed, channel: documents}

    DS->>EB: publish records · record.created table=documents
    EB->>CM: _on_records(event)
    CM-->>C: send_json {event: record.created, channel: records}

    Note over C,CM: Disconnect
    C->>EP: close WebSocket
    EP->>CM: disconnect(ws, channel=documents)
    CM->>CM: _channels[documents].discard(ws)
```

---

## 4. Polling And Monitoring Data Flow Zoomed View

```mermaid
sequenceDiagram
    participant SCHED  as Scheduler
    participant WORKER as PollingWorker
    participant PS     as PollService
    participant GS     as GdeltService
    participant GDELT  as GDELT API
    participant AS     as AlertService
    participant PR     as PollRepository
    participant AR     as AlertRepository
    participant DB     as SQLite async
    participant EB     as EventBus
    participant CM     as ConnectionManager

    rect rgb(237, 231, 246)
        Note over SCHED: ASYNC — asyncio.ensure_future(_loop())<br/>run_poll_cycle() → sleep(POLL_INTERVAL_SECONDS=300)
        SCHED->>WORKER: run_poll_cycle()
        Note over WORKER: ASYNC — isolated AsyncSession per run
    end

    WORKER->>PS: run_poll(db)

    rect rgb(187, 222, 251)
        Note over PS,DB: PERSIST — open PollRun
        PS->>PR: insert_poll_run source=gdelt status=started
        PR->>DB: INSERT PollRun
        DB-->>PS: PollRun id=N
    end

    rect rgb(200, 230, 201)
        Note over GS: BIZ LOGIC — sample 3 of 10 topics:<br/>shipping delays · factory shutdown · steel shortage · logistics crisis<br/>port congestion · freight disruption · raw material shortage<br/>manufacturing delays · transport strike · industrial shutdown
    end

    PS->>GS: poll(max_records=3)

    rect rgb(237, 231, 246)
        Note over GS: ASYNC — Semaphore(3) · asyncio.gather · done_event short-circuit
    end

    rect rgb(255, 235, 238)
        Note over GS,GDELT: Trust boundary — VPC egress to external GDELT API
        par bounded concurrent fetch
            GS->>GDELT: GET /api/v2/doc/doc?query=topic1&timespan=7days&maxrecords=3&format=json
            Note over GS,GDELT: BIZ LOGIC — retry x3<br/>network: 1s→2s→4s · 429: Retry-After then 3s→6s→12s
            GDELT-->>GS: articles list
            GS->>GDELT: GET ... query=topic2
            GDELT-->>GS: articles list
            GS->>GDELT: GET ... query=topic3
            GDELT-->>GS: articles list
        end
    end

    rect rgb(200, 230, 201)
        Note over GS: BIZ LOGIC — deduplicate by URL · normalise to GdeltArticle
        GS-->>PS: list of GdeltArticle
    end

    PS->>AS: create_alerts(poll_run, items, db)

    loop for each GdeltArticle
        rect rgb(200, 230, 201)
            Note over AS: BIZ LOGIC — savepoint-based dedup per insert
            AS->>DB: SAVEPOINT sp_N
            AS->>AR: insert_alert(AlertEvent status=detected)
            AR->>DB: INSERT AlertEvent
            alt IntegrityError — (source_name, source_item_id) or (source_name, article_url)
                DB-->>AS: IntegrityError
                AS->>DB: ROLLBACK TO SAVEPOINT sp_N
                Note over AS: outer transaction preserved — article skipped
            else new alert
                DB-->>AS: AlertEvent id=M
            end
        end

        rect rgb(187, 222, 251)
            Note over AS,DB: PERSIST — committed with outer transaction
        end

        rect rgb(237, 231, 246)
            Note over EB: ASYNC — asyncio.gather fan-out · exception-isolated
            AS->>EB: publish alerts · alert.detected alert_id=M
            EB->>CM: _on_alerts(event)
            CM-->>CM: broadcast to _channels[alerts] ∪ _channels[all]
        end
    end

    AS->>DB: COMMIT outer transaction
    AS-->>PS: alerts_created=M

    rect rgb(187, 222, 251)
        Note over PS,DB: PERSIST — close PollRun
        PS->>PR: update_poll_run status=completed items_seen=K alerts_created=M
        PR->>DB: UPDATE PollRun
    end

    PS-->>WORKER: done
    Note over SCHED: sleep(300) → loop resumes
```

---

## 5. Architecture to Deployment

```mermaid
graph LR
    classDef dev     fill:#E8F5E9,stroke:#2E7D32,color:#000,stroke-width:2px
    classDef ci      fill:#FFF9C4,stroke:#F9A825,color:#000,stroke-width:2px
    classDef gate    fill:#FFF3E0,stroke:#E65100,color:#000,stroke-width:2px
    classDef registry fill:#F3E5F5,stroke:#6A1B9A,color:#000,stroke-width:2px
    classDef pub     fill:#FFF9C4,stroke:#F57F17,color:#000,stroke-width:2px
    classDef fargate fill:#E3F2FD,stroke:#1565C0,color:#000,stroke-width:2px
    classDef data    fill:#ECEFF1,stroke:#37474F,color:#000,stroke-width:2px
    classDef config  fill:#F9FBE7,stroke:#827717,color:#000,stroke-width:2px
    classDef obs     fill:#E8F5E9,stroke:#1B5E20,color:#000,stroke-width:2px
    classDef external fill:#FFEBEE,stroke:#C62828,color:#000,stroke-width:2px

    subgraph LOCAL["Local Development"]
        SRC["Source Code\nPython · FastAPI · spaCy"]
        COMPOSE["docker compose up --build\napp/docker-compose.yml"]
        LOCAL_API["API at :8800\nSwagger at /docs\nSPA at /index.html"]
        LOCAL_DB["SQLite\n./data/ host volume"]
        PYTESTS["pytest -v\n62 tests · in-memory SQLite\nGDELT mocked · no network"]
    end

    subgraph GITHUB["GitHub Actions — CI Pipeline"]
        PUSH["git push main\nor Pull Request"]
        LINT["ruff lint\nmypy type check"]
        TEST["pytest\n62 tests pass required"]
        BUILD["docker build\nmulti-stage Dockerfile"]
        PUSH_ECR["docker push ECR\n:sha-commit · :latest"]
    end

    subgraph ECR_BOX["AWS ECR"]
        IMAGE["Tagged image\n:sha · :latest\nimmutable, signed"]
    end

    subgraph AWS_PROD["AWS Production — Private Subnet"]
        subgraph ENTRY["Public Subnet"]
            PROD_WAF["AWS WAF\nrate-limit · DDoS"]
            PROD_ALB["ALB\nHTTPS :443 · WSS"]
        end

        subgraph ECS_SVC["ECS Fargate Service"]
            TASK_A["Task A\nFastAPI + Uvicorn\n+ AsyncIO Scheduler"]
            TASK_B["Task B\nFastAPI + Uvicorn\n(rolling update)"]
        end

        subgraph PROD_DATA["Data Layer"]
            PROD_RDS["RDS PostgreSQL\nencrypted · PITR 7d\nmulti-AZ standby"]
            PROD_S3["S3\nraw documents\nSSE-S3"]
        end

        PROD_SSM["SSM Parameter Store\nSecureString secrets"]

        subgraph PROD_OBS["Observability"]
            PROD_CW["CloudWatch Logs\nJSON structured"]
            PROD_ALARM["Alarms → SNS → PagerDuty"]
        end
    end

    GDELT_PROD["GDELT API\napi.gdeltproject.org"]

    SRC --> COMPOSE
    COMPOSE --> LOCAL_API
    LOCAL_API --> LOCAL_DB
    SRC --> PYTESTS

    SRC -->|git push| PUSH
    PUSH --> LINT
    LINT -->|pass| TEST
    TEST -->|pass| BUILD
    BUILD --> PUSH_ECR
    PUSH_ECR --> IMAGE

    IMAGE -->|pull on deploy| TASK_A
    IMAGE -->|pull on deploy| TASK_B

    PROD_WAF --> PROD_ALB
    PROD_ALB -->|route| TASK_A
    PROD_ALB -->|route| TASK_B

    TASK_A --> PROD_RDS
    TASK_A --> PROD_S3
    TASK_A --> PROD_SSM
    TASK_A -->|stdout JSON| PROD_CW
    TASK_A -->|HTTPS retry/backoff| GDELT_PROD

    TASK_B --> PROD_RDS
    TASK_B -->|stdout JSON| PROD_CW

    PROD_CW --> PROD_ALARM

    class SRC,COMPOSE,LOCAL_API,PYTESTS dev
    class LOCAL_DB data
    class PUSH,LINT,TEST,BUILD,PUSH_ECR ci
    class IMAGE registry
    class PROD_WAF,PROD_ALB pub
    class TASK_A,TASK_B fargate
    class PROD_RDS,PROD_S3 data
    class PROD_SSM config
    class PROD_CW,PROD_ALARM obs
    class GDELT_PROD external
```
