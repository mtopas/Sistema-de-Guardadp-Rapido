import json
import logging
from datetime import datetime, timedelta, timezone

from jarvis.db.database import get_connection
from jarvis.embeddings.client import generate_embedding
from jarvis.embeddings.store import upsert_embedding
from jarvis.llm.client import call_classify
from jarvis.memory.service import get_entry, update_entry
from jarvis.vault.writer import write_entry
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_RETRY_DELAYS = [60, 300, 1800]  # 1min, 5min, 30min


def process_entry(entry_id: str) -> None:
    """Procesa una entrada del inbox. No lanza excepciones al llamador."""
    try:
        MANIFEST.assert_allowed("update_entry_status")
        _set_status(entry_id, "PROCESSING")

        MANIFEST.assert_allowed("read_inbox")
        entry = get_entry(entry_id)
        if not entry:
            logger.error("[processor] entry_id=%s no encontrada en DB", entry_id)
            _mark_error(entry_id, "Entry not found in DB")
            return

        MANIFEST.assert_allowed("classify_entry")
        classification = _classify(entry["content_raw"])

        entry_type = classification.get("type", "RAW")
        if entry_type not in ("RAW", "SEMANTIC", "DECISION", "PROJECT"):
            entry_type = "RAW"

        title = (classification.get("title") or "").strip()[:60] or None
        tags = classification.get("tags") or []
        if not isinstance(tags, list):
            tags = []

        update_entry(
            entry_id,
            type=entry_type,
            content_processed=entry["content_raw"],
            tags=tags,
            extraction_confidence=0.8,
        )

        # Re-leer con tipo actualizado para el writer
        updated_entry = dict(entry)
        updated_entry["type"] = entry_type
        updated_entry["tags"] = json.dumps(tags)

        MANIFEST.assert_allowed("write_vault")
        vault_rel_path = write_entry(updated_entry, title=title)

        now = datetime.now(timezone.utc).isoformat()
        update_entry(entry_id, vault_path=vault_rel_path, processed_at=now)

        embed_text = updated_entry.get("content_processed") or updated_entry.get("content_raw") or ""

        MANIFEST.assert_allowed("generate_embedding")
        embedding = generate_embedding(embed_text)

        MANIFEST.assert_allowed("store_embedding")
        upsert_embedding(
            entry_id,
            embedding,
            document=embed_text,
            metadata={
                "type": entry_type,
                "source": entry.get("source") or "",
                "origin_trust": entry.get("origin_trust") or "",
                "local_only": bool(entry.get("local_only")),
                "confidential": bool(entry.get("confidential")),
                "vault_path": vault_rel_path,
            },
        )

        update_entry(entry_id, embedded_at=datetime.now(timezone.utc).isoformat())
        _set_status(entry_id, "DONE")

        logger.info(
            "[processor] DONE entry_id=%s type=%s vault=%s embedded=1",
            entry_id, entry_type, vault_rel_path,
        )

    except Exception as exc:
        logger.exception("[processor] ERROR en entry_id=%s: %s", entry_id, exc)
        _mark_error(entry_id, str(exc))


def _classify(content: str) -> dict:
    raw = call_classify(content)
    try:
        # Extraer bloque JSON si hay texto extra alrededor
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception as e:
        logger.warning("[processor] classify JSON inválido: %s | raw=%r", e, raw[:200])
    return {"type": "RAW", "title": content[:60], "tags": [], "project": None}


def _set_status(entry_id: str, status: str, last_error: str | None = None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        with conn:
            if status in ("PROCESSING", "DONE"):
                conn.execute(
                    "UPDATE inbox_queue SET status = ?, updated_at = ? WHERE entry_id = ?",
                    (status, now, entry_id),
                )
            elif status == "ERROR":
                row = conn.execute(
                    "SELECT attempts FROM inbox_queue WHERE entry_id = ?",
                    (entry_id,),
                ).fetchone()
                attempts = (row["attempts"] if row else 0) + 1
                idx = min(attempts - 1, len(_RETRY_DELAYS) - 1)
                delay = _RETRY_DELAYS[idx]
                next_retry = (
                    datetime.now(timezone.utc) + timedelta(seconds=delay)
                ).isoformat()
                final_status = "ERROR" if attempts >= 3 else "PENDING"
                conn.execute(
                    """UPDATE inbox_queue
                       SET status = ?, attempts = ?, last_error = ?,
                           next_retry_at = ?, updated_at = ?
                       WHERE entry_id = ?""",
                    (final_status, attempts, last_error, next_retry, now, entry_id),
                )
    finally:
        conn.close()


def _mark_error(entry_id: str, error: str) -> None:
    _set_status(entry_id, "ERROR", last_error=error)
