import json
import logging
from datetime import datetime, timedelta, timezone

from jarvis.config import JARVIS_DEFAULT_USER, JARVIS_LOCAL_MODEL, JARVIS_RETRY_DELAYS_SECONDS
from jarvis.db.database import get_connection
from jarvis.debug.service import notify_debug_processed
from jarvis.embeddings.client import generate_embedding
from jarvis.embeddings.store import upsert_embedding
from jarvis.entities.service import extract_entities, link_entities_for_entry
from jarvis.events.service import log_event
from jarvis.llm.client import call_classify
from jarvis.memory.service import get_entry, update_entry
from jarvis.notify.telegram import notify_telegram_done
from jarvis.projects.service import link_project_for_entry
from jarvis.tags.service import link_tags_for_entry, list_tag_catalog
from jarvis.vault.writer import write_entry
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_RETRY_DELAYS = JARVIS_RETRY_DELAYS_SECONDS  # 1min, 5min, 30min (default)


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
        tag_catalog = list_tag_catalog(entry.get("user_id") or JARVIS_DEFAULT_USER)
        classification = _classify(entry["content_raw"], tag_catalog)

        entry_type = classification.get("type", "RAW")
        if entry_type not in ("RAW", "SEMANTIC", "DECISION", "PROJECT", "PEOPLE"):
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
        log_event("CLASSIFY", f"{entry_id[:8]} → {entry_type}", entry_id)

        try:
            MANIFEST.assert_allowed("link_tags")
            link_tags_for_entry(entry_id, tags, entry.get("user_id") or JARVIS_DEFAULT_USER)
        except Exception as exc:
            logger.warning(
                "[processor] Vinculación de tags falló para entry_id=%s: %s", entry_id, exc,
            )

        extracted: list[dict] = []
        try:
            MANIFEST.assert_allowed("extract_entities")
            extracted = extract_entities(entry["content_raw"])
            if extracted:
                MANIFEST.assert_allowed("link_entities")
                link_entities_for_entry(
                    entry_id, extracted, entry_type, entry.get("user_id") or JARVIS_DEFAULT_USER
                )
                log_event("ENTITY", "extraídas: " + ", ".join(e["name"] for e in extracted), entry_id)
        except Exception as exc:
            logger.warning(
                "[processor] Extracción/vinculación de entidades falló para entry_id=%s: %s",
                entry_id, exc,
            )

        try:
            MANIFEST.assert_allowed("link_project")
            project_name = classification.get("project")
            link_project_for_entry(entry_id, project_name)
            if project_name:
                log_event("LINK", f"vinculada a proyecto '{project_name}'", entry_id)
        except Exception as exc:
            logger.warning(
                "[processor] Vinculación de proyecto falló para entry_id=%s: %s",
                entry_id, exc,
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
        log_event("EMBED", "embedding generado y guardado en Chroma", entry_id)
        _set_status(entry_id, "DONE")

        logger.info(
            "[processor] DONE entry_id=%s type=%s vault=%s embedded=1",
            entry_id, entry_type, vault_rel_path,
        )

        if entry.get("source") == "telegram" and entry.get("channel"):
            try:
                MANIFEST.assert_allowed("notify_telegram")
                notify_telegram_done(
                    entry["channel"],
                    f"✅ Listo — guardado como *{entry_type}*.\n_ID: `{entry_id[:8]}`_",
                )
            except Exception as exc:
                logger.warning(
                    "[processor] Aviso de listo a Telegram falló para entry_id=%s: %s",
                    entry_id, exc,
                )

        # Modo debug: no bloquea el flujo si falla -- notify_debug_processed()
        # atrapa sus propias excepciones, y este try/except es una segunda capa
        # (mismo patrón "belt and suspenders" que la extracción de entidades arriba).
        try:
            MANIFEST.assert_allowed("notify_telegram")
            notify_debug_processed(
                entry,
                entry_type=entry_type,
                confidence=0.8,  # extraction_confidence usado en update_entry() arriba
                entities=extracted,
                model_used=JARVIS_LOCAL_MODEL,
            )
        except Exception as exc:
            logger.warning(
                "[processor] Notificación de debug falló para entry_id=%s: %s",
                entry_id, exc,
            )

    except Exception as exc:
        logger.exception("[processor] ERROR en entry_id=%s: %s", entry_id, exc)
        log_event("ERROR", str(exc)[:200], entry_id)
        _mark_error(entry_id, str(exc))


def _classify(content: str, tag_catalog: list[str] | None = None) -> dict:
    raw = call_classify(content, tag_catalog)
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
