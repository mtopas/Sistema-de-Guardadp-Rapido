"""
Recuperación semántica (RAG) desde ChromaDB + fallback texto en SQLite.

Flujo:
  1. Genera embedding de la pregunta vía LiteLLM
  2. Busca en ChromaDB por similitud coseno (n_results * 2, re-rankea)
  3. Carga los entry_ids desde SQLite para metadata completa
  4. Rankea por tipo + similitud + recencia
  5. Fallback: LIKE search en SQLite si ChromaDB falla o está vacío

Ranking (spec §8): DECISION > SEMANTIC > PROJECT > RAW
"""
import logging
from datetime import datetime, timezone

from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_TYPE_WEIGHT = {
    "DECISION": 1.0,
    "SEMANTIC": 0.8,
    "PROJECT":  0.7,
    "RAW":      0.5,
}
_RECENCY_BONUS = 0.1
_RECENCY_DAYS = 7


def retrieve(
    question: str,
    n_results: int = 5,
    user_id: str = "default",
) -> list[dict]:
    """Recupera las n_results memory_entries más relevantes para la pregunta.

    Devuelve lista de dicts (misma forma que memory_entries en SQLite),
    rankeados por tipo + similitud semántica + recencia.
    El llamador decide qué hacer con ellas; el Privacy Gateway se aplica aparte.
    """
    try:
        entries = _retrieve_chromadb(question, n_results, user_id)
        if entries:
            return entries
        logger.info("[jarvis.retriever] ChromaDB sin resultados — usando fallback SQLite")
        return _retrieve_sqlite_fallback(question, n_results, user_id)
    except Exception as exc:
        logger.warning(
            "[jarvis.retriever] ChromaDB falló (%s) — usando fallback SQLite", exc
        )
        return _retrieve_sqlite_fallback(question, n_results, user_id)


def _retrieve_chromadb(question: str, n_results: int, user_id: str) -> list[dict]:
    from jarvis.embeddings.client import generate_embedding
    from jarvis.embeddings.store import get_collection

    embedding = generate_embedding(question)
    collection = get_collection()
    total = collection.count()
    if total == 0:
        return []

    fetch = min(n_results * 2, total)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=fetch,
        include=["distances", "metadatas"],
    )

    ids = results["ids"][0]
    distances = results["distances"][0]
    if not ids:
        return []

    entries = _load_entries(ids, user_id)
    # ChromaDB cosine distance: 0=idéntico, 2=opuesto → similitud = 1 - d/2
    id_to_sim = {eid: max(0.0, 1.0 - d / 2.0) for eid, d in zip(ids, distances)}

    ranked = sorted(
        entries,
        key=lambda e: _rank_score(e, id_to_sim.get(e["id"], 0.0)),
        reverse=True,
    )
    return ranked[:n_results]


def _retrieve_sqlite_fallback(question: str, n_results: int, user_id: str) -> list[dict]:
    """Búsqueda por palabras clave en content_raw cuando ChromaDB no está disponible."""
    keywords = [w for w in question.split() if len(w) > 3][:5]
    if not keywords:
        conn = get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM memory_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?",
                (user_id, n_results),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    placeholders = " OR ".join("content_raw LIKE ?" for _ in keywords)
    params: list = [f"%{kw}%" for kw in keywords] + [user_id, n_results * 2]

    conn = get_connection()
    try:
        rows = conn.execute(
            f"SELECT * FROM memory_entries WHERE ({placeholders}) AND user_id = ? "
            f"ORDER BY recorded_at DESC LIMIT ?",
            params,
        ).fetchall()
        entries = [dict(r) for r in rows]
    finally:
        conn.close()

    ranked = sorted(entries, key=lambda e: _rank_score(e, 0.5), reverse=True)
    return ranked[:n_results]


def _load_entries(ids: list[str], user_id: str) -> list[dict]:
    if not ids:
        return []
    placeholders = ",".join("?" * len(ids))
    conn = get_connection()
    try:
        rows = conn.execute(
            f"SELECT * FROM memory_entries WHERE id IN ({placeholders}) AND user_id = ?",
            ids + [user_id],
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _rank_score(entry: dict, similarity: float) -> float:
    type_weight = _TYPE_WEIGHT.get(entry.get("type", "RAW"), 0.5)
    recency_bonus = 0.0
    recorded = entry.get("recorded_at") or entry.get("created_at")
    if recorded:
        try:
            dt = datetime.fromisoformat(str(recorded).replace("Z", "+00:00"))
            if not dt.tzinfo:
                dt = dt.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - dt).days
            if age_days <= _RECENCY_DAYS:
                recency_bonus = _RECENCY_BONUS
        except Exception:
            pass
    # 50% similitud semántica, 40% tipo, 10% recencia
    return similarity * 0.5 + type_weight * 0.4 + recency_bonus
