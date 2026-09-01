"""
Job de consolidación diaria de memoria (Jarvis 0.2 — Slice 1).

Sin esto, hechos viejos y hechos nuevos sobre lo mismo (ej. "vivo en Madrid" en
enero, "me mudé a Buenos Aires" en agosto) coexisten en memory_entries sin que
nada le diga al sistema cuál es vigente, contaminando el RAG con conocimiento
obsoleto. Este job corre una vez por día (disparado desde jarvis/worker/main.py)
y hace tres cosas, en orden, sobre memory_entries "vigentes" (valid_to IS NULL):

1. Detecta pares con alta similitud semántica (coseno > 0.92) del mismo tipo y
   user_id vía ChromaDB, y usa el modelo de razonamiento (externo, con fallback
   automático a local si no está disponible o el budget está agotado) para
   decidir si son el mismo hecho (marca el más viejo obsoleto), contradictorios
   (baja confidence en ambos y loguea para revisión manual) o distintos (ignora).
2. Marca como stale por edad (valid_from > 90 días, confidence < 0.4).
3. Loguea el resumen y registra la corrida en jarvis_policies (también sirve
   como marca de "última corrida" para el gating de una vez por día).

Nunca borra nada — solo marca valid_to o reduce confidence (spec: Memoria ≠
destrucción; ver Cerebro/estado-actual.md). La clasificación de pares usa
call_reason() (modelo externo con fallback a JARVIS_LOCAL_FALLBACK_MODEL ya
incorporado) — en pruebas reales el modelo local (llama3.2:3b) no clasificó
bien casos claros de "same_fact", mientras que el externo sí; el volumen es
bajo (~20 entradas/día) así que el costo es despreciable. Si ChromaDB no está
disponible, se salta el paso 1 y sigue con el paso 2.

Extendido con dos pasos más en la misma corrida (sin thread ni scheduling
propio, mismo gating de should_run()): backfill de tags del catálogo (pieza
D, `_backfill_catalog_tags()`) y auditoría proactiva de memoria por bloques
(`jarvis.audit.service.run_audit()`, huecos/contradicciones/duplicados/
conexiones/tags mal puestos, con propuestas por Telegram — ver
Cerebro/decisiones-implementacion.md, 2026-08-31).
"""
import json
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone

from jarvis.config import (
    JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD,
    JARVIS_CONSOLIDATION_STALE_CONFIDENCE,
    JARVIS_CONSOLIDATION_STALE_DAYS,
    JARVIS_DEFAULT_USER,
)
from jarvis.db.database import get_connection
from jarvis.llm.client import call_reason
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_SIMILARITY_THRESHOLD = JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD
_STALE_DAYS = JARVIS_CONSOLIDATION_STALE_DAYS
_STALE_CONFIDENCE = JARVIS_CONSOLIDATION_STALE_CONFIDENCE
_CONFLICT_CONFIDENCE_PENALTY = 0.5
_RUN_INTERVAL = timedelta(hours=24)

_POLICY_LAST_RUN = "consolidation_last_run"
_POLICY_RUN_SUMMARY = "consolidation_run"
_POLICY_CONFLICT = "consolidation_conflict"

# Pieza D (mantenimiento de memoria): tope de entradas re-etiquetadas por
# corrida del backfill de tags -- mismo criterio de costo acotado que ya usa
# el resto del job (volumen real ~20 capturas/día, así que 20 por corrida
# vacía el backlog en pocos días sin disparar el costo de LLM sin límite).
_TAG_BACKFILL_LIMIT = 20


def should_run(now: datetime | None = None) -> bool:
    """True si nunca corrió o si pasaron >=24h desde la última corrida."""
    now = now or datetime.now(timezone.utc)
    last = _last_run_at()
    return last is None or (now - last) >= _RUN_INTERVAL


