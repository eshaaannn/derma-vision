from __future__ import annotations

import asyncio
import importlib
from dataclasses import dataclass
from typing import Any, Callable

from .config import get_settings


@dataclass
class Prediction:
    risk_score: float
    top_label: str
    explainability: dict[str, Any] | None = None
    model_confidence: float | None = None


class ModelService:
    def __init__(self) -> None:
        self._loaded = False
        self._predict_callable: Callable[[bytes], dict[str, Any]] | None = None

    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        settings = get_settings()
        module = importlib.import_module(settings.MODEL_MODULE)
        callable_obj = getattr(module, settings.MODEL_CALLABLE)
        if not callable(callable_obj):
            raise RuntimeError("Configured model callable is not callable")

        self._predict_callable = callable_obj
        self._loaded = True

    async def predict(self, image_bytes: bytes) -> Prediction:
        settings = get_settings()
        if not self._predict_callable:
            raise RuntimeError("Model not loaded")

        loop = asyncio.get_running_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, self._predict_callable, image_bytes),
            timeout=settings.INFERENCE_TIMEOUT_SECONDS,
        )
        risk_score = max(0.0, min(1.0, float(result["risk_score"])))
        top_label = str(result.get("top_label", "unknown"))
        explainability = result.get("explainability")
        if explainability is not None and not isinstance(explainability, dict):
            explainability = {"raw": explainability}
        confidence_raw = result.get("model_confidence", result.get("confidence"))
        try:
            model_confidence = float(confidence_raw) if confidence_raw is not None else None
        except (TypeError, ValueError):
            model_confidence = None
        if model_confidence is not None:
            model_confidence = max(0.0, min(1.0, model_confidence))
        return Prediction(
            risk_score=risk_score,
            top_label=top_label,
            explainability=explainability,
            model_confidence=model_confidence,
        )


def map_risk_level(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"
