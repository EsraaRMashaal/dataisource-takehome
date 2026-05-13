
// Load partials dynamically
async function loadPartial(id, url, afterLoad) {
  const el = document.getElementById(id);
  if (!el) {
    console.log(`[loadPartial] Element with id '${id}' not found.`);
    return;
  }
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    el.innerHTML = text;
    if (afterLoad) afterLoad();
  } catch (err) {
    console.error(`[loadPartial] Error loading partial '${url}':`, err);
  }
}

function toggleWsPanel() {}

function toggleRightSidebar() {
  const sidebar = document.getElementById('rightSidebar');
  if (sidebar) sidebar.classList.toggle('rs-collapsed');
}

window.addEventListener('DOMContentLoaded', () => {
  loadPartial('rightSidebarPartial', 'partials/right-sidebar.html', () => {
    loadPartial('wsPanelPartial', 'partials/ws-panel.html');
    loadPartial('confidenceLegendPartial', 'partials/confidence-legend.html');
  });
  loadPartial('dashboardViewPartial', 'partials/dashboard-view.html', async () => {
    const entityCardsDashboard = document.getElementById('entityCards-dashboard');
    if (entityCardsDashboard) {
      entityCardsDashboard.innerHTML = await window.buildEntityCards('detail');
    }
  });
  loadPartial('uploadViewPartial', 'partials/upload-view.html', async () => {
    const entityCardsUpload = document.getElementById('entityCards-upload');
    if (entityCardsUpload) {
      entityCardsUpload.innerHTML = await window.buildEntityCards('upload');
    }
    if (typeof setupUploadViewEvents === 'function') {
      setupUploadViewEvents();
      const resultsUpload = document.getElementById("results-upload");
      if (resultsUpload) resultsUpload.style.display = "block";
    }
  });
  loadPartial('wsTestViewPartial', 'partials/ws-test-view.html', () => {
    if (typeof window._wstInit === 'function') window._wstInit();
  });
  loadPartial('newsViewPartial', 'partials/news-view.html');
  loadPartial('tablesViewPartial', 'partials/tables-view.html');
  loadPartial('apiTestViewPartial', 'partials/api-test-view.html');
});
