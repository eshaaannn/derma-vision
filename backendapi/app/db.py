from __future__ import annotations

from typing import Any

try:
    from supabase import Client, create_client
except Exception:  # pragma: no cover - optional dependency for demo mode
    Client = Any  # type: ignore[assignment]
    create_client = None

from .config import get_settings


class SupabaseService:
    def __init__(self) -> None:
        self.client: Client | None = None
        self._status = "not_configured"

    @property
    def status(self) -> str:
        return self._status

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def connect(self) -> None:
        settings = get_settings()
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            self.client = None
            self._status = "not_configured"
            return
        if create_client is None:
            self.client = None
            self._status = "failed"
            return

        try:
            self.client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
            # Verify project/table access during startup for reliable health checks.
            self.client.table(settings.SUPABASE_TABLE).select("id").limit(1).execute()
            self._status = "connected"
        except Exception:
            self.client = None
            self._status = "failed"

    def insert_scan(self, payload: dict[str, Any]) -> str | None:
        if not self.client:
            return None
        settings = get_settings()

        try:
            row = self.client.table(settings.SUPABASE_TABLE).insert(payload).execute()
            data = row.data or []
            if not data:
                return None
            return data[0].get("id")
        except Exception:
            self._status = "failed"
            raise

    def fetch_scans(
        self,
        patient_ref: str | None,
        limit: int,
        user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if not self.client:
            return []

        settings = get_settings()
        try:
            query = (
                self.client.table(settings.SUPABASE_TABLE)
                .select(
                    "id,created_at,user_id,patient_ref,risk_level,risk_score,top_label,model_version,status,metadata"
                )
                .order("created_at", desc=True)
                .limit(limit)
            )

            if user_id:
                query = query.eq("user_id", user_id)
            if patient_ref:
                query = query.eq("patient_ref", patient_ref)

            result = query.execute()
            return result.data or []
        except Exception:
            self._status = "failed"
            raise
