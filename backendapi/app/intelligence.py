from __future__ import annotations

import re
from statistics import mean
from typing import Any

from .model import map_risk_level

MAX_FOLLOWUP_QUESTIONS = 6

FOLLOWUP_QUESTION_BANK: dict[str, list[tuple[str, str]]] = {
    "oncologic": [
        ("previous_skin_cancer", "Have you ever been diagnosed with skin cancer before?"),
        ("family_history_skin_cancer", "Has any blood relative had melanoma or skin cancer?"),
        ("severe_sunburn_history", "Have you had repeated severe sunburns in the same body area?"),
        ("immunosuppression", "Are you immunosuppressed or on long-term steroid therapy?"),
        ("non_healing", "Has this lesion failed to heal for more than 3 weeks?"),
        ("new_vs_old_lesion", "Is this lesion new or different from your other moles?"),
    ],
    "fungal": [
        ("contact_history", "Did close contacts have similar ring-like lesions recently?"),
        ("pet_exposure", "Any recent contact with pets/animals with skin disease?"),
        ("sweating_occlusion", "Does sweating or tight clothing make the patch worse?"),
        ("steroid_cream_use", "Did steroid creams worsen this patch after temporary relief?"),
        ("immune_risk", "Do you have diabetes or immunity issues that worsen fungal infections?"),
        ("family_history_skin_cancer", "Any close family history of skin cancer or melanoma?"),
    ],
    "bacterial": [
        ("fever", "Any fever, chills, or feeling unwell with this lesion?"),
        ("pus", "Is there pus or yellow crust present?"),
        ("contact_history", "Any recent local trauma, shaving cuts, or insect bites there?"),
        ("immune_risk", "Do you have diabetes or low immunity?"),
        ("non_healing", "Has this lesion persisted despite basic topical treatment?"),
        ("family_history_skin_cancer", "Any close family history of skin cancer or melanoma?"),
    ],
    "inflammatory": [
        ("trigger_products", "Did new soaps/cosmetics/detergents trigger this lesion?"),
        ("allergy_history", "Do you have eczema or allergy history?"),
        ("photosensitivity", "Does sunlight clearly worsen this lesion?"),
        ("night_itch", "Does itching worsen at night?"),
        ("non_healing", "Has this lesion persisted beyond 3 weeks without improvement?"),
        ("family_history_skin_cancer", "Any close family history of skin cancer or melanoma?"),
    ],
    "general": [
        ("non_healing", "Has this lesion not healed for over 3 weeks?"),
        ("new_vs_old_lesion", "Is this lesion new or different from your usual moles?"),
        ("severe_sunburn_history", "Have you had frequent severe sunburns?"),
        ("immunosuppression", "Are you immunosuppressed or on long-term immunosuppressants?"),
        ("previous_skin_cancer", "Have you had skin cancer in the past?"),
        ("family_history_skin_cancer", "Any close family history of skin cancer or melanoma?"),
    ],
}

BOOLEAN_CONTEXT_KEYS = (
    "itching",
    "bleeding",
    "rapid_growth",
    "pain",
    "scaling",
    "ring_shape",
    "spreading",
    "irregular_border",
    "multi_color",
    "family_history_skin_cancer",
    "previous_skin_cancer",
    "severe_sunburn_history",
    "immunosuppression",
    "non_healing",
    "new_vs_old_lesion",
    "contact_history",
    "pet_exposure",
    "sweating_occlusion",
    "steroid_cream_use",
    "immune_risk",
    "fever",
    "pus",
    "trigger_products",
    "allergy_history",
    "photosensitivity",
    "night_itch",
)

PRIMARY_CONCERNS = {"cancer", "fungal", "bacterial", "inflammatory", "unsure"}

