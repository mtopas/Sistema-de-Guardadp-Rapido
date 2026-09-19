import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_EDIT_ALLOWED_TYPES = {"RAW", "SEMANTIC", "DECISION", "PROJECT", "PEOPLE"}


def capture_raw(
    content: str,
    source: str,
    channel: str | None,
    source_id: str,
    origin_trust: str = "user.authenticated",
    local_only: bool = False,
    confidential: bool = False,
    user_id: str | None = None,
    created_by: str = "explicit",
    authorship: str = "user",
    pinned_type: str | None = None,
    pinned_subject_entity_id: str | None = None,
) -> str:
    """Inserta el contenido en memory_entries (tipo RAW) y encola en inbox_queue.

    El RAW se escribe en la DB antes de cualquier procesamiento.
    Si falla, el llamador debe notificar el error — no se confirma recepción sin escritura.

    created_by (pieza C, captura pasiva): 'explicit' (default, el usuario tipeó
    esto a propósito con /j, el botón Capturar, o la API) o
    'jarvis_proposal_accepted' (nació de una propuesta pasiva por inactividad
    que el usuario aceptó -- ver jarvis/captures/passive.py). No afecta
    origin_trust: esa columna describe la confiabilidad de la FUENTE del
    texto, no cómo se decidió guardarlo.

    authorship (fusión Jarvis + Bóveda, 2026-09-11): 'user' (default -- el
    texto es palabra del usuario, sea cual sea created_by/canal) o
    'jarvis_synthesis' (prosa que el LLM generó combinando fragmentos -- hoy
    solo jarvis/audit/service.py::_apply_create()). Determina a qué raíz de
    D:\\Boveda escribe write_entry(): ver jarvis/vault/writer.py.

    pinned_type / pinned_subject_entity_id (fix del 2026-09-19, ver
    Cerebro/decisiones-implementacion.md): cuando el llamador YA SABE con
    certeza el tipo final y/o la entidad de la que esta entrada es 'subject'
    (hoy solo audit/service.py::_apply_create() al resolver un hueco de
    entidad), jarvis.worker.processor.process_entry() los usa en vez de
    confiar en la clasificación/extracción genérica por LLM. None (default)
    para toda entrada que deba clasificarse normal.

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
                     origin_trust, user_id, created_at, created_by, authorship,
                     pinned_type, pinned_subject_entity_id)
                VALUES
                    (?, 'RAW', ?, ?, ?,
                     ?, ?, ?,
                     ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?)
                """,
                (
                    entry_id, content, source, channel,
                    1 if local_only else 0,
                    1 if confidential else 0,
                    content_hash,
                    now, now, source_id,
                    origin_trust, uid, now, created_by, authorship,
                    pinned_type, pinned_subject_entity_id,
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
    valid_to: str | None = None,
    confidence: float | None = None,
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
    if valid_to is not None:
        fields.append("valid_to = ?")
        values.append(valid_to)
    if confidence is not None:
        fields.append("confidence = ?")
        values.append(confidence)

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


def edit_entry(
    entry_id: str,
    content: str | None = None,
    type: str | None = None,
    tags: list[str] | None = None,
) -> dict | None:
    """Corrige una entrada ya guardada -- pieza B (no hay forma hoy de arreglar
    algo mal guardado sin tocar la DB a mano).

    Solo toca content_processed, nunca content_raw -- content_raw queda como el
    original inmutable tal cual se capturó (provenance), content_processed es lo
    que ya usan vault/embeddings/RAG/UI para mostrar y recuperar (ver
    `entry.get("content_processed") or entry.get("content_raw")` en todo el
    código). No se puede corregir origin_trust/created_by/source_id -- esos
    describen CÓMO llegó la entrada, no algo que un editor deba poder reescribir.

    Si cambia el contenido o el tipo, reescribe el .md del vault (el tipo
    determina la subcarpeta) y regenera el embedding -- llamada síncrona y
    bloqueante a propósito: es una acción de administración poco frecuente
    disparada por el usuario, no algo en el hot path del worker.

    Devuelve la entrada actualizada, o None si no existe o el tipo es inválido.
    """
    entry = get_entry(entry_id)
    if not entry:
        return None
    if type is not None and type not in _EDIT_ALLOWED_TYPES:
        return None
    if content is None and type is None and tags is None:
        return entry

    old_vault_path = entry.get("vault_path")
    content_or_type_changed = content is not None or type is not None

    update_entry(entry_id, type=type, content_processed=content, tags=tags)

    if tags is not None:
        from jarvis.tags.service import replace_tags_for_entry

        replace_tags_for_entry(entry_id, tags, entry.get("user_id") or JARVIS_DEFAULT_USER)

    updated = get_entry(entry_id)

    if content_or_type_changed:
        _resync_vault_and_embedding(updated, old_vault_path)
    elif tags is not None:
        _resync_vault_only(updated)

    return get_entry(entry_id)


def _resync_vault_and_embedding(entry: dict, old_vault_path: str | None) -> None:
    """Reescribe vault + embedding tras editar contenido/tipo. Best-effort:
    la corrección en SQLite (fuente de verdad) ya se aplicó antes de llamar
    esto -- si el vault o Chroma fallan acá, quedan desincronizados hasta el
    próximo ciclo de consolidación/edición, pero la corrección real no se pierde.
    """
    try:
        from jarvis.vault.writer import delete_entry_file, write_entry

        new_vault_path = write_entry(entry)
        if old_vault_path and old_vault_path != new_vault_path:
            delete_entry_file(old_vault_path)
        update_entry(entry["id"], vault_path=new_vault_path)

        from jarvis.vault.index_writer import sync_indexes_for_entry

        sync_indexes_for_entry(entry["id"])
    except Exception as exc:
        logger.warning("[jarvis.memory] Reescritura de vault falló para entry_id=%s: %s", entry["id"], exc)

    try:
        from jarvis.embeddings.client import generate_embedding
        from jarvis.embeddings.store import upsert_embedding

        embed_text = entry.get("content_processed") or entry.get("content_raw") or ""
        embedding = generate_embedding(embed_text)
        # vault_path NO va en el metadata de Chroma (addendum, 2026-09-11):
        # confirmado que nada lo lee de vuelta (ni retriever.py ni el router
        # de la API) -- era write-only y quedaba desincronizado en cuanto el
        # archivo se movía. memory_entries.vault_path (SQL) sigue siendo el
        # puntero real, se actualiza dos líneas más abajo.
        upsert_embedding(
            entry["id"],
            embedding,
            document=embed_text,
            metadata={
                "type": entry.get("type") or "",
                "source": entry.get("source") or "",
                "origin_trust": entry.get("origin_trust") or "",
                "local_only": bool(entry.get("local_only")),
                "confidential": bool(entry.get("confidential")),
            },
        )
        update_entry(entry["id"], embedded_at=datetime.now(timezone.utc).isoformat())
    except Exception as exc:
        logger.warning("[jarvis.memory] Regeneración de embedding falló para entry_id=%s: %s", entry["id"], exc)


def _resync_vault_only(entry: dict) -> None:
    """Solo tags cambiaron -- el frontmatter del .md los incluye, así que se
    reescribe el archivo (mismo vault_path, no hay rename), pero no hace falta
    tocar el embedding (no depende de tags)."""
    try:
        from jarvis.vault.writer import write_entry

        write_entry(entry)
    except Exception as exc:
        logger.warning("[jarvis.memory] Reescritura de vault (solo tags) falló para entry_id=%s: %s", entry["id"], exc)


def forget_entry(entry_id: str) -> bool:
    """"Olvidar" una entrada -- soft-delete vía valid_to (nunca un DELETE
    físico de la fila -- preserva auditoría, spec: Memoria != destrucción).

    Fusión Jarvis + Bóveda (2026-09-11): a diferencia de una entrada
    marcada superseded por consolidation.py (juicio algorítmico, gateado
    detrás de una propuesta de auditoría antes de tocar el archivo --
    ver jarvis/audit/service.py, action_type='archive_superseded'), acá
    la confirmación humana YA EXISTIÓ -- el usuario pidió explícitamente
    "olvidar"/"borrar" (incluida la acción `delete` de auditoría ya
    aceptada, que llama esta misma función). Por eso el archivo SÍ se
    mueve acá, sin pasar por una propuesta nueva: a `05 - Basura/` si es
    contenido del usuario (authorship='user', vive en el árbol PARA), o se
    borra directo si es síntesis de Jarvis (authorship='jarvis_synthesis',
    vive en Boveda/Jarvis/ -- no es "tu contenido" para conservar en una
    papelera, es reconstruible).

    El embedding en Chroma se deja intacto a propósito (mismo criterio de
    siempre): _load_entries() lo descarta por el filtro de valid_to antes de
    rankear, así que nunca puede reaparecer en una respuesta -- borrar el
    vector físicamente no cambia el comportamiento observable, solo complica
    revertir un "olvidar" hecho por error.

    Devuelve False si la entrada no existe o ya estaba olvidada/superseded.
    """
    entry = get_entry(entry_id)
    if not entry or entry.get("valid_to"):
        return False
    update_entry(entry_id, valid_to=datetime.now(timezone.utc).isoformat())

    vault_path = entry.get("vault_path")
    if vault_path:
        try:
            if entry.get("authorship") == "jarvis_synthesis":
                from jarvis.vault.writer import delete_entry_file

                delete_entry_file(vault_path)
            else:
                from jarvis.vault.writer import move_entry_file

                new_path = move_entry_file(vault_path, "05 - Basura")
                if new_path:
                    update_entry(entry_id, vault_path=new_path)
        except Exception as exc:
            logger.warning(
                "[jarvis.memory] Mover/borrar archivo tras olvidar entry_id=%s falló: %s",
                entry_id, exc,
            )

    try:
        from jarvis.vault.index_writer import sync_indexes_for_entry

        sync_indexes_for_entry(entry_id)
    except Exception as exc:
        logger.warning(
            "[jarvis.memory] Sync de notas canónicas tras olvidar entry_id=%s falló: %s",
            entry_id, exc,
        )

    return True
