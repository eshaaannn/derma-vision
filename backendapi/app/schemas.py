from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class PredictResponse(BaseModel):
    scan_id: str | None
    risk_level: Literal["low", "medium", "high"]
    risk_score: float = Field(ge=0.0, le=1.0)
    top_label: str
    disclaimer: str
    created_at: datetime


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    api: Literal["up"]
    model: Literal["loaded", "failed"]
    db: Literal["connected", "not_configured", "failed"]
    version: str


class ScanRecord(BaseModel):
    id: uuid.UUID
    created_at: datetime
    patient_ref: str | None = None
    risk_level: str
    risk_score: float
    top_label: str
    model_version: str
    status: str
    metadata: dict[str, Any] | None = None


class ScanHistoryResponse(BaseModel):
    items: list[ScanRecord]
