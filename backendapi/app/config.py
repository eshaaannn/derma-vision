import os
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Derma Vision API")
    APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")
    API_KEY: str | None = os.getenv("API_KEY")

    MAX_IMAGE_BYTES: int = int(os.getenv("MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))
    INFERENCE_TIMEOUT_SECONDS: float = float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "10"))

    MODEL_MODULE: str = os.getenv("MODEL_MODULE", "app.sample_model")
    MODEL_CALLABLE: str = os.getenv("MODEL_CALLABLE", "predict_image_bytes")
    MODEL_VERSION: str = os.getenv("MODEL_VERSION", "demo-v1")

    SUPABASE_URL: str | None = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_TABLE: str = os.getenv("SUPABASE_TABLE", "scan_results")
    ENABLE_SCAN_HISTORY: bool = os.getenv("ENABLE_SCAN_HISTORY", "true").lower() == "true"


@lru_cache
def get_settings() -> Settings:
    return Settings()
