from __future__ import annotations

from typing import Any

from .image_model import MVP_CONDITIONS, display_condition_name, normalize_condition_key

CONDITION_STEPS: dict[str, list[str]] = {
    "Fungal_infection": [
        "Keep the area dry.",
        "Use an antifungal cream if a clinician or pharmacist has already advised it for you.",
        "Avoid sharing clothes or towels.",
    ],
    "Bacterial_infection": [
        "Maintain good skin hygiene.",
        "Avoid touching or squeezing the area.",
        "Seek care sooner if it becomes more painful, warm, or starts draining.",
    ],
    "Viral_skin_disease": [
        "Avoid scratching the area.",
        "Monitor whether it spreads or comes back again.",
        "Arrange review if it persists or worsens.",
    ],
    "Inflammatory_rash": [
        "Avoid likely triggers such as harsh soaps or friction.",
        "Use soothing creams or bland moisturizers if they usually help you.",
        "Monitor for ongoing irritation.",
    ],
    "Low_risk": [
        "Keep the area clean and avoid picking at it.",
        "Use gentle skin care and avoid harsh scrubs or strong acids unless advised.",
        "Monitor for spread, pain, or any clear change.",
    ],
    "Parasitic_infestation": [
        "Wash clothes, bedding, and towels well.",
        "Avoid close contact if others may be affected.",
        "Treat close household contacts if a clinician confirms it is needed.",
    ],
    "Suspicious_lesion": [
        "Arrange an urgent doctor or dermatologist consultation.",
        "Do not self-treat it with strong creams or acids.",
        "Take a clear photo today so you can compare any further change.",
    ],
    "Benign_lesion": [
        "Monitor the area rather than treating it aggressively.",
        "There is no obvious urgency if it stays unchanged.",
        "Take a baseline photo so you can compare later.",
    ],
}


def _clamp(score: float) -> float:
    return max(0.0, min(1.0, float(score)))


def _signal_support_for_condition(condition_key: str, text_signals: dict[str, Any], answers: dict[str, bool]) -> float:
    symptoms = text_signals.get("symptoms") or {}
    support = 0.0

    if condition_key == "Suspicious_lesion":
        if symptoms.get("bleeding") or answers.get("bleeding"):
            support += 0.22
        if symptoms.get("growth") or answers.get("changed_size"):
            support += 0.2
        if answers.get("irregular_borders"):
            support += 0.18
        if answers.get("color_variation"):
            support += 0.16
    elif condition_key == "Fungal_infection":
        if symptoms.get("itching") or answers.get("itching"):
            support += 0.12
        if symptoms.get("spreading") or answers.get("spreading_circular"):
            support += 0.12
        if answers.get("flaky_scaly"):
            support += 0.08
    elif condition_key == "Bacterial_infection":
        if symptoms.get("pus") or answers.get("pus_or_discharge"):
            support += 0.16
        if symptoms.get("pain") or answers.get("pain_or_warmth"):
            support += 0.12
        if symptoms.get("fever") or answers.get("fever_or_weakness"):
            support += 0.08
        if answers.get("swelling"):
            support += 0.08
    elif condition_key == "Viral_skin_disease":
        if answers.get("bumps_or_blisters"):
            support += 0.14
        if answers.get("recurring"):
            support += 0.1
        if symptoms.get("fever") or answers.get("fever_or_weakness"):
            support += 0.06
    elif condition_key == "Inflammatory_rash":
        if answers.get("red_irritated"):
            support += 0.12
        if answers.get("allergy_history"):
            support += 0.1
        if answers.get("improves_with_creams"):
            support += 0.08
    elif condition_key == "Parasitic_infestation":
        if answers.get("night_itch"):
            support += 0.16
        if answers.get("others_affected"):
            support += 0.12
        if answers.get("burrows_or_tracks"):
            support += 0.12
    elif condition_key == "Benign_lesion":
        if answers.get("unchanged"):
            support += 0.16
        if answers.get("pain_or_discomfort") is False:
            support += 0.12
        if text_signals.get("progression") == "stable":
            support += 0.08
    elif condition_key == "Low_risk":
        if answers.get("unchanged"):
            support += 0.18
        if answers.get("pain_or_discomfort") is False:
            support += 0.14
        if text_signals.get("progression") == "stable":
            support += 0.1

    return support


