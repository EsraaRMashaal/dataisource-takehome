/* ── State ── */
window._tablesState = {
  tables:   [],
  active:   null,
  page:     1,
  pageSize: 50,
  total:    0,
  columns:  [],
  rows:     [],
};

/* ═══════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════ */

async function loadTablesList() {
  try {
    const { data } = await apiListTables();
    window._tablesState.tables = data.tables || [];
    renderTablesStats();
    renderTablesTabs();
    const active = window._tablesState.active || (window._tablesState.tables[0] || {}).name;
    if (active) await loadTableRows(active, 1);
  } catch (_err) {
    const wrap = document.getElementById("tablesGridWrap");
    if (wrap) wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      Could not reach the server. Is it running on port 8800?
    </div>`;
  }
}

async function loadTableRows(tableName, page) {
  window._tablesState.active = tableName;
  window._tablesState.page   = page;
  renderTablesTabs();

  const wrap = document.getElementById("tablesGridWrap");
  if (wrap) wrap.innerHTML = `<div class="empty-state" style="padding:2rem;">Loading…</div>`;

  try {
    const { data } = await apiGetTableRows(tableName, page, window._tablesState.pageSize);
    window._tablesState.columns = data.columns || [];
    window._tablesState.rows    = data.rows    || [];
    window._tablesState.total   = data.total   || 0;
    renderTablesGrid();
    renderTablesPagination();
  } catch (_err) {
    if (wrap) wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      Failed to load table data.
    </div>`;
  }
}

function tablesChangePage(delta) {
  const s      = window._tablesState;
  const maxPg  = Math.ceil(s.total / s.pageSize) || 1;
  const newPg  = Math.max(1, Math.min(maxPg, s.page + delta));
  if (newPg !== s.page) loadTableRows(s.active, newPg);
}

/* ═══════════════════════════════════════════════
   RENDERING
═══════════════════════════════════════════════ */

function renderTablesStats() {
  const map = Object.fromEntries(
    window._tablesState.tables.map(t => [t.name, t.row_count])
  );
  const el = id => document.getElementById(id);
  if (el("tablesStatDocs"))   el("tablesStatDocs").textContent   = map["documents"]   ?? "—";
  if (el("tablesStatAlerts")) el("tablesStatAlerts").textContent = map["alert_events"] ?? "—";
  if (el("tablesStatPolls"))  el("tablesStatPolls").textContent  = map["poll_runs"]    ?? "—";
}

function renderTablesTabs() {
  const wrap = document.getElementById("tablesTabList");
  if (!wrap) return;
  const active = window._tablesState.active;
  wrap.innerHTML = window._tablesState.tables.map(t => {
    const cls = t.name === active ? " active" : "";
    return `<button class="tables-tab-btn${cls}" onclick="loadTableRows('${t.name}', 1)">
      ${_tblIcon(t.name)}
      <span class="tables-tab-name">${t.name.replace(/_/g, " ")}</span>
      <span class="tables-tab-count">${t.row_count}</span>
    </button>`;
  }).join("");
}

function renderTablesGrid() {
  const s    = window._tablesState;
  const wrap = document.getElementById("tablesGridWrap");
  if (!wrap) return;

  if (!s.rows.length) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🗄️</div>
      No rows in this table.
    </div>`;
    return;
  }

  const thead = s.columns.map(c => `<th title="${_esc(c)}">${_esc(c)}</th>`).join("")
    + `<th class="tables-th-action"></th>`;

  const tbody = s.rows.map((row, rowIdx) => {
    const rowId = row["id"];
    const safeId = JSON.stringify(String(rowId));
    const safeTable = JSON.stringify(s.active);
    const cells = s.columns.map(c => {
      const raw = row[c];
      if (raw === null || raw === undefined) {
        return `<td><span class="tables-null">NULL</span></td>`;
      }
      const str = String(raw);
      const display = str.length > 140 ? str.slice(0, 140) + "…" : str;
      return `<td title="${_esc(str)}">${_esc(display)}</td>`;
    }).join("");
    const delBtn = `<td class="tables-td-action">
      <button class="tables-row-del-btn" title="Delete row"
        onclick='event.stopPropagation();deleteTableRow(${safeTable}, ${safeId})'>✕</button>
    </td>`;
    return `<tr class="tables-data-row" onclick="showRowDetail(${rowIdx})">${cells}${delBtn}</tr>`;
  }).join("");

  wrap.innerHTML = `
    <div class="tables-grid-scroll">
      <table class="tables-data-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;
}

