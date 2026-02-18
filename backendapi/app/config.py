import os
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Derma Vision API")
    APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")
    API_KEY: str | None = os.getenv("API_KEY")
    CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
        ).split(",")
        if origin.strip()
    ]

    MAX_IMAGE_BYTES: int = int(os.getenv("MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))
    INFERENCE_TIMEOUT_SECONDS: float = float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "10"))
    MAX_IMAGE_COUNT: int = int(os.getenv("MAX_IMAGE_COUNT", "4"))
    MIN_IMAGE_WIDTH: int = int(os.getenv("MIN_IMAGE_WIDTH", "224"))
    MIN_IMAGE_HEIGHT: int = int(os.getenv("MIN_IMAGE_HEIGHT", "224"))
    MAX_IMAGE_DIMENSION: int = int(os.getenv("MAX_IMAGE_DIMENSION", "4096"))
    MIN_BRIGHTNESS_MEAN: float = float(os.getenv("MIN_BRIGHTNESS_MEAN", "12"))
    MAX_BRIGHTNESS_MEAN: float = float(os.getenv("MAX_BRIGHTNESS_MEAN", "245"))
    MIN_EDGE_INTENSITY: float = float(os.getenv("MIN_EDGE_INTENSITY", "6.0"))
    MAX_SCORE_DISAGREEMENT: float = float(os.getenv("MAX_SCORE_DISAGREEMENT", "0.35"))

    MODEL_MODULE: str = os.getenv("MODEL_MODULE", "app.ai_model_adapter")
    MODEL_CALLABLE: str = os.getenv("MODEL_CALLABLE", "predict_image_bytes")
    MODEL_VERSION: str = os.getenv("MODEL_VERSION", "demo-v1")

    SUPABASE_URL: str | None = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_TABLE: str = os.getenv("SUPABASE_TABLE", "scan_results")
    ENABLE_SCAN_HISTORY: bool = os.getenv("ENABLE_SCAN_HISTORY", "true").lower() == "true"


@lru_cache
def get_settings() -> Settings:
    return Settings()