def run_consolidation() -> dict:
    """Corre el job completo. No lanza — cualquier error queda en el resumen."""
    MANIFEST.assert_allowed("consolidate_memory")

    now = datetime.now(timezone.utc)
    summary = {
        "analyzed": 0, "obsolete": 0, "conflicts": 0, "tagged": 0,
        "audit": None, "errors": [],
    }

    try:
        entries = _fetch_active_entries()
        summary["analyzed"] = len(entries)

        pairs = _find_similar_pairs(entries) + _find_cross_type_similar_pairs(entries)
        for entry_a, entry_b, similarity in pairs:
            try:
                _resolve_pair(entry_a, entry_b, similarity, summary)
            except Exception as exc:
                logger.exception(
                    "[consolidation] Error resolviendo par %s/%s", entry_a["id"], entry_b["id"]
                )
                summary["errors"].append(str(exc))

        summary["obsolete"] += _mark_stale_by_age(now)

        try:
            summary["tagged"] = _backfill_catalog_tags()
        except Exception as exc:
            logger.exception("[consolidation] Backfill de tags (pieza D) falló")
            summary["errors"].append(str(exc))

        # Auditoría proactiva de memoria (extensión del job diario, ver
        # Cerebro/decisiones-implementacion.md 2026-08-31) -- cuarto paso,
        # mismo gating de should_run(), sin thread ni scheduling propio.
        try:
            from jarvis.audit.service import run_audit

            summary["audit"] = run_audit(now)
        except Exception as exc:
            logger.exception("[consolidation] Auditoría de memoria falló")
            summary["errors"].append(str(exc))
    except Exception as exc:
        logger.exception("[consolidation] Error en run_consolidation")
        summary["errors"].append(str(exc))
    finally:
        _record_run(now, summary)

    logger.info(
        "[consolidation] %d entradas analizadas, %d marcadas obsoletas, %d conflictos",
        summary["analyzed"], summary["obsolete"], summary["conflicts"],
    )
    return summary


def _fetch_active_entries() -> list[dict]:
    """Entradas todavía vigentes (no marcadas obsoletas/superseded en una corrida previa)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, type, user_id, content_raw, content_processed,
                      recorded_at, valid_from, confidence, origin_trust
               FROM memory_entries
               WHERE valid_to IS NULL"""
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _find_similar_pairs(entries: list[dict]) -> list[tuple[dict, dict, float]]:
    """Pares candidatos (mismo type + user_id, coseno > threshold) vía embeddings de ChromaDB.

    Si ChromaDB no está disponible, devuelve [] sin lanzar — el job sigue con el paso de stale.
    """
    return _find_pairs_by_group(entries, group_key=lambda e: (e["type"], e["user_id"]))


def _find_cross_type_similar_pairs(entries: list[dict]) -> list[tuple[dict, dict, float]]:
    """Pares candidatos de TIPOS DISTINTOS (mismo user_id) -- pieza D.

    _find_similar_pairs() agrupa por (type, user_id) antes de comparar, así que
    dos entradas sobre el mismo hecho pero clasificadas con tipos distintos
    (ej. una RAW y una SEMANTIC casi idénticas) nunca llegaban a compararse --
    "duplicados no detectados como same_fact exacto" del alcance de esta pieza.
    Ver Cerebro/decisiones-implementacion.md (2026-08-26, "Hallazgo: el umbral
    de similitud 0.92 ... probablemente nunca agrupa un same_fact/contradiction
    real"): los pares que sí cruzan 0.92 en la práctica son casi-textuales, y
    terminar con tipos distintos es una causa concreta y real de que un
    casi-duplicado quede fuera del agrupamiento original. Mismo umbral, mismo
    _resolve_pair() -- se excluyen los pares de mismo tipo porque esos ya los
    cubre _find_similar_pairs() (evita procesarlos dos veces).
    """
    pairs = _find_pairs_by_group(entries, group_key=lambda e: e["user_id"])
    return [(a, b, sim) for a, b, sim in pairs if a["type"] != b["type"]]


def _find_pairs_by_group(
    entries: list[dict], group_key,
) -> list[tuple[dict, dict, float]]:
    """Compartido por _find_similar_pairs()/_find_cross_type_similar_pairs():
    agrupa entries por group_key(entry), y dentro de cada grupo compara todos
    los pares por similitud coseno de sus embeddings en ChromaDB.
    """
    try:
        from jarvis.embeddings.store import get_collection

        collection = get_collection()
    except Exception as exc:
        logger.warning(
            "[consolidation] ChromaDB no disponible, se salta el paso de similitud: %s", exc
        )
        return []

    groups: dict = {}
    for entry in entries:
        groups.setdefault(group_key(entry), []).append(entry)

    pairs: list[tuple[dict, dict, float]] = []
    for group in groups.values():
        if len(group) < 2:
            continue

        ids = [e["id"] for e in group]
        try:
            result = collection.get(ids=ids, include=["embeddings"])
        except Exception as exc:
            logger.warning(
                "[consolidation] Fallo leyendo embeddings de ChromaDB para %s: %s", ids, exc
            )
            continue

        by_id = {e["id"]: e for e in group}
        raw_ids = result.get("ids")
        raw_embeddings = result.get("embeddings")
        result_ids = list(raw_ids) if raw_ids is not None else []
        embeddings = list(raw_embeddings) if raw_embeddings is not None else []
        vectors = {
            rid: emb for rid, emb in zip(result_ids, embeddings) if emb is not None
        }

        vector_ids = list(vectors.keys())
        for i in range(len(vector_ids)):
            for j in range(i + 1, len(vector_ids)):
                id_a, id_b = vector_ids[i], vector_ids[j]
                similarity = _cosine_similarity(vectors[id_a], vectors[id_b])
                if similarity > _SIMILARITY_THRESHOLD:
                    pairs.append((by_id[id_a], by_id[id_b], similarity))

    return pairs


