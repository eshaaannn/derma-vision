from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


@dataclass
class ScreeningSession:
    session_id: str
    created_at: datetime
    description: str
    images: list[dict[str, Any]]
    analysis: dict[str, Any] | None = None
    text_signals: dict[str, Any] | None = None
    questions: list[dict[str, Any]] = field(default_factory=list)
    answers: dict[str, bool] = field(default_factory=dict)
    result: dict[str, Any] | None = None
    risk_details: dict[str, Any] | None = None
    scan_id: str | None = None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, ScreeningSession] = {}

    def create_session(self, description: str, images: list[dict[str, Any]]) -> ScreeningSession:
        session = ScreeningSession(
            session_id=str(uuid4()),
            created_at=datetime.now(timezone.utc),
            description=description,
            images=images,
        )
        self._sessions[session.session_id] = session
        return session

    def get_session(self, session_id: str) -> ScreeningSession | None:
        return self._sessions.get(session_id)
