/* ── drag & drop ── */

// This function should be called after the upload partial is loaded
function setupUploadViewEvents() {
  const dropZone  = document.getElementById("dropZone-upload");
  const fileInput = document.getElementById("fileInput-upload");
  const fileLabel = document.getElementById("fileLabel-upload");
  const uploadBtn = document.getElementById("uploadBtn-upload");

  if (!dropZone || !fileInput || !fileLabel || !uploadBtn) {
    if (!fileInput) {
      console.warn('fileInput element not found when setting up upload events.');
    }
    return;
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) {
      fileLabel.textContent = fileInput.files[0].name;
      uploadBtn.disabled = false;
    }
  });
  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault(); dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer(); dt.items.add(file);
    fileInput.files = dt.files;
    fileLabel.textContent = file.name;
    uploadBtn.disabled = false;
  });
}

// Make sure _currentDocId is defined only once and in the global scope
if (typeof window._currentDocId === "undefined") {
  window._currentDocId = null;
}

/* ── main upload flow ── */
async function run() {
  let fileInput = document.getElementById("fileInput") || document.getElementById("fileInput-upload");
  let uploadBtn = document.getElementById("uploadBtn-upload");
  let fileLabel = document.getElementById("fileLabel-upload");
  if (!fileInput || !uploadBtn || !fileLabel) return;

  const file = fileInput.files[0];
  if (!file) return;

  uploadBtn.disabled = true;
  document.getElementById("results-upload").style.display = "none";
  setStatus("Uploading…", "info");

  let doc;
  try {
    const { res, data } = await apiUpload(file);

    if (res.status === 409) {
      const m = JSON.stringify(data).match(/id=([\w-]+)/);
      if (!m) { setStatus(`Duplicate: ${data.detail?.detail || "already exists"}`, "error"); uploadBtn.disabled = false; return; }
      setStatus("Already ingested — loading existing record…", "info");
      const { data: existing } = await apiGetDocument(m[1]);
      doc = existing;
    } else if (!res.ok) {
      setStatus(`Error ${res.status}: ${data.detail?.detail || data.detail || res.statusText}`, "error");
      uploadBtn.disabled = false; return;
    } else {
      doc = data;
    }
  } catch (err) {
    setStatus(`Network error — is the service on port 8800? (${err.message})`, "error");
    uploadBtn.disabled = false; return;
  }

  // Set _currentDocId and store filename for delete confirmation
  window._currentDocId = doc.id;
  window._currentDocFilename = doc.source_filename || doc.filename || "";

  setStatus("Fetching extracted data…", "info");

  const [{ data: kw }, { data: en }] = await Promise.all([
    apiGetKeywords(doc.id),
    apiGetEntities(doc.id),
  ]);

  // Rendering calls are correctly placed after analysis
  renderHeader(en.entities, "upload");
  renderQuantities(en.entities, "upload");
  renderPartInfo(en.entities, "upload");
  renderMaterial(en.entities, "upload");
  renderManufacturing(en.entities, "upload");
  renderCertification(en.entities, "upload");
  renderCommercial(en.entities, "upload");
  renderDoc(doc, "upload");
  renderKeywords(kw.keywords, "upload");

  document.getElementById("results-upload").style.display = "block";
  setStatus(
    `Done — ${kw.total} keyword${kw.total !== 1 ? "s" : ""} · ${en.total} entit${en.total !== 1 ? "ies" : "y"} extracted`,
    "success"
  );
  uploadBtn.disabled = false;
}

/* ── delete ── */
async function deleteUploadDoc() {
  const fileInput = document.getElementById("fileInput") || document.getElementById("fileInput-upload");
  const fileLabel = document.getElementById("fileLabel-upload");
  const uploadBtn = document.getElementById("uploadBtn-upload");

  // Use the stored filename if available
  let filename = window._currentDocFilename || "";
  if (!filename && fileInput && fileInput.files && fileInput.files[0]) {
    filename = fileInput.files[0].name;
  } else if (!filename && fileLabel && fileLabel.textContent) {
    filename = fileLabel.textContent;
  } else if (!filename && window._currentDocId) {
    filename = window._currentDocId;
  } else if (!filename) {
    filename = "Unknown";
  }

  if (!window._currentDocId) return;
  const confirmed = await showConfirm(`Delete "${filename}" and all its extracted data?`);
  if (!confirmed) return;

  try {
    const { res, data } = await apiDeleteDocument(window._currentDocId);

    if (res.ok) {
      setStatus("Deleted successfully", "success");
      uploadBtn.disabled = true;
      document.getElementById("results-upload").style.display = "none";
      fileLabel.textContent = "";
      fileInput.value = "";
      window._currentDocId = null;
      window._currentDocFilename = null;
      // Show dashboard, hide upload view
      const dashboard = document.getElementById('dashboardViewPartial');
      const upload = document.getElementById('uploadViewPartial');
      if (dashboard) dashboard.style.display = 'block';
      if (upload) upload.style.display = 'none';
    } else {
      setStatus(`Error ${res.status}: ${data?.detail?.detail || data?.detail || res.statusText}`, "error");
    }
  } catch (err) {
    setStatus(`Network error — is the service on port 8800? (${err.message})`, "error");
  } finally {
    uploadBtn.disabled = false;
  }
}

// Make sure the file ends with a newline and does not have any incomplete or unterminated blocks, functions, or comments.
// If you have an unterminated block, close it here.
// For example, ensure all functions and code blocks are properly closed:
