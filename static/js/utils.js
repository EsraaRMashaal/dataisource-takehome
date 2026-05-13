/*
 * utils.js — shared rendering helpers
 * Toast functions live in toast.js
 */

function metaItem(label, value, confidence) {
  const conf = confidence != null
    ? `<div class="conf">${Math.round(confidence * 100)}% confidence</div>`
    : "";
  return `<div class="meta-item">
            <label>${label.replace(/_/g, " ")}</label>
            <div class="val">${value ?? "—"}</div>
            ${conf}
          </div>`;
}

function typeBadge(t) {
  const map = {
    rfq: "badge-blue", specification: "badge-green",
    processed: "badge-green", pending: "badge-yellow", failed: "badge-red",
  };
  return `<span class="badge ${map[t] || "badge-gray"}">${t}</span>`;
}

function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

async function loadPartial(elementId, path) {
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    const res = await fetch(path);
    if (res.ok) el.innerHTML = await res.text();
  } catch {
    // silently skip
  }
}
