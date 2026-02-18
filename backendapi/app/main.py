from __future__ import annotations

import asyncio
import json
import uuid
from collections import Counter
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, Header, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .db import SupabaseService
from .errors import AppError, add_error_handlers
from .intelligence import (
    aggregate_scores,
    apply_context_weighting,
    build_confidence,
    build_followup_questions,
    build_risk_message,
    validate_context,
)
from .model import ModelService, map_risk_level
from .schemas import (
    EnhancedDetails,
    FollowupResponse,
    HealthResponse,
    PredictEnhancedResponse,
    PredictResponse,
    ScanHistoryResponse,
)
from .validation import analyze_image_quality, validate_image

DISCLAIMER = "This is a screening result, not a diagnosis. Please consult a dermatologist."

app = FastAPI(title="Derma Vision API", version="0.1.0")
add_error_handlers(app)

model_service = ModelService()
db_service = SupabaseService()


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request.state.request_id = str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings),
):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise AppError("UNAUTHORIZED", "Invalid API key.", 401)


@app.on_event("startup")
def startup_event() -> None:
    try:
        model_service.load()
    except Exception:
        pass

    db_service.connect()


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    model_status = "loaded" if model_service.loaded else "failed"
    db_status = db_service.status
    status = "ok" if model_status == "loaded" and db_status in {"connected", "not_configured"} else "degraded"

    return HealthResponse(
        status=status,
        api="up",
        model=model_status,
        db=db_status,
        version=settings.APP_VERSION,
    )


@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(require_api_key)])
async def predict(
    image: UploadFile = File(...),
    patient_ref: str | None = Query(default=None),
):
    settings = get_settings()

    if not model_service.loaded:
        raise AppError("MODEL_NOT_READY", "Model is not loaded.", 503)

    image_bytes = await image.read()
    validate_image(image_bytes, settings.MAX_IMAGE_BYTES)

    try:
        prediction = await model_service.predict(image_bytes)
    except asyncio.TimeoutError:
        raise AppError("INFERENCE_TIMEOUT", "Model inference timed out.", 504)
    except Exception:
        raise AppError("INFERENCE_FAILED", "Could not process image right now. Please retry.", 500)

    risk_level = map_risk_level(prediction.risk_score)
    created_at = datetime.now(timezone.utc)

    scan_payload = {
        "created_at": created_at.isoformat(),
        "patient_ref": patient_ref,
        "risk_level": risk_level,
        "risk_score": prediction.risk_score,
        "top_label": prediction.top_label,
        "model_version": settings.MODEL_VERSION,
        "status": "success",
        "metadata": {"filename": image.filename, "content_type": image.content_type},
    }

    scan_id = None
    try:
        scan_id = db_service.insert_scan(scan_payload)
    except Exception:
        scan_id = None

    return PredictResponse(
        scan_id=scan_id,
        risk_level=risk_level,
        risk_score=prediction.risk_score,
        top_label=prediction.top_label,
        disclaimer=DISCLAIMER,
        created_at=created_at,
    )


def _parse_json_object(value: str | None, field_name: str) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        raise AppError("INVALID_CONTEXT", f"{field_name} must be valid JSON.", 422)
    if not isinstance(parsed, dict):
        raise AppError("INVALID_CONTEXT", f"{field_name} must be a JSON object.", 422)
    return parsed


