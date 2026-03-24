from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .intelligence import aggregate_scores
from .model import ModelService, Prediction
from .validation import analyze_image_quality

MVP_CONDITIONS: dict[str, str] = {
    "Viral_skin_disease": "Viral skin disease",
    "Fungal_infection": "Fungal infection",
    "Bacterial_infection": "Bacterial infection",
    "Inflammatory_rash": "Inflammatory rash",
    "Low_risk": "Low-risk skin change",
    "Suspicious_lesion": "Suspicious lesion",
    "Benign_lesion": "Benign lesion",
    "Parasitic_infestation": "Parasitic infestation",
}

_LABEL_ALIASES = {
    "viral skin disease": "Viral_skin_disease",
    "viral_skin_disease": "Viral_skin_disease",
    "fungal infection": "Fungal_infection",
    "fungal_infection": "Fungal_infection",
    "bacterial infection": "Bacterial_infection",
    "bacterial_infection": "Bacterial_infection",
    "inflammatory rash": "Inflammatory_rash",
    "inflammatory_rash": "Inflammatory_rash",
    "low risk": "Low_risk",
    "low_risk": "Low_risk",
    "suspicious lesion": "Suspicious_lesion",
    "suspicious_lesion": "Suspicious_lesion",
    "benign lesion": "Benign_lesion",
    "benign_lesion": "Benign_lesion",
    "parasitic infestation": "Parasitic_infestation",
    "parasitic_infestation": "Parasitic_infestation",
}


@dataclass
class ImageInput:
    filename: str
    content_type: str | None
    image_bytes: bytes


def normalize_condition_key(label: str | None) -> str:
    normalized = str(label or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in _LABEL_ALIASES:
        return _LABEL_ALIASES[normalized]
    if "fung" in normalized or "tinea" in normalized:
        return "Fungal_infection"
    if "bacter" in normalized or "impetigo" in normalized or "follic" in normalized:
        return "Bacterial_infection"
    if "viral" in normalized or "wart" in normalized or "blister" in normalized:
        return "Viral_skin_disease"
    if "parasit" in normalized or "scab" in normalized:
        return "Parasitic_infestation"
    if "rash" in normalized or "dermat" in normalized or "eczema" in normalized or "inflamm" in normalized:
        return "Inflammatory_rash"
    if "low_risk" in normalized or "low risk" in normalized or "acne" in normalized or "pimple" in normalized:
        return "Low_risk"
    if "suspicious" in normalized or "melan" in normalized or "cancer" in normalized:
        return "Suspicious_lesion"
    return "Benign_lesion"


def display_condition_name(condition_key: str) -> str:
    return MVP_CONDITIONS.get(condition_key, condition_key.replace("_", " ").title())


def _normalize_probability_map(raw_probabilities: dict[str, float] | None) -> dict[str, float]:
    if not isinstance(raw_probabilities, dict):
        return {}

    scores = {key: 0.0 for key in MVP_CONDITIONS}
    for label, value in raw_probabilities.items():
        try:
            parsed_value = float(value)
        except (TypeError, ValueError):
            continue
        scores[normalize_condition_key(str(label))] += max(0.0, parsed_value)

    total = sum(scores.values())
    if total <= 0:
        return {}
    return {key: value / total for key, value in scores.items()}


def _fallback_probability_map(prediction: Prediction) -> dict[str, float]:
    scores = {key: 0.0 for key in MVP_CONDITIONS}
    scores[normalize_condition_key(prediction.top_label)] = 1.0
    return scores


def _prediction_probability_map(prediction: Prediction) -> dict[str, float]:
    normalized = _normalize_probability_map(prediction.class_probabilities)
    if normalized:
        return normalized
    return _fallback_probability_map(prediction)


async def analyze_images(model_service: ModelService, settings: Any, images: list[ImageInput]) -> dict[str, Any]:
    if not images:
        raise ValueError("images must not be empty")

    image_scores: list[float] = []
    image_confidences: list[float] = []
    per_condition_totals = {key: 0.0 for key in MVP_CONDITIONS}
    image_results: list[dict[str, Any]] = []

    for index, image in enumerate(images, start=1):
        quality = analyze_image_quality(
            image_bytes=image.image_bytes,
            max_bytes=settings.MAX_IMAGE_BYTES,
            min_width=settings.MIN_IMAGE_WIDTH,
            min_height=settings.MIN_IMAGE_HEIGHT,
            max_dimension=settings.MAX_IMAGE_DIMENSION,
            min_brightness_mean=settings.MIN_BRIGHTNESS_MEAN,
            max_brightness_mean=settings.MAX_BRIGHTNESS_MEAN,
            min_edge_intensity=settings.MIN_EDGE_INTENSITY,
        )
        prediction = await model_service.predict(image.image_bytes)
        probability_map = _prediction_probability_map(prediction)

        for condition_key, probability in probability_map.items():
            per_condition_totals[condition_key] += probability

        image_scores.append(float(prediction.risk_score))
        if prediction.model_confidence is not None:
            image_confidences.append(float(prediction.model_confidence))

        top_key = normalize_condition_key(prediction.top_label)
        image_results.append(
            {
                "image_number": index,
                "filename": image.filename,
                "content_type": image.content_type or "unknown",
                "top_condition": display_condition_name(top_key),
                "risk_score": round(float(prediction.risk_score), 4),
                "quality": quality,
            }
        )

    aggregation = aggregate_scores(image_scores, settings.MAX_SCORE_DISAGREEMENT)
    averaged_condition_scores = {
        key: total / len(images)
        for key, total in per_condition_totals.items()
    }
    ordered_conditions = sorted(averaged_condition_scores.items(), key=lambda item: item[1], reverse=True)
    top_conditions = [
        {
            "key": condition_key,
            "name": display_condition_name(condition_key),
            "score": round(float(score), 4),
        }
        for condition_key, score in ordered_conditions
        if score > 0
    ][:3]

    primary_condition = top_conditions[0]["key"] if top_conditions else "Benign_lesion"
    average_confidence = (
        round(sum(image_confidences) / len(image_confidences), 4)
        if image_confidences
        else None
    )

    return {
        "image_count": len(images),
        "image_risk_score": round(float(aggregation["aggregate_score"]), 4),
        "score_spread": round(float(aggregation["spread"]), 4),
        "consistency": "needs_retake" if aggregation["is_inconsistent"] else "consistent",
        "retake_recommended": bool(aggregation["is_inconsistent"]),
        "average_model_confidence": average_confidence,
        "primary_condition": primary_condition,
        "conditions": top_conditions,
        "individual_predictions": image_results,
    }
