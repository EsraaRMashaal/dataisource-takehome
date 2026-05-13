/* ── State ── */
// Use global variables to avoid redeclaration errors
window._docs       = window._docs       || [];
window._selectedId = window._selectedId || null;

/* ── Bootstrap ── */
(function() {
  document.addEventListener("DOMContentLoaded", loadDocuments);

  /* Reload document list when WS reports relevant events */
  document.addEventListener("wsEvent", (e) => {
    const { event } = e.detail;
    if (["document.completed", "record.created", "document.deleted"].includes(event)) {
      loadDocuments();
    }
  });
})();

/* ═══════════════════════════════════════════════
   DOCUMENT LIST
═══════════════════════════════════════════════ */

async function loadDocuments() {
  try {
    const data = await apiListDocuments();
    // Debug log to inspect the response
    console.log("apiListDocuments response:", data);
    _docs = (data && data.documents) ? data.documents : [];
    renderStats(_docs);
    renderTable(_docs);
  } catch (err) {
    // Debug log for error
    console.error("Failed to load documents:", err);
    // Try both possible wrapper IDs for error display
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

/* ═══════════════════════════════════════════════
   DETAIL PANEL
═══════════════════════════════════════════════ */

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
    const [kw, en] = await Promise.all([apiGetKeywords(docId), apiGetEntities(docId)]);
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
  // Use the correct panel ID
  const panel = document.getElementById("detailPanel-dashboard");
  if (panel) panel.style.display = "none";
  renderTable(_docs);
}

/* ═══════════════════════════════════════════════
   DELETE
═══════════════════════════════════════════════ */

async function deleteDoc(docId) {
  const doc  = _docs.find(d => d.id === docId);
  const name = doc ? doc.source_filename : docId;
  const confirmed = await showConfirm(`Delete "${name}" and all its extracted data?`);
  if (!confirmed) return;

  try {
    const res = await apiDeleteDocument(docId);
    if (res.status === 204) {
      _docs = _docs.filter(d => d.id !== docId);
      renderStats(_docs);
      renderTable(_docs);
      if (_selectedId === docId) closeDetail();
      setStatus("Document deleted.", "success");
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus(`Delete failed: ${data.detail?.detail || res.statusText}`, "error");
    }
  } catch (err) {
    setStatus(`Network error: ${err.message}`, "error");
  }
}
