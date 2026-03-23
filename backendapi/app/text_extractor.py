from __future__ import annotations

import re
from typing import Any

_SYMPTOM_KEYWORDS: dict[str, tuple[str, ...]] = {
    "itching": ("itch", "itchy", "pruritus"),
    "pain": ("pain", "painful", "tender", "sore", "burning"),
    "bleeding": ("bleed", "bleeding", "blood", "ooze", "oozing"),
    "growth": ("growth", "growing", "bigger", "enlarging", "changed in size"),
    "spreading": ("spread", "spreading", "expanding"),
    "pus": ("pus", "discharge", "yellow crust", "draining"),
    "fever": ("fever", "weakness", "chills", "unwell"),
}

_DURATION_PATTERN = re.compile(r"(\d+)\s*(day|days|week|weeks|month|months|year|years)")


def _normalize_text(description: str) -> str:
    return re.sub(r"\s+", " ", description.strip().lower())


def _extract_duration_days(normalized_text: str) -> int | None:
    match = _DURATION_PATTERN.search(normalized_text)
    if not match:
        return None

    value = int(match.group(1))
    unit = match.group(2)
    if unit.startswith("day"):
        return value
    if unit.startswith("week"):
        return value * 7
    if unit.startswith("month"):
        return value * 30
    return value * 365


def _extract_duration_bucket(normalized_text: str, duration_days: int | None) -> str:
    if duration_days is not None:
        return "short" if duration_days <= 14 else "long"
    if any(fragment in normalized_text for fragment in ("recent", "few days", "started this week", "new")):
        return "short"
    if any(fragment in normalized_text for fragment in ("weeks", "months", "long time", "for a while", "persistent")):
        return "long"
    return "unknown"


def _extract_symptoms(normalized_text: str) -> dict[str, bool]:
    return {
        key: any(fragment in normalized_text for fragment in fragments)
        for key, fragments in _SYMPTOM_KEYWORDS.items()
    }


def _extract_severity(normalized_text: str, symptoms: dict[str, bool]) -> str:
    if any(fragment in normalized_text for fragment in ("severe", "very painful", "extreme", "intense", "rapidly")):
        return "severe"
    if symptoms["bleeding"] or symptoms["pus"] or symptoms["fever"]:
        return "severe"
    if any(fragment in normalized_text for fragment in ("moderate", "worsening", "annoying")):
        return "moderate"
    if any(fragment in normalized_text for fragment in ("mild", "slight", "small")):
        return "mild"
    if any(symptoms.values()):
        return "moderate"
    return "unknown"


def _extract_progression(normalized_text: str, symptoms: dict[str, bool]) -> str:
    if any(fragment in normalized_text for fragment in ("stable", "unchanged", "same size", "not changing")):
        return "stable"
    if symptoms["spreading"] or "spreading" in normalized_text:
        return "spreading"
    if symptoms["growth"] or any(fragment in normalized_text for fragment in ("increasing", "worsening", "getting bigger")):
        return "increasing"
    return "unknown"


def extract_text_signals(description: str) -> dict[str, Any]:
    cleaned = description.strip()
    normalized = _normalize_text(cleaned)
    duration_days = _extract_duration_days(normalized)
    symptoms = _extract_symptoms(normalized)

    return {
        "description": cleaned,
        "duration": _extract_duration_bucket(normalized, duration_days),
        "duration_days": duration_days,
        "symptoms": symptoms,
        "severity": _extract_severity(normalized, symptoms),
        "progression": _extract_progression(normalized, symptoms),
    }
