import { _json } from './_base.js';

export async function apiListTables() {
  const res = await fetch(`${API}/tables`);
  return { res, data: await _json(res) };
}

export async function apiGetTableRows(tableName, page = 1, pageSize = 50) {
  const res = await fetch(`${API}/tables/${tableName}?page=${page}&page_size=${pageSize}`);
  return { res, data: await _json(res) };
}

export async function apiClearTable(tableName) {
  const res = await fetch(`${API}/tables/${tableName}`, { method: "DELETE" });
  return { res, data: await _json(res) };
}

export async function apiDeleteTableRow(tableName, rowId) {
  const res = await fetch(`${API}/tables/${tableName}/${encodeURIComponent(rowId)}`, { method: "DELETE" });
  return { res, data: await _json(res) };
}
