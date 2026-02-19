from __future__ import annotations

import hashlib
import importlib.util
import io
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any, Callable

from PIL import Image, ImageFilter, ImageStat

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
    deterministic_jitter = int(digest[:8], 16) / 0xFFFFFFFF
    visual_pattern = _estimate_visual_pattern(image_bytes)
    base_score = float(visual_pattern["base_risk"])
    risk_score = max(0.0, min(1.0, base_score + ((deterministic_jitter - 0.5) * 0.04)))
    top_label = str(visual_pattern["label"])
    explainability = {
        "source": "fallback_visual_pattern",
        "reason": error_message or _LOAD_ERROR or "ai-training model unavailable",
        "visual_pattern": visual_pattern,
    }
    return {"risk_score": risk_score, "top_label": top_label, "explainability": explainability}


def _estimate_visual_pattern(image_bytes: bytes) -> dict[str, Any]:
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return {"label": "benign_like", "base_risk": 0.28, "reason": "image_decode_failed"}

    red, green, blue = image.split()
    r_mean = float(ImageStat.Stat(red).mean[0])
    g_mean = float(ImageStat.Stat(green).mean[0])
    b_mean = float(ImageStat.Stat(blue).mean[0])
    gray = image.convert("L")
    brightness = float(ImageStat.Stat(gray).mean[0])
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge_intensity = float(ImageStat.Stat(edges).mean[0])

    redness = r_mean - max(g_mean, b_mean)
    darkness = 255.0 - brightness

    if redness > 14 and edge_intensity > 10:
        return {
            "label": "possible_fungal_infection",
            "base_risk": 0.26,
            "reason": "reddish_patch_with_texture",
        }

    if redness > 18 and edge_intensity <= 10:
        return {
            "label": "possible_inflammatory_rash",
            "base_risk": 0.24,
            "reason": "reddish_diffuse_pattern",
        }

    if darkness > 95 and edge_intensity > 12:
        return {
            "label": "suspicious_pigmented_lesion",
            "base_risk": 0.58,
            "reason": "dark_high_contrast_pattern",
        }

    if edge_intensity > 15 and r_mean > 120 and g_mean > 100:
        return {
            "label": "possible_bacterial_infection",
            "base_risk": 0.34,
            "reason": "high_texture_with_warm_tones",
        }

    return {
        "label": "benign_like",
        "base_risk": 0.22,
        "reason": "low_risk_visual_signature",
    }


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
        model_confidence_raw = result.get("model_confidence")
        try:
            model_confidence = float(model_confidence_raw) if model_confidence_raw is not None else None
        except (TypeError, ValueError):
            model_confidence = None

        visual_pattern = _estimate_visual_pattern(image_bytes)
        pattern_label = str(visual_pattern["label"])
        pattern_is_non_cancer = pattern_label in {
            "possible_fungal_infection",
            "possible_inflammatory_rash",
            "possible_bacterial_infection",
        }

        top_label = result.get("top_label")
        if not top_label:
            top_label = "suspicious_lesion" if risk_level in {"high", "medium"} else "benign_like"

        if pattern_is_non_cancer:
            top_label = pattern_label
            non_cancer_cap = 0.58 if (model_confidence is not None and model_confidence >= 0.8) else 0.5
            if risk_score > non_cancer_cap:
                risk_score = round(non_cancer_cap, 4)

        explainability = {
            "source": "ai-training",
            "risk_level": result.get("risk_level"),
            "model_confidence": model_confidence,
            "decision": result.get("decision"),
            "heatmap": result.get("heatmap"),
            "visual_pattern": visual_pattern,
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
