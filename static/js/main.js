
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

// WS panel is now inline in the sidebar — no toggle needed on desktop.
// Kept for compatibility in case anything calls it.
function toggleWsPanel() {}

window.addEventListener('DOMContentLoaded', () => {
  loadPartial('dashboardViewPartial', 'partials/dashboard-view.html', async () => {
    const entityCardsDashboard = document.getElementById('entityCards-dashboard');
    if (entityCardsDashboard) {
      entityCardsDashboard.innerHTML = await window.buildEntityCards('detail');
    } else {
      console.log('[dashboardViewPartial] entityCards-dashboard not found.');
    }
  });
  loadPartial('uploadViewPartial', 'partials/upload-view.html', async () => {
    const entityCardsUpload = document.getElementById('entityCards-upload');
    if (entityCardsUpload) {
      entityCardsUpload.innerHTML = await window.buildEntityCards('upload');
    } else {
      console.log('[uploadViewPartial] entityCards-upload not found.');
    }
    if (typeof setupUploadViewEvents === 'function') {
      setupUploadViewEvents();
      const resultsUpload = document.getElementById("results-upload");
      if (resultsUpload) {
        resultsUpload.style.display = "block";
      }
    }
  });
  loadPartial('wsPanelPartial', 'partials/ws-panel.html');
  loadPartial('confidenceLegendPartial', 'partials/confidence-legend.html');
  loadPartial('wsTestViewPartial', 'partials/ws-test-view.html', () => {
    if (typeof window._wstInit === 'function') window._wstInit();
  });
  loadPartial('newsViewPartial', 'partials/news-view.html');
  loadPartial('tablesViewPartial', 'partials/tables-view.html');
});
