/*
 * toast.js — notification toasts and confirm dialog
 *
 * Class names kept as "toast-container" / "toast" (original) so browser-cached
 * versions of utils.js continue to produce elements our CSS can style.
 *
 * API (exposed on window):
 *   setStatus(msg, type)  — type: "info" | "success" | "error"
 *   showConfirm(msg)      — returns Promise<boolean>
 */

(function () {
  "use strict";

  // Build and insert the container immediately — before any other script runs —
  // so it sits at the bottom of <body> and is never blocked by other stacking contexts.
  const _container = document.createElement("div");
  _container.className = "toast-container";

  function _mount() {
    if (!document.body.contains(_container)) {
      document.body.appendChild(_container);
    }
  }

  if (document.body) {
    _mount();
  } else {
    document.addEventListener("DOMContentLoaded", _mount);
  }

  // ── internal dismiss helper ───────────────────────────

  function _dismiss(toast, onDone) {
    toast.classList.add("removing");
    setTimeout(() => {
      toast.remove();
      if (onDone) onDone();
    }, 260);
  }

  // ── setStatus ────────────────────────────────────────

  window.setStatus = function setStatus(msg, type) {
    type = type || "info";
    const icons = { info: "ℹ", success: "✓", error: "✕" };

    const toast    = document.createElement("div");
    const iconEl   = document.createElement("span");
    const msgEl    = document.createElement("span");
    const closeBtn = document.createElement("button");

    toast.className    = "toast " + type;
    iconEl.className   = "toast-icon";
    msgEl.className    = "toast-msg";
    closeBtn.className = "toast-close";

    iconEl.textContent   = icons[type] || "ℹ";
    msgEl.textContent    = msg;
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Dismiss");

    closeBtn.addEventListener("click", function () { _dismiss(toast); });

    toast.append(iconEl, msgEl, closeBtn);
    _container.appendChild(toast);

    setTimeout(function () { _dismiss(toast); }, 4500);
  };

  // ── showConfirm ──────────────────────────────────────

  window.showConfirm = function showConfirm(msg) {
    return new Promise(function (resolve) {
      const toast = document.createElement("div");
      toast.className = "toast confirm";

      const top   = document.createElement("div");
      top.className = "toast-top";

      const iconEl = document.createElement("span");
      iconEl.className   = "toast-icon";
      iconEl.textContent = "⚠";

      const msgEl = document.createElement("span");
      msgEl.className   = "toast-msg";
      msgEl.textContent = msg;

      top.append(iconEl, msgEl);

      const actions = document.createElement("div");
      actions.className = "toast-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.className   = "toast-btn toast-btn-cancel";
      cancelBtn.textContent = "Cancel";

      const confirmBtn = document.createElement("button");
      confirmBtn.className   = "toast-btn toast-btn-confirm";
      confirmBtn.textContent = "Delete";

      cancelBtn.addEventListener("click",  function (e) {
        e.stopPropagation();
        _dismiss(toast, function () { resolve(false); });
      });
      confirmBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        _dismiss(toast, function () { resolve(true); });
      });

      actions.append(cancelBtn, confirmBtn);
      toast.append(top, actions);
      _container.appendChild(toast);
    });
  };

}());
