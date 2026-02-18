from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Header, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .db import SupabaseService
from .errors import AppError, add_error_handlers
from .model import ModelService, map_risk_level
from .schemas import HealthResponse, PredictResponse, ScanHistoryResponse
from .validation import validate_image

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
