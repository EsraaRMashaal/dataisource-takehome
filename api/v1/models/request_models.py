"""
Module: app.api.v1.models.request_models

Responsibility:
    Pydantic models for inbound request payloads.

    Planned models:
        DocumentUploadRequest  — multipart form fields for file upload
        PollTriggerRequest     — optional query override for on-demand GDELT poll
        AlertFilterRequest     — query params for filtering alert event lists

Why it exists:
    Explicit request models enforce input validation at the boundary,
    produce machine-readable 422 errors, and document the API contract
    in OpenAPI without manual schema annotations.

Architecture fit:
    Used as FastAPI Body/Form/Query dependencies in endpoint modules.
    Validated data is passed into service functions as typed objects,
    never as raw dicts or form strings.
"""
