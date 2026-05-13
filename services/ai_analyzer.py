"""
Module: app.services.ai_analyzer

Responsibility:
    Rule-based extraction of document type, metadata, keywords, and
    structured entities from raw UTF-8 document text.

    Extraction targets:
        - Document type  (rfq / specification / document)
        - Metadata fields (reference number, buyer, dates, currency …)
        - Keywords  — from "Keywords Of Interest" section or heuristics
        - Entities  — material, quantity, unit, due date, tolerance,
                      incoterm, currency, process, certification, location

Why it exists:
    Centralising extraction here makes it trivial to swap or augment
    the approach (regex → NLP model → LLM) without touching endpoints
    or repositories.

Architecture fit:
    Called by documents.py endpoint after the file is stored.
    Returns typed Pydantic models; the endpoint maps them to ORM objects.
    Fully offline — no external API required.
"""

from app.logger import get_logger
from app.services.ai_matchers import (
    compute_confidence,
    detect_type,
    extract_commercial_notes,
    extract_entities,
    extract_keywords,
    extract_metadata,
    nlp,
)
from app.services.ai_models import EntityItem, ExtractionResult

logger = get_logger(__name__)

_HEADER_ENTITY_TYPES = {"rfq_reference", "issue_date", "buyer"}


def analyze(text: str) -> ExtractionResult:
    """Run full spaCy-based extraction on document text."""
    doc = nlp(text)

    doc_type = detect_type(doc)
    metadata = extract_metadata(doc, text)
    keywords = extract_keywords(doc, text)
    entities = extract_entities(doc, text)
    entities.extend(extract_commercial_notes(doc, text))

    # Header-level metadata fields not covered by entity patterns
    for field, value in metadata.items():
        if field in _HEADER_ENTITY_TYPES:
            entities.append(EntityItem(
                entity_type=field,
                entity_value=value,
                normalized_value=value.lower(),
                confidence=compute_confidence(field, value, 0.99, None, text),
                quantity_value=None,
                unit=None,
                start_offset=None,
                end_offset=None,
            ))

    logger.info(
        "Extraction complete — type=%s  keywords=%d  entities=%d",
        doc_type, len(keywords), len(entities),
    )
    return ExtractionResult(
        document_type=doc_type,
        metadata_fields=metadata,
        keywords=keywords,
        entities=entities,
    )
