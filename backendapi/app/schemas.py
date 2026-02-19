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


class EnhancedDetails(BaseModel):
    image_count: int
    individual_scores: list[float]
    score_spread: float
    consistency: Literal["consistent", "inconsistent"]
    context_adjustment: float
    contributing_factors: list[str]
    reasoning: str


class FollowupQuestion(BaseModel):
    key: str
    question: str


class FollowupResponse(BaseModel):
    requires_followup: bool
    questions: list[str] = Field(default_factory=list)
    items: list[FollowupQuestion] = Field(default_factory=list)


class PredictEnhancedResponse(BaseModel):
    status: Literal["success", "invalid_image", "inconsistent_analysis"]
    scan_id: str | None = None
    risk_level: Literal["low", "medium", "high"] | None = None
    risk_score: float | None = Field(default=None, ge=0.0, le=1.0)
    top_label: str | None = None
    risk_message: str | None = None
    recommendation: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    disclaimer: str
    created_at: datetime
    details: EnhancedDetails | None = None
    followup: FollowupResponse | None = None
    model_explainability: dict[str, Any] | None = None
    message: str | None = None


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
