from __future__ import annotations

import hashlib


def predict_image_bytes(image_bytes: bytes) -> dict:
    # Deterministic fallback model for demo stability.
    digest = hashlib.sha256(image_bytes).hexdigest()
    raw = int(digest[:8], 16) / 0xFFFFFFFF
    score = round(float(raw), 4)
    label = "suspicious_lesion" if score >= 0.75 else "benign_like"
    return {"risk_score": score, "top_label": label}
