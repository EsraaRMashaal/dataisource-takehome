/*
 * js/index.js — compiled bundle of all non-API application scripts
 *
 * Source files (edit these, not this bundle):
 *   toast.js · notifications.js · constants.js · utils.js · renderers.js
 *   view-switcher.js · ws-panel.js · ws-test.js · upload.js · home.js
 *   news.js · tables.js · api-test.js · main.js
 *
 * API functions live in js/api/index.js (ES module, loaded separately).
 */

/* ─── toast.js ──────────────────────────────────────────────────────────── */

(function () {
  "use strict";

  const _container = document.createElement("div");
  _container.className = "toast-container";

  function _mount() {
    if (!document.body.contains(_container)) {
      document.body.appendChild(_container);
    }
  }

  if (document.body) {
    _mount();
  } else {
    document.addEventListener("DOMContentLoaded", _mount);
  }

  function _dismiss(toast, onDone) {
    toast.classList.add("removing");
    setTimeout(() => {
      toast.remove();
      if (onDone) onDone();
    }, 260);
  }

  window.setStatus = function setStatus(msg, type) {
    type = type || "info";
    const icons = { info: "ℹ", success: "✓", error: "✕" };

    const toast    = document.createElement("div");
    const iconEl   = document.createElement("span");
    const msgEl    = document.createElement("span");
    const closeBtn = document.createElement("button");

    toast.className    = "toast " + type;
    iconEl.className   = "toast-icon";
    msgEl.className    = "toast-msg";
    closeBtn.className = "toast-close";

    iconEl.textContent   = icons[type] || "ℹ";
    msgEl.textContent    = msg;
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Dismiss");

    closeBtn.addEventListener("click", function () { _dismiss(toast); });

    toast.append(iconEl, msgEl, closeBtn);
    _container.appendChild(toast);

    setTimeout(function () { _dismiss(toast); }, 4500);
  };

  window.showConfirm = function showConfirm(msg) {
    return new Promise(function (resolve) {
      const toast = document.createElement("div");
      toast.className = "toast confirm";

      const top   = document.createElement("div");
      top.className = "toast-top";

      const iconEl = document.createElement("span");
      iconEl.className   = "toast-icon";
      iconEl.textContent = "⚠";

      const msgEl = document.createElement("span");
      msgEl.className   = "toast-msg";
      msgEl.textContent = msg;

      top.append(iconEl, msgEl);

      const actions = document.createElement("div");
      actions.className = "toast-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.className   = "toast-btn toast-btn-cancel";
      cancelBtn.textContent = "Cancel";

      const confirmBtn = document.createElement("button");
      confirmBtn.className   = "toast-btn toast-btn-confirm";
      confirmBtn.textContent = "Delete";

      cancelBtn.addEventListener("click",  function (e) {
        e.stopPropagation();
        _dismiss(toast, function () { resolve(false); });
      });
      confirmBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        _dismiss(toast, function () { resolve(true); });
      });

      actions.append(cancelBtn, confirmBtn);
      toast.append(top, actions);
      _container.appendChild(toast);
    });
  };

}());

/* ─── notifications.js ──────────────────────────────────────────────────── */

(function () {
  "use strict";

  let _unread = 0;

  function _badge() { return document.getElementById("notifBadge"); }
  function _btn()   { return document.getElementById("notifBellBtn"); }

  function _updateBadge() {
    const badge = _badge();
    const btn   = _btn();
    if (!badge || !btn) return;
    if (_unread > 0) {
      badge.textContent = _unread > 99 ? "99+" : String(_unread);
      badge.hidden = false;
      btn.classList.add("notif-bell-active");
    } else {
      badge.hidden = true;
      btn.classList.remove("notif-bell-active");
    }
  }

  function _onAlert(data) {
    _unread++;
    _updateBadge();

    const title = (data.title || "New supply chain alert").slice(0, 80);
    const terms = Array.isArray(data.matched_terms) && data.matched_terms.length
      ? data.matched_terms.slice(0, 2).join(", ")
      : "";

    window.setStatus(
      (terms ? "⚠️ [" + terms + "] " : "📰 ") + title,
      "info"
    );
  }

  document.addEventListener("wsEvent", function (e) {
    const data = (e && e.detail) || {};
    if (data.event === "alert.detected") _onAlert(data);
  });

  window.clearNotifBadge = function () {
    _unread = 0;
    _updateBadge();
  };
}());

/* ─── constants.js ──────────────────────────────────────────────────────── */

const API = "http://localhost:8800/api/v1";

const HEADER_TYPES        = new Set(["rfq_reference","issue_date","buyer","delivery_location","due_date","currency","incoterm"]);
const QTY_TYPES           = new Set(["quantity","unit","packaging"]);
const COMMERCIAL_TYPES    = new Set(["commercial_note"]);
const CERT_TYPES          = new Set(["certification"]);
const PART_INFO_TYPES     = new Set(["part_description","drawing_revision"]);
const MANUFACTURING_TYPES = new Set(["manufacturing_process","surface_finish","tolerance"]);
const MATERIAL_TYPES      = new Set(["material"]);

const ENTITY_CARD_DEFS = [
  { cardId: "headerCard",        title: "RFQ Header",                  metaId: "headerMeta" },
  { cardId: "qtyCard",           title: "Quantities &amp; Packaging",   metaId: "qtyMeta" },
  { cardId: "partInfoCard",      title: "Part Information",            metaId: "partInfoMeta" },
  { cardId: "materialCard",      title: "Material Specifications",     metaId: "materialMeta" },
  { cardId: "manufacturingCard", title: "Manufacturing Requirements",  metaId: "manufacturingMeta" },
  { cardId: "certCard",          title: "Quality &amp; Certification", metaId: "certMeta" },
];

