"""
Module: app.services.extraction_models

Pydantic data classes for the document extraction pipeline.

These models flow from extraction_engine → extraction_service →
document_service → ORM layer.  They are the single source of truth
for the extraction contract — changing a field here automatically
propagates to every consumer.
"""

from pydantic import BaseModel, Field


class KeywordItem(BaseModel):
    keyword: str
    normalized_keyword: str
    score: float = Field(ge=0.0, le=1.0)
    source_method: str

    @property
    def is_high_confidence(self) -> bool:
        return self.score >= 0.85


class EntityItem(BaseModel):
    entity_type: str
    entity_value: str
    normalized_value: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    quantity_value: float | None = None
    unit: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None

    @property
    def confidence_label(self) -> str:
        """Human-readable confidence tier used by the UI legend."""
        if self.confidence >= 0.95:
            return "exact"
        if self.confidence >= 0.80:
            return "strong"
        if self.confidence >= 0.65:
            return "likely"
        if self.confidence >= 0.50:
            return "weak"
        return "low"

    @property
    def has_position(self) -> bool:
        return self.start_offset is not None


class ExtractionResult(BaseModel):
    document_type: str
    metadata_fields: dict[str, str] = Field(default_factory=dict)
    keywords: list[KeywordItem] = Field(default_factory=list)
    entities: list[EntityItem] = Field(default_factory=list)

    @property
    def keyword_count(self) -> int:
        return len(self.keywords)

    @property
    def entity_count(self) -> int:
        return len(self.entities)

    def top_keywords(self, n: int = 5) -> list[KeywordItem]:
        return sorted(self.keywords, key=lambda k: k.score, reverse=True)[:n]

    def entities_by_type(self, entity_type: str) -> list[EntityItem]:
        return [e for e in self.entities if e.entity_type == entity_type]
