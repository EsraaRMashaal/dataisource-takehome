/*
 * api-test.js — In-browser API test runner
 *
 * Runs live HTTP calls against the backend and displays pass/fail results.
 * A dedicated WebSocket connection shows server-side events in real time
 * (e.g. document.progress events emitted during upload tests).
 *
 * Depends on: constants.js (API base URL)
 */

// ─── State ────────────────────────────────────────────────────────────────────

let _atrSuite    = "all";   // currently selected suite
let _atrRunning  = false;
let _atrWs       = null;    // dedicated WS connection for this view
let _atrWsState  = "disconnected";
let _atrResults  = [];
let _atrStart    = 0;

// ─── Suite selector ──────────────────────────────────────────────────────────

window.atrSelectSuite = function (suite) {
  _atrSuite = suite;
  document.querySelectorAll(".atr-suite-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.suite === suite);
  });
};

// ─── Run ─────────────────────────────────────────────────────────────────────

window.atrRun = async function () {
  if (_atrRunning) return;
  _atrRunning = true;
  _atrResults = [];
  _atrStart   = Date.now();

  const runBtn = document.getElementById("atrRunBtn");
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = "⏳ Running…"; }

  _atrClearList();
  _atrShowSummary(false);
  _atrSetProgress(0, true);

  const suites = {
    health:    _suiteHealth,
    documents: _suiteDocuments,
    tables:    _suiteTables,
    news:      _suiteNews,
  };

  const toRun = _atrSuite === "all"
    ? Object.values(suites)
    : [suites[_atrSuite]].filter(Boolean);

  const total = toRun.reduce((n, s) => n + s.tests.length, 0);
  let done = 0;

  for (const suite of toRun) {
    _atrAppendGroup(suite.label);
    const ctx = {};   // shared context between tests in the same suite
    for (const t of suite.tests) {
      const row = _atrAppendPending(t.name);
      let passed = false;
      let detail = "";
      const t0 = Date.now();
      try {
        const result = await t.fn(ctx);
        passed = result !== false;
        detail = typeof result === "string" ? result : "";
      } catch (err) {
        passed = false;
        detail = err.message || String(err);
      }
      const elapsed = Date.now() - t0;
      _atrUpdateRow(row, passed, detail, elapsed);
      _atrResults.push({ name: t.name, passed, detail, elapsed });
      done++;
      _atrSetProgress(Math.round((done / total) * 100), true);
      // small pause so the browser can repaint
      await _sleep(40);
    }
  }

  _atrSetProgress(100, false);
  _atrRenderSummary();

  if (runBtn) { runBtn.disabled = false; runBtn.textContent = "▶ Run Tests"; }
  _atrRunning = false;
};

// ─── Test suites ─────────────────────────────────────────────────────────────

const _suiteHealth = {
  label: "Health",
  tests: [
    {
      name: "GET /health → 200",
      fn: async () => {
        const res = await fetch(`${API}/health`);
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        return `status ${res.status}`;
      },
    },
    {
      name: "GET /health → {status:'ok', database:'reachable'}",
      fn: async () => {
        const data = await (await fetch(`${API}/health`)).json();
        _assert(data.status === "ok", `status was '${data.status}'`);
        _assert(data.database === "reachable", `database was '${data.database}'`);
        return `ok · reachable`;
      },
    },
  ],
};