function renderTablesPagination() {
  const s          = window._tablesState;
  const pagination = document.getElementById("tablesPagination");
  const info       = document.getElementById("tablesPageInfo");
  const rowCount   = document.getElementById("tablesRowCount");
  const prevBtn    = document.getElementById("tablesPrevBtn");
  const nextBtn    = document.getElementById("tablesNextBtn");

  const maxPg = Math.ceil(s.total / s.pageSize) || 1;
  const from  = s.total ? (s.page - 1) * s.pageSize + 1 : 0;
  const to    = Math.min(s.page * s.pageSize, s.total);

  if (rowCount)   rowCount.textContent   = `(${s.total.toLocaleString()} rows)`;
  if (info)       info.textContent       = `Page ${s.page} of ${maxPg} · ${from}–${to}`;
  if (prevBtn)    prevBtn.disabled       = s.page <= 1;
  if (nextBtn)    nextBtn.disabled       = s.page >= maxPg;
  if (pagination) pagination.style.display = s.total > s.pageSize ? "flex" : "none";
}

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */

function _tblIcon(name) {
  const icons = {
    documents:           "📁",
    extracted_keywords:  "🔑",
    extracted_entities:  "🏷️",
    poll_runs:           "🔄",
    alert_events:        "🔔",
    websocket_messages:  "⚡",
  };
  return icons[name] || "📋";
}

function _esc(str) {
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

async function deleteTableRow(tableName, rowId) {
  const confirmed = await showConfirm(`Delete this row from "${tableName}"?`);
  if (!confirmed) return;

  try {
    const { res } = await apiDeleteTableRow(tableName, rowId);
    if (res.ok || res.status === 204) {
      setStatus("Row deleted.", "success");
      await loadTableRows(tableName, window._tablesState.page);
      await _refreshTabCount(tableName);
    } else {
      setStatus("Failed to delete row.", "error");
    }
  } catch (_err) {
    setStatus("Network error.", "error");
  }
}

async function clearTable(tableName) {
  const confirmed = await showConfirm(`Delete ALL rows in "${tableName}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const { res } = await apiClearTable(tableName);
    if (res.ok || res.status === 204) {
      setStatus(`Table "${tableName}" cleared.`, "success");
      window._tablesState.rows  = [];
      window._tablesState.total = 0;
      window._tablesState.page  = 1;
      renderTablesGrid();
      renderTablesPagination();
      await _refreshTabCounts();
    } else {
      setStatus("Failed to clear table.", "error");
    }
  } catch (_err) {
    setStatus("Network error.", "error");
  }
}

async function _refreshTabCount(tableName) {
  try {
    const { data } = await apiListTables();
    window._tablesState.tables = data.tables || [];
    renderTablesStats();
    renderTablesTabs();
  } catch (_e) {}
}

async function _refreshTabCounts() {
  return _refreshTabCount(null);
}

/* ═══════════════════════════════════════════════
   ROW DETAIL MODAL
═══════════════════════════════════════════════ */

function showRowDetail(rowIdx) {
  const s      = window._tablesState;
  const row    = s.rows[rowIdx];
  const table  = s.active || "row";
  if (!row) return;

  const fields = s.columns.map(col => {
    const raw = row[col];
    const isNull = raw === null || raw === undefined;
    const str    = isNull ? null : String(raw);
    const isLong = str && str.length > 120;
    return `
      <div class="trd-field">
        <div class="trd-key">${_esc(col)}</div>
        <div class="trd-val${isNull ? " trd-null" : ""}${isLong ? " trd-long" : ""}">
          ${isNull ? "NULL" : _esc(str)}
        </div>
      </div>`;
  }).join("");

  const rowId  = row["id"] != null ? ` · ID ${_esc(String(row["id"]))}` : "";
  const title  = `${table.replace(/_/g, " ")}${rowId}`;

  const existing = document.getElementById("trdOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id        = "trdOverlay";
  overlay.className = "trd-overlay";
  overlay.innerHTML = `
    <div class="trd-modal" role="dialog" aria-modal="true">
      <div class="trd-header">
        <span class="trd-title">${_esc(title)}</span>
        <button class="trd-close" onclick="closeRowDetail()" aria-label="Close">✕</button>
      </div>
      <div class="trd-body">${fields}</div>
    </div>`;

  overlay.addEventListener("click", e => { if (e.target === overlay) closeRowDetail(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("trd-visible"));
}

function closeRowDetail() {
  const overlay = document.getElementById("trdOverlay");
  if (!overlay) return;
  overlay.classList.remove("trd-visible");
  overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeRowDetail();
});

/* ── Exports ── */
window.loadTablesList   = loadTablesList;
window.loadTableRows    = loadTableRows;
window.tablesChangePage = tablesChangePage;
window.deleteTableRow   = deleteTableRow;
window.clearTable       = clearTable;
window.showRowDetail    = showRowDetail;
window.closeRowDetail   = closeRowDetail;
