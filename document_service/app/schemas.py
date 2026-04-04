from typing import Any, Literal

from pydantic import BaseModel, Field

DocumentType = Literal[
    "certificate",
    "prescription",
    "consent_form",
    "exam_request",
    "declaration",
    "lgpd",
    "other",
    "medical_record",
]


class RenderRequest(BaseModel):
    document_type: DocumentType
    payload: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "document-service"