/* ─── utils.js ──────────────────────────────────────────────────────────── */

function metaItem(label, value, confidence) {
  const conf = confidence != null
    ? `<div class="conf">${Math.round(confidence * 100)}% confidence</div>`
    : "";
  return `<div class="meta-item">
            <label>${label.replace(/_/g, " ")}</label>
            <div class="val">${value ?? "—"}</div>
            ${conf}
          </div>`;
}

function typeBadge(t) {
  const map = {
    rfq: "badge-blue", specification: "badge-green",
    processed: "badge-green", pending: "badge-yellow", failed: "badge-red",
  };
  return `<span class="badge ${map[t] || "badge-gray"}">${t}</span>`;
}

function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/* ─── renderers.js ──────────────────────────────────────────────────────── */

function buildEntityCards(mode) {
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const isUpload = mode !== "detail";
  const cards = ENTITY_CARD_DEFS.map(({ cardId, title, metaId }) => isUpload
    ? `<div class="card" id="${cardId}${suffix}">
         <div class="card-title">${title}</div>
         <div class="meta-grid" id="${metaId}${suffix}"></div>
       </div>`
    : `<div id="${cardId}${suffix}" style="display:none">
         <div class="detail-section-title">${title}</div>
         <div class="meta-grid" id="${metaId}${suffix}"></div>
       </div>`
  );
  cards.push(isUpload
    ? `<div class="card" id="commercialCard${suffix}">
         <div class="card-title">Commercial Notes</div>
         <div id="commercialMeta${suffix}"></div>
       </div>`
    : `<div class="detail-section-title">Commercial Notes</div>
       <div id="commercialMeta${suffix}"></div>`
  );
  return cards.join("");
}

function renderDoc(doc, mode = "dashboard") {
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  document.getElementById("docMeta" + suffix).innerHTML = [
    metaItem("ID",        `<span class="text-mono text-sm">${doc.id}</span>`),
    metaItem("Filename",  doc.source_filename),
    metaItem("Type",      typeBadge(doc.document_type)),
    metaItem("Status",    typeBadge(doc.processing_status)),
    metaItem("Origin",    doc.upload_origin),
    metaItem("MIME",      doc.source_mime_type || "—"),
    metaItem("Uploaded",  fmt(doc.created_at)),
    metaItem("Processed", fmt(doc.processed_at)),
  ].join("");
}