const _suiteDocuments = {
  label: "Documents",
  tests: [
    {
      name: "GET /documents → 200 + empty list",
      fn: async (ctx) => {
        const data = await (await fetch(`${API}/documents`)).json();
        _assert(typeof data.total === "number", "missing total");
        _assert(Array.isArray(data.documents), "missing documents array");
        return `total=${data.total}`;
      },
    },
    {
      name: "POST /documents (text/plain) → 201",
      fn: async (ctx) => {
        const file = new File(
          ["Aluminium 6061-T6 bar, qty 50 pcs, tolerance ±0.05 mm, RFQ-2024-001"],
          "rfq_test.txt",
          { type: "text/plain" }
        );
        const form = new FormData();
        form.append("file", file);
        const res  = await fetch(`${API}/documents`, { method: "POST", body: form });
        const data = await res.json();
        _assert(res.status === 201, `Expected 201, got ${res.status}`);
        _assert(data.id, "response missing id");
        _assert(data.processing_status === "processed", `status=${data.processing_status}`);
        ctx.docId = data.id;
        return `id=${data.id.slice(0, 8)}… status=${data.processing_status}`;
      },
    },
    {
      name: "POST /documents duplicate → 409",
      fn: async (ctx) => {
        const file = new File(
          ["Aluminium 6061-T6 bar, qty 50 pcs, tolerance ±0.05 mm, RFQ-2024-001"],
          "rfq_test.txt",
          { type: "text/plain" }
        );
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API}/documents`, { method: "POST", body: form });
        _assert(res.status === 409, `Expected 409, got ${res.status}`);
        return `409 Conflict`;
      },
    },
    {
      name: "POST /documents empty file → 422",
      fn: async () => {
        const file = new File([""], "empty.txt", { type: "text/plain" });
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API}/documents`, { method: "POST", body: form });
        _assert(res.status === 422, `Expected 422, got ${res.status}`);
        return `422 Unprocessable`;
      },
    },
    {
      name: "POST /documents unsupported MIME → 415",
      fn: async () => {
        const file = new File(["%PDF-1.4 fake"], "bad.pdf", { type: "application/pdf" });
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API}/documents`, { method: "POST", body: form });
        _assert(res.status === 415, `Expected 415, got ${res.status}`);
        return `415 Unsupported Media`;
      },
    },
    {
      name: "GET /documents/{id} → 200",
      fn: async (ctx) => {
        _assert(ctx.docId, "no docId from upload test");
        const res = await fetch(`${API}/documents/${ctx.docId}`);
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        _assert(data.id === ctx.docId, "id mismatch");
        return `found id=${ctx.docId.slice(0, 8)}…`;
      },
    },
    {
      name: "GET /documents/{id} not found → 404",
      fn: async () => {
        const res = await fetch(`${API}/documents/no-such-doc`);
        _assert(res.status === 404, `Expected 404, got ${res.status}`);
        return `404 Not Found`;
      },
    },
    {
      name: "GET /documents/{id}/keywords → 200",
      fn: async (ctx) => {
        _assert(ctx.docId, "no docId");
        const res  = await fetch(`${API}/documents/${ctx.docId}/keywords`);
        const data = await res.json();
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        _assert(data.document_id === ctx.docId, "document_id mismatch");
        _assert(data.total === data.keywords.length, "total/length mismatch");
        return `${data.total} keyword(s)`;
      },
    },
    {
      name: "GET /documents/{id}/entities → 200",
      fn: async (ctx) => {
        _assert(ctx.docId, "no docId");
        const res  = await fetch(`${API}/documents/${ctx.docId}/entities`);
        const data = await res.json();
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        _assert(data.document_id === ctx.docId, "document_id mismatch");
        _assert(data.total === data.entities.length, "total/length mismatch");
        return `${data.total} entit${data.total === 1 ? "y" : "ies"}`;
      },
    },
    {
      name: "GET /documents list includes uploaded doc",
      fn: async (ctx) => {
        _assert(ctx.docId, "no docId");
        const data = await (await fetch(`${API}/documents`)).json();
        const found = data.documents.some(d => d.id === ctx.docId);
        _assert(found, "uploaded document not in list");
        return `total=${data.total}`;
      },
    },
    {
      name: "DELETE /documents/{id} → 204",
      fn: async (ctx) => {
        _assert(ctx.docId, "no docId");
        const res = await fetch(`${API}/documents/${ctx.docId}`, { method: "DELETE" });
        _assert(res.status === 204, `Expected 204, got ${res.status}`);
        ctx.deletedId = ctx.docId;
        ctx.docId = null;
        return `204 No Content`;
      },
    },
    {
      name: "GET /documents/{id} after delete → 404",
      fn: async (ctx) => {
        _assert(ctx.deletedId, "no deletedId");
        const res = await fetch(`${API}/documents/${ctx.deletedId}`);
        _assert(res.status === 404, `Expected 404, got ${res.status}`);
        return `404 gone`;
      },
    },
    {
      name: "DELETE /documents not found → 404",
      fn: async () => {
        const res = await fetch(`${API}/documents/no-such-doc`, { method: "DELETE" });
        _assert(res.status === 404, `Expected 404, got ${res.status}`);
        return `404 Not Found`;
      },
    },
  ],
};

const _suiteTables = {
  label: "Tables",
  tests: [
    {
      name: "GET /tables → 200 with 6 tables",
      fn: async (ctx) => {
        const res  = await fetch(`${API}/tables`);
        const data = await res.json();
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        _assert(Array.isArray(data.tables), "tables not an array");
        _assert(data.tables.length === 6, `Expected 6 tables, got ${data.tables.length}`);
        const names = data.tables.map(t => t.name).sort().join(", ");
        return `${data.tables.length} tables: ${names}`;
      },
    },
    {
      name: "GET /tables → every table has row_count",
      fn: async () => {
        const data = await (await fetch(`${API}/tables`)).json();
        data.tables.forEach(t => {
          _assert(typeof t.row_count === "number", `${t.name} missing row_count`);
        });
        return "all row_counts present";
      },
    },
    {
      name: "GET /tables/documents → 200 with correct shape",
      fn: async (ctx) => {
        const res  = await fetch(`${API}/tables/documents`);
        const data = await res.json();
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        _assert(data.table === "documents", `table was '${data.table}'`);
        _assert(Array.isArray(data.columns), "columns not array");
        _assert(Array.isArray(data.rows), "rows not array");
        _assert(typeof data.total === "number", "total missing");
        ctx.docTableTotal = data.total;
        return `total=${data.total} columns=${data.columns.length}`;
      },
    },
    {
      name: "GET /tables/alert_events → 200",
      fn: async () => {
        const res = await fetch(`${API}/tables/alert_events`);
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        return `total=${data.total}`;
      },
    },
    {
      name: "GET /tables/nonexistent → 404",
      fn: async () => {
        const res = await fetch(`${API}/tables/nonexistent_table`);
        _assert(res.status === 404, `Expected 404, got ${res.status}`);
        return `404 Not Found`;
      },
    },
    {
      name: "GET /tables/documents?page=2&page_size=5 → correct pagination",
      fn: async () => {
        const res  = await fetch(`${API}/tables/documents?page=2&page_size=5`);
        const data = await res.json();
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        _assert(data.page === 2, `page was ${data.page}`);
        _assert(data.page_size === 5, `page_size was ${data.page_size}`);
        return `page=${data.page} page_size=${data.page_size}`;
      },
    },
  ],
};

const _suiteNews = {
  label: "News",
  tests: [
    {
      name: "GET /news/alerts → 200 with list shape",
      fn: async () => {
        const res  = await fetch(`${API}/news/alerts`);
        const data = await res.json();
        _assert(res.status === 200, `Expected 200, got ${res.status}`);
        _assert(typeof data.total === "number", "missing total");
        _assert(Array.isArray(data.alerts), "missing alerts array");
        return `total=${data.total}`;
      },
    },
    {
      name: "GET /news/alerts/{id} not found → 404",
      fn: async () => {
        const res = await fetch(`${API}/news/alerts/no-such-alert`);
        _assert(res.status === 404, `Expected 404, got ${res.status}`);
        return `404 Not Found`;
      },
    },
    {
      name: "DELETE /news/alerts → 204",
      fn: async () => {
        const res = await fetch(`${API}/news/alerts`, { method: "DELETE" });
        _assert(res.status === 204, `Expected 204, got ${res.status}`);
        return `204 No Content`;
      },
    },
    {
      name: "DELETE /news/alerts idempotent (second call → 204)",
      fn: async () => {
        const res = await fetch(`${API}/news/alerts`, { method: "DELETE" });
        _assert(res.status === 204, `Expected 204, got ${res.status}`);
        return `204 again`;
      },
    },
    {
      name: "GET /news/alerts count is 0 after delete",
      fn: async () => {
        const data = await (await fetch(`${API}/news/alerts`)).json();
        _assert(data.total === 0, `Expected 0, got ${data.total}`);
        return `total=0`;
      },
    },
  ],
};

// ─── Assertion helper ─────────────────────────────────────────────────────────

function _assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

// ─── Results UI ──────────────────────────────────────────────────────────────

function _atrClearList() {
  const list = document.getElementById("atrResultList");
  if (list) list.innerHTML = "";
  const cnt = document.getElementById("atrResultCount");
  if (cnt) cnt.textContent = "0 tests";
}

function _atrAppendGroup(label) {
  const list = document.getElementById("atrResultList");
  if (!list) return;
  const el = document.createElement("div");
  el.className = "atr-group-label";
  el.textContent = label;
  list.appendChild(el);
}

function _atrAppendPending(name) {
  const list = document.getElementById("atrResultList");
  if (!list) return null;
  const row = document.createElement("div");
  row.className = "atr-result-row atr-pending";
  row.innerHTML =
    '<span class="atr-icon">⏳</span>' +
    '<span class="atr-name">' + _esc(name) + '</span>' +
    '<span class="atr-detail"></span>' +
    '<span class="atr-time"></span>';
  list.appendChild(row);
  list.parentElement.scrollTop = list.parentElement.scrollHeight;
  return row;
}

function _atrUpdateRow(row, passed, detail, elapsed) {
  if (!row) return;
  row.className = "atr-result-row " + (passed ? "atr-pass" : "atr-fail");
  row.querySelector(".atr-icon").textContent  = passed ? "✅" : "❌";
  row.querySelector(".atr-detail").textContent = detail ? "— " + detail : "";
  row.querySelector(".atr-time").textContent   = elapsed + " ms";

  const cnt = document.getElementById("atrResultCount");
  if (cnt) {
    const n = document.querySelectorAll(".atr-result-row").length;
    cnt.textContent = n + " test" + (n !== 1 ? "s" : "");
  }
}

function _atrSetProgress(pct, visible) {
  const wrap = document.getElementById("atrProgressWrap");
  const bar  = document.getElementById("atrProgressBar");
  if (wrap) wrap.style.display = visible ? "" : "none";
  if (bar)  bar.style.width = pct + "%";
}

function _atrShowSummary(visible) {
  const el = document.getElementById("atrSummary");
  if (el) el.style.display = visible ? "" : "none";
}

function _atrRenderSummary() {
  const passed = _atrResults.filter(r => r.passed).length;
  const failed = _atrResults.filter(r => !r.passed).length;
  const total  = Date.now() - _atrStart;

  document.getElementById("atrPassCount").textContent  = passed;
  document.getElementById("atrFailCount").textContent  = failed;
  document.getElementById("atrSkipCount").textContent  = 0;
  document.getElementById("atrTotalTime").textContent  = total;
  _atrShowSummary(true);
}

window.atrClearResults = function () {
  _atrClearList();
  _atrShowSummary(false);
  _atrSetProgress(0, false);
  const list = document.getElementById("atrResultList");
  if (list) list.innerHTML = '<div class="atr-empty">Choose a suite and click Run Tests</div>';
};

// ─── Dedicated WebSocket connection ──────────────────────────────────────────

window.atrWsToggle = function () {
  if (_atrWsState === "connected") {
    _atrWsDisconnect();
  } else {
    _atrWsConnect();
  }
};

function _atrWsConnect() {
  if (_atrWs) return;
  const url = `ws://${location.host}/api/v1/ws/events`;
  _atrWs = new WebSocket(url);
  _atrWsSetState("connecting");

  _atrWs.onopen  = () => _atrWsSetState("connected");
  _atrWs.onclose = () => { _atrWs = null; _atrWsSetState("disconnected"); };
  _atrWs.onerror = () => { _atrWs = null; _atrWsSetState("disconnected"); };

  _atrWs.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      _atrWsAppend(data);
    } catch {
      _atrWsAppend({ raw: evt.data });
    }
  };
}

