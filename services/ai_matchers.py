"""
spaCy Matcher-based extraction: document type, metadata, keywords, entities, and confidence scoring.
"""

import re

import spacy
from spacy.matcher import Matcher, PhraseMatcher

from app.services.ai_models import EntityItem, KeywordItem
from app.settings import settings

# Shared blank NLP pipeline (tokenization only — no heavy model needed)
nlp = spacy.blank("en")

# ---------------------------------------------------------------------------
# Document type detection
# ---------------------------------------------------------------------------

_doc_type_matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
_doc_type_matcher.add("RFQ", [nlp.make_doc(p) for p in [
    "rfq", "request for quotation", "request for quote",
]])
_doc_type_matcher.add("SPEC", [nlp.make_doc(p) for p in [
    "technical specification", "specification sheet", "spec",
]])


def detect_type(doc: spacy.tokens.Doc) -> str:
    for match_id, _start, _end in _doc_type_matcher(doc):
        label = nlp.vocab.strings[match_id]
        if label == "RFQ":
            return "rfq"
        if label == "SPEC":
            return "specification"
    return "document"


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

def _value_after_match(text: str, match_end_char: int) -> tuple[str, int | None, int | None]:
    """Slice raw text from match_end_char to the next newline; strip leading colon/spaces."""
    rest = text[match_end_char:]
    stripped = rest.lstrip(": \t")
    offset = len(rest) - len(stripped)
    start_char = match_end_char + offset
    nl = stripped.find("\n")
    if nl == -1:
        value = stripped.strip()
        end_char = start_char + len(stripped.rstrip())
    else:
        value = stripped[:nl].strip()
        end_char = start_char + nl
    if not value:
        return "", None, None
    return value, start_char, end_char


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

_meta_matcher = Matcher(nlp.vocab)

_META_LABEL_PATTERNS: dict[str, list[dict]] = {
    "rfq_reference":           [{"LOWER": "rfq"}, {"LOWER": "reference"}],
    "issue_date":              [{"LOWER": "issue"}, {"LOWER": "date"}],
    "buyer":                   [{"LOWER": "buyer"}],
    "delivery_location":       [{"LOWER": "delivery"}, {"LOWER": "location"}],
    "requested_delivery_date": [{"LOWER": "requested"}, {"LOWER": "delivery"}, {"LOWER": "date"}],
    "currency":                [{"LOWER": "currency"}],
    "incoterm":                [{"LOWER": "incoterm"}],
}

for _key, _pat in _META_LABEL_PATTERNS.items():
    _meta_matcher.add(_key, [_pat])


