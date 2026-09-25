"""
Job de consolidación de memoria (Jarvis 0.2 — Slice 1).

Sin esto, hechos viejos y hechos nuevos sobre lo mismo (ej. "vivo en Madrid" en
enero, "me mudé a Buenos Aires" en agosto) coexisten en memory_entries sin que
nada le diga al sistema cuál es vigente, contaminando el RAG con conocimiento
obsoleto. Este job corre una vez cada JARVIS_CONSOLIDATION_INTERVAL_DAYS días
(default 7 — antes corría una vez por día, cambiado 2026-09-21; disparado desde
jarvis/worker/main.py) y hace tres cosas, en orden, sobre memory_entries
"vigentes" (valid_to IS NULL):

1. Detecta pares con alta similitud semántica (coseno > 0.92) del mismo tipo y
   user_id vía ChromaDB, y usa el modelo de razonamiento (externo, con fallback
   automático a local si no está disponible o el budget está agotado) para
   decidir si son el mismo hecho (marca el más viejo obsoleto), contradictorios
   (baja confidence en ambos y loguea para revisión manual) o distintos (ignora).
2. Marca como stale por edad (valid_from > 90 días, confidence < 0.4).
3. Loguea el resumen y registra la corrida en jarvis_policies (también sirve
   como marca de "última corrida" para el gating).

Nunca borra nada — solo marca valid_to o reduce confidence (spec: Memoria ≠
destrucción; ver Cerebro/estado-actual.md). La clasificación de pares usa
call_reason() (modelo externo con fallback a JARVIS_LOCAL_FALLBACK_MODEL ya
incorporado) — en pruebas reales el modelo local (llama3.2:3b) no clasificó
bien casos claros de "same_fact", mientras que el externo sí; el volumen es
bajo (~20 entradas/día) así que el costo es despreciable. Si ChromaDB no está
disponible, se salta el paso 1 y sigue con el paso 2.

Extendido con cinco pasos más en la misma corrida (sin thread ni scheduling
propio, mismo gating de should_run()): backfill de tags del catálogo (pieza
D, `_backfill_catalog_tags()`), auditoría proactiva de memoria por bloques
(`jarvis.audit.service.run_audit()`, huecos/contradicciones/duplicados/
conexiones/tags mal puestos, con propuestas por Telegram — ver
Cerebro/decisiones-implementacion.md, 2026-08-31), ingestión automática desde
la Agenda de SGR (`jarvis.ingestion.agenda.run_agenda_ingestion()`, 0.3 —
lee eventos/tareas ya pasados vía la API HTTP local y propone capturas, ver
Cerebro/decisiones-implementacion.md, 2026-09-03), síntesis de patrones de
Agenda (`jarvis.ingestion.agenda_patterns.run_agenda_pattern_synthesis()`,
2026-09-15 — corre todos los días pero se auto-gatea internamente a una vez
por semana, ver Cerebro/decisiones-implementacion.md, 2026-09-15), triage
automático del Inbox (`jarvis.ingestion.inbox_triage.run_inbox_triage()`,
2026-09-15 — mismo patrón de auto-gating semanal que la síntesis de patrones
de Agenda, ver Cerebro/decisiones-implementacion.md, "PROPUESTA... triage
automático del Inbox"), y pregunta abierta exploratoria
(`jarvis.audit.service.maybe_ask_open_question()`, dispara SOLO cuando
`_nothing_to_report()` da True — ver Cerebro/decisiones-implementacion.md,
2026-09-03).
"""
import json
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone

from jarvis.config import (
    JARVIS_AGENDA_PATTERN_CLUSTER_MIN_OCCURRENCES,
    JARVIS_CONSOLIDATION_INTERVAL_DAYS,
    JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD,
    JARVIS_CONSOLIDATION_STALE_CONFIDENCE,
    JARVIS_CONSOLIDATION_STALE_DAYS,
    JARVIS_DEFAULT_USER,
)
from jarvis.db.database import get_connection
from jarvis.llm.client import call_reason
from jarvis.privacy.gateway import filter_context
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_SIMILARITY_THRESHOLD = JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD
_STALE_DAYS = JARVIS_CONSOLIDATION_STALE_DAYS
_STALE_CONFIDENCE = JARVIS_CONSOLIDATION_STALE_CONFIDENCE
_CONFLICT_CONFIDENCE_PENALTY = 0.5
_RUN_INTERVAL = timedelta(days=JARVIS_CONSOLIDATION_INTERVAL_DAYS)

