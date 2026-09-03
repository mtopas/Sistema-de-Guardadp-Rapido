"""
Catálogo de tags (Jarvis 0.2, Slice 4 — pieza A).

Hasta ahora memory_entries.tags se llenaba en cada captura (prompt del
clasificador en jarvis/llm/client.py) pero nunca se leía de vuelta en ningún
lado -- cada entrada inventaba sus propios tags sueltos, sin canonizar. Este
módulo agrega un catálogo real (memory_tags + memory_entry_tags, mismo patrón
de tabla canónica + tabla puente que memory_entities/memory_entry_entities) y
hace que el clasificador elija del catálogo existente en vez de inventar
siempre -- ver list_tag_catalog() + el prompt en jarvis/llm/client.py.

Dedup: exacto case-insensitive contra memory_tags.name, sin la fusión difusa
por prefijo de tokens que usa _find_or_create_entity() para nombres de
persona (“Martín” / “Martín López”) -- un tag es una keyword suelta, no un
nombre propio con variantes; el criterio conservador equivalente acá es que
el propio clasificador ve el catálogo completo en el prompt y elige de ahí
semánticamente, así que la capa de DB solo necesita evitar duplicados por
mayúsculas/espacios, no adivinar sinónimos.
"""
import logging
import uuid
from datetime import datetime, timezone

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

# Tope de tags mostrados al clasificador en el prompt -- evita que el catálogo
# crezca sin límite dentro del prompt (costo de tokens) a medida que se
# acumulan cientos de tags. Los más usados primero: son los que más vale la
# pena reutilizar en vez de fragmentar en variantes nuevas.
_CATALOG_PROMPT_LIMIT = 60


def list_tag_catalog(user_id: str = JARVIS_DEFAULT_USER, limit: int = _CATALOG_PROMPT_LIMIT) -> list[str]:
    """Nombres canónicos de tags existentes, ordenados por uso (más usados primero).

    Pensado para interpolarse en el prompt del clasificador -- nunca lanza,
    [] si la DB falla por cualquier motivo (el clasificador simplemente
    inventa tags libres en ese caso, igual que antes de esta pieza).
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT t.name, COUNT(met.entry_id) AS n
               FROM memory_tags t
               LEFT JOIN memory_entry_tags met ON met.tag_id = t.tag_id
               WHERE t.user_id = ?
               GROUP BY t.tag_id
               ORDER BY n DESC, t.last_seen DESC
               LIMIT ?""",
            (user_id, limit),
        ).fetchall()
        return [r["name"] for r in rows]
    except Exception as exc:
        logger.warning("[jarvis.tags] list_tag_catalog falló: %s", exc)
        return []
    finally:
        conn.close()


def link_tags_for_entry(entry_id: str, tag_names: list[str], user_id: str = JARVIS_DEFAULT_USER) -> None:
    """Vincula (creando en el catálogo si hace falta) los tags de una entrada.

    Best-effort -- mismo patrón que jarvis/entities/service.py: nunca lanza,
    el call site en processor.py lo envuelve en su propio try/except además.
    """
    names = _clean_names(tag_names)
    if not names:
        return
    try:
        now = datetime.now(timezone.utc).isoformat()
        for name in names:
            tag_id = _find_or_create_tag(name, user_id, now)
            _link_entry_tag(entry_id, tag_id)
    except Exception as exc:
        logger.warning("[jarvis.tags] Vinculación falló para entry_id=%s: %s", entry_id, exc)


def _clean_names(tag_names: list[str]) -> list[str]:
    seen = set()
    cleaned = []
    for raw in tag_names or []:
        name = (raw or "").strip().lower()
        if name and name not in seen:
            seen.add(name)
            cleaned.append(name)
    return cleaned