def _rank_possible_conditions(
    image_analysis: dict[str, Any],
    text_signals: dict[str, Any],
    answers: dict[str, bool],
) -> list[str]:
    scores = {key: 0.0 for key in MVP_CONDITIONS}
    for condition in image_analysis.get("conditions", []):
        condition_key = normalize_condition_key(condition.get("key") or condition.get("name"))
        scores[condition_key] += float(condition.get("score", 0.0))

    for condition_key in scores:
        scores[condition_key] += _signal_support_for_condition(condition_key, text_signals, answers)

    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    return [display_condition_name(condition_key) for condition_key, score in ordered if score > 0][:3]


def _confidence_score(
    image_analysis: dict[str, Any],
    answers: dict[str, bool],
    question_count: int,
) -> float:
    score = float(image_analysis.get("average_model_confidence") or 0.62)
    score += 0.05 if int(image_analysis.get("image_count") or 0) >= 2 else 0.0

    spread = float(image_analysis.get("score_spread") or 0.0)
    if spread <= 0.12:
        score += 0.05
    elif spread >= 0.3:
        score -= 0.12

    completion = (len(answers) / question_count) if question_count else 0.0
    if completion >= 0.8:
        score += 0.05
    elif question_count:
        score -= 0.05

    conditions = image_analysis.get("conditions") or []
    if len(conditions) >= 2:
        gap = float(conditions[0]["score"]) - float(conditions[1]["score"])
        if gap >= 0.18:
            score += 0.05
        elif gap <= 0.08:
            score -= 0.05

    return _clamp(score)


def _confidence_label(score: float) -> str:
    if score >= 0.78:
        return "High"
    if score >= 0.58:
        return "Medium"
    return "Low"


def _build_explanation(
    risk_level: str,
    possible_conditions: list[str],
    risk_factors: list[str],
) -> str:
    primary_condition = possible_conditions[0] if possible_conditions else "a skin change"
    secondary_condition = possible_conditions[1] if len(possible_conditions) > 1 else None

    lead = f"This screening suggests a {risk_level.lower()} risk pattern."
    fit = f"The current images and answers fit best with {primary_condition.lower()}."
    if secondary_condition:
        fit = f"The current images and answers fit best with {primary_condition.lower()}, with {secondary_condition.lower()} also possible."

    if risk_factors:
        reason = risk_factors[0].lower().rstrip(".")
        return f"{lead} {fit} This is not a diagnosis, but it was pushed higher because {reason}."
    return f"{lead} {fit} This is not a diagnosis, and an in-person review matters if the area changes."


def _build_next_steps(risk_level: str, primary_condition: str, confidence_label: str) -> list[str]:
    steps: list[str] = []

    if risk_level == "High":
        steps.append("Arrange an in-person medical review as soon as possible, ideally within 24-72 hours.")
    elif risk_level == "Medium":
        steps.append("Arrange a medical review within 5-7 days if the area is not settling or keeps changing.")
    else:
        steps.append("Monitor the area closely over the next 5-7 days and seek care sooner if it changes.")

    steps.extend(CONDITION_STEPS.get(primary_condition, CONDITION_STEPS["Benign_lesion"]))
    steps.append("Take another clear photo in 5-7 days so you can compare change over time.")

    if confidence_label == "Low":
        steps.append("Because this screening is less certain, choose an in-person review sooner if you are unsure.")

    deduped: list[str] = []
    for step in steps:
        cleaned = step.strip()
        if cleaned and cleaned not in deduped:
            deduped.append(cleaned)
    return deduped[:6]


def build_screening_response(
    image_analysis: dict[str, Any],
    text_signals: dict[str, Any],
    answers: dict[str, bool],
    risk_result: dict[str, Any],
    question_count: int,
) -> dict[str, Any]:
    possible_conditions = _rank_possible_conditions(image_analysis, text_signals, answers)
    confidence_score = _confidence_score(image_analysis, answers, question_count)
    confidence_label = _confidence_label(confidence_score)
    primary_condition = normalize_condition_key(risk_result.get("primary_condition"))

    return {
        "risk_level": risk_result["risk_level"],
        "confidence": confidence_label,
        "possible_conditions": possible_conditions,
        "explanation": _build_explanation(
            risk_level=risk_result["risk_level"],
            possible_conditions=possible_conditions,
            risk_factors=risk_result.get("factors") or [],
        ),
        "next_steps": _build_next_steps(
            risk_level=risk_result["risk_level"],
            primary_condition=primary_condition,
            confidence_label=confidence_label,
        ),
        "details": {
            "confidence_score": round(confidence_score, 4),
        },
    }
