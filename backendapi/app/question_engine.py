from __future__ import annotations

from typing import Any

from .image_model import display_condition_name, normalize_condition_key

QUESTION_BANK: dict[str, list[dict[str, str]]] = {
    "Fungal_infection": [
        {"key": "itching", "question": "Is it itchy?"},
        {"key": "spreading_circular", "question": "Is it spreading in a circular pattern?"},
        {"key": "flaky_scaly", "question": "Is the skin flaky or scaly?"},
    ],
    "Bacterial_infection": [
        {"key": "pus_or_discharge", "question": "Is there pus or discharge?"},
        {"key": "pain_or_warmth", "question": "Is the area painful or warm?"},
        {"key": "swelling", "question": "Is there swelling?"},
    ],
    "Viral_skin_disease": [
        {"key": "bumps_or_blisters", "question": "Are there small bumps or blisters?"},
        {"key": "recurring", "question": "Is it recurring?"},
        {"key": "fever_or_weakness", "question": "Any fever or weakness?"},
    ],
    "Inflammatory_rash": [
        {"key": "red_irritated", "question": "Is the skin red and irritated?"},
        {"key": "allergy_history", "question": "Any allergy history?"},
        {"key": "improves_with_creams", "question": "Does it improve with creams?"},
    ],
    "Parasitic_infestation": [
        {"key": "night_itch", "question": "Severe itching at night?"},
        {"key": "others_affected", "question": "Are others around you affected?"},
        {"key": "burrows_or_tracks", "question": "Any burrows or tracks on skin?"},
    ],
    "Suspicious_lesion": [
        {"key": "changed_size", "question": "Has it changed in size?"},
        {"key": "bleeding", "question": "Is there bleeding?"},
        {"key": "irregular_borders", "question": "Are borders irregular?"},
        {"key": "color_variation", "question": "Color variation?"},
    ],
    "Benign_lesion": [
        {"key": "unchanged", "question": "Has it remained unchanged?"},
        {"key": "pain_or_discomfort", "question": "Any pain or discomfort?"},
    ],
}


def _coerce_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in {0, 1}:
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"yes", "y", "true", "1"}:
            return True
        if normalized in {"no", "n", "false", "0"}:
            return False
    return None


def normalize_answers(raw_answers: dict[str, Any] | None) -> dict[str, bool]:
    if not isinstance(raw_answers, dict):
        return {}

    allowed_keys = {
        item["key"]
        for items in QUESTION_BANK.values()
        for item in items
    }
    normalized: dict[str, bool] = {}
    for raw_key, raw_value in raw_answers.items():
        key = str(raw_key).strip()
        if key not in allowed_keys:
            continue
        parsed = _coerce_bool(raw_value)
        if parsed is not None:
            normalized[key] = parsed
    return normalized


def _known_signals_from_text(text_signals: dict[str, Any]) -> dict[str, bool]:
    symptoms = text_signals.get("symptoms") or {}
    known: dict[str, bool] = {}
    for key in ("itching", "bleeding"):
        if symptoms.get(key) is True:
            known[key] = True

    if symptoms.get("growth") is True or text_signals.get("progression") == "increasing":
        known["changed_size"] = True
    if text_signals.get("progression") == "stable":
        known["unchanged"] = True
    if symptoms.get("fever") is True:
        known["fever_or_weakness"] = True
    return known


def build_questions(conditions: list[dict[str, Any]], text_signals: dict[str, Any], limit: int = 6) -> list[dict[str, str]]:
    limit = max(4, min(limit, 6))

    top_condition_keys = [
        normalize_condition_key(condition.get("key") or condition.get("name"))
        for condition in conditions[:2]
    ]
    if not top_condition_keys:
        top_condition_keys = ["Benign_lesion"]
    if len(top_condition_keys) == 1:
        fallback_key = "Suspicious_lesion" if top_condition_keys[0] != "Suspicious_lesion" else "Benign_lesion"
        top_condition_keys.append(fallback_key)

    known_signals = _known_signals_from_text(text_signals)
    selected: list[dict[str, str]] = []
    seen_keys: set[str] = set()

    for condition_key in top_condition_keys[:2]:
        for item in QUESTION_BANK.get(condition_key, []):
            if item["key"] in seen_keys or item["key"] in known_signals:
                continue
            selected.append(
                {
                    "key": item["key"],
                    "question": item["question"],
                    "condition": display_condition_name(condition_key),
                    "answer_type": "yes_no",
                }
            )
            seen_keys.add(item["key"])
            if len(selected) >= limit:
                return selected

    if len(selected) < 4:
        for condition_key in top_condition_keys[:2]:
            for item in QUESTION_BANK.get(condition_key, []):
                if item["key"] in seen_keys:
                    continue
                selected.append(
                    {
                        "key": item["key"],
                        "question": item["question"],
                        "condition": display_condition_name(condition_key),
                        "answer_type": "yes_no",
                    }
                )
                seen_keys.add(item["key"])
                if len(selected) >= 4:
                    break
            if len(selected) >= 4:
                break

    return selected[:limit]
