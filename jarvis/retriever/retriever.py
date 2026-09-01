"""
Recuperación semántica (RAG) desde ChromaDB + fallback texto en SQLite.

Slice 2 de 0.2 — retrieval coarse-to-fine (ver Cerebro/decisiones-implementacion.md,
entrada "Jarvis 0.2, Slice 2"). Motivación: la búsqueda plana anterior (embedding →
ChromaDB → top-K → rankeo) mezclaba tipos y proyectos sin distinción; con pocas
entradas no se notaba, con cientos empieza a devolver ruido.

Flujo:
  0. Filtro coarse en SQLite, sin embeddings (`_coarse_filter`): heurística de
     keywords sobre la pregunta (+ modelo local para casos ambiguos) determina un
     `type` probable (DECISION/SEMANTIC) y, si la pregunta menciona un proyecto
     conocido, el set de `entry_id`s de ese proyecto. También detecta si la
     pregunta pide algo "reciente/último" (`recency_first`).
  1. Genera embedding de la pregunta vía LiteLLM.
  2. Búsqueda semántica dentro del subconjunto filtrado:
     - Si se identificó un proyecto: similitud coseno en Python solo contra los
       ids de ese proyecto (ChromaDB.get() por id, sin ANN sobre toda la
       colección) — reduce el espacio de búsqueda antes de rankear.
     - Si no: ANN de ChromaDB con `where={"type": ...}` cuando el filtro coarse
       identificó un tipo, degradando a la búsqueda sin filtro si no hay
       candidatos de ese tipo (no debe romper el caso genérico).
  3. Carga los entry_ids desde SQLite para metadata completa.
  4. Rankea por tipo + similitud + recencia (recencia domina si `recency_first`).
  5. Fallback: LIKE search en SQLite si ChromaDB falla o está vacío, con el mismo
     filtro coarse aplicado ahí (y el mismo degrade a sin filtro si no hay resultados).

Ranking (spec §8): DECISION > SEMANTIC > PROJECT > RAW. El filtro coarse es
heurístico y no tiene que ser perfecto: si no puede determinar nada (pregunta
ambigua, modelo local no disponible), se busca en todos los tipos, igual que antes.

Fix 2026-08-26 — `valid_to IS NULL`: hasta ahora `retrieve()` no filtraba entradas marcadas
`superseded` por el job de consolidación (Slice 1), así que podían seguir apareciendo en el
contexto RAG. `_load_entries()`, `_fallback_rows()` y `_match_project_entry_ids()` ahora
excluyen filas con `valid_to` seteado. El filtro se aplica en SQLite (fuente de verdad,
spec §9/§18), no vía `where=` de ChromaDB: los embeddings ya existentes no tienen un campo
`valid_to` en su metadata, y filtrar ahí exigiría backfillear metadata para todo lo ya
embebido. El camino ChromaDB queda cubierto igual porque tanto `_retrieve_chromadb` como
`_retrieve_scoped_by_ids` resuelven los ids devueltos por Chroma contra `_load_entries()`
antes de rankear — una entrada obsoleta puede ocupar un lugar en el top-K de la ANN pero se
descarta ahí. Se subió el multiplicador de `fetch` para reducir el riesgo de terminar con
menos de `n_results` cuando varios candidatos del top-K resultan obsoletos.
"""
import json
import logging
import math
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone

from jarvis.config import JARVIS_LOCAL_MODEL
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

# Punto único de edición de estos pesos — no duplicar en otro lado.
_TYPE_WEIGHT = {
    "DECISION": 1.0,
    "SEMANTIC": 0.8,
    "PEOPLE":   0.75,
    "PROJECT":  0.7,
    "RAW":      0.5,
}
_RECENCY_BONUS = 0.1
_RECENCY_DAYS = 7

# Fórmula de ranking normal (_rank_score, caso general): 50% similitud + 40% tipo
# + bonus de recencia aparte (_RECENCY_BONUS). Distinta a propósito del desempate
# de recency_first de abajo — no fusionar sin revisar la intención original de cada
# una (ver Cerebro/decisiones-implementacion.md, Fase B0).
_SIMILARITY_WEIGHT = 0.5
_TYPE_WEIGHT_FACTOR = 0.4

