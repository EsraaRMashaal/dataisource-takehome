const API = "http://localhost:8800/api/v1";

const HEADER_TYPES        = new Set(["rfq_reference","issue_date","buyer","delivery_location","due_date","currency","incoterm"]);
const QTY_TYPES           = new Set(["quantity","unit","packaging"]);
const COMMERCIAL_TYPES    = new Set(["commercial_note"]);
const CERT_TYPES          = new Set(["certification"]);
const PART_INFO_TYPES     = new Set(["part_description","drawing_revision"]);
const MANUFACTURING_TYPES = new Set(["manufacturing_process","surface_finish","tolerance"]);
const MATERIAL_TYPES      = new Set(["material"]);

/* Card definitions — single source of truth for entity section layout.
   buildEntityCards() in renderers.js reads this to generate HTML for
   both the upload page (mode "upload") and the home detail panel (mode "detail"). */
const ENTITY_CARD_DEFS = [
  { cardId: "headerCard",        title: "RFQ Header",                  metaId: "headerMeta" },
  { cardId: "qtyCard",           title: "Quantities &amp; Packaging",   metaId: "qtyMeta" },
  { cardId: "partInfoCard",      title: "Part Information",            metaId: "partInfoMeta" },
  { cardId: "materialCard",      title: "Material Specifications",     metaId: "materialMeta" },
  { cardId: "manufacturingCard", title: "Manufacturing Requirements",  metaId: "manufacturingMeta" },
  { cardId: "certCard",          title: "Quality &amp; Certification", metaId: "certMeta" },
];
