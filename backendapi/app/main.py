from __future__ import annotations

import asyncio
import base64
import io
import json
import math
import uuid
from collections import Counter
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, Header, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image

from .config import Settings, get_settings
from .db import SupabaseService
from .errors import AppError, add_error_handlers
from .image_model import ImageInput, analyze_images
from .intelligence import (
    aggregate_scores,
    apply_context_weighting,
    build_possible_conditions,
    build_personalized_summary,
    build_followup_questions,
    build_recommended_steps,
    build_risk_message,
    normalize_followup_answers,
    validate_context,
)
from .model import ModelService, map_risk_level
from .question_engine import build_questions, normalize_answers
from .response_generator import build_screening_response
from .risk_engine import evaluate_risk
from .schemas import (
    AnalyzeSessionResponse,
    ConditionScore,
    ExtractedTextSignals,
    EnhancedDetails,
    FollowupResponse,
    HealthResponse,
    PredictEnhancedResponse,
    PredictResponse,
    QuestionsSessionResponse,
    ScanHistoryResponse,
    ScreeningResultResponse,
    SessionRequest,
    SubmitAnswersRequest,
    SubmitAnswersResponse,
    UploadSessionResponse,
)
from .session_store import SessionStore
from .text_extractor import extract_text_signals
from .validation import analyze_image_quality, validate_image

DISCLAIMER = "This is a screening result, not a diagnosis. Please consult a dermatologist."
MISSING_CONTEXT_MESSAGE = "Please upload an image and provide clinical context before proceeding."

app = FastAPI(title="Derma Vision API", version="0.1.0")
add_error_handlers(app)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_service = ModelService()
db_service = SupabaseService()
session_store = SessionStore()


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
    user_id: uuid.UUID | None = Query(default=None),
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
        "user_id": str(user_id) if user_id else None,
        "patient_ref": patient_ref,
        "risk_level": risk_level,
        "risk_score": prediction.risk_score,
        "top_label": prediction.top_label,
        "model_version": settings.MODEL_VERSION,
        "status": "success",
        "metadata": {
            "filename": image.filename,
            "content_type": image.content_type,
            "image_preview": _build_preview_data_url(image_bytes),
            "model_explainability": prediction.explainability,
            "confidence": prediction.model_confidence,
            "explanation": f"{risk_level.title()} risk screening result.",
        },
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


def _build_preview_data_url(image_bytes: bytes, max_dimension: int = 640, quality: int = 82) -> str | None:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.load()
            image.thumbnail((max_dimension, max_dimension))

            if image.mode in {"RGBA", "LA"}:
                background = Image.new("RGB", image.size, (255, 255, 255))
                background.paste(image, mask=image.getchannel("A"))
                image = background
            elif image.mode != "RGB":
                image = image.convert("RGB")

            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=quality, optimize=True)
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
            return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return None


def _get_session_or_404(session_id: str):
    session = session_store.get_session(session_id)
    if session is None:
        raise AppError("SESSION_NOT_FOUND", "Screening session not found.", 404)
    return session


async def _ensure_session_analysis(session) -> None:
    if session.analysis is not None and session.text_signals is not None:
        return

    image_inputs = [
        ImageInput(
            filename=image["filename"],
            content_type=image.get("content_type"),
            image_bytes=image["image_bytes"],
        )
        for image in session.images
    ]
    session.analysis = await analyze_images(model_service, settings, image_inputs)
    session.text_signals = extract_text_signals(session.description)