# Desempate cuando domina recency_first (mismo recorded_at exacto): 50/50 entre
# similitud y tipo, sin bonus de recencia (la recencia ya domina vía epoch).
_TIEBREAK_SIMILARITY_WEIGHT = 0.5
_TIEBREAK_TYPE_WEIGHT = 0.5

# Búsqueda híbrida (pieza E): señal léxica adicional, SUMADA a la fórmula de
# ranking normal (nunca reemplaza los pesos de arriba) -- complementa el
# embedding cuando la pregunta usa una palabra exacta poco común (nombres
# propios, códigos) que la similitud semántica puede no capturar bien.
_LEXICAL_WEIGHT = 0.15
# Umbral de score léxico (0..1, normalizado) a partir del cual un candidato
# que la búsqueda densa no trajo igual se agrega al resultado -- ver
# _merge_lexical_only(). Conservador: solo entra si el match léxico es fuerte.
_LEXICAL_MERGE_THRESHOLD = 0.4
_LEXICAL_LIKE_FALLBACK_SCORE = 0.6  # LIKE no scorea -- score fijo moderado

_DECISION_KEYWORDS = [
    "decisión", "decision", "decidí", "decidi", "decidimos", "elegí", "elegi",
    "elegimos", "elección", "eleccion", "acordamos", "acordé", "acorde",
    "resolvimos", "resolví", "resolvi", "optamos", "opté", "opte",
]
_SEMANTIC_KEYWORDS = [
    "qué es", "que es", "qué son", "que son", "cómo funciona", "como funciona",
    "quién es", "quien es", "cuál es", "cual es", "por qué", "por que",
    "para qué sirve", "para que sirve", "explicá", "explica", "explicame",
    "explícame", "definí", "define", "significa",
]
_RECENCY_KEYWORDS = [
    "último", "ultimo", "última", "ultima", "más reciente", "mas reciente",
    "recién", "recien", "recientemente", "ayer", "hoy", "esta semana",
    "más nuevo", "mas nuevo", "lo más nuevo", "lo mas nuevo",
]
_MIN_PROJECT_NAME_LEN = 3


@dataclass
class _CoarseFilter:
    type: str | None = None
    project_entry_ids: set | None = None
    entity_entry_ids: set | None = None
    recency_first: bool = False


def retrieve(
    question: str,
    n_results: int = 5,
    user_id: str = "default",
) -> list[dict]:
    """Recupera las n_results memory_entries más relevantes para la pregunta.

    Devuelve lista de dicts (misma forma que memory_entries en SQLite),
    rankeados por tipo + similitud semántica + recencia.
    El llamador decide qué hacer con ellas; el Privacy Gateway se aplica aparte.

    Si la pregunta menciona una entidad conocida (memory_entities, 0.2 Slice 3),
    sus entradas vinculadas se anteponen al resultado (boost) antes de completar
    con la búsqueda semántica normal — ver `_match_entity_entry_ids`.
    """
    coarse = _coarse_filter(question, user_id)
    entity_first = _load_entries(list(coarse.entity_entry_ids), user_id) if coarse.entity_entry_ids else []
    lexical_scores = _lexical_candidates(question, user_id, limit=n_results * 3)

    query_embedding: list[float] | None = None
    try:
        entries, query_embedding = _retrieve_chromadb(question, n_results, user_id, coarse, lexical_scores)
        if not entries:
            logger.info("[jarvis.retriever] ChromaDB sin resultados — usando fallback SQLite")
            entries = _retrieve_sqlite_fallback(question, n_results, user_id, coarse, lexical_scores)
    except Exception as exc:
        logger.warning(
            "[jarvis.retriever] ChromaDB falló (%s) — usando fallback SQLite", exc
        )
        entries = _retrieve_sqlite_fallback(question, n_results, user_id, coarse, lexical_scores)

    entries = _merge_lexical_only(entries, lexical_scores, user_id, n_results, coarse, query_embedding)

    if not entity_first:
        return entries
    return _merge_entity_first(entity_first, entries, n_results)


