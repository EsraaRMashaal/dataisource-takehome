// view-switcher.js — handles view switching, sidebar nav active state, mobile sidebar

function _setNavActive(id) {
  ["navBtnDashboard", "navBtnUpload", "navBtnWsTest", "navBtnNews", "navBtnTables", "navBtnApiTest"].forEach(btnId => {
    document.getElementById(btnId)?.classList.toggle("active", btnId === id);
  });
}

function _allViews() {
  return ["dashboardView", "uploadView", "wsTestView", "newsView", "tablesView", "apiTestView"].map(
    id => document.getElementById(id)
  );
}

function _leaveApiTestView() {
  if (typeof window._atrOnHide === "function") window._atrOnHide();
}

function showDashboardView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const dashView = document.getElementById("dashboardView");
  if (dashView) dashView.style.display = "";

  _setNavActive("navBtnDashboard");

  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "Dashboard";

  // Refresh data each time the dashboard is shown
  if (typeof window.loadDocuments === "function") window.loadDocuments();

  closeSidebar();
}

function showUploadView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const upView = document.getElementById("uploadView");
  if (upView) upView.style.display = "";

  _setNavActive("navBtnUpload");

  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "Upload Document";

  closeSidebar();
}

function showWsTestView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const wsView = document.getElementById("wsTestView");
  if (wsView) wsView.style.display = "";

  _setNavActive("navBtnWsTest");

  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "WebSocket Test";

  if (typeof window._wstInit === "function") window._wstInit();

  closeSidebar();
}

function showNewsView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const newsView = document.getElementById("newsView");
  if (newsView) newsView.style.display = "";

  _setNavActive("navBtnNews");

  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "News Monitor";

  if (typeof window.loadNewsAlerts === "function") window.loadNewsAlerts();

  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (!sidebar) return;
  sidebar.classList.toggle("mobile-open");
  overlay?.classList.toggle("active");
}

function closeSidebar() {
  if (window.innerWidth > 768) return;
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar?.classList.remove("mobile-open");
  overlay?.classList.remove("active");
}

function showTablesView() {
  _leaveApiTestView();
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const tblView = document.getElementById("tablesView");
  if (tblView) tblView.style.display = "";

  _setNavActive("navBtnTables");

  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "Database Explorer";

  if (typeof window.loadTablesList === "function") window.loadTablesList();

  closeSidebar();
}

function showApiTestView() {
  _allViews().forEach(v => { if (v) v.style.display = "none"; });
  const atView = document.getElementById("apiTestView");
  if (atView) atView.style.display = "";

  _setNavActive("navBtnApiTest");

  const titleEl = document.getElementById("topBarTitle");
  if (titleEl) titleEl.textContent = "API Test Runner";

  closeSidebar();
}

window.showDashboardView = showDashboardView;
window.showUploadView    = showUploadView;
window.showWsTestView    = showWsTestView;
window.showNewsView      = showNewsView;
window.showTablesView    = showTablesView;
window.showApiTestView   = showApiTestView;
window.toggleSidebar     = toggleSidebar;
window.closeSidebar      = closeSidebar;