TEXT_SIGNAL_KEYWORDS: dict[str, tuple[str, ...]] = {
    "itching": ("itch", "itchy", "pruritus"),
    "bleeding": ("bleeding", "blood", "oozing", "crusting"),
    "rapid_growth": ("rapid growth", "growing quickly", "changed rapidly", "enlarging quickly"),
    "pain": ("pain", "painful", "tender"),
    "scaling": ("scaly", "scaling", "flaky", "dry patch"),
    "ring_shape": ("ring-shaped", "ring shaped", "annular", "circular patch"),
    "spreading": ("spread", "spreading", "expanding"),
    "irregular_border": ("irregular border", "uneven border", "jagged edge"),
    "multi_color": ("multiple colors", "multiple shades", "variegated"),
    "family_history_skin_cancer": ("family history melanoma", "family history skin cancer", "relative had melanoma"),
    "previous_skin_cancer": ("previous skin cancer", "history of melanoma", "past melanoma"),
    "severe_sunburn_history": ("severe sunburn", "blistering sunburn"),
    "immunosuppression": ("immunosuppressed", "immunosuppressant", "long-term steroid"),
    "non_healing": ("not healing", "non-healing", "won't heal", "persistent sore"),
    "new_vs_old_lesion": ("new lesion", "new mole", "different from other moles", "ugly duckling"),
    "contact_history": ("close contact", "shared towel", "contact had similar rash"),
    "pet_exposure": ("pet", "animal", "cat", "dog"),
    "sweating_occlusion": ("sweating", "tight clothing", "occlusion"),
    "steroid_cream_use": ("steroid cream", "steroid ointment", "betamethasone", "clobetasol"),
    "immune_risk": ("diabetes", "low immunity", "immune weakness"),
    "fever": ("fever", "chills", "unwell"),
    "pus": ("pus", "yellow crust", "purulent"),
    "trigger_products": ("new soap", "new cosmetic", "new detergent"),
    "allergy_history": ("eczema", "allergy history", "atopy"),
    "photosensitivity": ("sunlight worsens", "photosensitive", "sun sensitive"),
    "night_itch": ("itching at night", "night itch"),
}

TEXT_CONCERN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "fungal": ("fungal", "ringworm", "tinea", "athlete's foot"),
    "bacterial": ("bacterial", "impetigo", "folliculitis"),
    "inflammatory": ("eczema", "dermatitis", "allergy rash", "rash"),
    "cancer": ("melanoma", "skin cancer", "suspicious mole"),
}

STRONG_SIGNAL_KEYS: dict[str, tuple[str, ...]] = {
    "oncologic": (
        "bleeding",
        "rapid_growth",
        "irregular_border",
        "multi_color",
        "non_healing",
        "new_vs_old_lesion",
        "previous_skin_cancer",
        "family_history_skin_cancer",
    ),
    "fungal": (
        "ring_shape",
        "scaling",
        "itching",
        "contact_history",
        "pet_exposure",
        "sweating_occlusion",
        "steroid_cream_use",
    ),
    "bacterial": ("pain", "fever", "pus"),
    "inflammatory": ("itching", "scaling", "photosensitivity", "trigger_products", "allergy_history", "night_itch"),
}


def clamp_score(score: float) -> float:
    return max(0.0, min(1.0, float(score)))


def _is_answered_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, set, tuple)):
        return len(value) > 0
    return True


def _coerce_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in {0, 1}:
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"yes", "y", "true", "present", "positive"}:
            return True
        if normalized in {"no", "n", "false", "absent", "negative"}:
            return False
    return None


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned.isdigit():
            return int(cleaned)
    return None


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _extract_context_text_signals(context_text: str) -> dict[str, bool]:
    normalized_text = _normalize_text(context_text)
    if not normalized_text:
        return {}

    signals: dict[str, bool] = {}
    for key, keywords in TEXT_SIGNAL_KEYWORDS.items():
        if any(keyword in normalized_text for keyword in keywords):
            signals[key] = True
    return signals


def _infer_primary_concern_from_text(context_text: str) -> str | None:
    normalized_text = _normalize_text(context_text)
    if not normalized_text:
        return None

    scores = {
        concern: sum(1 for keyword in keywords if keyword in normalized_text)
        for concern, keywords in TEXT_CONCERN_KEYWORDS.items()
    }
    top_concern = max(scores, key=scores.get)
    if scores[top_concern] <= 0:
        return None
    return top_concern