def _merge_entity_first(entity_entries: list[dict], other_entries: list[dict], n_results: int) -> list[dict]:
    """Antepone las entradas de la entidad mencionada (recientes primero) y
    completa hasta n_results con el resultado de la búsqueda semántica normal,
    sin duplicar ids.
    """
    entity_entries = sorted(
        entity_entries, key=lambda e: e.get("recorded_at") or "", reverse=True
    )
    seen = {e["id"] for e in entity_entries}
    merged = list(entity_entries)
    for e in other_entries:
        if len(merged) >= n_results:
            break
        if e["id"] not in seen:
            merged.append(e)
            seen.add(e["id"])
    return merged


# ── Paso 0: filtro coarse (SQLite, sin embeddings) ──────────────────────────────

def _coarse_filter(question: str, user_id: str) -> _CoarseFilter:
    q_lower = question.lower()

    type_hint = None
    if any(kw in q_lower for kw in _DECISION_KEYWORDS):
        type_hint = "DECISION"
    elif any(kw in q_lower for kw in _SEMANTIC_KEYWORDS):
        type_hint = "SEMANTIC"

    project_entry_ids = _match_project_entry_ids(q_lower, user_id)
    entity_entry_ids = _match_entity_entry_ids(question, user_id)
    recency_first = any(kw in q_lower for kw in _RECENCY_KEYWORDS)

    if type_hint is None and project_entry_ids is None and not recency_first:
        # Ni keywords de tipo, de proyecto ni de recencia: caso ambiguo, se
        # consulta al modelo local (nunca el externo — es clasificación liviana,
        # no razonamiento). Si ya hay señal de recencia, no forzar un tipo — la
        # intención dominante es cronológica, no de tipo, y el modelo de 3B puede
        # elegir mal (visto en pruebas: clasificó una pregunta de recencia pura
        # como DECISION).
        type_hint = _classify_type_with_local_model(question)

    return _CoarseFilter(
        type=type_hint,
        project_entry_ids=project_entry_ids,
        entity_entry_ids=entity_entry_ids,
        recency_first=recency_first,
    )


def _match_entity_entry_ids(question: str, user_id: str) -> set | None:
    """Si la pregunta menciona una entidad conocida (memory_entities), devuelve
    el set de entry_ids vinculados a ella. None si no se identifica ninguna.
    """
    from jarvis.entities.service import get_entity_entry_ids, match_entities_in_text

    matched = match_entities_in_text(question, user_id)
    if not matched:
        return None
    ids = get_entity_entry_ids([m["entity_id"] for m in matched], user_id)
    return ids or None


def _match_project_entry_ids(q_lower: str, user_id: str) -> set | None:
    """Si la pregunta menciona el nombre de un proyecto conocido, devuelve el set
    de entry_ids asociados a ese proyecto. None si no se identifica ninguno.
    """
    conn = get_connection()
    try:
        projects = conn.execute("SELECT id, name FROM memory_projects").fetchall()
        matched_ids = [
            p["id"] for p in projects
            if len(p["name"]) >= _MIN_PROJECT_NAME_LEN and p["name"].lower() in q_lower
        ]
        if not matched_ids:
            return None

        placeholders = ",".join("?" * len(matched_ids))
        rows = conn.execute(
            f"""SELECT mep.entry_id FROM memory_entry_projects mep
                JOIN memory_entries me ON me.id = mep.entry_id
                WHERE mep.project_id IN ({placeholders}) AND me.user_id = ?
                  AND me.valid_to IS NULL""",
            matched_ids + [user_id],
        ).fetchall()
        ids = {r["entry_id"] for r in rows}
        return ids or None
    except Exception as exc:
        logger.warning(
            "[jarvis.retriever] Fallo buscando proyecto mencionado en la pregunta: %s", exc
        )
        return None
    finally:
        conn.close()


_COARSE_TYPE_PROMPT = """\
Clasificá la intención de esta pregunta sobre una base de memoria personal.
Responde SOLO con JSON válido, sin texto extra:
{{"type": "DECISION" | "SEMANTIC" | "AMBIGUOUS"}}

Reglas:
- "DECISION": la pregunta busca una decisión tomada o una elección hecha en el pasado.
- "SEMANTIC": la pregunta busca conocimiento, una explicación o un concepto general.
- "AMBIGUOUS": no queda claro, o busca otra cosa (notas sueltas, estado de un proyecto, etc.).

Pregunta: {question}

JSON:"""


