import hashlib
import json
import uuid
from datetime import datetime, timezone

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection


def capture_raw(
    content: str,
    source: str,
    channel: str | None,
    source_id: str,
    origin_trust: str = "user.authenticated",
    local_only: bool = False,
    confidential: bool = False,
    user_id: str | None = None,
) -> str:
    """Inserta el contenido en memory_entries (tipo RAW) y encola en inbox_queue.

    El RAW se escribe en la DB antes de cualquier procesamiento.
    Si falla, el llamador debe notificar el error — no se confirma recepción sin escritura.

    Devuelve el entry_id generado.
    """
    entry_id = str(uuid.uuid4())
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    uid = user_id or JARVIS_DEFAULT_USER

    conn = get_connection()
    try:
        with conn:
            # Verificar duplicado por hash (mismo user, mismo contenido)
            existing = conn.execute(
                "SELECT id FROM memory_entries WHERE content_hash = ? AND user_id = ?",
                (content_hash, uid),
            ).fetchone()
            if existing:
                return existing["id"]

            conn.execute(
                """
                INSERT INTO memory_entries
                    (id, type, content_raw, source, channel,
                     local_only, confidential, content_hash,
                     recorded_at, valid_from, source_id,
                     origin_trust, user_id, created_at)
                VALUES
                    (?, 'RAW', ?, ?, ?,
                     ?, ?, ?,
                     ?, ?, ?,
                     ?, ?, ?)
                """,
                (
                    entry_id, content, source, channel,
                    1 if local_only else 0,
                    1 if confidential else 0,
                    content_hash,
                    now, now, source_id,
                    origin_trust, uid, now,
                ),
            )
            conn.execute(
                "INSERT INTO inbox_queue (entry_id, status, updated_at) VALUES (?, 'PENDING', ?)",
                (entry_id, now),
            )
    finally:
        conn.close()

    return entry_id


def get_entry(entry_id: str) -> dict | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM memory_entries WHERE id = ?", (entry_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_entry(
    entry_id: str,
    type: str | None = None,
    content_processed: str | None = None,
    tags: list[str] | None = None,
    extraction_confidence: float | None = None,
    vault_path: str | None = None,
    processed_at: str | None = None,
    embedded_at: str | None = None,
) -> None:
    fields: list[str] = []
    values: list = []

    if type is not None:
        fields.append("type = ?")
        values.append(type)
    if content_processed is not None:
        fields.append("content_processed = ?")
        values.append(content_processed)
    if tags is not None:
        fields.append("tags = ?")
        values.append(json.dumps(tags, ensure_ascii=False))
    if extraction_confidence is not None:
        fields.append("extraction_confidence = ?")
        values.append(extraction_confidence)
    if vault_path is not None:
        fields.append("vault_path = ?")
        values.append(vault_path)
    if processed_at is not None:
        fields.append("processed_at = ?")
        values.append(processed_at)
    if embedded_at is not None:
        fields.append("embedded_at = ?")
        values.append(embedded_at)

    if not fields:
        return

    values.append(entry_id)
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                f"UPDATE memory_entries SET {', '.join(fields)} WHERE id = ?",
                values,
            )
    finally:
        conn.close()