def _store_mvp_scan(session) -> str | None:
    if session.analysis is None or session.result is None or session.risk_details is None:
        return None

    payload = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "risk_level": session.result["risk_level"].lower(),
        "risk_score": session.risk_details["risk_score"],
        "top_label": session.analysis["primary_condition"],
        "model_version": settings.MODEL_VERSION,
        "status": "success",
        "metadata": {
            "session_id": session.session_id,
            "image_count": session.analysis["image_count"],
            "image_previews": [image.get("preview") for image in session.images if image.get("preview")],
            "context": {"context_text": session.description},
            "text_signals": session.text_signals,
            "followup_items": session.questions,
            "followup_questions": [item["question"] for item in session.questions],
            "followup_answers": session.answers,
            "possible_conditions": session.result["possible_conditions"],
            "simple_explanation": session.result["explanation"],
            "recommended_steps": session.result["next_steps"],
            "confidence": session.result["confidence"],
            "risk_engine": session.risk_details,
            "analysis": session.analysis,
        },
    }

    try:
        return db_service.insert_scan(payload)
    except Exception:
        return None


@app.post("/upload", response_model=UploadSessionResponse, dependencies=[Depends(require_api_key)])
async def upload_screening(
    images: list[UploadFile] = File(...),
    description: str = Form(...),
):
    if not model_service.loaded:
        raise AppError("MODEL_NOT_READY", "Model is not loaded.", 503)

    cleaned_description = description.strip()
    if not cleaned_description:
        raise AppError("INVALID_DESCRIPTION", "A short description is required.", 422)
    if len(cleaned_description) > 1500:
        raise AppError("INVALID_DESCRIPTION", "Description must be 1500 characters or fewer.", 422)
    if not 2 <= len(images) <= 3:
        raise AppError("INVALID_IMAGE_COUNT", "Please upload 2 or 3 images for screening.", 400)

    stored_images: list[dict[str, str | bytes | None]] = []
    for upload in images:
        image_bytes = await upload.read()
        validate_image(image_bytes, settings.MAX_IMAGE_BYTES)
        stored_images.append(
            {
                "filename": upload.filename or "unknown",
                "content_type": upload.content_type,
                "image_bytes": image_bytes,
                "preview": _build_preview_data_url(image_bytes),
            }
        )

    session = session_store.create_session(cleaned_description, stored_images)
    return UploadSessionResponse(
        session_id=session.session_id,
        created_at=session.created_at,
        image_count=len(session.images),
        description_received=True,
    )


@app.post("/analyze", response_model=AnalyzeSessionResponse, dependencies=[Depends(require_api_key)])
async def analyze_screening(request: SessionRequest):
    if not model_service.loaded:
        raise AppError("MODEL_NOT_READY", "Model is not loaded.", 503)

    session = _get_session_or_404(request.session_id)
    await _ensure_session_analysis(session)

    message = None
    if session.analysis["consistency"] == "needs_retake":
        message = "Image results are less consistent than expected. Retaking clearer photos is recommended."

    return AnalyzeSessionResponse(
        session_id=session.session_id,
        image_count=session.analysis["image_count"],
        consistency=session.analysis["consistency"],
        conditions=[ConditionScore(**condition) for condition in session.analysis["conditions"]],
        text_signals=ExtractedTextSignals(**session.text_signals),
        message=message,
    )


@app.post("/questions", response_model=QuestionsSessionResponse, dependencies=[Depends(require_api_key)])
async def screening_questions(request: SessionRequest):
    session = _get_session_or_404(request.session_id)
    await _ensure_session_analysis(session)

    if not session.questions:
        session.questions = build_questions(session.analysis["conditions"], session.text_signals or {})

    return QuestionsSessionResponse(
        session_id=session.session_id,
        questions=session.questions,
    )