def _cosine_similarity(a, b) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


_PAIR_PROMPT = """\
Estos son dos fragmentos de memoria del mismo usuario, del mismo tipo, con alta \
similitud semántica ({similarity:.3f}). Determiná la relación entre ellos.
Responde SOLO con JSON válido, sin texto extra:
{{"relation": "same_fact" | "contradiction" | "different", "newer_id": "<id del fragmento más reciente si relation es same_fact, si no null>"}}

Reglas:
- "same_fact": describen el mismo hecho, uno reemplaza al otro con información más actual (ej. cambio de domicilio, de trabajo, de estado).
- "contradiction": afirman cosas incompatibles sobre lo mismo sin que quede claro cuál reemplaza a cuál.
- "different": tratan temas distintos aunque se parezcan en redacción.

Fragmento A (id={id_a}, registrado={recorded_a}):
{content_a}

Fragmento B (id={id_b}, registrado={recorded_b}):
{content_b}

JSON:"""


def _resolve_pair(entry_a: dict, entry_b: dict, similarity: float, summary: dict) -> None:
    content_a = entry_a.get("content_processed") or entry_a.get("content_raw") or ""
    content_b = entry_b.get("content_processed") or entry_b.get("content_raw") or ""

    raw = call_reason(
        messages=[
            {
                "role": "system",
                "content": "Sos un analista de memoria. Respondé únicamente con JSON válido.",
            },
            {
                "role": "user",
                "content": _PAIR_PROMPT.format(
                    similarity=similarity,
                    id_a=entry_a["id"], recorded_a=entry_a.get("recorded_at"), content_a=content_a,
                    id_b=entry_b["id"], recorded_b=entry_b.get("recorded_at"), content_b=content_b,
                ),
            },
        ],
    )
    verdict = _parse_verdict(raw)
    relation = verdict.get("relation")

    if relation == "same_fact":
        newer_id = verdict.get("newer_id")
        if newer_id not in (entry_a["id"], entry_b["id"]):
            # El modelo no identificó con claridad cuál es más nuevo: desempata por recorded_at.
            newer_id = (
                entry_a["id"] if entry_a["recorded_at"] >= entry_b["recorded_at"] else entry_b["id"]
            )
        older, newer = (
            (entry_b, entry_a) if newer_id == entry_a["id"] else (entry_a, entry_b)
        )
        _mark_superseded(older["id"], newer["recorded_at"])
        summary["obsolete"] += 1
        logger.info(
            "[consolidation] %s superseded por %s (mismo hecho, similitud=%.3f)",
            older["id"], newer["id"], similarity,
        )

    elif relation == "contradiction":
        # Bug real encontrado 2026-08-31: a diferencia de same_fact (que marca
        # valid_to en la entrada vieja -- un estado terminal que la saca de
        # _fetch_active_entries() para siempre), contradiction no cambia
        # valid_to en ninguna de las dos entradas -- ambas siguen "vigentes".
        # Sin este chequeo, el MISMO par sin resolver se re-detecta en cada
        # corrida diaria siguiente (la similitud no cambió) y se re-penaliza
        # cada vez: confidence decae exponencialmente para siempre (0.5, 0.25,
        # 0.125, ...) y el log de conflictos acumula un duplicado idéntico por
        # corrida, sin que ninguna intervención humana haya pasado todavía.
        # Confirmado en vivo: 2 corridas seguidas sobre el mismo par sin tocar
        # nada bajaron confidence de 1.0 a 0.5 y de 0.5 a 0.25.
        if _pair_already_conflicted(entry_a["id"], entry_b["id"]):
            logger.info(
                "[consolidation] Conflicto %s/%s ya estaba logueado -- se omite "
                "(evita re-penalizar/re-loguear una contradicción todavía sin resolver)",
                entry_a["id"], entry_b["id"],
            )
            return
        _reduce_confidence(entry_a["id"], entry_a.get("confidence", 1.0))
        _reduce_confidence(entry_b["id"], entry_b.get("confidence", 1.0))
        _log_conflict(entry_a["id"], entry_b["id"], similarity)
        summary["conflicts"] += 1
        logger.warning(
            "[consolidation] Conflicto entre %s y %s (similitud=%.3f) — revisión manual",
            entry_a["id"], entry_b["id"], similarity,
        )

    # relation == "different" (o respuesta no reconocida) -> ignorar, ninguna mutación.


def _parse_verdict(raw: str) -> dict:
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception as exc:
        logger.warning(
            "[consolidation] Respuesta del par no es JSON válido: %s | raw=%r", exc, raw[:200]
        )
    return {"relation": "different"}