def derive_context_from_text(context: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(context, dict):
        return {}

    derived = dict(context)
    raw_text = derived.get("context_text")
    if not isinstance(raw_text, str) or not raw_text.strip():
        return derived

    inferred_concern = _infer_primary_concern_from_text(raw_text)
    if inferred_concern and "primary_concern" not in derived:
        derived["primary_concern"] = inferred_concern

    inferred_signals = _extract_context_text_signals(raw_text)
    for key, value in inferred_signals.items():
        if key not in derived:
            derived[key] = value

    return derived


def _infer_followup_key(raw_key: str) -> str | None:
    key = raw_key.strip().lower().replace("-", "_")
    if key in {
        "duration_days",
        "rapid_growth",
        "bleeding",
        "itching",
        "pain",
        "spreading",
        "ring_shape",
        "scaling",
        "irregular_border",
        "multi_color",
        "family_history_skin_cancer",
        "previous_skin_cancer",
        "severe_sunburn_history",
        "immunosuppression",
        "non_healing",
        "new_vs_old_lesion",
        "contact_history",
        "pet_exposure",
        "sweating_occlusion",
        "steroid_cream_use",
        "immune_risk",
        "fever",
        "pus",
        "trigger_products",
        "allergy_history",
        "photosensitivity",
        "night_itch",
    }:
        return key

    keyword_mapping = (
        ("duration_days", ("how many days", "how long")),
        ("rapid_growth", ("changed rapidly", "changed quickly", "changed in size", "changed shape")),
        ("bleeding", ("bleeding", "crusting", "oozing")),
        ("itching", ("itching",)),
        ("pain", ("pain", "tender")),
        ("spreading", ("spread", "spreading")),
        ("ring_shape", ("ring-shaped", "ring shaped")),
        ("scaling", ("scaling", "flaky")),
        ("irregular_border", ("irregular", "uneven")),
        ("multi_color", ("multiple colors", "multiple shades")),
        ("family_history_skin_cancer", ("family history", "skin cancer")),
        ("previous_skin_cancer", ("diagnosed", "skin cancer")),
        ("severe_sunburn_history", ("sunburn",)),
        ("immunosuppression", ("immunosuppressed", "steroid")),
        ("non_healing", ("failed to heal", "not healed", "persisted")),
        ("new_vs_old_lesion", ("different", "other moles", "usual moles")),
        ("contact_history", ("close contacts", "cuts", "bites", "trauma")),
        ("pet_exposure", ("pets", "animals")),
        ("sweating_occlusion", ("sweating", "tight clothing")),
        ("steroid_cream_use", ("steroid creams",)),
        ("immune_risk", ("diabetes", "low immunity", "immune weakness")),
        ("fever", ("fever", "chills")),
        ("pus", ("pus", "yellow crust")),
        ("trigger_products", ("soaps", "cosmetics", "detergents")),
        ("allergy_history", ("eczema", "allergy")),
        ("photosensitivity", ("sunlight",)),
        ("night_itch", ("night", "itch")),
    )
    for canonical_key, keywords in keyword_mapping:
        if any(fragment in key for fragment in keywords):
            return canonical_key
    return None


def normalize_followup_answers(raw_followup: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(raw_followup, dict):
        return {}

    normalized: dict[str, Any] = {}
    for raw_key, raw_value in raw_followup.items():
        canonical_key = _infer_followup_key(str(raw_key))
        if canonical_key is None:
            continue

        if canonical_key == "duration_days":
            parsed_int = _coerce_int(raw_value)
            if isinstance(parsed_int, int) and 0 <= parsed_int <= 36500:
                normalized[canonical_key] = parsed_int
            continue

        parsed_bool = _coerce_bool(raw_value)
        if parsed_bool is not None:
            normalized[canonical_key] = parsed_bool
            continue

        if isinstance(raw_value, str) and raw_value.strip():
            normalized[canonical_key] = raw_value.strip().lower()

    return normalized


def _label_bucket_and_weight(label: str) -> tuple[str, float]:
    if any(token in label for token in ("fung", "tinea", "ringworm")):
        return "fungal", 2.2
    if any(token in label for token in ("bacter", "impetigo", "follicul")):
        return "bacterial", 2.2
    if any(token in label for token in ("rash", "eczema", "dermatitis", "inflamm")):
        return "inflammatory", 2.0
    if any(token in label for token in ("melan", "cancer")):
        return "oncologic", 2.6
    if "suspicious" in label:
        return "oncologic", 1.3
    return "general", 0.7


def _signal_strength(context: dict[str, Any], bucket: str) -> int:
    keys = STRONG_SIGNAL_KEYS.get(bucket, ())
    return sum(1 for key in keys if context.get(key) is True)


def infer_condition_bucket(top_label: str | None, context: dict[str, Any] | None = None) -> str:
    enriched_context = derive_context_from_text(context)
    label = (top_label or "").strip().lower()
    label_bucket, label_weight = _label_bucket_and_weight(label)

    concern = enriched_context.get("primary_concern")
    concern_weight = 2.8

    bucket_scores = {
        "oncologic": 0.0,
        "fungal": 0.0,
        "bacterial": 0.0,
        "inflammatory": 0.0,
        "general": 0.0,
    }
    bucket_scores[label_bucket] += label_weight

    if concern in {"fungal", "bacterial", "inflammatory"}:
        bucket_scores[concern] += concern_weight
    elif concern == "cancer":
        bucket_scores["oncologic"] += concern_weight
    elif concern == "unsure":
        bucket_scores["general"] += 1.0

    for bucket in ("oncologic", "fungal", "bacterial", "inflammatory"):
        bucket_scores[bucket] += _signal_strength(enriched_context, bucket) * 0.95

    fungal_strength = _signal_strength(enriched_context, "fungal")
    oncologic_strength = _signal_strength(enriched_context, "oncologic")
    if (
        concern == "fungal"
        and fungal_strength >= 2
        and label_bucket == "oncologic"
        and label_weight <= 1.3
        and oncologic_strength <= 1
    ):
        return "fungal"

    return max(bucket_scores, key=bucket_scores.get)


def validate_context(raw_context: dict[str, Any] | None) -> dict[str, Any]:
    if raw_context is None:
        return {}
    if not isinstance(raw_context, dict):
        raise ValueError("context must be a JSON object")

    context: dict[str, Any] = {}
    for key in BOOLEAN_CONTEXT_KEYS:
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

    if "context_text" in raw_context:
        context_text = raw_context["context_text"]
        if not isinstance(context_text, str):
            raise ValueError("context_text must be a string")
        cleaned = context_text.strip()
        if len(cleaned) > 1500:
            raise ValueError("context_text must be at most 1500 characters")
        if cleaned:
            context["context_text"] = cleaned

    if "primary_concern" in raw_context:
        primary_concern = raw_context["primary_concern"]
        if not isinstance(primary_concern, str) or primary_concern not in PRIMARY_CONCERNS:
            raise ValueError(f"primary_concern must be one of {sorted(PRIMARY_CONCERNS)}")
        context["primary_concern"] = primary_concern

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


def apply_context_weighting(score: float, context: dict[str, Any], top_label: str | None = None) -> dict[str, Any]:
    context = derive_context_from_text(context)
    condition_bucket = infer_condition_bucket(top_label, context)
    adjustment = 0.0
    contributing_factors: list[str] = []

    age = context.get("age")
    if isinstance(age, int) and age >= 65 and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.05
        contributing_factors.append("Age >= 65 reported")

    duration_days = context.get("duration_days")
    if isinstance(duration_days, int) and duration_days <= 14:
        adjustment += 0.05 if condition_bucket in {"oncologic", "general"} else 0.03
        contributing_factors.append("Recent onset reported")

    if context.get("bleeding") is True:
        adjustment += 0.12 if condition_bucket in {"oncologic", "general"} else 0.08
        contributing_factors.append("Bleeding reported")
    if context.get("rapid_growth") is True:
        adjustment += 0.15 if condition_bucket in {"oncologic", "general"} else 0.07
        contributing_factors.append("Rapid growth reported")
    if context.get("pain") is True:
        adjustment += 0.05 if condition_bucket in {"oncologic", "general"} else 0.03
        contributing_factors.append("Pain reported")

    if context.get("itching") is True:
        if condition_bucket in {"fungal", "inflammatory"}:
            adjustment -= 0.03
            contributing_factors.append("Itching aligns with non-malignant inflammatory pattern")
        else:
            adjustment += 0.03
            contributing_factors.append("Itching reported")

    if context.get("scaling") is True:
        if condition_bucket in {"fungal", "inflammatory"}:
            adjustment -= 0.05
            contributing_factors.append("Scaling aligns with non-malignant pattern")
        else:
            adjustment += 0.02

    if context.get("ring_shape") is True:
        adjustment -= 0.06
        contributing_factors.append("Ring-shaped morphology aligns with fungal pattern")
    if context.get("spreading") is True:
        adjustment += 0.04
        contributing_factors.append("Reported lesion spread")
    if context.get("multi_color") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.06
        contributing_factors.append("Multiple colors reported")
    if context.get("irregular_border") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.06
        contributing_factors.append("Irregular border reported")
    if context.get("family_history_skin_cancer") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.1
        contributing_factors.append("Family history of skin cancer reported")
    if context.get("family_history_skin_cancer") is False and condition_bucket in {"oncologic", "general"}:
        adjustment -= 0.02

    if context.get("previous_skin_cancer") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.14
        contributing_factors.append("Previous skin cancer history reported")
    if context.get("severe_sunburn_history") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.05
        contributing_factors.append("Frequent severe sunburn history reported")
    if context.get("immunosuppression") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.09
        contributing_factors.append("Immunosuppression risk reported")
    if context.get("non_healing") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.1
        contributing_factors.append("Non-healing lesion behavior reported")
    if context.get("new_vs_old_lesion") is True and condition_bucket in {"oncologic", "general"}:
        adjustment += 0.08
        contributing_factors.append("Lesion is new/different from baseline moles")

    if condition_bucket == "fungal":
        if context.get("contact_history") is True:
            adjustment -= 0.03
        if context.get("pet_exposure") is True:
            adjustment -= 0.03
        if context.get("sweating_occlusion") is True:
            adjustment -= 0.02
        if context.get("steroid_cream_use") is True:
            adjustment -= 0.02

    if condition_bucket == "bacterial":
        if context.get("fever") is True:
            adjustment += 0.02
        if context.get("pus") is True:
            adjustment += 0.02

    if condition_bucket in {"fungal", "bacterial", "inflammatory"}:
        adjustment = max(-0.18, min(0.16, adjustment))
    else:
        adjustment = max(-0.12, min(0.24, adjustment))

    final_score = clamp_score(score + adjustment)
    if condition_bucket in {"fungal", "bacterial", "inflammatory"} and not (
        context.get("bleeding") and context.get("rapid_growth")
    ):
        final_score = min(final_score, 0.58)

    return {
        "score": final_score,
        "context_adjustment": round(adjustment, 3),
        "contributing_factors": contributing_factors,
        "condition_bucket": condition_bucket,
    }


def build_followup_questions(
    context: dict[str, Any],
    risk_score: float,
    top_label: str | None = None,
    followup_answers: dict[str, Any] | None = None,
) -> list[tuple[str, str]]:
    context = derive_context_from_text(context)
    condition_bucket = infer_condition_bucket(top_label, context)
    question_bank = FOLLOWUP_QUESTION_BANK.get(condition_bucket, FOLLOWUP_QUESTION_BANK["general"])
    risk_level = map_risk_level(risk_score)

    answered_keys = set(context.keys())
    if isinstance(followup_answers, dict):
        answered_keys.update(key for key, value in followup_answers.items() if _is_answered_value(value))

    high_priority_keys: set[str]
    medium_priority_keys: set[str]
    if condition_bucket == "oncologic":
        high_priority_keys = {
            "previous_skin_cancer",
            "family_history_skin_cancer",
            "non_healing",
            "new_vs_old_lesion",
            "immunosuppression",
        }
        medium_priority_keys = {"severe_sunburn_history"}
    elif condition_bucket == "fungal":
        high_priority_keys = {"contact_history", "pet_exposure", "sweating_occlusion", "steroid_cream_use", "immune_risk"}
        medium_priority_keys = {"non_healing", "family_history_skin_cancer"}
    elif condition_bucket == "bacterial":
        high_priority_keys = {"fever", "pus", "contact_history", "immune_risk"}
        medium_priority_keys = {"non_healing", "family_history_skin_cancer"}
    elif condition_bucket == "inflammatory":
        high_priority_keys = {"trigger_products", "allergy_history", "photosensitivity", "night_itch"}
        medium_priority_keys = {"non_healing", "family_history_skin_cancer"}
    else:
        high_priority_keys = {"non_healing", "new_vs_old_lesion", "family_history_skin_cancer"}
        medium_priority_keys = {"severe_sunburn_history", "immunosuppression"}

    scored_candidates: list[tuple[int, int, str, str]] = []
    for bank_index, (key, question) in enumerate(question_bank):
        if key in answered_keys:
            continue

        priority = 0
        if key in high_priority_keys:
            priority += 6 if risk_level == "high" else 4
        elif key in medium_priority_keys:
            priority += 4 if risk_level == "high" else 2
        else:
            priority += 2

        if key == "family_history_skin_cancer" and condition_bucket != "oncologic":
            priority += 1 if risk_level in {"high", "medium"} else -2
        if key == "non_healing" and risk_level == "high":
            priority += 2

        scored_candidates.append((priority, -bank_index, key, question))

    scored_candidates.sort(reverse=True)
    return [(key, question) for _, _, key, question in scored_candidates[:MAX_FOLLOWUP_QUESTIONS]]


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
    top_label: str | None = None,
) -> float:
    confidence = 0.9
    confidence -= min(0.25, spread * 0.6)
    if image_count == 1:
        confidence -= 0.05
    context = derive_context_from_text(context)
    condition_bucket = infer_condition_bucket(top_label, context)
    if condition_bucket == "oncologic":
        required_fields = (
            "duration_days",
            "rapid_growth",
            "bleeding",
            "irregular_border",
            "multi_color",
            "family_history_skin_cancer",
        )
    elif condition_bucket == "fungal":
        required_fields = ("duration_days", "itching", "scaling", "ring_shape")
    elif condition_bucket == "bacterial":
        required_fields = ("duration_days", "pain", "bleeding")
    else:
        required_fields = ("duration_days", "rapid_growth", "bleeding")

    missing_context_fields = sum(1 for key in required_fields if key not in context)
    confidence -= missing_context_fields * 0.04
    if has_model_explainability:
        confidence += 0.03
    return round(max(0.5, min(0.97, confidence)), 2)
