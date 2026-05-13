/*
 * ws-test.js — WebSocket test page logic
 *
 * Depends on: ws-panel.js (wsSend, wsConnect, wsDisconnect, wsSetStatus)
 */

let _wstLogCount = 0;

/* ── sync connection state to test page UI ─────────────── */

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

/* ── connect / disconnect ──────────────────────────────── */

window.wstToggleConnect = function () {
  if (window._wsState === "connected") {
    wsDisconnect();
  } else {
    wsConnect();
  }
};

/* ── send ──────────────────────────────────────────────── */

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

/* ── allow Enter (Ctrl+Enter or Cmd+Enter) to send ──────── */

document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    const input = document.getElementById("wstInput");
    if (document.activeElement === input) wstSend();
  }
});

/* ── clear log ─────────────────────────────────────────── */

window.wstClear = function () {
  const log = document.getElementById("wstLog");
  if (log) {
    log.innerHTML = '<div class="wst-log-empty">Log cleared</div>';
    _wstLogCount = 0;
    const cnt = document.getElementById("wstLogCount");
    if (cnt) cnt.textContent = "0 messages";
  }
};

/* ── append a row to the log ───────────────────────────── */

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
    '<pre class="wst-log-body">' + _escape(text) + "</pre>";

  log.appendChild(row);
  log.scrollTop = log.scrollHeight;

  // cap at 200 rows
  while (log.children.length > 200) log.firstChild.remove();
}

function _escape(str) {
  // pretty-print JSON if possible, otherwise plain text
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  } catch {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

/* ── listen for incoming ws events ────────────────────── */

document.addEventListener("wsEvent", function (e) {
  const view = document.getElementById("wsTestView");
  if (!view || view.style.display === "none") return;
  _wstAppend("recv", JSON.stringify(e.detail));
});

/* ── listen for status changes from ws-panel.js ─────────── */

document.addEventListener("wsStatusChange", function (e) {
  window._wsState = e.detail;
  _wstSyncStatus();
});

/* ── init when view becomes visible ─────────────────────── */

window._wstInit = function () {
  _wstLogCount = 0;
  _wstSyncStatus();
};
