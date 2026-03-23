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
    possible_conditions: list[str] = Field(default_factory=list)
    risk_message: str | None = None
    simple_explanation: str | None = None
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


class ConditionScore(BaseModel):
    key: str
    name: str
    score: float = Field(ge=0.0, le=1.0)


class TextSymptomSignals(BaseModel):
    itching: bool = False
    pain: bool = False
    bleeding: bool = False
    growth: bool = False
    spreading: bool = False
    pus: bool = False
    fever: bool = False


class ExtractedTextSignals(BaseModel):
    duration: Literal["short", "long", "unknown"]
    duration_days: int | None = None
    symptoms: TextSymptomSignals
    severity: Literal["mild", "moderate", "severe", "unknown"]
    progression: Literal["stable", "increasing", "spreading", "unknown"]


class UploadSessionResponse(BaseModel):
    session_id: str
    created_at: datetime
    image_count: int = Field(ge=2, le=3)
    description_received: bool


class SessionRequest(BaseModel):
    session_id: str


class AnalyzeSessionResponse(BaseModel):
    session_id: str
    image_count: int = Field(ge=1)
    consistency: Literal["consistent", "needs_retake"]
    conditions: list[ConditionScore]
    text_signals: ExtractedTextSignals
    message: str | None = None


class ScreeningQuestion(BaseModel):
    key: str
    question: str
    condition: str
    answer_type: Literal["yes_no"] = "yes_no"


class QuestionsSessionResponse(BaseModel):
    session_id: str
    questions: list[ScreeningQuestion]


class SubmitAnswersRequest(BaseModel):
    session_id: str
    answers: dict[str, Any] = Field(default_factory=dict)


class SubmitAnswersResponse(BaseModel):
    session_id: str
    status: Literal["completed"]
    result_ready: bool = True
    scan_id: str | None = None


class ScreeningResultResponse(BaseModel):
    risk_level: Literal["Low", "Medium", "High"]
    confidence: Literal["Low", "Medium", "High"]
    possible_conditions: list[str]
    explanation: str
    next_steps: list[str]
