import { _json } from './_base.js';

export async function apiHealth() {
  const res = await fetch(`${API}/health`);
  return { res, data: await _json(res) };
}