@app.post("/submit-answers", response_model=SubmitAnswersResponse, dependencies=[Depends(require_api_key)])
async def submit_screening_answers(request: SubmitAnswersRequest):
    session = _get_session_or_404(request.session_id)
    await _ensure_session_analysis(session)

    if not session.questions:
        session.questions = build_questions(session.analysis["conditions"], session.text_signals or {})

    session.answers = normalize_answers(request.answers)
    session.risk_details = evaluate_risk(
        image_analysis=session.analysis,
        text_signals=session.text_signals or {},
        answers=session.answers,
    )
    response_payload = build_screening_response(
        image_analysis=session.analysis,
        text_signals=session.text_signals or {},
        answers=session.answers,
        risk_result=session.risk_details,
        question_count=len(session.questions),
    )
    session.result = {
        "risk_level": response_payload["risk_level"],
        "confidence": response_payload["confidence"],
        "possible_conditions": response_payload["possible_conditions"],
        "explanation": response_payload["explanation"],
        "next_steps": response_payload["next_steps"],
    }

    if session.scan_id is None:
        session.scan_id = _store_mvp_scan(session)

    return SubmitAnswersResponse(
        session_id=session.session_id,
        status="completed",
        result_ready=True,
        scan_id=session.scan_id,
    )


@app.get("/result", response_model=ScreeningResultResponse, dependencies=[Depends(require_api_key)])
async def screening_result(session_id: str = Query(...)):
    session = _get_session_or_404(session_id)
    if session.result is None:
        raise AppError("RESULT_NOT_READY", "Submit answers before requesting a result.", 409)
    return ScreeningResultResponse(**session.result)