@app.post("/predict/enhanced", response_model=PredictEnhancedResponse, dependencies=[Depends(require_api_key)])
async def predict_enhanced(
    image: UploadFile | None = File(default=None),
    images: list[UploadFile] | None = File(default=None),
    context: str | None = Form(default=None),
    followup_answers: str | None = Form(default=None),
    patient_ref: str | None = Query(default=None),
):
    settings = get_settings()
    created_at = datetime.now(timezone.utc)

    if not model_service.loaded:
        raise AppError("MODEL_NOT_READY", "Model is not loaded.", 503)

    uploads: list[UploadFile] = []
    if image is not None:
        uploads.append(image)
    if images:
        uploads.extend(images)
    if not uploads:
        raise AppError("MISSING_IMAGE", "Image file is required.", 400)
    if len(uploads) > settings.MAX_IMAGE_COUNT:
        raise AppError("TOO_MANY_IMAGES", f"Maximum {settings.MAX_IMAGE_COUNT} images are allowed.", 400)

    context_payload = _parse_json_object(context, "context")
    followup_payload = _parse_json_object(followup_answers, "followup_answers")
    try:
        validated_context = validate_context(context_payload)
    except ValueError as exc:
        raise AppError("INVALID_CONTEXT", str(exc), 422)

    image_scores: list[float] = []
    image_labels: list[str] = []
    model_explainability_chunks: list[dict] = []
    quality_metrics: list[dict] = []
    filenames: list[str] = []
    content_types: list[str] = []

    for upload in uploads:
        image_bytes = await upload.read()
        try:
            metrics = analyze_image_quality(
                image_bytes=image_bytes,
                max_bytes=settings.MAX_IMAGE_BYTES,
                min_width=settings.MIN_IMAGE_WIDTH,
                min_height=settings.MIN_IMAGE_HEIGHT,
                max_dimension=settings.MAX_IMAGE_DIMENSION,
                min_brightness_mean=settings.MIN_BRIGHTNESS_MEAN,
                max_brightness_mean=settings.MAX_BRIGHTNESS_MEAN,
                min_edge_intensity=settings.MIN_EDGE_INTENSITY,
            )
        except AppError as exc:
            if exc.code in {"INVALID_IMAGE", "UNSUPPORTED_IMAGE", "IMAGE_TOO_LARGE", "MISSING_IMAGE"}:
                return PredictEnhancedResponse(
                    status="invalid_image",
                    message="Image quality insufficient for analysis. Please retake photo.",
                    disclaimer=DISCLAIMER,
                    created_at=created_at,
                )
            raise

        try:
            prediction = await model_service.predict(image_bytes)
        except asyncio.TimeoutError:
            raise AppError("INFERENCE_TIMEOUT", "Model inference timed out.", 504)
        except Exception:
            raise AppError("INFERENCE_FAILED", "Could not process image right now. Please retry.", 500)

        quality_metrics.append(metrics)
        image_scores.append(prediction.risk_score)
        image_labels.append(prediction.top_label)
        if prediction.explainability:
            model_explainability_chunks.append(prediction.explainability)
        filenames.append(upload.filename or "unknown")
        content_types.append(upload.content_type or "unknown")

    aggregation = aggregate_scores(image_scores, settings.MAX_SCORE_DISAGREEMENT)
    if aggregation["is_inconsistent"]:
        return PredictEnhancedResponse(
            status="inconsistent_analysis",
            message="Multiple images show inconsistent results. Please upload clearer images.",
            disclaimer=DISCLAIMER,
            created_at=created_at,
            followup=FollowupResponse(
                requires_followup=True,
                questions=["Please upload 2-3 new well-lit, focused images from consistent distance."],
            ),
            details=EnhancedDetails(
                image_count=len(image_scores),
                individual_scores=[round(score, 3) for score in image_scores],
                score_spread=round(float(aggregation["spread"]), 3),
                consistency="inconsistent",
                context_adjustment=0.0,
                contributing_factors=["High score disagreement across uploaded images"],
                reasoning="Multi-image aggregation blocked due to high disagreement between predictions.",
            ),
        )

    context_result = apply_context_weighting(float(aggregation["aggregate_score"]), validated_context)
    final_score = float(context_result["score"])
    messaging = build_risk_message(final_score)
    top_label = Counter(image_labels).most_common(1)[0][0]
    followup_questions = build_followup_questions(validated_context, final_score)
    confidence = build_confidence(
        image_count=len(image_scores),
        spread=float(aggregation["spread"]),
        context=validated_context,
        has_model_explainability=bool(model_explainability_chunks),
    )

    contributing_factors = list(context_result["contributing_factors"])
    if len(image_scores) > 1:
        contributing_factors.append("Consistent model scores across multiple images")

    scan_payload = {
        "created_at": created_at.isoformat(),
        "patient_ref": patient_ref,
        "risk_level": messaging["risk_level"],
        "risk_score": final_score,
        "top_label": top_label,
        "model_version": settings.MODEL_VERSION,
        "status": "success",
        "metadata": {
            "image_count": len(image_scores),
            "individual_scores": [round(score, 4) for score in image_scores],
            "aggregate_score": round(float(aggregation["aggregate_score"]), 4),
            "score_spread": round(float(aggregation["spread"]), 4),
            "context": validated_context,
            "context_adjustment": round(float(context_result["context_adjustment"]), 4),
            "followup_answers": followup_payload,
            "quality_metrics": quality_metrics,
            "filenames": filenames,
            "content_types": content_types,
        },
    }

    scan_id = None
    try:
        scan_id = db_service.insert_scan(scan_payload)
    except Exception:
        scan_id = None

    model_explainability = model_explainability_chunks[0] if model_explainability_chunks else None
    return PredictEnhancedResponse(
        status="success",
        scan_id=scan_id,
        risk_level=messaging["risk_level"],
        risk_score=final_score,
        top_label=top_label,
        risk_message=messaging["risk_message"],
        recommendation=messaging["recommendation"],
        confidence=confidence,
        disclaimer=DISCLAIMER,
        created_at=created_at,
        followup=FollowupResponse(
            requires_followup=bool(followup_questions),
            questions=followup_questions,
        ),
        details=EnhancedDetails(
            image_count=len(image_scores),
            individual_scores=[round(score, 3) for score in image_scores],
            score_spread=round(float(aggregation["spread"]), 3),
            consistency="consistent",
            context_adjustment=round(float(context_result["context_adjustment"]), 3),
            contributing_factors=contributing_factors,
            reasoning="Final score combines weighted multi-image model score with capped deterministic context adjustment.",
        ),
        model_explainability=model_explainability,
    )


@app.get("/scans", response_model=ScanHistoryResponse, dependencies=[Depends(require_api_key)])
async def scans(
    patient_ref: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    settings: Settings = Depends(get_settings),
):
    if not settings.ENABLE_SCAN_HISTORY:
        raise AppError("FEATURE_DISABLED", "Scan history is disabled.", 404)

    try:
        items = db_service.fetch_scans(patient_ref=patient_ref, limit=limit)
    except Exception:
        raise AppError("SCAN_HISTORY_FAILED", "Could not fetch scan history.", 500)

    return ScanHistoryResponse(items=items)


@app.get("/")
async def root():
    return JSONResponse({"message": "Derma Vision API", "docs": "/docs"})