function _atrWsDisconnect() {
  if (_atrWs) { _atrWs.close(); _atrWs = null; }
  _atrWsSetState("disconnected");
}

function _atrWsSetState(state) {
  _atrWsState = state;
  const dot = document.getElementById("atrWsDot");
  const btn = document.getElementById("atrWsConnBtn");
  if (dot) dot.className = "ws-dot " + state;
  if (btn) {
    btn.textContent = state === "connected" ? "Disconnect" : "Connect";
    btn.style.color = state === "connected" ? "#d93025" : "";
  }
}

function _atrWsAppend(data) {
  const log = document.getElementById("atrWsLog");
  if (!log) return;
  log.querySelector(".atr-ws-empty")?.remove();

  const eventType = data.event || "message";
  const typeClass = eventType.replace(/\./g, "-");

  const ts  = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const row = document.createElement("div");
  row.className = "ws-event";
  row.innerHTML =
    '<div class="ws-event-head">' +
      '<span class="ws-ts">' + ts + '</span>' +
      '<span class="ws-type ' + _esc(typeClass) + '">' + _esc(eventType) + '</span>' +
    '</div>' +
    '<div class="ws-payload">' + _esc(JSON.stringify(data)) + '</div>';

  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 150) log.firstChild.remove();
}

window.atrWsClear = function () {
  const log = document.getElementById("atrWsLog");
  if (log) log.innerHTML = '<div class="atr-ws-empty">Log cleared</div>';
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Disconnect WS when leaving the view ─────────────────────────────────────

window._atrOnHide = function () {
  _atrWsDisconnect();
};
