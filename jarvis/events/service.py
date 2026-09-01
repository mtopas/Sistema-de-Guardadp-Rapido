"""
Log de eventos del worker (Fase B5) — alimenta el log real del tab Debug.

Best-effort: log_event() nunca lanza, mismo patrón que
jarvis/projects/service.py::link_project_for_entry() — el worker no puede fallar
su procesamiento normal porque el log de eventos tuvo un problema.
"""
import logging
import uuid
from datetime import datetime, timezone

from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)


def log_event(level: str, message: str, entry_id: str | None = None) -> None:
    """Registra un evento. Nunca lanza."""
    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    """INSERT INTO jarvis_event_log (id, entry_id, level, message, created_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        str(uuid.uuid4()), entry_id, level, message,
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("[jarvis.events] log_event falló (level=%s): %s", level, exc)


def list_recent_events(limit: int = 20) -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, entry_id, level, message, created_at
               FROM jarvis_event_log
               ORDER BY created_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
