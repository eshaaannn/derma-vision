from __future__ import annotations

from typing import Any

from .image_model import normalize_condition_key


def _clamp(score: float) -> float:
    return max(0.0, min(1.0, float(score)))


def _questionnaire_score(primary_condition: str, answers: dict[str, bool]) -> float:
    if not answers:
        return 0.35

    score = 0.18
    if answers.get("bleeding"):
        score = max(score, 0.95)
    if answers.get("changed_size"):
        score = max(score, 0.88)
    if answers.get("irregular_borders"):
        score = max(score, 0.82)
    if answers.get("color_variation"):
        score = max(score, 0.8)

    if primary_condition == "Fungal_infection":
        if answers.get("itching"):
            score += 0.12
        if answers.get("spreading_circular"):
            score += 0.16
        if answers.get("flaky_scaly"):
            score += 0.12
    elif primary_condition == "Bacterial_infection":
        if answers.get("pus_or_discharge"):
            score += 0.22
        if answers.get("pain_or_warmth"):
            score += 0.16
        if answers.get("swelling"):
            score += 0.1
    elif primary_condition == "Viral_skin_disease":
        if answers.get("bumps_or_blisters"):
            score += 0.14
        if answers.get("recurring"):
            score += 0.12
        if answers.get("fever_or_weakness"):
            score += 0.08
    elif primary_condition == "Inflammatory_rash":
        if answers.get("red_irritated"):
            score += 0.14
        if answers.get("allergy_history"):
            score += 0.12
        if answers.get("improves_with_creams"):
            score += 0.08
    elif primary_condition == "Parasitic_infestation":
        if answers.get("night_itch"):
            score += 0.2
        if answers.get("others_affected"):
            score += 0.18
        if answers.get("burrows_or_tracks"):
            score += 0.18
    elif primary_condition == "Benign_lesion":
        if answers.get("unchanged"):
            score = min(score, 0.12)
        if answers.get("pain_or_discomfort") is False:
            score = min(score, 0.08)
    elif primary_condition == "Low_risk":
        score = min(score, 0.12)
        if answers.get("unchanged"):
            score = min(score, 0.08)
        if answers.get("pain_or_discomfort") is False:
            score = min(score, 0.06)
    elif primary_condition == "Suspicious_lesion":
        if answers.get("changed_size"):
            score += 0.18
        if answers.get("bleeding"):
            score += 0.18
        if answers.get("irregular_borders"):
            score += 0.14
        if answers.get("color_variation"):
            score += 0.14

    return _clamp(score)


def _text_signal_score(primary_condition: str, text_signals: dict[str, Any]) -> float:
    symptoms = text_signals.get("symptoms") or {}
    severity = text_signals.get("severity")
    progression = text_signals.get("progression")
    duration = text_signals.get("duration")

    if progression == "stable" and not any(symptoms.values()) and primary_condition == "Benign_lesion":
        return 0.05

    score = 0.16
    if symptoms.get("bleeding"):
        score = max(score, 0.92)
    if symptoms.get("growth"):
        score = max(score, 0.88)
    if symptoms.get("pus"):
        score = max(score, 0.66)
    if symptoms.get("fever"):
        score = max(score, 0.64)
    if symptoms.get("pain"):
        score += 0.08
    if symptoms.get("itching"):
        score += 0.06
    if symptoms.get("spreading"):
        score += 0.08

    if severity == "severe":
        score += 0.1
    elif severity == "moderate":
        score += 0.04

    if progression == "increasing":
        score += 0.12
    elif progression == "spreading":
        score += 0.1

    if duration == "long":
        score += 0.04

    return _clamp(score)


def evaluate_risk(
    image_analysis: dict[str, Any],
    text_signals: dict[str, Any],
    answers: dict[str, bool],
) -> dict[str, Any]:
    primary_condition = normalize_condition_key(image_analysis.get("primary_condition"))
    symptoms = text_signals.get("symptoms") or {}

    image_score = _clamp(float(image_analysis.get("image_risk_score", 0.0)))
    questionnaire_score = _questionnaire_score(primary_condition, answers)
    text_score = _text_signal_score(primary_condition, text_signals)

    risk_score = (0.5 * image_score) + (0.3 * questionnaire_score) + (0.2 * text_score)
    factors: list[str] = []

    bleeding_flag = symptoms.get("bleeding") or answers.get("bleeding")
    growth_flag = symptoms.get("growth") or answers.get("changed_size")
    if bleeding_flag:
        risk_score = max(risk_score, 0.84)
        factors.append("Bleeding was reported")
    if growth_flag:
        risk_score = max(risk_score, 0.82)
        factors.append("Recent change or growth was reported")

    if primary_condition == "Suspicious_lesion":
        risk_score = min(1.0, risk_score + 0.08)
        factors.append("The image model favored a suspicious lesion pattern")

    fungal_support = (
        primary_condition == "Fungal_infection"
        and (symptoms.get("itching") or answers.get("itching"))
        and (symptoms.get("spreading") or answers.get("spreading_circular"))
    )
    if fungal_support:
        risk_score = max(risk_score, 0.45)
        factors.append("Itching with spread fits a fungal pattern")

    bacterial_support = (
        primary_condition == "Bacterial_infection"
        and (symptoms.get("pus") or answers.get("pus_or_discharge"))
        and (symptoms.get("pain") or answers.get("pain_or_warmth"))
    )
    if bacterial_support:
        bacterial_floor = 0.72 if (symptoms.get("fever") or answers.get("fever_or_weakness")) else 0.58
        risk_score = max(risk_score, bacterial_floor)
        factors.append("Pus with pain suggests a more active infection")

    stable_and_quiet = (
        (text_signals.get("progression") == "stable" or answers.get("unchanged"))
        and not any(symptoms.values())
        and answers.get("pain_or_discomfort") in {False, None}
    )
    if primary_condition in {"Benign_lesion", "Low_risk"} and stable_and_quiet:
        risk_score = min(risk_score, 0.28)
        factors.append("The area sounds stable without active symptoms")

    risk_score = _clamp(risk_score)
    if risk_score >= 0.72:
        risk_level = "High"
    elif risk_score >= 0.35:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return {
        "risk_score": round(risk_score, 4),
        "risk_level": risk_level,
        "primary_condition": primary_condition,
        "component_scores": {
            "image": round(image_score, 4),
            "questionnaire": round(questionnaire_score, 4),
            "text": round(text_score, 4),
        },
        "factors": factors[:4],
    }
