/* ── State ── */
window._newsAlerts    = window._newsAlerts    || [];
window._newsSelectedId = window._newsSelectedId || null;
window._newsNewIds    = window._newsNewIds    || new Set();

/* ── Bootstrap ── */
(function () {
  document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("wsEvent", (e) => {
      if (e.detail?.event === "alert.detected") loadNewsAlerts();
    });
  });
})();

/* ═══════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════
   LIST RENDERING
═══════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════
   DETAIL PANEL
═══════════════════════════════════════════════ */

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
    _renderDetail(panel, alert);
  } catch (err) {
    panel.innerHTML = `<div class="empty-state">Failed to load alert detail.</div>`;
  }
}

function _renderDetail(panel, alert) {
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

/* ═══════════════════════════════════════════════
   ACTIONS
═══════════════════════════════════════════════ */

async function runNewsPoll() {
  const btn = document.getElementById("btnRunPoll");
  if (btn) { btn.disabled = true; btn.textContent = "Polling…"; }

  try {
    const { res, data } = await apiNewsPoll();
    if (res.ok) {
      const created = data.total ?? 0;
      // Mark newly returned alert IDs so cards render highlighted
      window._newsNewIds = new Set((data.alerts || []).map(a => a.id));
      setStatus(`Poll complete — ${created} new alert${created !== 1 ? "s" : ""}`, "success");
      await loadNewsAlerts();
      // Reset highlight after 4 s
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

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */

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
  d.textContent = str;
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

/* ── Exports ── */
window.loadNewsAlerts  = loadNewsAlerts;
window.openNewsDetail  = openNewsDetail;
window.closeNewsDetail = closeNewsDetail;
window.runNewsPoll     = runNewsPoll;
window.clearNewsAlerts = clearNewsAlerts;
