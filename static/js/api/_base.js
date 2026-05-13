export async function _json(res) {
  if (res.status === 204) return null;
  try { return await res.json(); } catch { return null; }
}