@app.post("/predict/enhanced", response_model=PredictEnhancedResponse, dependencies=[Depends(require_api_key)])
async def predict_enhanced(
    image: UploadFile | None = File(default=None),
    images: list[UploadFile] | None = File(default=None),
    context: str | None = Form(default=None),
    followup_answers: str | None = Form(default=None),
    patient_ref: str | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
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
    if not validated_context.get("context_text"):
        raise AppError("INVALID_CONTEXT", MISSING_CONTEXT_MESSAGE, 422)
    normalized_followup = normalize_followup_answers(followup_payload)
    merged_context = {**validated_context, **normalized_followup}

    image_scores: list[float] = []
    image_labels: list[str] = []
    image_model_confidences: list[float] = []
    model_explainability_chunks: list[dict] = []
    quality_metrics: list[dict] = []
    filenames: list[str] = []
    content_types: list[str] = []
    image_previews: list[str] = []

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
        if (
            prediction.model_confidence is not None
            and isinstance(prediction.model_confidence, (int, float))
            and math.isfinite(float(prediction.model_confidence))
        ):
            image_model_confidences.append(float(prediction.model_confidence))
        if prediction.explainability:
            model_explainability_chunks.append(prediction.explainability)
        filenames.append(upload.filename or "unknown")
        content_types.append(upload.content_type or "unknown")
        preview = _build_preview_data_url(image_bytes)
        if preview:
            image_previews.append(preview)

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
                items=[
                    {
                        "key": "retake_images",
                        "question": "Please upload 2-3 new well-lit, focused images from consistent distance.",
                    }
                ],
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

    top_label = Counter(image_labels).most_common(1)[0][0]
    context_result = apply_context_weighting(
        float(aggregation["aggregate_score"]),
        merged_context,
        top_label=top_label,
    )
    final_score = float(context_result["score"])
    messaging = build_risk_message(final_score)
    followup_question_items = build_followup_questions(
        merged_context,
        final_score,
        top_label=top_label,
        followup_answers=normalized_followup,
    )
    followup_questions = [question for _, question in followup_question_items]
    if image_model_confidences:
        confidence = round(sum(image_model_confidences) / len(image_model_confidences), 2)
    else:
        confidence = None

    contributing_factors = list(context_result["contributing_factors"])
    if len(image_scores) > 1:
        contributing_factors.append("Consistent model scores across multiple images")
    possible_conditions = build_possible_conditions(
        top_label=top_label,
        context=merged_context,
        risk_score=final_score,
    )
    simple_explanation = build_personalized_summary(
        risk_level=messaging["risk_level"],
        possible_conditions=possible_conditions,
        symptoms=merged_context,
        confidence=confidence,
    )
    recommended_steps = build_recommended_steps(
        risk_level=messaging["risk_level"],
        primary_recommendation=messaging["recommendation"],
        possible_conditions=possible_conditions,
        symptoms=merged_context,
        confidence=confidence,
    )

    followup_items = [{"key": key, "question": question} for key, question in followup_question_items]
    per_image_breakdown = [
        {
            "image_number": index + 1,
            "confidence": round(score * 100, 2),
            "predicted_class": label,
            "risk_level": map_risk_level(score),
        }
        for index, (score, label) in enumerate(zip(image_scores, image_labels))
    ]
    model_explainability = model_explainability_chunks[0] if model_explainability_chunks else None
    backend_details = {
        "image_count": len(image_scores),
        "individual_scores": [round(score, 3) for score in image_scores],
        "score_spread": round(float(aggregation["spread"]), 3),
        "consistency": "consistent",
        "context_adjustment": round(float(context_result["context_adjustment"]), 3),
        "contributing_factors": contributing_factors,
        "reasoning": "Final score combines weighted multi-image model score with capped deterministic context adjustment.",
    }

    scan_payload = {
        "created_at": created_at.isoformat(),
        "user_id": str(user_id) if user_id else None,
        "patient_ref": patient_ref,
        "risk_level": messaging["risk_level"],
        "risk_score": final_score,
        "top_label": top_label,
        "model_version": settings.MODEL_VERSION,
        "status": "success",
        "metadata": {
            "image_count": len(image_scores),
            "image_preview": image_previews[0] if image_previews else None,
            "image_previews": image_previews,
            "individual_scores": [round(score, 4) for score in image_scores],
            "aggregate_score": round(float(aggregation["aggregate_score"]), 4),
            "score_spread": round(float(aggregation["spread"]), 4),
            "context": merged_context,
            "context_adjustment": round(float(context_result["context_adjustment"]), 4),
            "followup_answers": normalized_followup,
            "followup_questions": followup_questions,
            "followup_items": followup_items,
            "model_confidences": [round(value, 4) for value in image_model_confidences],
            "quality_metrics": quality_metrics,
            "filenames": filenames,
            "content_types": content_types,
            "confidence": confidence,
            "risk_message": messaging["risk_message"],
            "recommendation": messaging["recommendation"],
            "recommended_steps": recommended_steps,
            "simple_explanation": simple_explanation,
            "explanation": simple_explanation,
            "possible_conditions": possible_conditions,
            "backend_details": backend_details,
            "model_explainability": model_explainability,
            "ai_image_breakdown": per_image_breakdown,
            "probabilities": {},
        },
    }

    scan_id = None
    try:
        scan_id = db_service.insert_scan(scan_payload)
    except Exception:
        scan_id = None

    return PredictEnhancedResponse(
        status="success",
        scan_id=scan_id,
        risk_level=messaging["risk_level"],
        risk_score=final_score,
        top_label=top_label,
        possible_conditions=possible_conditions,
        risk_message=messaging["risk_message"],
        simple_explanation=simple_explanation,
        recommendation=messaging["recommendation"],
        confidence=confidence,
        disclaimer=DISCLAIMER,
        created_at=created_at,
        followup=FollowupResponse(
            requires_followup=bool(followup_question_items),
            questions=followup_questions,
            items=followup_items,
        ),
        details=EnhancedDetails(**backend_details),
        model_explainability=model_explainability,
    )


@app.get("/scans", response_model=ScanHistoryResponse, dependencies=[Depends(require_api_key)])
async def scans(
    patient_ref: str | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    settings: Settings = Depends(get_settings),
):
    if not settings.ENABLE_SCAN_HISTORY:
        raise AppError("FEATURE_DISABLED", "Scan history is disabled.", 404)

    try:
        items = db_service.fetch_scans(
            patient_ref=patient_ref,
            limit=limit,
            user_id=str(user_id) if user_id else None,
        )
    except Exception:
        raise AppError("SCAN_HISTORY_FAILED", "Could not fetch scan history.", 500)

    return ScanHistoryResponse(items=items)


@app.get("/")
async def root():
    return JSONResponse({"message": "Derma Vision API", "docs": "/docs"})
