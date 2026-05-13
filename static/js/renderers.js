/*
 * buildEntityCards(mode)
 * Generates HTML for all entity section cards from ENTITY_CARD_DEFS.
 *   mode "upload" → full .card wrappers with .card-title (upload page)
 *   mode "detail" → collapsible divs with .detail-section-title (home detail panel)
 * Commercial Notes is appended separately (no meta-grid, custom content).
 */
function buildEntityCards(mode) {
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const isUpload = mode !== "detail";
  const cards = ENTITY_CARD_DEFS.map(({ cardId, title, metaId }) => isUpload
    ? `<div class="card" id="${cardId}${suffix}">
         <div class="card-title">${title}</div>
         <div class="meta-grid" id="${metaId}${suffix}"></div>
       </div>`
    : `<div id="${cardId}${suffix}" style="display:none">
         <div class="detail-section-title">${title}</div>
         <div class="meta-grid" id="${metaId}${suffix}"></div>
       </div>`
  );
  cards.push(isUpload
    ? `<div class="card" id="commercialCard${suffix}">
         <div class="card-title">Commercial Notes</div>
         <div id="commercialMeta${suffix}"></div>
       </div>`
    : `<div class="detail-section-title">Commercial Notes</div>
       <div id="commercialMeta${suffix}"></div>`
  );
  return cards.join("");
}

function renderDoc(doc, mode = "dashboard") {
  _currentDocId = doc.id;
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  document.getElementById("docMeta" + suffix).innerHTML = [
    metaItem("ID",        `<span class="text-mono text-sm">${doc.id}</span>`),
    metaItem("Filename",  doc.source_filename),
    metaItem("Type",      typeBadge(doc.document_type)),
    metaItem("Status",    typeBadge(doc.processing_status)),
    metaItem("Origin",    doc.upload_origin),
    metaItem("MIME",      doc.source_mime_type || "—"),
    metaItem("Uploaded",  fmt(doc.created_at)),
    metaItem("Processed", fmt(doc.processed_at)),
  ].join("");
}

function renderHeader(entities, mode = "dashboard") {
  const header = entities.filter(e => HEADER_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card   = document.getElementById("headerCard" + suffix);
  if (!card || !header.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("headerMeta" + suffix).innerHTML =
    header.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderQuantities(entities, mode = "dashboard") {
  const items = entities.filter(e => QTY_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("qtyCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";

  const qty  = items.find(e => e.entity_type === "quantity");
  const unit = items.find(e => e.entity_type === "unit");
  const pkg  = items.find(e => e.entity_type === "packaging");

  const cartonMatch  = pkg?.entity_value.match(/(\d+)\s+\w+\s+per\s+carton/i);
  const perCarton    = cartonMatch ? parseInt(cartonMatch[1]) : null;
  const totalCartons = (qty?.quantity_value && perCarton)
    ? Math.ceil(qty.quantity_value / perCarton) : null;

  document.getElementById("qtyMeta" + suffix).innerHTML = [
    qty  ? metaItem("Quantity",        `${qty.quantity_value ?? qty.entity_value} ${unit?.entity_value ?? ""}`.trim(), qty.confidence) : "",
    unit ? metaItem("Unit of Measure", unit.entity_value, unit.confidence) : "",
    perCarton    ? metaItem("Units per Carton", perCarton)    : "",
    totalCartons ? metaItem("Total Cartons",    totalCartons) : "",
    pkg  ? metaItem("Packaging",       pkg.entity_value, pkg.confidence) : "",
  ].filter(Boolean).join("");
}

function renderPartInfo(entities, mode = "dashboard") {
  const items = entities.filter(e => PART_INFO_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("partInfoCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("partInfoMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderMaterial(entities, mode = "dashboard") {
  const items = entities.filter(e => MATERIAL_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("materialCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("materialMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderManufacturing(entities, mode = "dashboard") {
  const items = entities.filter(e => MANUFACTURING_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("manufacturingCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("manufacturingMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderCertification(entities, mode = "dashboard") {
  const items = entities.filter(e => CERT_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const card  = document.getElementById("certCard" + suffix);
  if (!card || !items.length) { if(card) card.style.display = "none"; return; }
  card.style.display = "block";
  document.getElementById("certMeta" + suffix).innerHTML =
    items.map(e => metaItem(e.entity_type, e.entity_value, e.confidence)).join("");
}

function renderCommercial(entities, mode = "dashboard") {
  const items = entities.filter(e => COMMERCIAL_TYPES.has(e.entity_type));
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  const el = document.getElementById("commercialMeta" + suffix);
  if (!el) return;
  el.innerHTML = items.length
    ? `<ul class="note-list">${items.map(e => `<li class="note-point">${e.entity_value}</li>`).join("")}</ul>`
    : `<p class="empty">No commercial notes extracted</p>`;
}

function renderKeywords(keywords, mode = "dashboard") {
  const suffix = mode === "upload" ? "-upload" : "-dashboard";
  document.getElementById("kwCount" + suffix).textContent = `(${keywords.length})`;
  const cloud = document.getElementById("kwCloud" + suffix);
  if (!keywords.length) {
    cloud.innerHTML = `<p class="empty">No keywords extracted</p>`;
    return;
  }
  cloud.innerHTML = keywords.map(kw => {
    const pct = Math.round(kw.score * 100);
    return `<div class="kw-chip flex-center gap-xs" title="${kw.normalized_keyword}">
              <span class="kw-text">${kw.keyword}</span>
              <span class="kw-score">${pct}%</span>
            </div>`;
  }).join("");
}
