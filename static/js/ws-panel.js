/* ── WebSocket live events — fixed left sidebar ── */

let _ws = null;
const _WS_URL = "ws://localhost:8800/api/v1/ws/events";

/* Inject sidebar HTML and auto-connect */
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
  /* Auto-connect after DOM is ready */
  setTimeout(wsConnect, 100);
})();

/* ── Connection management ── */

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

  // Sync top-bar status badge
  const navDot  = document.getElementById("wsNavDot");
  const navText = document.getElementById("wsNavText");
  if (navDot)  navDot.className   = `ws-nav-dot ${state}`;
  if (navText) navText.textContent = state.charAt(0).toUpperCase() + state.slice(1);

  // Notify ws-test page
  window._wsState = state;
  document.dispatchEvent(new CustomEvent("wsStatusChange", { detail: state }));
}

/* ── Send a raw message ── */
function wsSend(text) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    window.setStatus("Not connected — click Connect first.", "error");
    return false;
  }
  _ws.send(text);
  return true;
}
window.wsSend      = wsSend;
window.wsConnect   = wsConnect;
window.wsDisconnect = wsDisconnect;

/* ── Event rendering ── */

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
  box.scrollTop = box.scrollHeight; /* newest at bottom */
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
