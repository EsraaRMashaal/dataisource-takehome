"""
Module: app.services.extraction_service

Orchestrates the full document extraction pipeline:
  1. tokenize with spaCy
  2. detect document type
  3. extract metadata, keywords, entities, commercial notes
  4. promote key metadata fields to entities
  5. deduplicate and sort by confidence

Public API: analyze(text) → ExtractionResult
            analyze_safe(text) → ExtractionResult  (never raises)
"""

from app.logger import get_logger
from app.services.extraction_engine import (
    compute_confidence,
    detect_type,
    extract_commercial_notes,
    extract_entities,
    extract_keywords,
    extract_metadata,
    nlp,
)
from app.services.extraction_models import EntityItem, ExtractionResult

logger = get_logger(__name__)

_HEADER_ENTITY_TYPES = {"rfq_reference", "issue_date", "buyer"}


def analyze(text: str) -> ExtractionResult:
    """
    Run the full extraction pipeline on *text*.

    Raises:
        Any exception from spaCy or the pattern matchers propagates to the caller.
        Use analyze_safe() if you need a guaranteed non-raising variant.
    """
    doc = nlp(text)

    doc_type  = detect_type(doc)
    metadata  = extract_metadata(doc, text)
    keywords  = extract_keywords(doc, text)
    entities  = extract_entities(doc, text)
    entities += extract_commercial_notes(doc, text)

    # Promote key metadata fields that are not already covered by entity patterns
    existing_types = {e.entity_type for e in entities}
    for field, value in metadata.items():
        if field in _HEADER_ENTITY_TYPES and field not in existing_types:
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

    # Sort entities by confidence descending so callers get the most reliable first
    entities.sort(key=lambda e: e.confidence, reverse=True)

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


def analyze_safe(text: str) -> ExtractionResult:
    """
    Like analyze(), but catches all exceptions and returns an empty result
    instead of propagating.  Use for background/batch processing where a
    single bad document must not abort the whole batch.
    """
    try:
        return analyze(text)
    except Exception as exc:
        logger.error("Extraction failed — returning empty result: %s", exc)
        return ExtractionResult(document_type="document")