def extract_metadata(doc: spacy.tokens.Doc, text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    seen: set[str] = set()
    for match_id, _start, end in _meta_matcher(doc):
        key = nlp.vocab.strings[match_id]
        if key in seen:
            continue
        seen.add(key)
        end_char = doc[end - 1].idx + len(doc[end - 1].text)
        value, _, _ = _value_after_match(text, end_char)
        if value:
            result[key] = value
    return result


# ---------------------------------------------------------------------------
# Keyword extraction
# ---------------------------------------------------------------------------

_keyword_matcher = Matcher(nlp.vocab)
_keyword_matcher.add("KEYWORD_SECTION", [[
    {"LOWER": "keywords"}, {"LOWER": "of"}, {"LOWER": "interest"},
]])
_keyword_matcher.add("MATERIAL_GRADE", [[
    {"TEXT": {"REGEX": r"^[A-Z]{1,4}\d+[A-Z0-9]*$"}},
]])
_keyword_matcher.add("CNC_PROCESS", [[
    {"LOWER": "cnc"}, {"IS_ALPHA": True},
]])
_keyword_matcher.add("EN_STANDARD", [[
    {"LOWER": "en"}, {"IS_DIGIT": True},
]])

_KEYWORD_SCORES: dict[str, tuple[float, str]] = {
    "MATERIAL_GRADE": (0.70, "material_grade_pattern"),
    "CNC_PROCESS":    (0.65, "process_pattern"),
    "EN_STANDARD":    (0.65, "standard_pattern"),
}


def extract_keywords(doc: spacy.tokens.Doc, text: str) -> list[KeywordItem]:
    matches = _keyword_matcher(doc)
    for match_id, _start, end in matches:
        if nlp.vocab.strings[match_id] == "KEYWORD_SECTION":
            end_char = doc[end - 1].idx + len(doc[end - 1].text)
            rest = text[end_char:].lstrip(": \t\n")
            blank = re.search(r"\n[ \t]*\n", rest)
            block = rest[: blank.start()] if blank else rest
            return [
                KeywordItem(
                    keyword=kw.strip(),
                    normalized_keyword=kw.strip().lower(),
                    score=0.95,
                    source_method="keyword_section",
                )
                for kw in block.strip().split(",")
                if kw.strip()
            ]

    seen: set[str] = set()
    items: list[KeywordItem] = []
    for match_id, start, end in matches:
        label = nlp.vocab.strings[match_id]
        if label not in _KEYWORD_SCORES:
            continue
        score, method = _KEYWORD_SCORES[label]
        kw = doc[start:end].text.strip()
        norm = kw.lower()
        if norm not in seen:
            seen.add(norm)
            items.append(KeywordItem(keyword=kw, normalized_keyword=norm, score=score, source_method=method))
    return items


# ---------------------------------------------------------------------------
# Confidence scoring
# ---------------------------------------------------------------------------

_KNOWN_INCOTERMS = {"EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"}

_VALIDATION_PATTERNS: dict[str, re.Pattern | None] = {
    "quantity":              re.compile(r"^\d+(?:\.\d+)?$"),
    "currency":              re.compile(r"^[A-Z]{3}$"),
    "incoterm":              None,
    "material":              re.compile(r"\b(?:Grade|Alloy|Steel|Alumin|Copper|Titanium|Nickel|\d{4})\b", re.I),
    "tolerance":             re.compile(r"[±+\-]?\d+(?:\.\d+)?\s*(?:mm|%|°|deg)?"),
    "certification":         re.compile(r"ISO|AS9100|IATF|RoHS|REACH|CE\b|UL\b|NADCAP", re.I),
    "manufacturing_process": re.compile(r"CNC|mill|turn|cast|forg|weld|machin|grind|drill", re.I),
    "surface_finish":        re.compile(r"Ra\s*\d|anodiz|plat|coat|paint|polish|zinc|chromat", re.I),
    "unit":                  re.compile(r"\b(?:pcs?|pieces?|units?|kg|mm|m\b|cm|in\b|ft|sets?|pairs?)\b", re.I),
    "packaging":             re.compile(r"per\s+carton|box|pallet|bag|bulk|crate|\d+\s+\w+\s+per", re.I),
}

_CONTEXT_WINDOW = 150

_CONTEXT_CLUES: dict[str, list[str]] = {
    "material":              ["grade", "alloy", "specification", "steel", "aluminum", "material"],
    "quantity":              ["quantity", "order", "units", "pcs", "pieces", "total"],
    "unit":                  ["measure", "unit", "each", "per"],
    "tolerance":             ["tolerance", "allowable", "deviation", "acceptable", "precision"],
    "certification":         ["certified", "certification", "required", "compliant", "standard"],
    "manufacturing_process": ["process", "manufacturing", "production", "fabrication"],
    "surface_finish":        ["finish", "surface", "coating", "treatment"],
    "incoterm":              ["delivery", "trade", "shipping", "terms"],
    "currency":              ["price", "cost", "quotation", "payment", "currency"],
    "packaging":             ["packaging", "carton", "box", "pallet", "shipping"],
    "drawing_revision":      ["drawing", "revision", "dwg", "rev"],
    "part_description":      ["part", "component", "description", "item"],
    "delivery_location":     ["delivery", "ship", "location", "destination"],
    "due_date":              ["delivery", "date", "deadline", "schedule", "requested"],
    "rfq_reference":         ["rfq", "reference", "number", "quote", "request"],
    "issue_date":            ["issue", "date", "issued", "sent"],
    "buyer":                 ["buyer", "customer", "client", "company"],
}


def _validation_score(entity_type: str, value: str) -> float:
    if entity_type == "incoterm":
        return 1.0 if value.upper() in _KNOWN_INCOTERMS else 0.4
    pat = _VALIDATION_PATTERNS.get(entity_type)
    if pat is None:
        return 0.7
    return 1.0 if pat.search(value) else 0.4


def _context_score(entity_type: str, match_start: int | None, text: str) -> float:
    if match_start is None:
        return 0.7
    clues = _CONTEXT_CLUES.get(entity_type, [])
    if not clues:
        return 0.7
    start = max(0, match_start - _CONTEXT_WINDOW)
    end = min(len(text), match_start + _CONTEXT_WINDOW)
    window = text[start:end].lower()
    hits = sum(1 for c in clues if c in window)
    return min(1.0, 0.5 + hits * 0.15)


def compute_confidence(
    entity_type: str,
    value: str,
    pattern_score: float,
    match_start: int | None,
    text: str,
) -> float:
    vs = _validation_score(entity_type, value)
    cs = _context_score(entity_type, match_start, text)
    w_p = settings.confidence_weight_pattern
    w_v = settings.confidence_weight_validation
    w_c = settings.confidence_weight_context
    return round(min(1.0, w_p * pattern_score + w_v * vs + w_c * cs), 4)


# ---------------------------------------------------------------------------
# Entity extraction
# ---------------------------------------------------------------------------

_entity_matcher = Matcher(nlp.vocab)

_ENTITY_LABEL_PATTERNS: list[tuple[str, list[dict], float]] = [
    ("material",              [{"LOWER": "material"}, {"LOWER": "grade"}],                         0.95),
    ("part_description",      [{"LOWER": "part"}, {"LOWER": "description"}],                       0.80),
    ("quantity",              [{"LOWER": "quantity"}],                                             0.99),
    ("unit",                  [{"LOWER": "unit"}, {"LOWER": "of"}, {"LOWER": "measure"}],          0.99),
    ("due_date",              [{"LOWER": "requested"}, {"LOWER": "delivery"}, {"LOWER": "date"}],  0.99),
    ("tolerance",             [{"LOWER": "tolerance"}],                                            0.95),
    ("incoterm",              [{"LOWER": "incoterm"}],                                             0.99),
    ("currency",              [{"LOWER": "currency"}],                                             0.99),
    ("manufacturing_process", [{"LOWER": "manufacturing"}, {"LOWER": "process"}],                  0.95),
    ("certification",         [{"LOWER": "certification"}, {"LOWER": "required"}],                 0.90),
    ("delivery_location",     [{"LOWER": "delivery"}, {"LOWER": "location"}],                      0.95),
    ("surface_finish",        [{"LOWER": "surface"}, {"LOWER": "finish"}],                         0.85),
    ("drawing_revision",      [{"LOWER": "drawing"}, {"LOWER": "revision"}],                       0.85),
    ("packaging",             [{"LOWER": "packaging"}, {"LOWER": "requirement"}],                  0.80),
]

_ENTITY_PATTERN_SCORES: dict[str, float] = {}
for _etype, _epat, _escore in _ENTITY_LABEL_PATTERNS:
    _entity_matcher.add(_etype, [_epat])
    _ENTITY_PATTERN_SCORES[_etype] = _escore


def _parse_qty(value: str) -> tuple[float | None, str | None]:
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?", value.strip())
    if m:
        return float(m.group(1)), m.group(2) or None
    return None, None


def extract_entities(doc: spacy.tokens.Doc, text: str) -> list[EntityItem]:
    items: list[EntityItem] = []
    seen: set[str] = set()
    for match_id, _start, end in _entity_matcher(doc):
        etype = nlp.vocab.strings[match_id]
        if etype in seen:
            continue
        seen.add(etype)
        end_char = doc[end - 1].idx + len(doc[end - 1].text)
        value, start_char, val_end_char = _value_after_match(text, end_char)
        if not value:
            continue
        qty, unit = _parse_qty(value) if etype == "quantity" else (None, None)
        items.append(EntityItem(
            entity_type=etype,
            entity_value=value,
            normalized_value=value.lower(),
            confidence=compute_confidence(etype, value, _ENTITY_PATTERN_SCORES[etype], start_char, text),
            quantity_value=qty,
            unit=unit,
            start_offset=start_char,
            end_offset=val_end_char,
        ))
    return items


# ---------------------------------------------------------------------------
# Commercial notes extraction
# ---------------------------------------------------------------------------

_commercial_matcher = Matcher(nlp.vocab)
_commercial_matcher.add("COMMERCIAL_NOTES", [[
    {"LOWER": "commercial"},
    {"LOWER": {"IN": ["note", "notes"]}},
]])


def extract_commercial_notes(doc: spacy.tokens.Doc, text: str) -> list[EntityItem]:
    matches = _commercial_matcher(doc)
    if not matches:
        return []
    _, _start, end = matches[0]
    end_char = doc[end - 1].idx + len(doc[end - 1].text)
    items: list[EntityItem] = []
    for raw in text[end_char:].splitlines():
        stripped = raw.strip()
        if not stripped:
            if items:
                break
            continue
        if stripped[0] not in "-*•" and not raw[0].isspace():
            break
        clean = re.sub(r"^[\s\-\*\•\d\.]+", "", stripped)
        if clean:
            items.append(EntityItem(
                entity_type="commercial_note",
                entity_value=clean,
                normalized_value=clean.lower(),
                confidence=1.0,
                quantity_value=None,
                unit=None,
                start_offset=None,
                end_offset=None,
            ))
    return items