_POLICY_LAST_RUN = "consolidation_last_run"
_POLICY_RUN_SUMMARY = "consolidation_run"
_POLICY_CONFLICT = "consolidation_conflict"

# Pieza D (mantenimiento de memoria): tope de entradas re-etiquetadas por
# corrida del backfill de tags -- mismo criterio de costo acotado que ya usa
# el resto del job (volumen real ~20 capturas/día, así que 20 por corrida
# vacía el backlog en pocos días sin disparar el costo de LLM sin límite).
_TAG_BACKFILL_LIMIT = 20


def should_run(now: datetime | None = None) -> bool:
    """True si nunca corrió o si pasó >=_RUN_INTERVAL desde la última corrida."""
    now = now or datetime.now(timezone.utc)
    last = _last_run_at()
    return last is None or (now - last) >= _RUN_INTERVAL


def run_consolidation() -> dict:
    """Corre el job completo. No lanza — cualquier error queda en el resumen."""
    MANIFEST.assert_allowed("consolidate_memory")

    now = datetime.now(timezone.utc)
    entries: list[dict] = []
    summary = {
        "analyzed": 0, "obsolete": 0, "conflicts": 0, "tagged": 0,
        "audit": None, "errors": [],
        # Detalle solo para el reporte diario de Telegram (ver
        # Cerebro/decisiones-implementacion.md, 2026-09-03).
        "pairwise_detail": [], "stale_detail": [], "tagged_detail": [],
        # Ingestión automática desde Agenda de SGR (0.3, mismo día) -- sexto
        # paso, ver jarvis/ingestion/agenda.py.
        "agenda_ingestion": None,
        # Síntesis de patrones de Agenda (2026-09-15) -- séptimo paso, ver
        # jarvis/ingestion/agenda_patterns.py. Corre todos los días pero se
        # auto-gatea internamente a una vez por semana -- summary["ran"]
        # queda en False (sin tocar el resto) las corridas que no le tocaba.
        "agenda_patterns": None,
        # Triage automático del Inbox (2026-09-15) -- octavo paso, ver
        # jarvis/ingestion/inbox_triage.py. Mismo patrón de auto-gating
        # semanal que agenda_patterns -- summary["ran"] queda en False las
        # corridas que no le tocaba.
        "inbox_triage": None,
        # Pregunta abierta exploratoria (mismo día, 2026-09-03) -- quiet_day
        # queda registrado siempre (True/False), open_question solo se llena
        # si quiet_day fue True.
        "quiet_day": False, "open_question": None,
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

        stale_detail = _mark_stale_by_age(now)
        summary["stale_detail"] = stale_detail
        summary["obsolete"] += len(stale_detail)

        try:
            tagged_detail = _backfill_catalog_tags()
            summary["tagged_detail"] = tagged_detail
            summary["tagged"] = len(tagged_detail)
        except Exception as exc:
            logger.exception("[consolidation] Backfill de tags (pieza D) falló")
            summary["errors"].append(str(exc))

        # Auditoría proactiva de memoria (extensión del job diario, ver
        # Cerebro/decisiones-implementacion.md 2026-08-31) -- cuarto paso,
        # mismo gating de should_run(), sin thread ni scheduling propio.
        try:
            from jarvis.audit.service import run_audit

            # push=False (fix 2026-09-19, ver Cerebro/decisiones-implementacion.md
            # "resumen corto + preguntas al final"): no empujar todavía -- se
            # flushea la cola recién después de mandar el resumen corto, más
            # abajo en esta misma función.
            summary["audit"] = run_audit(now, push=False)
        except Exception as exc:
            logger.exception("[consolidation] Auditoría de memoria falló")
            summary["errors"].append(str(exc))

        # Ingestión automática desde Agenda de SGR -- sexto paso (0.3, ver
        # Cerebro/decisiones-implementacion.md, 2026-09-03, "0.3, Ingestión
        # Automática"). Mismo gating de 24h que el resto del job. Corre ANTES
        # del chequeo de quiet_day para que sus propuestas (si las hubo)
        # cuenten como "hubo algo que reportar" y no compitan con la
        # pregunta abierta exploratoria por atención (ver _nothing_to_report()).
        try:
            from jarvis.ingestion.agenda import run_agenda_ingestion

            summary["agenda_ingestion"] = run_agenda_ingestion(now, push=False)
        except Exception as exc:
            logger.exception("[consolidation] Ingestión de Agenda falló")
            summary["errors"].append(str(exc))

        # Síntesis de patrones de Agenda -- séptimo paso (2026-09-15, ver
        # Cerebro/decisiones-implementacion.md, "PROPUESTA... síntesis de
        # patrones de Agenda"). Corre TODOS los días como el resto del job,
        # pero internamente se auto-gatea a una vez por semana
        # (should_run_pattern_synthesis(), gate propio distinto del de 24h de
        # arriba) -- "un patrón de horario no cambia todos los días". Mismo
        # motivo que la ingestión literal para correr antes de quiet_day: si
        # propuso algo, no es un día "sin nada".
        try:
            from jarvis.ingestion.agenda_patterns import run_agenda_pattern_synthesis

            summary["agenda_patterns"] = run_agenda_pattern_synthesis(now, push=False)
        except Exception as exc:
            logger.exception("[consolidation] Síntesis de patrones de Agenda falló")
            summary["errors"].append(str(exc))

        # Triage automático del Inbox -- octavo paso (2026-09-15, ver
        # Cerebro/decisiones-implementacion.md, "PROPUESTA... triage
        # automático del Inbox (00 - Sin categorizar/)"). Corre TODOS los
        # días como el resto del job, pero se auto-gatea internamente a una
        # vez por semana (should_run_inbox_triage(), gate propio -- mismo
        # criterio que la síntesis de patrones de Agenda: con el umbral de
        # antigüedad de 21+ días, el conjunto de candidatas casi no cambia de
        # un día a otro). Corre antes de quiet_day: si propuso algo, no es un
        # día "sin nada".
        try:
            from jarvis.ingestion.inbox_triage import run_inbox_triage

            summary["inbox_triage"] = run_inbox_triage(now)
        except Exception as exc:
            logger.exception("[consolidation] Triage automático del Inbox falló")
            summary["errors"].append(str(exc))

        # Pregunta abierta exploratoria -- séptimo paso, dispara SOLO si esta
        # corrida no tuvo nada más que reportar (ver _nothing_to_report() y
        # Cerebro/decisiones-implementacion.md, 2026-09-03). No es un cuarto
        # tipo de hueco A/B/C -- mecanismo hermano y separado.
        summary["quiet_day"] = _nothing_to_report(summary)
        if summary["quiet_day"]:
            try:
                from jarvis.audit.service import maybe_ask_open_question
                from jarvis.debug.service import get_debug_chat_id

                oq_chat_id = get_debug_chat_id()
                oq_channel = "telegram" if oq_chat_id else "desktop"
                summary["open_question"] = maybe_ask_open_question(now, oq_channel, oq_chat_id)
            except Exception as exc:
                logger.exception("[consolidation] Pregunta abierta exploratoria falló")
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

    # Notificación de cada corrida, haya o no haya algo -- ver Cerebro/
    # decisiones-implementacion.md, 2026-09-03. Nunca debe tumbar el job:
    # la corrida ya terminó y ya quedó grabada en jarvis_policies arriba.
    try:
        _notify_run_report(now, summary, entries)
    except Exception:
        logger.exception("[consolidation] Error armando/enviando el reporte de Telegram")

    # Flush de las colas de propuestas -- recién ACÁ, después del resumen de
    # arriba (fix 2026-09-19, ver Cerebro/decisiones-implementacion.md
    # "resumen corto + preguntas al final"). run_audit()/run_agenda_
    # ingestion()/run_agenda_pattern_synthesis() corrieron con push=False
    # más arriba -- sus propuestas (huecos de entidad, eventos/tareas de
    # Agenda, patrones, triage del Inbox) quedaron en cola sin empujar.
    # push_next_audit_batch()/push_next_capture_batch() son las mismas
    # funciones de siempre (mismo throttle/batch-size, misma lógica de
    # expiración desde pushed_at) -- solo cambia CUÁNDO se llaman la primera
    # vez en el día, no cómo funcionan. Esto es exclusivo de la consolidación
    # diaria: el resto del día, si el worker detecta algo digno de confirmar
    # fuera de esta corrida (captura pasiva por inactividad, etc.), lo sigue
    # preguntando en el momento -- el tick ocioso normal del worker
    # (jarvis/worker/main.py) llama estas mismas funciones sin cambios.
    try:
        from jarvis.audit.service import push_next_audit_batch
        from jarvis.captures.passive import push_next_capture_batch
        from jarvis.debug.service import get_debug_chat_id

        chat_id = get_debug_chat_id()
        if chat_id:
            push_next_audit_batch("telegram", chat_id, JARVIS_DEFAULT_USER)
            push_next_capture_batch("telegram", chat_id, JARVIS_DEFAULT_USER)
    except Exception:
        logger.exception("[consolidation] Error flusheando la cola de propuestas tras el resumen")

    return summary


def _fetch_active_entries() -> list[dict]:
    """Entradas todavía vigentes (no marcadas obsoletas/superseded en una corrida previa)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, type, user_id, content_raw, content_processed,
                      recorded_at, valid_from, confidence, origin_trust,
                      local_only, confidential
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
    if len(filter_context([entry_a, entry_b])) != 2:
        return
    from jarvis.tags.service import get_tags_for_entry

    content_a = entry_a.get("content_processed") or entry_a.get("content_raw") or ""
    content_b = entry_b.get("content_processed") or entry_b.get("content_raw") or ""

    # Detalle para el reporte diario de Telegram (ver Cerebro/decisiones-
    # implementacion.md, 2026-09-03) -- se completa "action" según la rama
    # que siga abajo y se agrega SIEMPRE a summary["pairwise_detail"],
    # incluida "different" (nunca solo los pares con acción real): el
    # pedido explícito era listar todo par que cruzó el umbral y llegó al
    # LLM, con o sin consecuencia. Eso sigue siendo cierto para la
    # RECOLECCIÓN de datos acá (no cambia -- _record_run() sigue
    # persistiendo el historial completo en jarvis_policies). Lo que
    # cambió (ver Cerebro/decisiones-implementacion.md, 2026-09-16) es
    # que _section_pairwise() ahora filtra qué se LISTA en detalle en el
    # texto del reporte de Telegram: los "different" (sin acción real)
    # se reducen a un conteo, no se listan uno por uno.
    detail = {
        "content_a": _short(content_a), "content_b": _short(content_b),
        "tags_a": get_tags_for_entry(entry_a["id"]), "tags_b": get_tags_for_entry(entry_b["id"]),
        "similarity": round(similarity, 3), "relation": None, "action": None,
    }

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
    detail["relation"] = relation

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
        detail["action"] = f"{older['id'][:8]} marcada obsoleta (mismo hecho, reemplazada por {newer['id'][:8]})"
        logger.info(
            "[consolidation] %s superseded por %s (mismo hecho, similitud=%.3f)",
            older["id"], newer["id"], similarity,
        )
        _propose_archive(older["id"], f"mismo hecho que {newer['id'][:8]}, reemplazada")

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
            detail["action"] = "contradicción -- ya estaba logueada de una corrida anterior, no se repite la penalización"
            summary["pairwise_detail"].append(detail)
            return
        _reduce_confidence(entry_a["id"], entry_a.get("confidence", 1.0))
        _reduce_confidence(entry_b["id"], entry_b.get("confidence", 1.0))
        _log_conflict(entry_a["id"], entry_b["id"], similarity)
        summary["conflicts"] += 1
        detail["action"] = "confianza reducida en ambas entradas, conflicto logueado para revisión manual"
        logger.warning(
            "[consolidation] Conflicto entre %s y %s (similitud=%.3f) — revisión manual",
            entry_a["id"], entry_b["id"], similarity,
        )

    else:
        # relation == "different" (o respuesta no reconocida) -> ignorar, ninguna mutación.
        detail["action"] = "sin acción (el modelo los juzgó contenidos distintos)"

    summary["pairwise_detail"].append(detail)


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


def _propose_archive(entry_id: str, reason: str) -> None:
    """Fusión Jarvis + Bóveda (2026-09-11, addendum punto 1): el marcado de
    valid_to arriba sigue siendo inmediato, sin gating, como ya funcionaba --
    lo nuevo es proponer (gateado, nunca automático) mover el .md a
    `04 - Archivo/`. Solo aplica a same_fact/stale_por_edad (juicio
    algorítmico, puede estar mal); forget_entry() explícito NO pasa por acá
    (ver jarvis/memory/service.py::forget_entry(), esa confirmación ya
    existió). Best-effort -- nunca debe tumbar la corrida de consolidación.
    """
    try:
        from jarvis.audit.service import propose_archive_superseded
        from jarvis.debug.service import get_debug_chat_id

        chat_id = get_debug_chat_id()
        channel = "telegram" if chat_id else "desktop"
        propose_archive_superseded(entry_id, reason, channel, chat_id, JARVIS_DEFAULT_USER)
    except Exception as exc:
        logger.warning(
            "[consolidation] No se pudo proponer archivado para entry_id=%s: %s", entry_id, exc
        )


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


def _mark_stale_by_age(now: datetime) -> list[dict]:
    """Marca obsoletas por antigüedad y devuelve el detalle de cada una
    (contenido corto, antigüedad en días, confidence) para el reporte diario
    de Telegram (ver Cerebro/decisiones-implementacion.md, 2026-09-03) --
    antes solo devolvía el rowcount del UPDATE, sin decir CUÁLES ni POR QUÉ.
    """
    cutoff = (now - timedelta(days=_STALE_DAYS)).isoformat()
    conn = get_connection()
    try:
        with conn:
            rows = conn.execute(
                """SELECT id, content_raw, content_processed, confidence, valid_from
                   FROM memory_entries
                   WHERE valid_to IS NULL
                     AND confidence < ?
                     AND valid_from IS NOT NULL
                     AND valid_from < ?""",
                (_STALE_CONFIDENCE, cutoff),
            ).fetchall()
            ids = [r["id"] for r in rows]
            if ids:
                placeholders = ",".join("?" * len(ids))
                conn.execute(
                    f"UPDATE memory_entries SET valid_to = ? WHERE id IN ({placeholders})",
                    [now.isoformat()] + ids,
                )
            detail = []
            for r in rows:
                content = r["content_processed"] or r["content_raw"] or ""
                age_days = None
                try:
                    valid_from = datetime.fromisoformat(r["valid_from"])
                    if valid_from.tzinfo is None:
                        valid_from = valid_from.replace(tzinfo=timezone.utc)
                    age_days = (now - valid_from).days
                except Exception:
                    pass
                detail.append({
                    "id": r["id"], "content": _short(content),
                    "confidence": r["confidence"], "age_days": age_days,
                })
    finally:
        conn.close()

    # Propuesta de archivado (fuera del `with conn:` de arriba -- fusión
    # Jarvis + Bóveda, ver _propose_archive()) por cada entrada recién
    # marcada stale, una por una (no hay agrupación como en same_fact).
    for d in detail:
        _propose_archive(d["id"], f"stale por antigüedad ({d['age_days']}d)")

    return detail


def _backfill_catalog_tags(user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Asigna tags del catálogo (pieza A) a entradas viejas que nunca pasaron
    por un clasificador catálogo-aware -- pieza D ("etiquetar entradas viejas
    que nunca pasaron por un clasificador con catálogo").

    Capado por corrida (_TAG_BACKFILL_LIMIT) para no disparar costo de LLM sin
    límite -- mismo criterio de "volumen bajo, ~20/día" que ya usa el resto del
    job. No re-clasifica type/project ni toca content_processed -- reusa
    call_classify() con el catálogo (mismo prompt que el worker usa en
    captura normal, jarvis/llm/client.py), solo lee "tags" del resultado.

    Devuelve el detalle por entrada (contenido corto + tags asignados) para
    el reporte diario de Telegram (ver Cerebro/decisiones-implementacion.md,
    2026-09-03) -- antes devolvía solo un contador.
    """
    from jarvis.llm.client import call_classify
    from jarvis.tags.service import entry_ids_without_catalog_tags, link_tags_for_entry, list_tag_catalog

    untagged = entry_ids_without_catalog_tags(user_id=user_id, limit=_TAG_BACKFILL_LIMIT)
    if not untagged:
        return []

    catalog = list_tag_catalog(user_id)
    detail = []
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
                detail.append({"id": entry["id"], "content": _short(content), "tags": tags})
        except Exception as exc:
            logger.warning(
                "[consolidation] Backfill de tags falló para entry_id=%s: %s", entry["id"], exc
            )
    return detail


def _nothing_to_report(summary: dict) -> bool:
    """True si esta corrida no tuvo NADA de las 7 categorías del reporte
    diario (pairwise/stale/backfill de tags/hallazgos de auditoría/ingestión
    de Agenda/síntesis de patrones de Agenda/triage del Inbox) -- gate para
    disparar la pregunta abierta exploratoria (ver Cerebro/decisiones-
    implementacion.md, 2026-09-03).

    "Hallazgos de auditoría" se generaliza acá a
    summary["audit"]["proposed"] == 0 en vez de mirar solo
    tag_block_findings/random_block_findings por separado -- ese contador ya
    suma bloques tag+random, entradas vacías detectadas Y huecos de entidad
    tipo A (ver jarvis/audit/service.py::run_audit()). Si el audit propuso
    ALGO ese día por CUALQUIER camino (incluido un hueco tipo A con 2+
    menciones), no es un día "sin nada" -- la pregunta abierta no debe
    competir por atención con una propuesta real ya generada. Mismo criterio
    para la ingestión de Agenda (0.3, mismo día) y para la síntesis de
    patrones (2026-09-15, corre como mucho una vez por semana -- las
    corridas en las que no le toca ni siquiera aportan a esta cuenta,
    summary["agenda_patterns"]["ran"] queda en False y los contadores en 0):
    si propusieron algo, tampoco es un día "sin nada".
    """
    if summary.get("pairwise_detail") or summary.get("stale_detail") or summary.get("tagged_detail"):
        return False
    audit = summary.get("audit")
    if audit and audit.get("proposed", 0) > 0:
        return False
    agenda = summary.get("agenda_ingestion")
    if agenda and agenda.get("proposed", 0) > 0:
        return False
    patterns = summary.get("agenda_patterns")
    if patterns and (patterns.get("rule_based_proposed", 0) > 0 or patterns.get("clusters_proposed", 0) > 0):
        return False
    triage = summary.get("inbox_triage")
    if triage and triage.get("proposed", 0) > 0:
        return False
    return True


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


def _short(content: str, n: int = 100) -> str:
    c = (content or "").strip().replace("\n", " ")
    return c if len(c) <= n else c[:n].rstrip() + "…"


# ── Reporte diario de Telegram ────────────────────────────────────────────────
# Ver Cerebro/decisiones-implementacion.md, 2026-09-03: antes solo se
# empujaba un mensaje si la auditoría generaba una propuesta -- el resto (o
# una corrida sin hallazgos) quedaba solo en el JSON terso de
# jarvis_policies.consolidation_run. Se probó despues (mismo día) "reporte
# con detalle legible, partido en varios mensajes" -- con la Bóveda real
# indexada eso llegó a ser un reporte de 37 mensajes de puro ruido (ver
# Cerebro/decisiones-implementacion.md, 2026-09-19, "resumen corto +
# preguntas al final"). Pedido explícito del usuario esa fecha: un resumen
# corto (máx. 10 líneas) en vez del detalle línea por línea -- el detalle
# COMPLETO (pairwise_detail, tag_block_entries, etc.) sigue persistiendo sin
# cambios en jarvis_policies.consolidation_run para quien lo necesite después,
# esto es un cambio de presentación en Telegram únicamente.

def _notify_run_report(now: datetime, summary: dict, entries: list[dict]) -> None:
    from jarvis.debug.service import get_debug_chat_id
    from jarvis.notify.telegram import send_report

    title = f"📊 Consolidación — {now.strftime('%Y-%m-%d %H:%M')} UTC"
    sections = [_build_short_summary(summary, entries)]

    chat_id = get_debug_chat_id()
    if not chat_id:
        logger.info(
            "[consolidation] Sin chat_id de Telegram configurado (JARVIS_TELEGRAM_CHAT_ID "
            "ni derivado de /j) -- reporte solo queda en el log:\n%s",
            "\n\n".join([title] + sections),
        )
        return
    send_report(chat_id, title, sections)


def _build_short_summary(summary: dict, entries: list[dict]) -> str:
    """Resumen de ≤10 líneas de toda la corrida (fix 2026-09-19, ver el
    comentario largo arriba de _notify_run_report()). Reemplaza a
    _build_report_sections() (queda sin uso, no se borra por si hace falta
    volver al detalle completo -- ver Pendientes en el reporte de cierre de
    esa fecha) como lo que se manda por Telegram.
    """
    lines = [f"📋 {summary.get('analyzed', 0)} entradas analizadas"]

    pairwise = summary.get("pairwise_detail") or []
    con_accion = len([d for d in pairwise if d.get("relation") in ("same_fact", "contradiction")])
    if pairwise:
        lines.append(f"🔗 {len(pairwise)} pares comparados — {con_accion} con acción")
    lines.append(
        f"🗑️ {summary.get('obsolete', 0)} obsoletas · 🏷️ {summary.get('tagged', 0)} tags nuevos"
    )

    audit = summary.get("audit")
    total_proposed = 0
    if audit:
        findings = len(audit.get("tag_block_findings") or []) + len(audit.get("random_block_findings") or [])
        huecos = len(audit.get("entity_gap_detail") or [])
        lines.append(f"🔍 Auditoría: {findings} hallazgos · {huecos} huecos de entidad")
        total_proposed += audit.get("proposed", 0)

    agenda = summary.get("agenda_ingestion")
    if agenda and (agenda.get("events_scanned") or agenda.get("tasks_scanned")):
        lines.append(
            f"🗓️ Agenda: {agenda.get('events_scanned', 0)} eventos, "
            f"{agenda.get('tasks_scanned', 0)} tareas completadas"
        )
        total_proposed += agenda.get("proposed", 0)

    patterns = summary.get("agenda_patterns")
    if patterns and patterns.get("ran"):
        total_proposed += patterns.get("rule_based_proposed", 0) + patterns.get("clusters_proposed", 0)
        lines.append("🔁 Síntesis de patrones de Agenda: corrió esta vez")

    triage = summary.get("inbox_triage")
    if triage and triage.get("ran"):
        total_proposed += triage.get("proposed", 0)
        lines.append(f"🗂️ Triage del Inbox: {triage.get('proposed', 0)} propuestas")

    if summary.get("quiet_day") and summary.get("open_question"):
        lines.append("❓ Día tranquilo — te va a llegar una pregunta abierta a continuación.")
    elif total_proposed:
        lines.append(f"👉 {total_proposed} propuesta(s) esperando tu sí/no — llegan a continuación.")
    else:
        lines.append("Sin propuestas pendientes de confirmación hoy.")

    if summary.get("errors"):
        lines.append(f"⚠️ {len(summary['errors'])} error(es) durante la corrida.")

    return "\n".join(lines)


def _build_report_sections(summary: dict, entries: list[dict]) -> list[str]:
    sections = [
        _section_analyzed(entries),
        _section_pairwise(summary.get("pairwise_detail") or []),
        _section_stale(summary.get("stale_detail") or []),
        _section_tagged(summary.get("tagged_detail") or []),
    ]

    audit_summary = summary.get("audit")
    if audit_summary:
        from jarvis.audit.service import build_audit_report_text

        sections.append(build_audit_report_text(audit_summary))
    else:
        sections.append("🔍 Auditoría de memoria: no corrió esta vez (ver errores abajo).")

    sections.append(_section_agenda_ingestion(summary.get("agenda_ingestion")))

    sections.append(_section_agenda_patterns(summary.get("agenda_patterns")))

    sections.append(_section_inbox_triage(summary.get("inbox_triage")))

    sections.append(_section_open_question(summary.get("quiet_day", False), summary.get("open_question")))

    if summary.get("errors"):
        sections.append(
            "⚠️ Errores durante la corrida:\n" + "\n".join(f"• {e}" for e in summary["errors"])
        )
    return sections


def _section_analyzed(entries: list[dict]) -> str:
    from jarvis.tags.service import get_tags_for_entry

    lines = [f"📋 Analizado: {len(entries)} entradas vigentes"]
    for e in entries:
        content = _short(e.get("content_processed") or e.get("content_raw") or "")
        tags = get_tags_for_entry(e["id"])
        lines.append(f"  • {content} — {', '.join(tags) or 'sin tags'}")
    return "\n".join(lines)


def _section_pairwise(detail: list[dict]) -> str:
    if not detail:
        return f"Pares comparados (similitud > {_SIMILARITY_THRESHOLD:.2f}): ninguno esta corrida."
    con_accion = [d for d in detail if d["relation"] in ("same_fact", "contradiction")]
    sin_accion = len(detail) - len(con_accion)
    lines = [f"Pares comparados (similitud > {_SIMILARITY_THRESHOLD:.2f}, {len(detail)}):"]
    for d in con_accion:
        lines.append(
            f"  • [A] {d['content_a']} {', '.join(d['tags_a']) or 'sin tags'} / "
            f"[B] {d['content_b']} {', '.join(d['tags_b']) or 'sin tags'}\n"
            f"    sim={d['similarity']:.3f} — veredicto: {d['relation']} — {d['action']}"
        )
    if sin_accion:
        lines.append(f"  • Sin acción (el modelo los juzgó contenidos distintos): {sin_accion}")
    return "\n".join(lines)


def _section_stale(detail: list[dict]) -> str:
    if not detail:
        return "Marcadas obsoletas por antigüedad: ninguna esta corrida."
    lines = [f"Marcadas obsoletas por antigüedad ({len(detail)}):"]
    for d in detail:
        age = f"{d['age_days']}d" if d["age_days"] is not None else "?"
        lines.append(f"  • {d['content']} — antigüedad {age}, confidence={d['confidence']}")
    return "\n".join(lines)


def _section_tagged(detail: list[dict]) -> str:
    if not detail:
        return "Tags nuevos asignados (backfill): ninguno esta corrida."
    lines = [f"Tags nuevos asignados (backfill) ({len(detail)}):"]
    for d in detail:
        lines.append(f"  • {d['content']} → {', '.join(d['tags'])}")
    return "\n".join(lines)


def _section_agenda_ingestion(agenda: dict | None) -> str:
    """Sección "Ingestión de Agenda" del reporte diario (0.3, ver
    jarvis/ingestion/agenda.py) -- mismo criterio que el resto del reporte:
    decir explícitamente qué se revisó y qué no pasó nada, nunca en silencio.
    """
    if agenda is None:
        return "🗓️ Ingestión de Agenda: no corrió esta vez (ver errores abajo)."
    proposed = agenda.get("proposed_detail") or []
    header = (
        f"🗓️ Ingestión de Agenda ({agenda.get('events_scanned', 0)} eventos, "
        f"{agenda.get('tasks_scanned', 0)} tareas completadas revisadas):"
    )
    if not proposed:
        return f"{header} nada nuevo para proponer esta corrida."
    lines = [header]
    for d in proposed:
        lines.append(f"  • {_short(d['content'])}")
    return "\n".join(lines)


def _section_agenda_patterns(patterns: dict | None) -> str:
    """Sección "Síntesis de patrones de Agenda" del reporte diario (2026-09-15,
    ver jarvis/ingestion/agenda_patterns.py) -- mismo criterio que el resto
    del reporte: decir explícitamente qué pasó, nunca en silencio, incluido
    el caso normal de "esta semana no le tocaba correr" (gate propio de 7
    días, distinto del de 24h del resto del job).
    """
    if patterns is None:
        return "🔁 Síntesis de patrones de Agenda: no corrió esta vez (ver errores abajo)."
    if not patterns.get("ran"):
        return "🔁 Síntesis de patrones de Agenda: no le tocaba esta corrida (gate semanal)."
    proposed = patterns.get("proposed_detail") or []
    header = (
        f"🔁 Síntesis de patrones de Agenda "
        f"({patterns.get('rule_based_scanned', 0)} eventos recurrentes, "
        f"{patterns.get('clusters_scanned', 0)} clusters de {JARVIS_AGENDA_PATTERN_CLUSTER_MIN_OCCURRENCES}+ ocurrencias revisados):"
    )
    if not proposed:
        return f"{header} nada nuevo para proponer esta corrida."
    lines = [header]
    for d in proposed:
        lines.append(f"  • {_short(d['content'])}")
    return "\n".join(lines)


def _section_inbox_triage(triage: dict | None) -> str:
    """Sección "Triage del Inbox" del reporte diario (2026-09-15, ver
    jarvis/ingestion/inbox_triage.py) -- mismo criterio que el resto del
    reporte: decir explícitamente qué pasó, nunca en silencio, incluido el
    caso normal de "esta semana no le tocaba correr" (gate propio de 7 días,
    distinto del de 24h del resto del job).
    """
    if triage is None:
        return "🗂️ Triage del Inbox: no corrió esta vez (ver errores abajo)."
    if not triage.get("ran"):
        return "🗂️ Triage del Inbox: no le tocaba esta corrida (gate semanal)."
    proposed = triage.get("proposed_detail") or []
    header = f"🗂️ Triage del Inbox ({triage.get('candidates_scanned', 0)} candidatas revisadas):"
    if not proposed:
        return f"{header} nada nuevo para proponer esta corrida."
    lines = [header]
    for d in proposed:
        lines.append(f"  • {_short(d['content'])} → {d['dest']}")
    return "\n".join(lines)


def _section_open_question(quiet_day: bool, open_question: dict | None) -> str:
    """Sección "Pregunta abierta" del reporte diario -- nunca se omite (mismo
    criterio del resto del reporte: decir explícitamente por qué no pasó
    nada, en vez de quedar en silencio). Va DENTRO del mismo mensaje de
    reporte (ver _build_report_sections()) -- pedido explícito, nunca un
    ping de Telegram desconectado aparte (ver maybe_ask_open_question()).
    """
    if not quiet_day:
        return "❓ Pregunta abierta: no aplica hoy (hubo otras cosas para reportar arriba)."
    if open_question is None:
        return "❓ Pregunta abierta: no se evaluó (error interno, ver errores abajo)."
    if not open_question.get("asked"):
        return (
            f"❓ Pregunta abierta: nada más para reportar hoy, pero no "
            f"disparé ninguna ({open_question.get('reason')})."
        )
    return (
        f"❓ Pregunta abierta (nada más para reportar hoy, aprovecho a "
        f"preguntar):\n{open_question['question']}"
    )


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