def _classify_type_with_local_model(question: str) -> str | None:
    """Clasificación liviana con el modelo local para el caso coarse ambiguo.

    Nunca usa el modelo externo (call_reason) — esto es clasificación barata que
    corre en cada consulta, no razonamiento. Si el modelo local falla por
    cualquier motivo, no filtra por tipo (mismo comportamiento que antes).
    """
    from jarvis.llm.client import call_llm

    try:
        raw = call_llm(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Clasificás la intención de preguntas sobre una base de memoria "
                        "personal. Respondé únicamente con JSON válido."
                    ),
                },
                {"role": "user", "content": _COARSE_TYPE_PROMPT.format(question=question)},
            ],
            model=JARVIS_LOCAL_MODEL,
            temperature=0.0,
        )
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start < 0 or end <= start:
            return None
        verdict = json.loads(raw[start:end])
        type_hint = verdict.get("type")
        return type_hint if type_hint in ("DECISION", "SEMANTIC") else None
    except Exception as exc:
        logger.warning(
            "[jarvis.retriever] Clasificación coarse local falló — sin filtro de tipo: %s", exc
        )
        return None


# ── Paso 1-2: búsqueda semántica dentro del subconjunto filtrado ────────────────

def _retrieve_chromadb(
    question: str, n_results: int, user_id: str, coarse: _CoarseFilter,
    lexical_scores: dict[str, float] | None = None,
) -> tuple[list[dict], list[float]]:
    """Devuelve (entradas rankeadas, embedding de la pregunta) -- el embedding
    se propaga hasta _merge_lexical_only() para que un rescate léxico (típicamente
    de un tipo excluido por el `where` de abajo) pueda competir con una
    similitud real en vez de un valor fijo (ver esa función)."""
    from jarvis.embeddings.client import generate_embedding
    from jarvis.embeddings.store import get_collection

    lexical_scores = lexical_scores or {}
    embedding = generate_embedding(question)
    collection = get_collection()
    total = collection.count()
    if total == 0:
        return [], embedding

    if coarse.project_entry_ids:
        entries = _retrieve_scoped_by_ids(
            collection, embedding, coarse.project_entry_ids, n_results, user_id, coarse, lexical_scores
        )
        if entries:
            return entries, embedding
        # Proyecto identificado pero sin embeddings/resultados ahí — no perder la
        # consulta entera por eso, se sigue con la búsqueda ANN normal más abajo.

    # x3 (no x2): deja margen para que _load_entries() descarte candidatos con
    # valid_to seteado (obsoletos por consolidación) sin quedarse con menos de n_results.
    fetch = min(n_results * 3, total)
    where = {"type": coarse.type} if coarse.type else None
    results = collection.query(
        query_embeddings=[embedding],
        n_results=fetch,
        where=where,
        include=["distances", "metadatas"],
    )

    ids = results["ids"][0]
    distances = results["distances"][0]
    if not ids and where:
        # El tipo del filtro coarse no tiene candidatos en Chroma — degradar al
        # caso genérico (buscar en todos los tipos) en vez de devolver vacío.
        results = collection.query(
            query_embeddings=[embedding], n_results=fetch, include=["distances", "metadatas"]
        )
        ids = results["ids"][0]
        distances = results["distances"][0]
    if not ids:
        return [], embedding

    entries = _load_entries(ids, user_id)
    # ChromaDB cosine distance: 0=idéntico, 2=opuesto → similitud = 1 - d/2
    id_to_sim = {eid: max(0.0, 1.0 - d / 2.0) for eid, d in zip(ids, distances)}

    return _rank_and_attach(entries, id_to_sim, coarse.recency_first, lexical_scores, n_results), embedding


