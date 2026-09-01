"""
Navegación/filtro de memoria sin pasar por el chat (Jarvis 0.2 Slice 4 —
pieza F). Equivalente a como Bóveda tiene su árbol de categorías en
LeftPanel: hoy no hay forma de ver "toda la memoria" filtrada por
tipo/tag/fecha/proyecto, solo lo que trae una consulta RAG puntual.

Depende de la pieza A (catálogo de tags) para el filtro por tag, y se
beneficia de la pieza E (búsqueda léxica) para el filtro de texto libre --
reusa jarvis.retriever.retriever._fts_query_terms() en vez de duplicar la
lógica de armar la expresión MATCH.
"""
import sqlite3

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection


def browse_entries(
    user_id: str = JARVIS_DEFAULT_USER,
    type: str | None = None,
    tag: str | None = None,
    project_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Lista memory_entries vigentes filtradas. Devuelve {"total", "items"} --
    total sin paginar, para que el frontend arme "mostrando X de Y" y
    paginación real en vez de adivinar si hay más páginas.
    """
    clauses = ["me.user_id = ?", "me.valid_to IS NULL"]
    params: list = [user_id]
    join = ""

    if type:
        clauses.append("me.type = ?")
        params.append(type)
    if date_from:
        clauses.append("me.recorded_at >= ?")
        params.append(date_from)
    if date_to:
        # recorded_at es un timestamp completo ("2026-08-28T21:53:42...");
        # comparar contra una fecha pelada ("2026-08-28") como string falla en
        # el límite superior -- "2026-08-28T21:53:42" > "2026-08-28" en orden
        # lexicográfico (el string más largo con el mismo prefijo es "mayor"),
        # así que un date_to sin hora excluía TODAS las entradas de ese mismo
        # día. JarvisBrowsePanel.jsx ya lo esquiva mandando siempre
        # "{fecha}T23:59:59" -- se normaliza acá también para que la API sea
        # correcta por sí misma para cualquier otro caller (bot, tests,
        # integraciones futuras) que pase una fecha pelada.
        normalized_to = date_to if "T" in date_to else f"{date_to}T23:59:59.999999"
        clauses.append("me.recorded_at <= ?")
        params.append(normalized_to)
    if tag:
        join += " JOIN memory_entry_tags met ON met.entry_id = me.id JOIN memory_tags mt ON mt.tag_id = met.tag_id"
        clauses.append("LOWER(mt.name) = LOWER(?)")
        params.append(tag)
    if project_id:
        join += " JOIN memory_entry_projects mep ON mep.entry_id = me.id"
        clauses.append("mep.project_id = ?")
        params.append(project_id)
    if q:
        ids = _text_match_ids(q, user_id)
        if not ids:
            return {"total": 0, "items": []}
        placeholders = ",".join("?" * len(ids))
        clauses.append(f"me.id IN ({placeholders})")
        params.extend(ids)

    where = " AND ".join(clauses)
    conn = get_connection()
    try:
        total = conn.execute(
            f"SELECT COUNT(DISTINCT me.id) AS n FROM memory_entries me{join} WHERE {where}", params
        ).fetchone()["n"]
        rows = conn.execute(
            f"""SELECT DISTINCT me.* FROM memory_entries me{join}
                WHERE {where} ORDER BY me.recorded_at DESC LIMIT ? OFFSET ?""",
            params + [limit, offset],
        ).fetchall()
        return {"total": total, "items": [dict(r) for r in rows]}
    finally:
        conn.close()


def _text_match_ids(q: str, user_id: str) -> list[str]:
    """IDs cuyo contenido matchea el texto libre -- reusa el FTS5 (con
    fallback LIKE) de la pieza E, sin scoring: browse filtra, no rankea por
    relevancia (el orden es recorded_at DESC, como el resto de la pantalla).
    """
    from jarvis.retriever.retriever import _fts_query_terms

    terms = _fts_query_terms(q)
    if not terms:
        return []
    conn = get_connection()
    try:
        try:
            rows = conn.execute(
                """SELECT me.id AS id FROM memory_entries_fts
                   JOIN memory_entries me ON me.id = memory_entries_fts.entry_id
                   WHERE memory_entries_fts MATCH ? AND me.user_id = ?""",
                (terms, user_id),
            ).fetchall()
            return [r["id"] for r in rows]
        except sqlite3.OperationalError:
            keywords = [w for w in q.split() if len(w) > 2][:6]
            if not keywords:
                return []
            clause = " OR ".join("content_raw LIKE ? OR content_processed LIKE ?" for _ in keywords)
            like_params: list = []
            for kw in keywords:
                like_params += [f"%{kw}%", f"%{kw}%"]
            rows = conn.execute(
                f"SELECT id FROM memory_entries WHERE ({clause}) AND user_id = ?",
                like_params + [user_id],
            ).fetchall()
            return [r["id"] for r in rows]
    finally:
        conn.close()
