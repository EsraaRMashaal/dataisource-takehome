import { _json } from './_base.js';

export async function apiListDocuments() {
  const res = await fetch(`${API}/documents`);
  return { res, data: await _json(res) };
}

export async function apiUpload(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/documents`, { method: "POST", body: form });
  return { res, data: await _json(res) };
}

export async function apiGetDocument(docId) {
  const res = await fetch(`${API}/documents/${docId}`);
  return { res, data: await _json(res) };
}

export async function apiGetKeywords(docId) {
  const res = await fetch(`${API}/documents/${docId}/keywords`);
  return { res, data: await _json(res) };
}

export async function apiGetEntities(docId) {
  const res = await fetch(`${API}/documents/${docId}/entities`);
  return { res, data: await _json(res) };
}

export async function apiDeleteDocument(docId) {
  const res = await fetch(`${API}/documents/${docId}`, { method: "DELETE" });
  return { res, data: await _json(res) };
}