def _retrieve_scoped_by_ids(
    collection, embedding: list[float], candidate_ids: set, n_results: int,
    user_id: str, coarse: _CoarseFilter, lexical_scores: dict[str, float] | None = None,
) -> list[dict]:
    """Similitud coseno en Python contra un set acotado de ids (proyecto ya
    identificado por el filtro coarse) — evita una ANN sobre toda la colección.
    """
    ids = list(candidate_ids)
    try:
        result = collection.get(ids=ids, include=["embeddings"])
    except Exception as exc:
        logger.warning(
            "[jarvis.retriever] Fallo leyendo embeddings del proyecto identificado: %s", exc
        )
        return []

    raw_ids = result.get("ids")
    raw_embeddings = result.get("embeddings")
    result_ids = list(raw_ids) if raw_ids is not None else []
    embeddings = list(raw_embeddings) if raw_embeddings is not None else []
    vectors = {rid: emb for rid, emb in zip(result_ids, embeddings) if emb is not None}
    if not vectors:
        return []

    lexical_scores = lexical_scores or {}
    id_to_sim = {rid: _cosine_similarity(embedding, vec) for rid, vec in vectors.items()}
    entries = _load_entries(list(vectors.keys()), user_id)
    return _rank_and_attach(entries, id_to_sim, coarse.recency_first, lexical_scores, n_results)


def _cosine_similarity(a, b) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ── Fallback: LIKE search en SQLite ──────────────────────────────────────────────

def _retrieve_sqlite_fallback(
    question: str, n_results: int, user_id: str, coarse: _CoarseFilter,
    lexical_scores: dict[str, float] | None = None,
) -> list[dict]:
    """Búsqueda por palabras clave en content_raw cuando ChromaDB no está disponible.

    Aplica el mismo filtro coarse (tipo / proyecto) que el camino de ChromaDB,
    degradando a sin filtro si no encuentra nada — igual criterio que arriba.
    """
    lexical_scores = lexical_scores or {}
    keywords = [w for w in question.split() if len(w) > 3][:5]

    entries = _fallback_rows(question, keywords, n_results, user_id, coarse.type, coarse.project_entry_ids)
    if not entries and (coarse.type or coarse.project_entry_ids):
        entries = _fallback_rows(question, keywords, n_results, user_id, None, None)

    # Sin ChromaDB no hay similitud real disponible -- 0.5 fijo para todos
    # (mismo criterio que antes), _rank_and_attach igual deja el _rank_score
    # anotado para que _merge_lexical_only() pueda comparar en igualdad de
    # condiciones con los rescates léxicos.
    id_to_sim = {e["id"]: 0.5 for e in entries}
    return _rank_and_attach(entries, id_to_sim, coarse.recency_first, lexical_scores, n_results)


