async function apiListDocuments() {
  const res = await fetch(`${API}/documents`);
  return res.json();
}

async function apiUpload(file) {
  const form = new FormData();
  form.append("file", file);
  const res  = await fetch(`${API}/documents`, { method: "POST", body: form });
  const data = await res.json();
  return { res, data };
}

async function apiGetDocument(docId) {
  const res = await fetch(`${API}/documents/${docId}`);
  return res.json();
}

async function apiGetKeywords(docId) {
  const res = await fetch(`${API}/documents/${docId}/keywords`);
  return res.json();
}

async function apiGetEntities(docId) {
  const res = await fetch(`${API}/documents/${docId}/entities`);
  return res.json();
}

async function apiDeleteDocument(docId) {
  return fetch(`${API}/documents/${docId}`, { method: "DELETE" });
}

async function apiNewsPoll() {
  const res = await fetch(`${API}/news/poll`, { method: "POST" });
  const data = await res.json();
  return { res, data };
}

async function apiNewsAlerts() {
  const res = await fetch(`${API}/news/alerts`);
  return res.json();
}

async function apiNewsDeleteAlerts() {
  return fetch(`${API}/news/alerts`, { method: "DELETE" });
}

async function apiNewsGetAlert(alertId) {
  const res = await fetch(`${API}/news/alerts/${alertId}`);
  return res.json();
}

async function apiListTables() {
  const res = await fetch(`${API}/tables`);
  return res.json();
}

async function apiGetTableRows(tableName, page = 1, pageSize = 50) {
  const res = await fetch(`${API}/tables/${tableName}?page=${page}&page_size=${pageSize}`);
  return res.json();
}

async function apiClearTable(tableName) {
  return fetch(`${API}/tables/${tableName}`, { method: "DELETE" });
}

async function apiDeleteTableRow(tableName, rowId) {
  return fetch(`${API}/tables/${tableName}/${encodeURIComponent(rowId)}`, { method: "DELETE" });
}