function renderHeader(entities, mode = "dashboard") {
  const header = entities.filter(e => HEADER_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card   = document.getElementById("headerCard" + suffix);
  if (!card || !header.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("headerMeta" + suffix).innerHTML =
    header.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderQuantities(entities, mode = "dashboard") {
  const items = entities.filter(e => QTY_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("qtyCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";

  const qty  = items.find(e => e.entity_type === "quantity");
  const unit = items.find(e => e.entity_type === "unit");
  const pkg  = items.find(e => e.entity_type === "packaging");

  const cartonMatch  = pkg?.entity_value.match(/(\d+)\s+\w+\s+per\s+carton/i);
  const perCarton    = cartonMatch ? parseInt(cartonMatch[1]) : null;
  const totalCartons = (qty?.quantity_value && perCarton)
    ? Math.ceil(qty.quantity_value / perCarton) : null;

  document.getElementById("qtyMeta" + suffix).innerHTML = [
    qty  ? metaItem("Quantity",        `${qty.quantity_value ?? qty.entity_value} ${unit?.entity_value ?? ""}`.trim(), qty.confidence) : "",
    unit ? metaItem("Unit of Measure", unit.entity_value, unit.confidence) : "",
    perCarton    ? metaItem("Units per Carton", perCarton)    : "",
    totalCartons ? metaItem("Total Cartons",    totalCartons) : "",
    pkg  ? metaItem("Packaging",       pkg.entity_value, pkg.confidence) : "",
  ].filter(Boolean).join("");
}

function renderPartInfo(entities, mode = "dashboard") {
  const items = entities.filter(e => PART_INFO_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("partInfoCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("partInfoMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderMaterial(entities, mode = "dashboard") {
  const items = entities.filter(e => MATERIAL_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("materialCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("materialMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderManufacturing(entities, mode = "dashboard") {
  const items = entities.filter(e => MANUFACTURING_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("manufacturingCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("manufacturingMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderCertification(entities, mode = "dashboard") {
  const items = entities.filter(e => CERT_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("certCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("certMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderCommercial(entities, mode = "dashboard") {
  const items = entities.filter(e => COMMERCIAL_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const el = document.getElementById("commercialMeta" + suffix);
  if (!el) return;
  el.innerHTML = items.length
    ? `<ul class="note-list">${items.map(e => `<li class="note-point">${e.entity_value}</li>`).join("")}</ul>`
    : `<p class="empty">No commercial notes extracted</p>`;
}

function renderKeywords(keywords, mode = "dashboard") {
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  document.getElementById("kwCount" + suffix).textContent = `(${keywords.length})`;
  const cloud = document.getElementById("kwCloud" + suffix);
  if (!keywords.length) {
    cloud.innerHTML = `<p class="empty">No keywords extracted</p>`;
    return;
  }
  cloud.innerHTML = keywords.map(kw => {
    const pct = Math.round(kw.score * 100);
    return `<div class="kw-chip flex-center gap-xs" title="${kw.normalized_keyword}">
              <span class="kw-text">${kw.keyword}</span>
              <span class="kw-score">${pct}%</span>
            </div>`;
  }).join("");
}

/* ─── view-switcher.js ──────────────────────────────────────────────────── */

function _setNavActive(id) {
  ["navBtnDashboard", "navBtnUpload", "navBtnWsTest", "navBtnNews", "navBtnTables", "navBtnApiTest"].forEach(btnId => {
    document.getElementById(btnId)?.classList.toggle("active", btnId === id);
  });
}

function _allViews() {
  return ["dashboardView", "uploadView", "wsTestView", "newsView", "tablesView", "apiTestView"].map(
    id => document.getElementById(id)
  );
}

function _leaveApiTestView() {
  if (typeof window._atrOnHide === "function") window._atrOnHide();
}

function showDashboardView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const dashView = document.getElementById("dashboardView");
  if (dashView) dashView.style.display = "";
  _setNavActive("navBtnDashboard");
  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "Dashboard";
  if (typeof window.loadDocuments === "function") window.loadDocuments();
  closeSidebar();
}

function showUploadView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const upView = document.getElementById("uploadView");
  if (upView) upView.style.display = "";
  _setNavActive("navBtnUpload");
  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "Upload Document";
  closeSidebar();
}

function showWsTestView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const wsView = document.getElementById("wsTestView");
  if (wsView) wsView.style.display = "";
  _setNavActive("navBtnWsTest");
  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "WebSocket Test";
  if (typeof window._wstInit === "function") window._wstInit();
  closeSidebar();
}

function showNewsView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const newsView = document.getElementById("newsView");
  if (newsView) newsView.style.display = "";
  _setNavActive("navBtnNews");
  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "News Monitor";
  if (typeof window.loadNewsAlerts === "function") window.loadNewsAlerts();
  closeSidebar();
}

function showTablesView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const tblView = document.getElementById("tablesView");
  if (tblView) tblView.style.display = "";
  _setNavActive("navBtnTables");
  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "Database Explorer";
  if (typeof window.loadTablesList === "function") window.loadTablesList();
  closeSidebar();
}

function showApiTestView() {
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const atView = document.getElementById("apiTestView");
  if (atView) atView.style.display = "";
  _setNavActive("navBtnApiTest");
  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "API Test Runner";
  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (!sidebar) return;
  sidebar.classList.toggle("mobile-open");
  overlay?.classList.toggle("active");
}

function closeSidebar() {
  if (window.innerWidth > 768) return;
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar?.classList.remove("mobile-open");
  overlay?.classList.remove("active");
}

window.showDashboardView = showDashboardView;
window.showUploadView    = showUploadView;
window.showWsTestView    = showWsTestView;
window.showNewsView      = showNewsView;
window.showTablesView    = showTablesView;
window.showApiTestView   = showApiTestView;
window.toggleSidebar     = toggleSidebar;
window.closeSidebar      = closeSidebar;

/* ─── ws-panel.js ───────────────────────────────────────────────────────── */

let _ws = null;
const _WS_URL = "ws://localhost:8800/api/v1/ws/events";

(function initWsPanel() {
  const anchor = document.getElementById("wsPanelAnchor");
  if (!anchor) return;
  anchor.innerHTML = `
    <div class="ws-panel" id="wsPanel">
      <div class="ws-panel-header">
        <div class="ws-title">
          <span class="ws-dot" id="wsDot"></span>
          ⚡ Live Events
          <span class="ws-status-text" id="wsStatusText">connecting…</span>
        </div>
        <div class="ws-panel-controls">
          <button class="ws-btn ws-btn-danger" id="wsConnectBtn" onclick="wsToggleConnect()">Disconnect</button>
          <button class="ws-btn" onclick="wsClear()">Clear</button>
        </div>
      </div>
      <div class="ws-events" id="wsEvents">
        <div class="ws-empty">Connecting to event stream…</div>
      </div>
    </div>`;
  setTimeout(wsConnect, 100);
})();

function wsToggleConnect() {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    wsDisconnect();
  } else {
    wsConnect();
  }
}

function wsConnect() {
  if (_ws) { _ws.close(); _ws = null; }
  wsSetStatus("connecting");
  try {
    _ws = new WebSocket(_WS_URL);
  } catch (err) {
    wsSetStatus("disconnected");
    wsAddSystem("Connection failed: " + err.message);
    return;
  }

  _ws.onopen = () => {
    wsSetStatus("connected");
    wsAddSystem("Connected · receiving live events");
  };

  _ws.onmessage = (e) => {
    let data;
    try { data = JSON.parse(e.data); } catch { data = { event: "raw", message: e.data }; }
    if (data.event !== "connected") wsAddEvent(data);
    document.dispatchEvent(new CustomEvent("wsEvent", { detail: data }));
  };

  _ws.onerror = () => wsSetStatus("disconnected");
  _ws.onclose = () => {
    wsSetStatus("disconnected");
    wsAddSystem("Connection closed");
    _ws = null;
  };
}

function wsDisconnect() {
  if (_ws) { _ws.close(); _ws = null; }
  wsSetStatus("disconnected");
}

function wsSetStatus(state) {
  const dot = document.getElementById("wsDot");
  const txt = document.getElementById("wsStatusText");
  const btn = document.getElementById("wsConnectBtn");
  if (!dot) return;

  dot.className   = `ws-dot ${state}`;
  txt.className   = `ws-status-text${state === "connected" ? " connected" : ""}`;
  txt.textContent = state;

  if (state === "connected") {
    btn.textContent = "Disconnect";
    btn.className   = "ws-btn ws-btn-danger";
  } else {
    btn.textContent = "Connect";
    btn.className   = "ws-btn ws-btn-connect";
  }

  const navDot  = document.getElementById("wsNavDot");
  const navText = document.getElementById("wsNavText");
  if (navDot)  navDot.className   = `ws-nav-dot ${state}`;
  if (navText) navText.textContent = state.charAt(0).toUpperCase() + state.slice(1);

  window._wsState = state;
  document.dispatchEvent(new CustomEvent("wsStatusChange", { detail: state }));
}

function wsSend(text) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    window.setStatus("Not connected — click Connect first.", "error");
    return false;
  }
  _ws.send(text);
  return true;
}

function wsCreateRow(typeClass, typeLabel, payloadHtml) {
  const now = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const row = document.createElement("div");
  row.className = "ws-event";
  row.innerHTML = `
    <div class="ws-event-head">
      <span class="ws-ts">${now}</span>
      <span class="ws-type ${typeClass}">${typeLabel}</span>
    </div>
    <div class="ws-payload">${payloadHtml}</div>`;
  return row;
}

function wsAddEvent(data) {
  const box = document.getElementById("wsEvents");
  if (!box) return;
  box.querySelector(".ws-empty")?.remove();

  const evt     = data.event || "unknown";
  const payload = Object.entries(data)
    .filter(([k]) => k !== "event")
    .map(([k, v]) => `${k}=${typeof v === "string" && v.length > 20 ? v.slice(0, 18) + "…" : v}`)
    .join("  ");

  box.appendChild(wsCreateRow(evt.replace(/\./g, "-"), evt, payload || "—"));
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 150) box.firstChild.remove();
}

function wsAddSystem(msg) {
  const box = document.getElementById("wsEvents");
  if (!box) return;
  box.querySelector(".ws-empty")?.remove();
  box.appendChild(wsCreateRow("ws-opened", "system", msg));
  box.scrollTop = box.scrollHeight;
}

function wsClear() {
  const box = document.getElementById("wsEvents");
  if (box) box.innerHTML = `<div class="ws-empty">Cleared · waiting for events</div>`;
}

window.wsSend       = wsSend;
window.wsConnect    = wsConnect;
window.wsDisconnect = wsDisconnect;

/* ─── ws-test.js ────────────────────────────────────────────────────────── */

let _wstLogCount = 0;

function _wstSyncStatus() {
  const dot   = document.getElementById("wstDot");
  const label = document.getElementById("wstConnLabel");
  const btn   = document.getElementById("wstConnBtn");
  const send  = document.getElementById("wstSendBtn");
  if (!dot) return;

  const state = window._wsState || "disconnected";

  dot.className = "ws-dot " + state;
  label.textContent = state.charAt(0).toUpperCase() + state.slice(1);

  if (state === "connected") {
    btn.textContent  = "Disconnect";
    btn.className    = "wst-conn-btn wst-conn-btn-danger";
    if (send) send.disabled = false;
  } else {
    btn.textContent  = "Connect";
    btn.className    = "wst-conn-btn";
    if (send) send.disabled = true;
  }
}

window.wstToggleConnect = function () {
  if (window._wsState === "connected") {
    wsDisconnect();
  } else {
    wsConnect();
  }
};

window.wstSend = function () {
  const input = document.getElementById("wstInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) { setStatus("Enter a message first.", "info"); return; }

  const ok = wsSend(text);
  if (ok) {
    _wstAppend("sent", text);
    input.value = "";
    input.focus();
  }
};

document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    const input = document.getElementById("wstInput");
    if (document.activeElement === input) wstSend();
  }
});

window.wstClear = function () {
  const log = document.getElementById("wstLog");
  if (log) {
    log.innerHTML = '<div class="wst-log-empty">Log cleared</div>';
    _wstLogCount = 0;
    const cnt = document.getElementById("wstLogCount");
    if (cnt) cnt.textContent = "0 messages";
  }
};

function _wstAppend(dir, text) {
  const log = document.getElementById("wstLog");
  if (!log) return;

  log.querySelector(".wst-log-empty")?.remove();

  _wstLogCount++;
  const cnt = document.getElementById("wstLogCount");
  if (cnt) cnt.textContent = _wstLogCount + " message" + (_wstLogCount !== 1 ? "s" : "");

  const ts  = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const row = document.createElement("div");
  row.className = "wst-log-row wst-" + dir;

  row.innerHTML =
    '<span class="wst-log-dir">' + (dir === "sent" ? "▲ SENT" : "▼ RECV") + "</span>" +
    '<span class="wst-log-ts">'  + ts + "</span>" +
    '<pre class="wst-log-body">' + _wstEscape(text) + "</pre>";

  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 200) log.firstChild.remove();
}

function _wstEscape(str) {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  } catch {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

document.addEventListener("wsEvent", function (e) {
  const view = document.getElementById("wsTestView");
  if (!view || view.style.display === "none") return;
  _wstAppend("recv", JSON.stringify(e.detail));
});

document.addEventListener("wsStatusChange", function (e) {
  window._wsState = e.detail;
  _wstSyncStatus();
});

window._wstInit = function () {
  _wstLogCount = 0;
  _wstSyncStatus();
};

/* ─── upload.js ─────────────────────────────────────────────────────────── */

function setupUploadViewEvents() {
  const dropZone  = document.getElementById("dropZone-upload");
  const fileInput = document.getElementById("fileInput-upload");
  const fileLabel = document.getElementById("fileLabel-upload");
  const uploadBtn = document.getElementById("uploadBtn-upload");

  if (!dropZone || !fileInput || !fileLabel || !uploadBtn) {
    if (!fileInput) console.warn('fileInput element not found when setting up upload events.');
    return;
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) {
      fileLabel.textContent = fileInput.files[0].name;
      uploadBtn.disabled = false;
    }
  });
  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault(); dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer(); dt.items.add(file);
    fileInput.files = dt.files;
    fileLabel.textContent = file.name;
    uploadBtn.disabled = false;
  });
}

if (typeof window._currentDocId === "undefined") {
  window._currentDocId = null;
}

async function run() {
  let fileInput = document.getElementById("fileInput") || document.getElementById("fileInput-upload");
  let uploadBtn = document.getElementById("uploadBtn-upload");
  let fileLabel = document.getElementById("fileLabel-upload");
  if (!fileInput || !uploadBtn || !fileLabel) return;

  const file = fileInput.files[0];
  if (!file) return;

  uploadBtn.disabled = true;
  document.getElementById("results-upload").style.display = "none";
  setStatus("Uploading…", "info");

  let doc;
  try {
    const { res, data } = await apiUpload(file);

    if (res.status === 409) {
      const m = JSON.stringify(data).match(/id=([\w-]+)/);
      if (!m) { setStatus(`Duplicate: ${data.detail?.detail || "already exists"}`, "error"); uploadBtn.disabled = false; return; }
      setStatus("Already ingested — loading existing record…", "info");
      const { data: existing } = await apiGetDocument(m[1]);
      doc = existing;
    } else if (!res.ok) {
      setStatus(`Error ${res.status}: ${data.detail?.detail || data.detail || res.statusText}`, "error");
      uploadBtn.disabled = false; return;
    } else {
      doc = data;
    }
  } catch (err) {
    setStatus(`Network error — is the service on port 8800? (${err.message})`, "error");
    uploadBtn.disabled = false; return;
  }

  window._currentDocId = doc.id;
  window._currentDocFilename = doc.source_filename || doc.filename || "";

  setStatus("Fetching extracted data…", "info");

  const [{ data: kw }, { data: en }] = await Promise.all([
    apiGetKeywords(doc.id),
    apiGetEntities(doc.id),
  ]);

  renderHeader(en.entities, "upload");
  renderQuantities(en.entities, "upload");
  renderPartInfo(en.entities, "upload");
  renderMaterial(en.entities, "upload");
  renderManufacturing(en.entities, "upload");
  renderCertification(en.entities, "upload");
  renderCommercial(en.entities, "upload");
  renderDoc(doc, "upload");
  renderKeywords(kw.keywords, "upload");

  document.getElementById("results-upload").style.display = "block";
  setStatus(
    `Done — ${kw.total} keyword${kw.total !== 1 ? "s" : ""} · ${en.total} entit${en.total !== 1 ? "ies" : "y"} extracted`,
    "success"
  );
  uploadBtn.disabled = false;
}

async function deleteUploadDoc() {
  const fileInput = document.getElementById("fileInput") || document.getElementById("fileInput-upload");
  const fileLabel = document.getElementById("fileLabel-upload");
  const uploadBtn = document.getElementById("uploadBtn-upload");

  let filename = window._currentDocFilename || "";
  if (!filename && fileInput && fileInput.files && fileInput.files[0]) {
    filename = fileInput.files[0].name;
  } else if (!filename && fileLabel && fileLabel.textContent) {
    filename = fileLabel.textContent;
  } else if (!filename && window._currentDocId) {
    filename = window._currentDocId;
  } else if (!filename) {
    filename = "Unknown";
  }

  if (!window._currentDocId) return;
  const confirmed = await showConfirm(`Delete "${filename}" and all its extracted data?`);
  if (!confirmed) return;

  try {
    const { res, data } = await apiDeleteDocument(window._currentDocId);

    if (res.ok) {
      setStatus("Deleted successfully", "success");
      uploadBtn.disabled = true;
      document.getElementById("results-upload").style.display = "none";
      fileLabel.textContent = "";
      fileInput.value = "";
      window._currentDocId = null;
      window._currentDocFilename = null;
      const dashboard = document.getElementById('dashboardViewPartial');
      const upload = document.getElementById('uploadViewPartial');
      if (dashboard) dashboard.style.display = 'block';
      if (upload) upload.style.display = 'none';
    } else {
      setStatus(`Error ${res.status}: ${data?.detail?.detail || data?.detail || res.statusText}`, "error");
    }
  } catch (err) {
    setStatus(`Network error — is the service on port 8800? (${err.message})`, "error");
  } finally {
    uploadBtn.disabled = false;
  }
}

/* ─── home.js ───────────────────────────────────────────────────────────── */

window._docs       = window._docs       || [];
window._selectedId = window._selectedId || null;

(function() {
  document.addEventListener("DOMContentLoaded", loadDocuments);

  document.addEventListener("wsEvent", (e) => {
    const { event } = e.detail;
    if (["document.completed", "record.created", "document.deleted"].includes(event)) {
      loadDocuments();
    }
  });
})();

async function loadDocuments() {
  try {
    const { data } = await apiListDocuments();
    console.log("apiListDocuments response:", data);
    _docs = (data && data.documents) ? data.documents : [];
    renderStats(_docs);
    renderTable(_docs);
  } catch (err) {
    console.error("Failed to load documents:", err);
    let wrap = document.getElementById("docTableWrap-dashboard") || document.getElementById("docTableWrap");
    if (wrap) {
      wrap.innerHTML =
        `<div class="empty-state"><div class="empty-icon">⚠️</div>
         Could not reach the server. Is it running on port 8800?</div>`;
    }
  }
}

function renderStats(docs) {
  const processed = docs.filter(d => d.processing_status === "processed").length;
  const pending   = docs.filter(d => d.processing_status !== "processed").length;
  document.getElementById("statTotal-dashboard").textContent     = docs.length;
  document.getElementById("statProcessed-dashboard").textContent = processed;
  document.getElementById("statPending-dashboard").textContent   = pending;
  document.getElementById("docCount-dashboard").textContent      = `(${docs.length})`;
}

function renderTable(docs) {
  const wrap = document.getElementById("docTableWrap-dashboard");
  if (!docs.length) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      No documents yet — <span class="link" onclick="showUploadView()">upload one</span> to get started.
    </div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="doc-table">
      <thead>
        <tr><th>Filename</th><th>Type</th><th>Status</th><th>Uploaded</th><th></th></tr>
      </thead>
      <tbody>${docs.map(docRow).join("")}</tbody>
    </table>`;
}

function docRow(doc) {
  const active = doc.id === _selectedId ? " active" : "";
  return `<tr class="${active}" onclick="openDetail('${doc.id}')">
    <td class="col-file"><span title="${doc.source_filename}">${doc.source_filename}</span></td>
    <td>${typeBadge(doc.document_type)}</td>
    <td>${typeBadge(doc.processing_status)}</td>
    <td class="col-date">${fmt(doc.created_at)}</td>
    <td class="col-actions" onclick="event.stopPropagation()">
      <button class="btn-icon btn-view" title="View"   onclick="openDetail('${doc.id}')">👁</button>
      <button class="btn-icon btn-del"  title="Delete" onclick="deleteDoc('${doc.id}')">🗑</button>
    </td>
  </tr>`;
}

async function openDetail(docId) {
  _selectedId = docId;
  renderTable(_docs);

  const panel = document.getElementById("detailPanel-dashboard");
  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  const doc = _docs.find(d => d.id === docId);
  if (doc) document.getElementById("detailFilename-dashboard").textContent = doc.source_filename;

  setStatus("Loading document detail…", "info");
  try {
    const [{ data: kw }, { data: en }] = await Promise.all([apiGetKeywords(docId), apiGetEntities(docId)]);
    renderDoc(doc, "dashboard");
    renderHeader(en.entities, "dashboard");
    renderQuantities(en.entities, "dashboard");
    renderPartInfo(en.entities, "dashboard");
    renderMaterial(en.entities, "dashboard");
    renderManufacturing(en.entities, "dashboard");
    renderCertification(en.entities, "dashboard");
    renderCommercial(en.entities, "dashboard");
    renderKeywords(kw.keywords, "dashboard");
    setStatus(
      `${kw.total} keyword${kw.total !== 1 ? "s" : ""} · ${en.total} entit${en.total !== 1 ? "ies" : "y"} extracted`,
      "success"
    );
  } catch (err) {
    setStatus(`Failed to load detail: ${err.message}`, "error");
  }
}

function closeDetail() {
  _selectedId = null;
  const panel = document.getElementById("detailPanel-dashboard");
  if (panel) panel.style.display = "none";
  renderTable(_docs);
}

async function deleteDoc(docId) {
  const doc  = _docs.find(d => d.id === docId);
  const name = doc ? doc.source_filename : docId;
  const confirmed = await showConfirm(`Delete "${name}" and all its extracted data?`);
  if (!confirmed) return;

  try {
    const { res, data } = await apiDeleteDocument(docId);
    if (res.status === 204) {
      _docs = _docs.filter(d => d.id !== docId);
      renderStats(_docs);
      renderTable(_docs);
      if (_selectedId === docId) closeDetail();
      setStatus("Document deleted.", "success");
    } else {
      setStatus(`Delete failed: ${data?.detail?.detail || res.statusText}`, "error");
    }
  } catch (err) {
    setStatus(`Network error: ${err.message}`, "error");
  }
}

/* ─── news.js ───────────────────────────────────────────────────────────── */

window._newsAlerts    = window._newsAlerts    || [];
window._newsSelectedId = window._newsSelectedId || null;
window._newsNewIds    = window._newsNewIds    || new Set();

(function () {
  document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("wsEvent", (e) => {
      if (e.detail?.event === "alert.detected") loadNewsAlerts();
    });
  });
})();

async function loadNewsAlerts() {
  try {
    const { data } = await apiNewsAlerts();
    window._newsAlerts = data.alerts || [];
    renderNewsStats(window._newsAlerts);
    renderNewsList(window._newsAlerts);
  } catch (err) {
    const wrap = document.getElementById("newsListWrap");
    if (wrap) {
      wrap.innerHTML = `<div class="empty-state">
        <div class="empty-icon">⚠️</div>
        Could not reach the server. Is it running on port 8800?
      </div>`;
    }
  }
}

function renderNewsStats(alerts) {
  const total    = alerts.length;
  const detected = alerts.filter(a => a.alert_status === "detected").length;
  const sources  = new Set(alerts.map(a => a.source_name)).size;

  const el = id => document.getElementById(id);
  if (el("newsStatTotal"))    el("newsStatTotal").textContent    = total;
  if (el("newsStatDetected")) el("newsStatDetected").textContent = detected;
  if (el("newsStatSources"))  el("newsStatSources").textContent  = sources;
  if (el("newsAlertCount"))   el("newsAlertCount").textContent   = `(${total})`;
}

function renderNewsList(alerts) {
  const wrap = document.getElementById("newsListWrap");
  if (!wrap) return;

  if (!alerts.length) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📡</div>
      No alerts yet — click <strong>Run Poll</strong> to fetch the latest news.
    </div>`;
    return;
  }

  wrap.innerHTML = alerts.map(alertCard).join("");
}

function alertCard(alert) {
  const terms   = _safeJson(alert.matched_terms_json, []);
  const payload = _safeJson(alert.payload_json, {});
  const country = payload.sourcecountry || "";
  const domain  = payload.domain || "";
  const selected = alert.id === window._newsSelectedId ? " news-alert-selected" : "";
  const isNew    = window._newsNewIds.has(alert.id) ? " news-alert-new" : "";

  const chips = terms.map(t =>
    `<span class="news-term-chip">${_esc(t)}</span>`
  ).join("");

  return `
    <div class="news-alert-card${selected}${isNew}" onclick="openNewsDetail('${alert.id}')">
      <div class="news-card-top">
        <div class="news-card-meta">
          ${_statusBadge(alert.alert_status)}
          ${domain  ? `<span class="news-domain-badge">${_esc(domain)}</span>` : ""}
          ${country ? `<span class="news-country">${_esc(country)}</span>` : ""}
        </div>
        <span class="news-date">${_fmt(alert.published_at)}</span>
      </div>
      <a class="news-title" href="${alert.article_url}" target="_blank" rel="noopener"
         onclick="event.stopPropagation()">${_esc(alert.article_title)}</a>
      <div class="news-card-footer">
        <div class="news-terms-wrap">
          <span class="news-terms-label">Matched:</span>
          ${chips || '<span class="text-muted text-sm">—</span>'}
        </div>
        <span class="news-detected-at">Detected ${_fmt(alert.detected_at)}</span>
      </div>
    </div>`;
}

async function openNewsDetail(alertId) {
  window._newsSelectedId = alertId;
  renderNewsList(window._newsAlerts);

  const panel = document.getElementById("newsDetailPanel");
  if (!panel) return;
  panel.style.display = "block";
  panel.innerHTML = `<div class="empty-state" style="padding:2rem;">Loading…</div>`;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const { data: alert } = await apiNewsGetAlert(alertId);
    _renderNewsDetail(panel, alert);
  } catch (err) {
    panel.innerHTML = `<div class="empty-state">Failed to load alert detail.</div>`;
  }
}

function _renderNewsDetail(panel, alert) {
  const terms   = _safeJson(alert.matched_terms_json, []);
  const payload = _safeJson(alert.payload_json, {});

  const kwChips = terms.map(t =>
    `<span class="kw-chip"><span class="kw-text">${_esc(t)}</span></span>`
  ).join("") || '<span class="text-muted text-sm">None</span>';

  const imgBlock = payload.socialimage
    ? `<div class="detail-section-title mt-md">Social Image</div>
       <img src="${payload.socialimage}" alt="" class="news-social-img" onerror="this.style.display='none'">`
    : "";

  const errBlock = alert.processing_error
    ? `<div class="detail-section-title mt-md">Processing Error</div>
       <span class="badge badge-red">${_esc(alert.processing_error)}</span>`
    : "";

  panel.innerHTML = `
    <div class="card-title flex-between">
      <span>Alert Detail</span>
      <button class="detail-close" onclick="closeNewsDetail()">✕ Close</button>
    </div>
    <div class="meta-grid">
      ${_mi("ID",        `<span class="text-mono text-xs">${alert.id}</span>`)}
      ${_mi("Status",    _statusBadge(alert.alert_status))}
      ${_mi("Source",    alert.source_name)}
      ${_mi("Published", _fmt(alert.published_at))}
      ${_mi("Detected",  _fmt(alert.detected_at))}
      ${_mi("Notified",  _fmt(alert.notified_at))}
      ${_mi("Domain",    payload.domain    || "—")}
      ${_mi("Country",   payload.sourcecountry || "—")}
      ${_mi("Language",  payload.language  || "—")}
      ${_mi("Poll Run",  `<span class="text-mono text-xs">${alert.poll_run_id}</span>`)}
    </div>
    <div class="detail-section-title mt-md">Article</div>
    <p style="font-size:0.92rem;font-weight:600;margin:0 0 0.4rem;line-height:1.4;">${_esc(alert.article_title)}</p>
    <a href="${alert.article_url}" target="_blank" rel="noopener" class="link text-sm"
       style="word-break:break-all;">${_esc(alert.article_url)}</a>
    <div class="detail-section-title mt-md">Matched Terms</div>
    <div class="kw-cloud">${kwChips}</div>
    ${imgBlock}
    ${errBlock}`;
}

function closeNewsDetail() {
  window._newsSelectedId = null;
  const panel = document.getElementById("newsDetailPanel");
  if (panel) panel.style.display = "none";
  renderNewsList(window._newsAlerts);
}

async function runNewsPoll() {
  const btn = document.getElementById("btnRunPoll");
  if (btn) { btn.disabled = true; btn.textContent = "Polling…"; }

  try {
    const { res, data } = await apiNewsPoll();
    if (res.ok) {
      const created = data.total ?? 0;
      window._newsNewIds = new Set((data.alerts || []).map(a => a.id));
      setStatus(`Poll complete — ${created} new alert${created !== 1 ? "s" : ""}`, "success");
      await loadNewsAlerts();
      if (window._newsNewIds.size > 0) {
        setTimeout(() => {
          window._newsNewIds = new Set();
          renderNewsList(window._newsAlerts);
        }, 4000);
      }
    } else {
      setStatus(`Poll failed: ${data.detail || res.statusText}`, "error");
    }
  } catch (err) {
    setStatus(`Network error: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "▶ Run Poll"; }
  }
}

async function clearNewsAlerts() {
  const confirmed = await showConfirm("Delete ALL stored news alerts? This cannot be undone.");
  if (!confirmed) return;

  try {
    const { res } = await apiNewsDeleteAlerts();
    if (res.ok || res.status === 204) {
      window._newsAlerts = [];
      window._newsSelectedId = null;
      renderNewsStats([]);
      renderNewsList([]);
      const panel = document.getElementById("newsDetailPanel");
      if (panel) panel.style.display = "none";
      setStatus("All alerts cleared.", "success");
    } else {
      setStatus("Failed to delete alerts.", "error");
    }
  } catch (err) {
    setStatus(`Network error: ${err.message}`, "error");
  }
}

function _statusBadge(status) {
  const map = { detected: "badge-blue", notified: "badge-green", error: "badge-red" };
  return `<span class="badge ${map[status] || "badge-gray"}">${status || "unknown"}</span>`;
}

function _mi(label, value) {
  return `<div class="meta-item"><label>${label}</label><div class="val">${value || "—"}</div></div>`;
}

function _safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function _esc(str) {
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

function _fmt(str) {
  if (!str) return "—";
  try {
    return new Date(str).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return str; }
}

window.loadNewsAlerts  = loadNewsAlerts;
window.openNewsDetail  = openNewsDetail;
window.closeNewsDetail = closeNewsDetail;
window.runNewsPoll     = runNewsPoll;
window.clearNewsAlerts = clearNewsAlerts;

/* ─── tables.js ─────────────────────────────────────────────────────────── */

window._tablesState = {
  tables:   [],
  active:   null,
  page:     1,
  pageSize: 50,
  total:    0,
  columns:  [],
  rows:     [],
};

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
      <span class="tables-tab-name">${t.name.replace(/_/g, " ")}</span>
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

window.loadTablesList   = loadTablesList;
window.loadTableRows    = loadTableRows;
window.tablesChangePage = tablesChangePage;
window.deleteTableRow   = deleteTableRow;
window.clearTable       = clearTable;
window.showRowDetail    = showRowDetail;
window.closeRowDetail   = closeRowDetail;

/* ─── api-test.js ───────────────────────────────────────────────────────── */

let _atrSuite    = "all";
let _atrRunning  = false;
let _atrWs       = null;
let _atrWsState  = "disconnected";
let _atrResults  = [];
let _atrStart    = 0;

window.atrSelectSuite = function (suite) {
  _atrSuite = suite;
  document.querySelectorAll(".atr-suite-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.suite === suite);
  });
};

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
    const ctx = {};
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
      await _sleep(40);
    }
  }

  _atrSetProgress(100, false);
  _atrRenderSummary();

  if (runBtn) { runBtn.disabled = false; runBtn.textContent = "▶ Run Tests"; }
  _atrRunning = false;
};

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
          "rfq_test.txt", { type: "text/plain" }
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
          "rfq_test.txt", { type: "text/plain" }
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

function _assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

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

window._atrOnHide = function () {
  _atrWsDisconnect();
};

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─── main.js ───────────────────────────────────────────────────────────── */

async function loadPartial(id, url, afterLoad) {
  const el = document.getElementById(id);
  if (!el) {
    console.log(`[loadPartial] Element with id '${id}' not found.`);
    return;
  }
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    el.innerHTML = text;
    if (afterLoad) afterLoad();
  } catch (err) {
    console.error(`[loadPartial] Error loading partial '${url}':`, err);
  }
}

function toggleWsPanel() {}

function toggleRightSidebar() {
  const sidebar = document.getElementById('rightSidebar');
  if (sidebar) sidebar.classList.toggle('rs-collapsed');
}

window.addEventListener('DOMContentLoaded', () => {
  loadPartial('rightSidebarPartial', 'partials/right-sidebar.html', () => {
    loadPartial('wsPanelPartial', 'partials/ws-panel.html');
    loadPartial('confidenceLegendPartial', 'partials/confidence-legend.html');
  });
  loadPartial('dashboardViewPartial', 'partials/dashboard-view.html', async () => {
    const entityCardsDashboard = document.getElementById('entityCards-dashboard');
    if (entityCardsDashboard) {
      entityCardsDashboard.innerHTML = await window.buildEntityCards('detail');
    }
  });
  loadPartial('uploadViewPartial', 'partials/upload-view.html', async () => {
    const entityCardsUpload = document.getElementById('entityCards-upload');
    if (entityCardsUpload) {
      entityCardsUpload.innerHTML = await window.buildEntityCards('upload');
    }
    if (typeof setupUploadViewEvents === 'function') {
      setupUploadViewEvents();
      const resultsUpload = document.getElementById("results-upload");
      if (resultsUpload) resultsUpload.style.display = "block";
    }
  });
  loadPartial('wsTestViewPartial', 'partials/ws-test-view.html', () => {
    if (typeof window._wstInit === 'function') window._wstInit();
  });
  loadPartial('newsViewPartial', 'partials/news-view.html');
  loadPartial('tablesViewPartial', 'partials/tables-view.html');
  loadPartial('apiTestViewPartial', 'partials/api-test-view.html');
});
