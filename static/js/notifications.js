(function () {
  "use strict";

  let _unread = 0;

  function _badge() { return document.getElementById("notifBadge"); }
  function _btn()   { return document.getElementById("notifBellBtn"); }

  function _updateBadge() {
    const badge = _badge();
    const btn   = _btn();
    if (!badge || !btn) return;
    if (_unread > 0) {
      badge.textContent = _unread > 99 ? "99+" : String(_unread);
      badge.hidden = false;
      btn.classList.add("notif-bell-active");
    } else {
      badge.hidden = true;
      btn.classList.remove("notif-bell-active");
    }
  }

  function _onAlert(data) {
    _unread++;
    _updateBadge();

    const title = (data.title || "New supply chain alert").slice(0, 80);
    const terms = Array.isArray(data.matched_terms) && data.matched_terms.length
      ? data.matched_terms.slice(0, 2).join(", ")
      : "";

    window.setStatus(
      (terms ? "⚠️ [" + terms + "] " : "📰 ") + title,
      "info"
    );
  }

  // ws-panel.js dispatches this on every incoming WS message
  document.addEventListener("wsEvent", function (e) {
    const data = (e && e.detail) || {};
    if (data.event === "alert.detected") _onAlert(data);
  });

  window.clearNotifBadge = function () {
    _unread = 0;
    _updateBadge();
  };
}());
