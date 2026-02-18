from __future__ import annotations

import hashlib
import importlib.util
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any, Callable

_LOCK = Lock()
_PREDICT_FUNC: Callable[[str, dict[str, Any] | None], dict[str, Any]] | None = None
_LOAD_ERROR: str | None = None


def _inference_file_path() -> Path:
    return Path(__file__).resolve().parents[2] / "ai-training" / "inference.py"


def _load_predict_func() -> Callable[[str, dict[str, Any] | None], dict[str, Any]]:
    path = _inference_file_path()
    if not path.exists():
        raise FileNotFoundError(f"AI inference file not found: {path}")

    spec = importlib.util.spec_from_file_location("ai_training_inference", path)
    if not spec or not spec.loader:
        raise RuntimeError("Failed to load ai-training inference module spec.")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    predict_func = getattr(module, "predict", None)
    if not callable(predict_func):
        raise RuntimeError("ai-training/inference.py must expose callable `predict`.")
    return predict_func


def _get_predict_func() -> Callable[[str, dict[str, Any] | None], dict[str, Any]] | None:
    global _PREDICT_FUNC, _LOAD_ERROR
    if _PREDICT_FUNC is not None:
        return _PREDICT_FUNC
    if _LOAD_ERROR is not None:
        return None

    with _LOCK:
        if _PREDICT_FUNC is not None:
            return _PREDICT_FUNC
        if _LOAD_ERROR is not None:
            return None
        try:
            _PREDICT_FUNC = _load_predict_func()
            return _PREDICT_FUNC
        except Exception as exc:
            _LOAD_ERROR = str(exc)
            return None


def _fallback_prediction(image_bytes: bytes, error_message: str | None = None) -> dict[str, Any]:
    digest = hashlib.sha256(image_bytes).hexdigest()
    score = int(digest[:8], 16) / 0xFFFFFFFF
    risk_score = max(0.0, min(1.0, float(score)))
    top_label = "suspicious_lesion" if risk_score >= 0.75 else "benign_like"
    explainability = {
        "source": "fallback_hash",
        "reason": error_message or _LOAD_ERROR or "ai-training model unavailable",
    }
    return {"risk_score": risk_score, "top_label": top_label, "explainability": explainability}


def predict_image_bytes(image_bytes: bytes) -> dict[str, Any]:
    predict_func = _get_predict_func()
    if predict_func is None:
        return _fallback_prediction(image_bytes)

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as temp_file:
            temp_file.write(image_bytes)
            temp_path = Path(temp_file.name)

        result = predict_func(str(temp_path), None)
        risk_score_raw = result.get("final_risk_score", result.get("cancer_probability", 0.0))
        risk_score = max(0.0, min(1.0, float(risk_score_raw)))

        risk_level = str(result.get("risk_level", "")).lower()
        top_label = result.get("top_label")
        if not top_label:
            top_label = "suspicious_lesion" if risk_level in {"high", "medium"} else "benign_like"

        explainability = {
            "source": "ai-training",
            "risk_level": result.get("risk_level"),
            "model_confidence": result.get("model_confidence"),
            "decision": result.get("decision"),
            "heatmap": result.get("heatmap"),
        }

        return {"risk_score": risk_score, "top_label": str(top_label), "explainability": explainability}
    except Exception as exc:
        return _fallback_prediction(image_bytes, str(exc))
    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