def _fallback_rows(
    question: str, keywords: list[str], n_results: int, user_id: str,
    type_filter: str | None, project_ids: set | None,
) -> list[dict]:
    type_clause = " AND type = ?" if type_filter else ""
    type_params = [type_filter] if type_filter else []

    ids_clause = ""
    ids_params: list = []
    if project_ids:
        placeholders = ",".join("?" * len(project_ids))
        ids_clause = f" AND id IN ({placeholders})"
        ids_params = list(project_ids)

    conn = get_connection()
    try:
        if not keywords:
            sql = (
                f"SELECT * FROM memory_entries WHERE user_id = ? AND valid_to IS NULL"
                f"{type_clause}{ids_clause} ORDER BY recorded_at DESC LIMIT ?"
            )
            params = [user_id] + type_params + ids_params + [n_results]
        else:
            placeholders_kw = " OR ".join("content_raw LIKE ?" for _ in keywords)
            sql = (
                f"SELECT * FROM memory_entries WHERE ({placeholders_kw}) AND user_id = ?"
                f" AND valid_to IS NULL{type_clause}{ids_clause} ORDER BY recorded_at DESC LIMIT ?"
            )
            params = (
                [f"%{kw}%" for kw in keywords] + [user_id] + type_params + ids_params
                + [n_results * 2]
            )
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _load_entries(ids: list[str], user_id: str) -> list[dict]:
    if not ids:
        return []
    placeholders = ",".join("?" * len(ids))
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""SELECT * FROM memory_entries
                WHERE id IN ({placeholders}) AND user_id = ? AND valid_to IS NULL""",
            ids + [user_id],
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ── Rankeo ────────────────────────────────────────────────────────────────────

def _rank_score(
    entry: dict, similarity: float, recency_first: bool = False, lexical_score: float = 0.0,
) -> float:
    type_weight = _TYPE_WEIGHT.get(entry.get("type", "RAW"), 0.5)
    lexical_bonus = lexical_score * _LEXICAL_WEIGHT

    if recency_first:
        # La pregunta pide algo reciente/último: ordenar por recorded_at DESC
        # primero (literal, no un bonus continuo) — el resto solo desempata entre
        # entradas con el mismo recorded_at exacto. epoch está en segundos, así
        # que cualquier diferencia real de tiempo (>=1s) siempre pesa más que el
        # desempate (acotado a < 1.0 + el bonus léxico, también < 1.0).
        epoch = _entry_epoch(entry)
        if epoch is None:
            epoch = -1.0e18
        tie_break = similarity * _TIEBREAK_SIMILARITY_WEIGHT + type_weight * _TIEBREAK_TYPE_WEIGHT
        return epoch + tie_break + lexical_bonus

    age_days = _age_days(entry)
    recency_bonus = _RECENCY_BONUS if age_days is not None and age_days <= _RECENCY_DAYS else 0.0
    # 50% similitud semántica, 40% tipo, 10% recencia + señal léxica adicional (pieza E)
    return similarity * _SIMILARITY_WEIGHT + type_weight * _TYPE_WEIGHT_FACTOR + recency_bonus + lexical_bonus


# ── Búsqueda léxica (pieza E, búsqueda híbrida) ──────────────────────────────

def _lexical_candidates(question: str, user_id: str, limit: int) -> dict[str, float]:
    """Candidatos por señal léxica (FTS5 con bm25, fallback a LIKE si FTS5 no
    está disponible en este SQLite) -- {entry_id: score normalizado 0..1,
    mejor=1}. Nunca lanza -- {} si algo falla, la búsqueda densa sigue sola.
    """
    terms = _fts_query_terms(question)
    if not terms:
        return {}
    conn = get_connection()
    try:
        try:
            rows = conn.execute(
                """SELECT me.id AS id, bm25(memory_entries_fts) AS rank
                   FROM memory_entries_fts
                   JOIN memory_entries me ON me.id = memory_entries_fts.entry_id
                   WHERE memory_entries_fts MATCH ? AND me.user_id = ? AND me.valid_to IS NULL
                   ORDER BY rank LIMIT ?""",
                (terms, user_id, limit),
            ).fetchall()
        except sqlite3.OperationalError:
            # Tabla FTS5 no disponible en este entorno (ver jarvis/db/database.py::_init_fts) --
            # fallback léxico sin scoring real, un score fijo moderado para todo lo que matchea.
            return _lexical_candidates_like(question, user_id, limit)

        if not rows:
            return {}
        if len(rows) == 1:
            # Único match -- normalizarlo contra sí mismo (worst==best) daría
            # span=0 y colapsaría a score 0.0 (el peor), exactamente al revés
            # de lo que significa ser el único resultado. Bug real encontrado
            # probando esta pieza: una pregunta con una palabra rara que solo
            # matchea UNA entrada (el caso más común que la búsqueda léxica
            # está pensada para resolver) puntuaba 0.0 en vez de 1.0.
            return {rows[0]["id"]: 1.0}
        # bm25(): más NEGATIVO = mejor match. Normalizar a 0..1 (mejor=1).
        scores_raw = [r["rank"] for r in rows]
        worst, best = max(scores_raw), min(scores_raw)
        span = (worst - best) or 1.0
        return {r["id"]: (worst - r["rank"]) / span for r in rows}
    except Exception as exc:
        logger.warning("[jarvis.retriever] Búsqueda léxica falló, se sigue solo con la densa: %s", exc)
        return {}
    finally:
        conn.close()


def _lexical_candidates_like(question: str, user_id: str, limit: int) -> dict[str, float]:
    keywords = [w for w in question.split() if len(w) > 3][:5]
    if not keywords:
        return {}
    conn = get_connection()
    try:
        clause = " OR ".join("content_raw LIKE ? OR content_processed LIKE ?" for _ in keywords)
        params: list = []
        for kw in keywords:
            params += [f"%{kw}%", f"%{kw}%"]
        rows = conn.execute(
            f"""SELECT id FROM memory_entries WHERE ({clause})
                AND user_id = ? AND valid_to IS NULL LIMIT ?""",
            params + [user_id, limit],
        ).fetchall()
        # LIKE no scorea -- score fijo moderado para todo lo que matchea.
        return {r["id"]: _LEXICAL_LIKE_FALLBACK_SCORE for r in rows}
    except Exception as exc:
        logger.warning("[jarvis.retriever] Fallback léxico LIKE falló: %s", exc)
        return {}
    finally:
        conn.close()


# Conectores muy comunes en español, excluidos de la expresión MATCH de FTS5
# -- sin este filtro, una pregunta como "¿Dónde vivo actualmente?" deja
# "actualmente" como término OR, y si esa palabra suelta aparece por
# casualidad en una sola entrada totalmente ajena, bm25 la ranquea como
# "el mejor/único match" y el score léxico normalizado le da 1.0 -- igual
# que a un término realmente raro (nombre propio, código). Encontrado
# probando el fix del bug de ranking del 28/08 (ver
# Cerebro/decisiones-implementacion.md): el rescate léxico ahora compite por
# score real, así que un falso positivo léxico también puede subir a la
# cima si no se filtra acá.
_FTS_STOPWORDS = {
    "que", "qué", "quien", "quién", "quienes", "quiénes",
    "donde", "dónde", "como", "cómo", "cual", "cuál", "cuales", "cuáles",
    "para", "por", "con", "sin", "del", "las", "los", "una", "uno", "unos",
    "unas", "esta", "esto", "ese", "esa", "eso", "estos", "estas", "esos",
    "esas", "hace", "hacer", "muy", "mas", "más", "también", "tambien",
    "desde", "hasta", "entre", "sobre", "cada", "otra", "otro", "otros",
    "otras", "ahora", "actualmente", "recién", "recien", "recientemente",
    "todavía", "todavia", "siempre", "nunca", "alguna", "alguno",
    "algunas", "algunos", "nuestro", "nuestra", "tiene", "tener", "está",
    "están", "estan", "sido", "fue", "eran", "era",
}


def _fts_query_terms(question: str) -> str:
    """Arma la expresión MATCH de FTS5: términos ORed, cada uno entre comillas
    (evita que caracteres como '-'/':' se interpreten como sintaxis de FTS5).
    Filtra conectores comunes (_FTS_STOPWORDS) antes de tomar los primeros 6 --
    ver el comentario de esa constante.
    """
    words = [w.strip('.,;:!?¿¡"\'()[]{}').replace('"', '') for w in question.split()]
    words = [w for w in words if len(w) > 2 and w.lower() not in _FTS_STOPWORDS][:6]
    if not words:
        return ""
    return " OR ".join(f'"{w}"' for w in words)


def _rank_and_attach(
    entries: list[dict],
    id_to_sim: dict[str, float],
    recency_first: bool,
    lexical_scores: dict[str, float],
    n_results: int,
) -> list[dict]:
    """Rankea `entries` por _rank_score y deja el score anotado en cada dict
    (clave transitoria `_rank_score`, la saca _merge_lexical_only() antes de
    devolver el resultado final de retrieve()) -- así un rescate léxico
    agregado después puede compararse en igualdad de condiciones contra lo
    que ya trajo la búsqueda densa, en vez de perder ese score una vez
    ordenado (bug de ranking encontrado 2026-08-28, ver
    Cerebro/decisiones-implementacion.md).
    """
    scored = [
        (e, _rank_score(e, id_to_sim.get(e["id"], 0.0), recency_first, lexical_scores.get(e["id"], 0.0)))
        for e in entries
    ]
    scored.sort(key=lambda t: t[1], reverse=True)
    ranked = []
    for e, score in scored[:n_results]:
        e["_rank_score"] = score
        ranked.append(e)
    return ranked


def _fetch_similarities(ids: list[str], query_embedding: list[float] | None) -> dict[str, float]:
    """Similitud coseno real contra la pregunta para un set puntual de ids --
    usado por _merge_lexical_only() para que un rescate léxico compita con un
    score real en vez de un valor fijo. {} si no hay embedding de la pregunta
    disponible (p. ej. venimos del fallback SQLite sin ChromaDB) o si la
    consulta a Chroma falla -- nunca lanza, degrada a similitud 0.0 para esos
    ids (el bonus léxico y el peso de tipo igual pueden hacerlos competir).
    """
    if not ids or query_embedding is None:
        return {}
    from jarvis.embeddings.store import get_collection

    try:
        collection = get_collection()
        result = collection.get(ids=ids, include=["embeddings"])
        # result["embeddings"] puede venir como numpy array -- `or []` sobre
        # un array de más de un elemento lanza ValueError ("truth value of an
        # array is ambiguous"), mismo cuidado que ya toma _retrieve_scoped_by_ids().
        raw_ids = result.get("ids")
        raw_embeddings = result.get("embeddings")
        ids_list = list(raw_ids) if raw_ids is not None else []
        embeddings_list = list(raw_embeddings) if raw_embeddings is not None else []
        return {
            rid: _cosine_similarity(query_embedding, emb)
            for rid, emb in zip(ids_list, embeddings_list)
            if emb is not None
        }
    except Exception as exc:
        logger.warning(
            "[jarvis.retriever] No se pudo calcular similitud real para rescates léxicos: %s", exc
        )
        return {}


def _merge_lexical_only(
    entries: list[dict],
    lexical_scores: dict[str, float],
    user_id: str,
    n_results: int,
    coarse: _CoarseFilter,
    query_embedding: list[float] | None = None,
) -> list[dict]:
    """Si hay un match léxico fuerte (pieza E, score >= _LEXICAL_MERGE_THRESHOLD)
    que la búsqueda densa dejó afuera -- caso típico: el filtro coarse de tipo
    excluyó de raíz un candidato de otro tipo (ver Cerebro/decisiones-
    implementacion.md, bug de ranking 2026-08-28) -- lo agrega compitiendo por
    su _rank_score real (similitud real cuando hay embedding disponible +
    peso de tipo + bonus léxico), no por posición ciega al final de la lista.
    Antes de este fix, un match léxico perfecto (score 1.0 -- el caso más
    fuerte posible) nunca podía superar a un match semántico débil de "tipo
    correcto", que es exactamente el caso que esta pieza está pensada para
    resolver.
    """
    for e in entries:
        e.setdefault("_rank_score", 0.0)

    if not lexical_scores:
        for e in entries:
            e.pop("_rank_score", None)
        return entries

    present_ids = {e["id"] for e in entries}
    missing_ids = [
        eid for eid, score in lexical_scores.items()
        if eid not in present_ids and score >= _LEXICAL_MERGE_THRESHOLD
    ]
    if missing_ids:
        extra = _load_entries(missing_ids, user_id)
        extra_sims = _fetch_similarities([e["id"] for e in extra], query_embedding)
        for e in extra:
            sim = extra_sims.get(e["id"], 0.0)
            e["_rank_score"] = _rank_score(
                e, sim, coarse.recency_first, lexical_scores.get(e["id"], 0.0)
            )
        entries = entries + extra

    entries.sort(key=lambda e: e["_rank_score"], reverse=True)
    entries = entries[:n_results]
    for e in entries:
        e.pop("_rank_score", None)
    return entries


def _parse_recorded_at(entry: dict) -> datetime | None:
    recorded = entry.get("recorded_at") or entry.get("created_at")
    if not recorded:
        return None
    try:
        dt = datetime.fromisoformat(str(recorded).replace("Z", "+00:00"))
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _age_days(entry: dict) -> int | None:
    dt = _parse_recorded_at(entry)
    if dt is None:
        return None
    return (datetime.now(timezone.utc) - dt).days


def _entry_epoch(entry: dict) -> float | None:
    dt = _parse_recorded_at(entry)
    if dt is None:
        return None
    return dt.timestamp()
