from __future__ import annotations

from statistics import mean
from typing import Any

from .model import map_risk_level

FOLLOWUP_QUESTION_BANK = {
    "duration_days": "How many days has this lesion been present?",
    "rapid_growth": "Has the lesion changed size recently?",
    "bleeding": "Is there bleeding?",
    "pain": "Is there pain or tenderness?",
    "itching": "Is there persistent itching?",
}


def clamp_score(score: float) -> float:
    return max(0.0, min(1.0, float(score)))


def validate_context(raw_context: dict[str, Any] | None) -> dict[str, Any]:
    if raw_context is None:
        return {}
    if not isinstance(raw_context, dict):
        raise ValueError("context must be a JSON object")

    context: dict[str, Any] = {}
    for key in ("itching", "bleeding", "rapid_growth", "pain"):
        if key in raw_context:
            value = raw_context[key]
            if not isinstance(value, bool):
                raise ValueError(f"{key} must be boolean")
            context[key] = value

    if "age" in raw_context:
        age = raw_context["age"]
        if not isinstance(age, int) or age < 0 or age > 120:
            raise ValueError("age must be an integer between 0 and 120")
        context["age"] = age

    if "duration_days" in raw_context:
        duration_days = raw_context["duration_days"]
        if not isinstance(duration_days, int) or duration_days < 0 or duration_days > 36500:
            raise ValueError("duration_days must be an integer between 0 and 36500")
        context["duration_days"] = duration_days

    return context


def aggregate_scores(scores: list[float], max_score_disagreement: float) -> dict[str, Any]:
    if not scores:
        raise ValueError("scores must not be empty")

    normalized = [clamp_score(score) for score in scores]
    max_score = max(normalized)
    avg_score = mean(normalized)
    spread = max_score - min(normalized)
    aggregate = clamp_score(0.6 * max_score + 0.4 * avg_score) if len(normalized) > 1 else normalized[0]

    return {
        "aggregate_score": aggregate,
        "max_score": max_score,
        "avg_score": avg_score,
        "spread": spread,
        "is_inconsistent": spread > max_score_disagreement,
    }


def apply_context_weighting(score: float, context: dict[str, Any]) -> dict[str, Any]:
    adjustment = 0.0
    contributing_factors: list[str] = []

    age = context.get("age")
    if isinstance(age, int) and age >= 65:
        adjustment += 0.06
        contributing_factors.append("Age >= 65 reported")

    duration_days = context.get("duration_days")
    if isinstance(duration_days, int) and duration_days <= 14:
        adjustment += 0.05
        contributing_factors.append("Recent onset reported")

    if context.get("itching") is True:
        adjustment += 0.03
        contributing_factors.append("Itching reported")
    if context.get("bleeding") is True:
        adjustment += 0.12
        contributing_factors.append("Bleeding reported")
    if context.get("rapid_growth") is True:
        adjustment += 0.15
        contributing_factors.append("Rapid growth reported")
    if context.get("pain") is True:
        adjustment += 0.05
        contributing_factors.append("Pain reported")

    adjustment = max(-0.12, min(0.22, adjustment))
    final_score = clamp_score(score + adjustment)

    return {
        "score": final_score,
        "context_adjustment": round(adjustment, 3),
        "contributing_factors": contributing_factors,
    }


def build_followup_questions(context: dict[str, Any], risk_score: float) -> list[str]:
    missing_keys = [key for key in ("duration_days", "rapid_growth", "bleeding") if key not in context]
    if not missing_keys:
        return []
    if risk_score < 0.35:
        return []
    return [FOLLOWUP_QUESTION_BANK[key] for key in missing_keys]


def build_risk_message(score: float) -> dict[str, str]:
    risk_level = map_risk_level(score)
    if risk_level == "low":
        return {
            "risk_level": "low",
            "risk_message": "Low Risk - Monitor regularly.",
            "recommendation": "Capture a new image if the lesion changes in color, shape, or size.",
        }
    if risk_level == "medium":
        return {
            "risk_level": "medium",
            "risk_message": "Medium Risk - Dermatologist consultation recommended.",
            "recommendation": "Schedule a dermatology appointment for professional evaluation.",
        }
    return {
        "risk_level": "high",
        "risk_message": "High Risk - Immediate clinical evaluation advised.",
        "recommendation": "Seek prompt in-person medical assessment.",
    }


def build_confidence(
    image_count: int,
    spread: float,
    context: dict[str, Any],
    has_model_explainability: bool,
) -> float:
    confidence = 0.9
    confidence -= min(0.25, spread * 0.6)
    if image_count == 1:
        confidence -= 0.05
    missing_context_fields = sum(1 for key in ("duration_days", "rapid_growth", "bleeding") if key not in context)
    confidence -= missing_context_fields * 0.04
    if has_model_explainability:
        confidence += 0.03
    return round(max(0.5, min(0.97, confidence)), 2)