def _mark_superseded(entry_id: str, newer_recorded_at: str) -> None:
    from jarvis.memory.service import update_entry

    update_entry(entry_id, valid_to=newer_recorded_at)


def _reduce_confidence(entry_id: str, current_confidence: float) -> None:
    from jarvis.memory.service import update_entry

    update_entry(entry_id, confidence=max(0.0, round(current_confidence * _CONFLICT_CONFIDENCE_PENALTY, 4)))


def _log_conflict(id_a: str, id_b: str, similarity: float) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    _POLICY_CONFLICT,
                    json.dumps({"entry_a": id_a, "entry_b": id_b, "similarity": similarity}, ensure_ascii=False),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
    finally:
        conn.close()


def _pair_already_conflicted(id_a: str, id_b: str) -> bool:
    """True si este par (en cualquier orden) ya fue logueado como conflicto en
    una corrida anterior -- ver el comentario en _resolve_pair() (bug real de
    re-penalización sin fin). Compara por par de ids, no por contenido: si el
    usuario edita una de las dos entradas (jarvis/memory/service.py::
    edit_entry(), pieza B) el id no cambia, así que el par sigue
    considerándose "ya resuelto" aunque el contenido ya no contradiga -- caso
    borde aceptado (el volumen real de conflictos es bajo, y de todos modos
    hace falta revisión manual del par; ver Cerebro/decisiones-
    implementacion.md, 2026-08-31).
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT value FROM jarvis_policies WHERE policy_type = ?", (_POLICY_CONFLICT,)
        ).fetchall()
    finally:
        conn.close()

    pair = {id_a, id_b}
    for row in rows:
        try:
            data = json.loads(row["value"])
        except Exception:
            continue
        if {data.get("entry_a"), data.get("entry_b")} == pair:
            return True
    return False


def _mark_stale_by_age(now: datetime) -> int:
    cutoff = (now - timedelta(days=_STALE_DAYS)).isoformat()
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                """UPDATE memory_entries
                   SET valid_to = ?
                   WHERE valid_to IS NULL
                     AND confidence < ?
                     AND valid_from IS NOT NULL
                     AND valid_from < ?""",
                (now.isoformat(), _STALE_CONFIDENCE, cutoff),
            )
            return cur.rowcount
    finally:
        conn.close()


def _backfill_catalog_tags(user_id: str = JARVIS_DEFAULT_USER) -> int:
    """Asigna tags del catálogo (pieza A) a entradas viejas que nunca pasaron
    por un clasificador catálogo-aware -- pieza D ("etiquetar entradas viejas
    que nunca pasaron por un clasificador con catálogo").

    Capado por corrida (_TAG_BACKFILL_LIMIT) para no disparar costo de LLM sin
    límite -- mismo criterio de "volumen bajo, ~20/día" que ya usa el resto del
    job. No re-clasifica type/project ni toca content_processed -- reusa
    call_classify() con el catálogo (mismo prompt que el worker usa en
    captura normal, jarvis/llm/client.py), solo lee "tags" del resultado.
    """
    from jarvis.llm.client import call_classify
    from jarvis.tags.service import entry_ids_without_catalog_tags, link_tags_for_entry, list_tag_catalog

    untagged = entry_ids_without_catalog_tags(user_id=user_id, limit=_TAG_BACKFILL_LIMIT)
    if not untagged:
        return 0

    catalog = list_tag_catalog(user_id)
    tagged = 0
    for entry in untagged:
        try:
            content = entry.get("content_processed") or entry.get("content_raw") or ""
            raw = call_classify(content, catalog)
            start, end = raw.find("{"), raw.rfind("}") + 1
            if start < 0 or end <= start:
                continue
            parsed = json.loads(raw[start:end])
            tags = parsed.get("tags")
            if isinstance(tags, list) and tags:
                link_tags_for_entry(entry["id"], tags, user_id)
                tagged += 1
        except Exception as exc:
            logger.warning(
                "[consolidation] Backfill de tags falló para entry_id=%s: %s", entry["id"], exc
            )
    return tagged


def _last_run_at() -> datetime | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT value FROM jarvis_policies WHERE policy_type = ? ORDER BY created_at DESC LIMIT 1",
            (_POLICY_LAST_RUN,),
        ).fetchone()
        if not row:
            return None
        return datetime.fromisoformat(row["value"])
    finally:
        conn.close()


def _record_run(now: datetime, summary: dict) -> None:
    conn = get_connection()
    try:
        with conn:
            now_iso = now.isoformat()
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), _POLICY_LAST_RUN, now_iso, now_iso),
            )
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), _POLICY_RUN_SUMMARY, json.dumps(summary, ensure_ascii=False), now_iso),
            )
    finally:
        conn.close()
