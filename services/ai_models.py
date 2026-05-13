from pydantic import BaseModel


class KeywordItem(BaseModel):
    keyword: str
    normalized_keyword: str
    score: float
    source_method: str


class EntityItem(BaseModel):
    entity_type: str
    entity_value: str
    normalized_value: str | None
    confidence: float
    quantity_value: float | None
    unit: str | None
    start_offset: int | None
    end_offset: int | None


class ExtractionResult(BaseModel):
    document_type: str
    metadata_fields: dict[str, str]
    keywords: list[KeywordItem]
    entities: list[EntityItem]