def _find_or_create_tag(name: str, user_id: str, now: str) -> str:
    conn = get_connection()
    try:
        with conn:
            row = conn.execute(
                "SELECT tag_id FROM memory_tags WHERE user_id = ? AND LOWER(name) = LOWER(?)",
                (user_id, name),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE memory_tags SET last_seen = ? WHERE tag_id = ?", (now, row["tag_id"])
                )
                return row["tag_id"]

            tag_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO memory_tags (tag_id, name, user_id, first_seen, last_seen)
                   VALUES (?, ?, ?, ?, ?)""",
                (tag_id, name, user_id, now, now),
            )
            return tag_id
    finally:
        conn.close()


def _link_entry_tag(entry_id: str, tag_id: str) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "INSERT OR IGNORE INTO memory_entry_tags (entry_id, tag_id) VALUES (?, ?)",
                (entry_id, tag_id),
            )
    finally:
        conn.close()


def replace_tags_for_entry(entry_id: str, tag_names: list[str], user_id: str = JARVIS_DEFAULT_USER) -> None:
    """Reemplaza por completo los tags de una entrada -- usado al editar (pieza B).

    A diferencia de link_tags_for_entry() (que solo agrega), esto primero
    desvincula los tags actuales de la entrada -- un tag_id que se queda sin
    ninguna entrada vinculada se deja en memory_tags igual (no se borra el
    catálogo por eso: puede volver a usarse en otra clasificación futura).
    Best-effort, nunca lanza.
    """
    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute("DELETE FROM memory_entry_tags WHERE entry_id = ?", (entry_id,))
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("[jarvis.tags] No se pudo desvincular tags viejos de entry_id=%s: %s", entry_id, exc)
    link_tags_for_entry(entry_id, tag_names, user_id)


def list_tags_with_counts(user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Catálogo completo con conteo de entradas vigentes -- para la API / browse (pieza F)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT t.tag_id, t.name, t.last_seen,
                      COUNT(DISTINCT CASE WHEN me.valid_to IS NULL THEN me.id END) AS memory_count
               FROM memory_tags t
               LEFT JOIN memory_entry_tags met ON met.tag_id = t.tag_id
               LEFT JOIN memory_entries me ON me.id = met.entry_id
               WHERE t.user_id = ?
               GROUP BY t.tag_id
               ORDER BY memory_count DESC, t.last_seen DESC""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_entries_for_tag(name: str, user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Entradas vigentes con este tag (nombre exacto, case-insensitive). [] si no existe."""
    conn = get_connection()
    try:
        tag_row = conn.execute(
            "SELECT tag_id FROM memory_tags WHERE user_id = ? AND LOWER(name) = LOWER(?)",
            (user_id, name),
        ).fetchone()
        if not tag_row:
            return []
        rows = conn.execute(
            """SELECT me.* FROM memory_entries me
               JOIN memory_entry_tags met ON met.entry_id = me.id
               WHERE met.tag_id = ? AND me.user_id = ? AND me.valid_to IS NULL
               ORDER BY me.recorded_at DESC""",
            (tag_row["tag_id"], user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_tags_for_entry(entry_id: str) -> list[str]:
    """Nombres de tags vinculados a una entrada. Compartido por jarvis/audit/
    service.py (bloques de auditoría) y jarvis/worker/consolidation.py
    (reporte diario de Telegram, ver Cerebro/decisiones-implementacion.md
    2026-09-03) -- antes vivía duplicado como `_current_tag_names()` privado
    en audit/service.py.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT mt.name FROM memory_entry_tags met
               JOIN memory_tags mt ON mt.tag_id = met.tag_id
               WHERE met.entry_id = ?""",
            (entry_id,),
        ).fetchall()
        return [r["name"] for r in rows]
    finally:
        conn.close()


def entry_ids_without_catalog_tags(user_id: str = JARVIS_DEFAULT_USER, limit: int = 20) -> list[dict]:
    """Entradas vigentes que nunca pasaron por el clasificador con catálogo
    (sin ninguna fila en memory_entry_tags) -- usado por el backfill de
    consolidation.py (pieza D). Las más viejas primero (las que más tiempo
    llevan sin tags canónicos).
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT me.id, me.content_raw, me.content_processed
               FROM memory_entries me
               LEFT JOIN memory_entry_tags met ON met.entry_id = me.id
               WHERE me.user_id = ? AND me.valid_to IS NULL AND met.entry_id IS NULL
               ORDER BY me.recorded_at ASC
               LIMIT ?""",
            (user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
