import { _json } from './_base.js';

export async function apiNewsPoll() {
  const res = await fetch(`${API}/news/poll`, { method: "POST" });
  return { res, data: await _json(res) };
}

export async function apiNewsAlerts() {
  const res = await fetch(`${API}/news/alerts`);
  return { res, data: await _json(res) };
}

export async function apiNewsDeleteAlerts() {
  const res = await fetch(`${API}/news/alerts`, { method: "DELETE" });
  return { res, data: await _json(res) };
}

export async function apiNewsGetAlert(alertId) {
  const res = await fetch(`${API}/news/alerts/${alertId}`);
  return { res, data: await _json(res) };
}
