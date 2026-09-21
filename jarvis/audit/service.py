"""
Auditoría proactiva de memoria (Jarvis 0.2 Slice 4 — extensión de
consolidation.py). Ver Cerebro/decisiones-implementacion.md, 2026-08-31
("PROPUESTA... auditoría proactiva de memoria en consolidation.py",
aprobada y con las decisiones abiertas resueltas el mismo día).

A diferencia de consolidation.py (que solo compara PARES de alta similitud
de embedding), esto mira bloques de memoria completos buscando huecos,
contradicciones, duplicados, conexiones entre temas distintos y tags mal
puestos. Corre como cuarto paso de run_consolidation() (mismo job diario,
mismo gating de 24h vía should_run() -- sin thread ni scheduling nuevo).

Dos bloques por corrida, roles distintos (ver el doc, punto 2):
  - un bloque agrupado por el tag con más entradas sin auditar (contexto
    temático real para juzgar coherencia interna).
  - un bloque genuinamente random sobre toda la memoria vigente (para cruzar
    relaciones entre tags/entidades distintas que un muestreo estructurado
    nunca compararía -- pedido explícito del usuario).

Tres tipos de "hueco" (punto 3): tipo A (entidad mencionada 2+ veces sin
entrada PEOPLE propia -- SQL puro, escala a la acción "create") y tipo B
(entrada aislada, sin entidad ni proyecto -- SQL puro, sin acción, expuesta
vía list_isolated_entries() para Explorar, nunca genera una propuesta) se
detectan por consulta directa; tipo C (referencia sin resolver dentro de una
entrada, ej. "¿Quién es José?") lo detecta el LLM leyendo el contenido de
cada bloque, junto con contradicción/duplicado/conexión/tag incorrecto.

Ninguna acción se aplica sin pasar por jarvis_audit_proposals
(PENDING -> ACCEPTED/REJECTED/EXPIRED) -- ver create_proposal()/
accept_proposal(). Reusa el mismo patrón que jarvis/captures/passive.py,
tabla separada por shape distinto (target_entry_ids/payload/action_type).

Decisiones de esta sesión de implementación no cerradas del todo por el
documento de diseño -- resueltas acá con criterio propio, reportadas al
usuario al cierre (ver instrucción explícita de la tarea, "no lo resuelvas
en silencio"):
  1. El prompt de bloque NO reintenta detectar huecos de entidad
     ("gap_needs_entry") -- el punto 3 del doc ya lo define como "SQL puro,
     sin LLM"; dejar que el LLM también lo buscara hubiera generado
     propuestas "create" duplicadas por dos caminos distintos para la misma
     entidad.
  2. La acción "delete" (una de las 8 aprobadas) no tenía disparador propio
     en el documento -- se implementa acá exclusivamente para el caso
     objetivamente determinable sin LLM: contenido vacío/en blanco. El resto
     de "obsoleta/duplicada" del template de pregunta original ya lo cubre
     "merge" (marca la vieja como reemplazada).
  3. El costo de los llamados de síntesis de "create" (uno por hueco de
     entidad, fuera de los 2 llamados/bloque) no estaba presupuestado en el
     punto 5 del doc -- se capa acá a _ENTITY_CREATE_LIMIT=3/corrida, mismo
     criterio de costo acotado que el resto del sistema.
  4. El origin_trust "mínimo" de una entrada "create" requiere un orden
     total entre los 5 valores del CHECK que el schema nunca definió -- se
     construye uno acá (_TRUST_RANK), con web.untrusted estrictamente el más
     bajo (coincide con el nombre) y los dos orígenes de usuario directo
     empatados arriba.
  5. [SUPERADO 2026-09-17, ver más abajo y Cerebro/decisiones-implementacion.md]
     Cuando hay varias propuestas individuales (no agrupadas) PENDING para
     el mismo chat a la vez, una respuesta de texto libre en Telegram
     resolvía la más VIEJA primero (FIFO) sin avisar -- el documento asumía
     una sola pendiente a la vez (mismo supuesto que ya tenía captura
     pasiva), sin contemplar que un solo audit run puede generar varias de
     golpe. Esto era seguro en la práctica mientras JARVIS_AUDIT_PUSH_BATCH_SIZE
     fuera 1 (nunca había 2+ PENDING+pushed a la vez), pero quedaba roto en
     cuanto esa variable subía a 2+ -- ver la entrada de desambiguación
     (2026-09-17) para el fix real: ya no se resuelve a ciegas, se pide al
     usuario que aclare a cuál se refiere cuando hay 2+.

Extensión 2026-08-31 ("respuestas de texto libre con información nueva",
ver Cerebro/decisiones-implementacion.md): generaliza a las 7 acciones que
no son `clarify` el criterio de que una respuesta de texto libre a una
propuesta individual PENDING que no es un "no" limpio ni un "sí" limpio
trae información real, en vez de tratarla como rechazo-con-motivo (lo que
hacía antes, perdiendo esa información). `resolve_individual_reply()` es
el punto de entrada único (reemplaza la interpretación que antes vivía
repartida en project/mybot/jarvis_handlers.py); no las 8 acciones se
resuelven igual -- ver el docstring de esa función y el documento de
decisiones para el detalle caso por caso y los trade-offs.

Extensión 2026-09-03 ("pregunta abierta exploratoria", ver Cerebro/
decisiones-implementacion.md): noveno action_type, `open_question` --
dispara SOLO cuando run_consolidation() no tuvo NADA más que reportar
(pairwise/stale/backfill/hallazgos de auditoría, ver
jarvis/worker/consolidation.py::_nothing_to_report()). No es un cuarto tipo
de hueco (A/B/C siguen exactamente igual, gateados por evidencia real) --
es un mecanismo hermano y separado que solo se activa cuando esos tres
mecanismos existentes ya buscaron y no encontraron nada. Jerarquía de
fallback de dos niveles (ver maybe_ask_open_question()): entidades
mencionadas exactamente 1 vez (por debajo del umbral memory_count>=2 del
hueco tipo A -- hay algo real de qué preguntar) y, si no hay ninguna,
preguntas de arranque genéricas (base recién vacía, el caso motivador). Se
resuelve igual que `clarify` (la respuesta ES el contenido nuevo) porque
comparte su forma -- "hay una pregunta pendiente, la respuesta de texto
libre la contesta" -- no la forma de las otras 7 acciones (que proponen una
mutación concreta sobre memoria ya existente).
"""
import json
import logging
import random
import re
import uuid
from datetime import datetime, timedelta, timezone

from jarvis.config import (
    JARVIS_AUDIT_BLOCK_SIZE,
    JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES,
    JARVIS_AUDIT_PUSH_BATCH_SIZE,
    JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS,
    JARVIS_DEFAULT_USER,
    JARVIS_OPEN_QUESTION_COOLDOWN_DAYS,
    JARVIS_OPEN_QUESTION_ENABLED,
)
from jarvis.db.database import get_connection
from jarvis.llm.client import call_reason
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_ENTITY_CREATE_LIMIT = 3
_MAX_FRAGMENT_CHARS = 500

# Throttle de propuestas de auditoría (Cerebro/decisiones-implementacion.md,
# 2026-09-17): estos 8 action_types son los únicos que se encolan (pushed_at
# NULL al crearse, canal telegram) y avanzan de a JARVIS_AUDIT_PUSH_BATCH_SIZE
# por vez. flag_contradiction/flag_connection quedan afuera a propósito (van
# en UN solo mensaje agrupado vía build_grouped_message() -- ya no son una
# ráfaga de mensajes separados, no hace falta throttlearlos) y open_question
# también queda afuera (nunca se pushea individual, va embebido en el
# reporte diario -- regla previa, sin cambios). MANTENER SINCRONIZADO con el
# backfill de jarvis/db/database.py::_migrate().
_QUEUED_INDIVIDUAL_ACTION_TYPES = frozenset({
    "create", "clarify", "merge", "edit", "delete", "retag",
    "archive_superseded", "triage_move",
})

_LOCAL_PREFIX_RE = re.compile(r"^\s*\[modo local\]\s*", re.IGNORECASE)
_NUM_RE = re.compile(r"\d+")

# Interpretación propia de "origin_trust nunca aumenta en derivados" para el
# caso "create" -- ver nota 4 arriba. web.untrusted es estrictamente el más
# bajo; system/migration quedan en el medio; los dos orígenes de usuario
# directo quedan arriba, empatados (no hay razón documentada para preferir
# uno sobre el otro).
_TRUST_RANK = {
    "web.untrusted": 0,
    "system": 1,
    "migration": 2,
    "telegram.user": 3,
    "user.authenticated": 3,
}


# ── Orquestación (llamado desde consolidation.py) ────────────────────────────

def run_audit(now: datetime | None = None, push: bool = True) -> dict:
    """Corre la auditoría completa. Nunca lanza -- cualquier error queda en
    el resumen (mismo patrón que run_consolidation()/scan_and_propose()).

    push=False (fix del 2026-09-19, ver Cerebro/decisiones-implementacion.md
    -- "resumen corto + preguntas al final"): omite el empuje inmediato a
    Telegram de las propuestas que esta corrida generó. Único llamador de
    run_audit() es run_consolidation() (confirmado, no hay otro call site),
    que ahora manda primero el resumen corto de la corrida completa y recién
    después flushea la cola (mismo push_next_audit_batch(), solo que
    diferido) -- así las preguntas de sí/no quedan como últimos mensajes, no
    los primeros. Default True para no romper el contrato de la función si
    algún día se llama desde otro lado.
    """
    MANIFEST.assert_allowed("audit_memory")
    MANIFEST.assert_allowed("propose_audit_action")

    now = now or datetime.now(timezone.utc)
    user_id = JARVIS_DEFAULT_USER
    summary = {
        "tag_block": 0, "random_block": 0, "proposed": 0, "errors": [],
        # Detalle solo para el reporte diario de Telegram (ver
        # Cerebro/decisiones-implementacion.md, 2026-09-03) -- nada de esto
        # se persiste más allá de jarvis_policies.consolidation_run.
        "tag_block_name": None, "tag_block_entries": [], "tag_block_findings": [],
        "tag_block_deleted_empty": [],
        "random_block_entries": [], "random_block_findings": [],
        "random_block_deleted_empty": [],
        "entity_gap_detail": [],
    }

    from jarvis.debug.service import get_debug_chat_id

    chat_id = get_debug_chat_id()
    channel = "telegram" if chat_id else "desktop"

    created_ids: list[str] = []
    try:
        tag_name, tag_block = _select_tag_block(user_id)
        summary["tag_block"] = len(tag_block)
        summary["tag_block_name"] = tag_name
        summary["tag_block_entries"] = [_entry_brief(e) for e in tag_block]
        created, tag_findings, tag_deleted = _process_block(tag_block, channel, chat_id, user_id, summary)
        created_ids += created
        summary["tag_block_findings"] = tag_findings
        summary["tag_block_deleted_empty"] = tag_deleted

        seen_ids = {e["id"] for e in tag_block}
        random_block = _select_random_block(user_id, exclude_ids=seen_ids)
        summary["random_block"] = len(random_block)
        summary["random_block_entries"] = [_entry_brief(e) for e in random_block]
        created, random_findings, random_deleted = _process_block(random_block, channel, chat_id, user_id, summary)
        created_ids += created
        summary["random_block_findings"] = random_findings
        summary["random_block_deleted_empty"] = random_deleted
        seen_ids |= {e["id"] for e in random_block}

        if seen_ids:
            _mark_audited(seen_ids, now.isoformat())

        entity_created, entity_detail = _process_entity_gaps(user_id, channel, chat_id, summary)
        created_ids += entity_created
        summary["entity_gap_detail"] = entity_detail
    except Exception as exc:
        logger.exception("[audit] Error en run_audit")
        summary["errors"].append(str(exc))

    summary["proposed"] = len(created_ids)

    if push and channel == "telegram" and chat_id and created_ids:
        try:
            _push_created(created_ids, channel, chat_id, user_id)
        except Exception as exc:
            logger.exception("[audit] Error empujando propuestas a Telegram")
            summary["errors"].append(str(exc))

    if push and channel == "telegram" and chat_id:
        try:
            push_next_audit_batch(channel, chat_id, user_id)
        except Exception as exc:
            logger.exception("[audit] Error empujando el próximo lote de la cola de auditoría")
            summary["errors"].append(str(exc))

    logger.info(
        "[audit] bloque tag=%d bloque random=%d propuestas=%d",
        summary["tag_block"], summary["random_block"], summary["proposed"],
    )
    return summary


# ── Selección de bloques (punto 2) ───────────────────────────────────────────

def _select_tag_block(user_id: str) -> tuple[str | None, list[dict]]:
    """Bloque agrupado por el tag con más entradas sin auditar (last_audited_at
    más viejo dentro del grupo, mismo criterio que entry_ids_without_
    catalog_tags()). (None, []) si no hay ningún tag con entradas vigentes.

    Devuelve también el nombre del tag (no solo el tag_id) -- lo necesita el
    reporte diario de Telegram (ver Cerebro/decisiones-implementacion.md,
    2026-09-03) para decir CUÁL tag se revisó, no solo cuántas entradas.
    """
    conn = get_connection()
    try:
        tag_row = conn.execute(
            """SELECT mt.tag_id, mt.name
               FROM memory_tags mt
               JOIN memory_entry_tags met ON met.tag_id = mt.tag_id
               JOIN memory_entries me ON me.id = met.entry_id
               WHERE mt.user_id = ? AND me.valid_to IS NULL
               GROUP BY mt.tag_id
               ORDER BY MIN(COALESCE(me.last_audited_at, '')) ASC
               LIMIT 1""",
            (user_id,),
        ).fetchone()
        if not tag_row:
            return None, []
        rows = conn.execute(
            """SELECT me.* FROM memory_entries me
               JOIN memory_entry_tags met ON met.entry_id = me.id
               WHERE met.tag_id = ? AND me.user_id = ? AND me.valid_to IS NULL
               ORDER BY COALESCE(me.last_audited_at, '') ASC, me.recorded_at ASC
               LIMIT ?""",
            (tag_row["tag_id"], user_id, JARVIS_AUDIT_BLOCK_SIZE),
        ).fetchall()
        return tag_row["name"], [dict(r) for r in rows]
    finally:
        conn.close()


def _select_random_block(user_id: str, exclude_ids: set) -> list[dict]:
    """Bloque random literal sobre toda la memoria vigente (cualquier tag,
    cualquier entidad) -- corrección explícita del usuario sobre la primera
    versión de este diseño (que lo acotaba a entradas sin tag). Único filtro:
    no re-samplear lo auditado en los últimos JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS.
    """
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS)
    ).isoformat()
    conn = get_connection()
    try:
        query = (
            "SELECT * FROM memory_entries WHERE user_id = ? AND valid_to IS NULL "
            "AND (last_audited_at IS NULL OR last_audited_at < ?)"
        )
        params: list = [user_id, cutoff]
        if exclude_ids:
            placeholders = ",".join("?" * len(exclude_ids))
            query += f" AND id NOT IN ({placeholders})"
            params += list(exclude_ids)
        query += " ORDER BY RANDOM() LIMIT ?"
        params.append(JARVIS_AUDIT_BLOCK_SIZE)
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _mark_audited(entry_ids: set, now_iso: str) -> None:
    """Marca "revisada" siempre, haya encontrado algo o no -- mismo criterio
    que mark_reviewed() de captura pasiva, para que el backlog se drene
    parejo con el tiempo.
    """
    conn = get_connection()
    try:
        with conn:
            placeholders = ",".join("?" * len(entry_ids))
            conn.execute(
                f"UPDATE memory_entries SET last_audited_at = ? WHERE id IN ({placeholders})",
                [now_iso] + list(entry_ids),
            )
    finally:
        conn.close()


# ── Detección de huecos tipo A/B (punto 3, SQL puro) ─────────────────────────

def _detect_entity_gaps(user_id: str) -> list[dict]:
    """Hueco tipo A: entidades 'person' mencionadas 2+ veces (en entradas
    vigentes) que nunca fueron sujeto de una entrada PEOPLE vigente.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT e.entity_id, e.name,
                      COUNT(DISTINCT CASE WHEN me.valid_to IS NULL THEN mee.entry_id END) AS memory_count,
                      SUM(CASE WHEN mee.relation = 'subject' AND me.type = 'PEOPLE'
                                    AND me.valid_to IS NULL THEN 1 ELSE 0 END) AS subject_count
               FROM memory_entities e
               LEFT JOIN memory_entry_entities mee ON mee.entity_id = e.entity_id
               LEFT JOIN memory_entries me ON me.id = mee.entry_id
               WHERE e.user_id = ? AND e.entity_type = 'person'
               GROUP BY e.entity_id
               HAVING memory_count >= 2 AND subject_count = 0
               ORDER BY memory_count DESC""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_isolated_entries(user_id: str = JARVIS_DEFAULT_USER, limit: int = 100) -> list[dict]:
    """Hueco tipo B: entradas vigentes sin ninguna entidad NI proyecto
    vinculado. Sin acción asociada (punto 1/3 del doc) -- nunca genera una
    jarvis_audit_proposals, es una consulta en vivo para que Explorar la
    filtre bajo demanda (no hace falta guardar nada: es SQL puro, siempre
    recomputable, y el resultado nunca queda "viejo" de una forma que
    importe corregir).
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT me.* FROM memory_entries me
               WHERE me.user_id = ? AND me.valid_to IS NULL
                 AND NOT EXISTS (SELECT 1 FROM memory_entry_entities x WHERE x.entry_id = me.id)
                 AND NOT EXISTS (SELECT 1 FROM memory_entry_projects y WHERE y.entry_id = me.id)
               ORDER BY me.recorded_at DESC
               LIMIT ?""",
            (user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ── Revisión de bloque por LLM (tipo C + contradicción/duplicado/conexión/tag) ─

_BLOCK_PROMPT = """\
Revisá este bloque de fragmentos de memoria personal del mismo usuario y \
buscá, solo si de verdad están presentes (sé conservador, no fuerces nada):

- contradicciones reales entre fragmentos (afirman cosas incompatibles sobre lo mismo)
- duplicados (dos fragmentos dicen esencialmente lo mismo con otras palabras)
- referencias sin resolver: una persona/lugar/proyecto mencionado en un fragmento \
sin contexto suficiente para saber quién/qué es, y que tampoco se explica en las \
entidades ya conocidas que se listan junto a cada fragmento
- conexiones no obvias entre fragmentos de temas distintos que podrían ser útiles \
de relacionar
- un tag que no corresponde de verdad al contenido de ese fragmento

Responde SOLO con un array JSON, vacío si no encontrás nada real:
[{{"type": "contradiction"|"duplicate"|"unresolved_reference"|"connection"|"wrong_tag",
  "entry_ids": ["<id>", "<id2 si aplica>"],
  "detail": "explicación breve",
  "resolution": "supersede"|"combine" (solo type=duplicate),
  "newer_id": "<id>" (solo type=duplicate),
  "combined_content": "..." (solo type=duplicate y resolution=combine),
  "reference": "..." (solo type=unresolved_reference, la mención textual ambigua),
  "wrong_tag": "..." (solo type=wrong_tag, el nombre exacto del tag incorrecto)}}]

Fragmentos:
{block_text}

JSON:"""


def _review_block(entries: list[dict]) -> list[dict]:
    if not entries:
        return []
    fragments = []
    for e in entries:
        content = (e.get("content_processed") or e.get("content_raw") or "").strip()
        if len(content) > _MAX_FRAGMENT_CHARS:
            content = content[:_MAX_FRAGMENT_CHARS].rstrip() + "…"
        tags = ", ".join(_current_tag_names(e["id"])) or "(sin tags)"
        entities = _entry_entities_context(e["id"])
        fragments.append(
            f"id={e['id']} | tags: {tags} | entidades conocidas: {entities}\n{content}"
        )
    block_text = "\n\n".join(fragments)

    try:
        raw = call_reason(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Auditás bloques de memoria personal buscando problemas "
                        "concretos. Respondé únicamente con un array JSON."
                    ),
                },
                {"role": "user", "content": _BLOCK_PROMPT.format(block_text=block_text)},
            ]
        )
    except Exception as exc:
        logger.warning("[audit] Revisión de bloque falló: %s", exc)
        return []
    return _parse_findings(raw)


def _parse_findings(raw: str) -> list[dict]:
    cleaned = _LOCAL_PREFIX_RE.sub("", raw)
    start, end = cleaned.find("["), cleaned.rfind("]") + 1
    if start < 0 or end <= start:
        return []
    try:
        parsed = json.loads(cleaned[start:end])
    except Exception as exc:
        logger.warning("[audit] Respuesta del bloque no es JSON válido: %s | raw=%r", exc, raw[:200])
        return []
    return parsed if isinstance(parsed, list) else []


def _entry_entities_context(entry_id: str) -> str:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT me.name, me.notes FROM memory_entry_entities mee
               JOIN memory_entities me ON me.entity_id = mee.entity_id
               WHERE mee.entry_id = ?""",
            (entry_id,),
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        return "(ninguna)"
    return "; ".join(
        r["name"] + (f" ({r['notes']})" if r["notes"] else "") for r in rows
    )


def _current_tag_names(entry_id: str) -> list[str]:
    from jarvis.tags.service import get_tags_for_entry

    return get_tags_for_entry(entry_id)


# ── Bloque -> propuestas ──────────────────────────────────────────────────────

def _entry_brief(entry: dict) -> dict:
    """Resumen liviano de una entrada para el reporte diario de Telegram
    (contenido corto + tags actuales) -- ver Cerebro/decisiones-
    implementacion.md, 2026-09-03."""
    content = (entry.get("content_processed") or entry.get("content_raw") or "").strip()
    return {
        "id": entry["id"],
        "content": _short(content),
        "tags": _current_tag_names(entry["id"]),
    }


def _process_block(
    entries: list[dict], channel: str, chat_id, user_id: str, summary: dict
) -> tuple[list[str], list[dict], list[str]]:
    """Devuelve (proposal_ids creados, findings del bloque con outcome anotado,
    ids de entradas vacías que dispararon 'delete'). Los findings se devuelven
    completos (no solo los que generaron una propuesta nueva) -- el reporte
    diario de Telegram (ver Cerebro/decisiones-implementacion.md, 2026-09-03)
    necesita mostrar TODOS los hallazgos del LLM, incluidos los que ya tenían
    una propuesta de una corrida anterior (dedup) y por eso no crean una fila
    nueva.
    """
    if not entries:
        return [], [], []
    created: list[str] = []
    deleted_empty: list[str] = []
    entries_by_id = {e["id"]: e for e in entries}

    # Delete (nota 2 del docstring del módulo): único disparador SQL/local
    # determinístico para "delete" -- contenido vacío, sin LLM de por medio.
    for e in entries:
        content = (e.get("content_processed") or e.get("content_raw") or "").strip()
        if content:
            continue
        pid = create_proposal(
            "delete", [e["id"]], None, _question_delete_empty(e["id"]),
            channel, chat_id, user_id,
        )
        deleted_empty.append(e["id"])
        if pid:
            created.append(pid)

    findings = _review_block(entries)
    for finding in findings:
        try:
            pid = _resolve_finding_to_proposal(finding, entries_by_id, channel, chat_id, user_id)
            finding["_outcome"] = (
                "propuesta creada, esperando confirmación" if pid
                else "ya había una propuesta pendiente/resuelta para esto -- no se repite"
            )
            if pid:
                created.append(pid)
        except Exception as exc:
            logger.warning("[audit] No se pudo procesar hallazgo %r: %s", finding, exc)
            finding["_outcome"] = f"error procesando el hallazgo: {exc}"
            summary["errors"].append(str(exc))
    return created, findings, deleted_empty


def _resolve_finding_to_proposal(finding: dict, entries_by_id: dict, channel: str, chat_id, user_id: str) -> str | None:
    ftype = finding.get("type")
    raw_ids = finding.get("entry_ids") or []
    entry_ids = [str(x) for x in raw_ids if str(x) in entries_by_id]

    if ftype == "contradiction" and len(entry_ids) == 2:
        return create_proposal(
            "flag_contradiction", entry_ids, None,
            _question_flag_contradiction(entries_by_id, entry_ids),
            channel, chat_id, user_id,
        )

    if ftype == "connection" and len(entry_ids) == 2:
        return create_proposal(
            "flag_connection", entry_ids, None,
            _question_flag_connection(entries_by_id, entry_ids),
            channel, chat_id, user_id,
        )

    if ftype == "duplicate" and len(entry_ids) == 2:
        a, b = entry_ids
        if finding.get("resolution") == "combine" and finding.get("combined_content"):
            newer_id = finding.get("newer_id")
            keep = newer_id if newer_id in entry_ids else a
            drop = b if keep == a else a
            payload = {
                "keep_entry_id": keep,
                "supersede_entry_id": drop,
                "content": finding["combined_content"],
            }
            return create_proposal(
                "edit", entry_ids, payload,
                _question_edit(entries_by_id, keep, finding["combined_content"]),
                channel, chat_id, user_id,
            )
        newer_id = finding.get("newer_id")
        if newer_id not in entry_ids:
            newer_id = a if entries_by_id[a].get("recorded_at", "") >= entries_by_id[b].get("recorded_at", "") else b
        older_id = b if newer_id == a else a
        payload = {"older_entry_id": older_id, "newer_entry_id": newer_id}
        return create_proposal(
            "merge", entry_ids, payload,
            _question_merge(entries_by_id, older_id, newer_id),
            channel, chat_id, user_id,
        )

    if ftype == "unresolved_reference" and len(entry_ids) == 1:
        reference = (finding.get("reference") or "esto").strip()
        return create_proposal(
            "clarify", entry_ids, {"reference": reference},
            _question_clarify(entries_by_id, entry_ids[0], reference),
            channel, chat_id, user_id,
        )

    if ftype == "wrong_tag" and len(entry_ids) == 1 and finding.get("wrong_tag"):
        wrong_tag = str(finding["wrong_tag"]).strip()
        return create_proposal(
            "retag", entry_ids, {"remove_tag": wrong_tag},
            _question_retag(entries_by_id, entry_ids[0], wrong_tag),
            channel, chat_id, user_id,
        )

    return None


# ── Huecos de entidad -> propuestas "create" ─────────────────────────────────

_CREATE_PROMPT = """\
Tenés estos fragmentos de memoria que mencionan a {name}. Escribí un resumen \
breve y autocontenido (una o dos oraciones, en español) de quién es {name}, \
usando SOLO información que ya está escrita en estos fragmentos -- no agregues \
ningún dato que no esté explícito acá, no inventes ni asumas nada. Si no hay \
suficiente para un resumen útil, respondé exactamente "SIN_DATOS".

Fragmentos:
{fragments}

Resumen:"""


def _process_entity_gaps(
    user_id: str, channel: str, chat_id, summary: dict
) -> tuple[list[str], list[dict]]:
    from jarvis.entities.service import get_entries_for_entity

    created: list[str] = []
    detail: list[dict] = []
    for gap in _detect_entity_gaps(user_id)[:_ENTITY_CREATE_LIMIT]:
        entries = get_entries_for_entity(gap["name"], user_id)
        if not entries:
            continue
        target_ids = [e["id"] for e in entries]
        if _already_exists("create", target_ids):
            detail.append({
                "name": gap["name"], "n_mentions": len(entries),
                "outcome": "ya había una propuesta pendiente/resuelta para esto -- no se repite",
            })
            continue
        content = _synthesize_entity_summary(gap["name"], entries)
        if not content:
            detail.append({
                "name": gap["name"], "n_mentions": len(entries),
                "outcome": "no se pudo sintetizar contenido suficiente a partir de lo ya escrito",
            })
            continue
        payload = {
            "content": content,
            "origin_trust": _min_origin_trust(entries),
            "entity_name": gap["name"],
        }
        pid = create_proposal(
            "create", target_ids, payload,
            _question_create(gap["name"], len(entries), content),
            channel, chat_id, user_id,
        )
        detail.append({
            "name": gap["name"], "n_mentions": len(entries), "content": _short(content),
            "outcome": "propuesta creada, esperando confirmación" if pid else "ya existía",
        })
        if pid:
            created.append(pid)
    return created, detail


def _synthesize_entity_summary(name: str, entries: list[dict]) -> str | None:
    fragments = "\n".join(
        f"- {(e.get('content_processed') or e.get('content_raw') or '').strip()[:_MAX_FRAGMENT_CHARS]}"
        for e in entries
    )
    try:
        raw = call_reason(
            messages=[
                {
                    "role": "system",
                    "content": "Sintetizás resúmenes breves solo con información ya provista, sin inventar nada.",
                },
                {"role": "user", "content": _CREATE_PROMPT.format(name=name, fragments=fragments)},
            ]
        )
    except Exception as exc:
        logger.warning("[audit] Síntesis de resumen falló para %s: %s", name, exc)
        return None
    text = _LOCAL_PREFIX_RE.sub("", raw).strip()
    if not text or text.upper().startswith("SIN_DATOS"):
        return None
    return text


def _min_origin_trust(entries: list[dict]) -> str:
    best, best_rank = None, None
    for e in entries:
        trust = e.get("origin_trust") or "system"
        rank = _TRUST_RANK.get(trust, 1)
        if best_rank is None or rank < best_rank:
            best, best_rank = trust, rank
    return best or "system"


# ── Preguntas (plantillas, sin LLM aparte) ───────────────────────────────────

def _short(content: str, n: int = 140) -> str:
    c = (content or "").strip().replace("\n", " ")
    return c if len(c) <= n else c[: n].rstrip() + "…"


def _content_of(entries_by_id: dict, entry_id: str) -> str:
    e = entries_by_id.get(entry_id, {})
    return _short(e.get("content_processed") or e.get("content_raw") or "")


def _question_flag_contradiction(entries_by_id, ids):
    a, b = ids
    return (
        f"🧠 Estas dos entradas parecen contradecirse:\n"
        f"[A] {_content_of(entries_by_id, a)}\n[B] {_content_of(entries_by_id, b)}\n"
        f"¿Lo marco para revisión?"
    )


def _question_flag_connection(entries_by_id, ids):
    a, b = ids
    return (
        f"🧠 Encontré una posible relación entre estas entradas de temas distintos:\n"
        f"[A] {_content_of(entries_by_id, a)}\n[B] {_content_of(entries_by_id, b)}\n"
        f"¿Lo anoto?"
    )


def _question_merge(entries_by_id, older_id, newer_id):
    return (
        f"🧠 Estas dos entradas parecen decir lo mismo:\n"
        f"[vieja] {_content_of(entries_by_id, older_id)}\n"
        f"[nueva] {_content_of(entries_by_id, newer_id)}\n"
        f"¿Marco la más vieja como reemplazada?"
    )


def _question_edit(entries_by_id, keep_id, new_content):
    return (
        f"🧠 Encontré una posible corrección combinando dos entradas:\n"
        f"{_content_of(entries_by_id, keep_id)}\n"
        f"→ ¿la cambio a: {_short(new_content)}?"
    )


def _question_delete_empty(entry_id):
    return f"🧠 Esta entrada parece vacía (id {entry_id[:8]}). ¿La borro?"


def _question_clarify(entries_by_id, entry_id, reference):
    return (
        f"🧠 En esta entrada mencionás a {reference} sin más contexto:\n"
        f"{_content_of(entries_by_id, entry_id)}\n¿Quién/qué es?"
    )


def _question_retag(entries_by_id, entry_id, wrong_tag):
    return (
        f"🧠 El tag {wrong_tag} no parece corresponder a esta entrada:\n"
        f"{_content_of(entries_by_id, entry_id)}\n¿Lo saco?"
    )


def _question_create(name, n_mentions, content):
    return (
        f"🧠 Encontré {n_mentions} menciones de {name} sin ninguna entrada "
        f"propia. ¿Guardo esto?\n{_short(content)}"
    )


# ── Reporte diario de Telegram (ver Cerebro/decisiones-implementacion.md, ────
# 2026-09-03) -- arma el texto de la sección "Auditoría" del reporte de
# consolidation.py a partir del summary enriquecido de run_audit(). No
# depende de que haya habido hallazgos: dice explícitamente "sin hallazgos"
# cuando corresponde, en vez de omitir la sección.

def build_audit_report_text(summary: dict) -> str:
    parts = ["🔍 Auditoría de memoria"]

    tag_name = summary.get("tag_block_name")
    tag_entries = summary.get("tag_block_entries") or []
    if tag_name:
        header = f"Bloque por tag {tag_name} ({len(tag_entries)} entradas)"
    else:
        header = "Bloque por tag: no había ningún tag con entradas vigentes para revisar."
    # 2026-09-15: se sacó el listado de contenido+tags de cada entrada
    # (_entry_lines()) -- con la Bóveda real indexada (74+ notas) el reporte
    # se volvía larguísimo todos los días, haya hallazgos o no. Se mantiene el
    # conteo y los hallazgos (lo que de verdad importa); el detalle de qué
    # entrada puntual se revisó sigue disponible en jarvis_policies.
    # consolidation_run (el JSON completo, incluye tag_block_entries/
    # random_block_entries) para quien lo necesite después. Pedido explícito
    # del usuario, ver Cerebro/decisiones-implementacion.md.
    parts.append(header)
    parts.append(_findings_section(
        "Hallazgos del bloque por tag", summary.get("tag_block_findings") or [], len(tag_entries)
    ))

    random_entries = summary.get("random_block_entries") or []
    parts.append(f"Bloque random ({len(random_entries)} entradas)")
    parts.append(_findings_section(
        "Hallazgos del bloque random", summary.get("random_block_findings") or [], len(random_entries)
    ))

    empty_ids = (summary.get("tag_block_deleted_empty") or []) + (summary.get("random_block_deleted_empty") or [])
    if empty_ids:
        parts.append(
            "Entradas vacías detectadas (propuesta de borrado creada para cada una): "
            + ", ".join(i[:8] for i in empty_ids)
        )

    entity_detail = summary.get("entity_gap_detail") or []
    if entity_detail:
        lines = ["Huecos de entidad (persona mencionada 2+ veces sin entrada propia):"]
        for d in entity_detail:
            content_part = f" — {d['content']}" if "content" in d else ""
            lines.append(f"  • {d['name']} ({d['n_mentions']} menciones) — {d['outcome']}{content_part}")
        parts.append("\n".join(lines))

    return "\n\n".join(parts)


def _findings_section(title: str, findings: list[dict], n_entries: int) -> str:
    if not findings:
        return f"{title}: revisé {n_entries} entradas, sin hallazgos."
    lines = [f"{title} ({len(findings)}):"]
    for f in findings:
        ftype = f.get("type", "?")
        detail = (f.get("detail") or "").strip()
        outcome = f.get("_outcome", "?")
        ids = ", ".join(str(x)[:8] for x in (f.get("entry_ids") or []))
        lines.append(f"  • [{ftype}] ({ids}) {detail} — {outcome}")
    return "\n".join(lines)


# ── Propuestas: CRUD + dedup ──────────────────────────────────────────────────

def _already_exists(action_type: str, target_entry_ids: list[str]) -> bool:
    """Mismo criterio que _pair_already_conflicted() de consolidation.py
    (bug real arreglado 2026-08-31): si ya existe una fila (cualquier
    status) para esta acción+entradas, no se vuelve a proponer -- evita
    re-preguntar por Telegram algo ya resuelto (o ya aplicado) en una
    corrida anterior.
    """
    key = json.dumps(sorted(target_entry_ids), ensure_ascii=False)
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT 1 FROM jarvis_audit_proposals WHERE action_type = ? AND target_entry_ids = ? LIMIT 1",
            (action_type, key),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def _initial_pushed_at(action_type: str, channel: str, now_iso: str) -> str | None:
    """None si la propuesta debe esperar en la cola de throttle (recién se
    entrega cuando push_next_audit_batch() la levante); now_iso si se la
    considera "entregada" de entrada -- canal 'desktop' (polling, no hay
    ráfaga que evitar: el frontend la trae cuando el usuario abre la
    pantalla), flag_contradiction/flag_connection (van agrupadas en un solo
    mensaje, nunca individuales -- ver _push_created()) y open_question
    (nunca se pushea sola, va embebida en el reporte diario -- regla previa
    sin cambios). Ver Cerebro/decisiones-implementacion.md, 2026-09-17.
    """
    if channel != "telegram":
        return now_iso
    if action_type not in _QUEUED_INDIVIDUAL_ACTION_TYPES:
        return now_iso
    return None


def create_proposal(
    action_type: str,
    target_entry_ids: list[str],
    payload: dict | None,
    question: str,
    channel: str,
    channel_id,
    user_id: str,
) -> str | None:
    """Crea una jarvis_audit_proposals PENDING. Devuelve None (sin crear
    nada) si ya existe una propuesta para esta acción+entradas -- dedup.
    pushed_at queda NULL (en cola) o se setea de inmediato según
    _initial_pushed_at() -- ver Cerebro/decisiones-implementacion.md,
    2026-09-17. No afecta el dedup: _already_exists() sigue mirando solo
    (action_type, target_entry_ids), ajeno a pushed_at/status.
    """
    if _already_exists(action_type, target_entry_ids):
        return None

    proposal_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    pushed_at = _initial_pushed_at(action_type, channel, now)
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO jarvis_audit_proposals
                    (id, action_type, target_entry_ids, payload, question,
                     channel, channel_id, status, user_id, created_at, pushed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)""",
                (
                    proposal_id,
                    action_type,
                    json.dumps(sorted(target_entry_ids), ensure_ascii=False),
                    json.dumps(payload, ensure_ascii=False) if payload else None,
                    question,
                    channel,
                    str(channel_id) if channel_id is not None else None,
                    user_id,
                    now,
                    pushed_at,
                ),
            )
        return proposal_id
    finally:
        conn.close()


def get_proposal(proposal_id: str) -> dict | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM jarvis_audit_proposals WHERE id = ?", (proposal_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_pending_proposals(user_id: str = JARVIS_DEFAULT_USER, channel: str | None = None) -> list[dict]:
    """Pendientes -- usado por el frontend (polling, GET /jarvis/audit-proposals)."""
    conn = get_connection()
    try:
        if channel:
            rows = conn.execute(
                """SELECT * FROM jarvis_audit_proposals
                   WHERE user_id = ? AND channel = ? AND status = 'PENDING'
                     AND pushed_at IS NOT NULL
                   ORDER BY created_at DESC""",
                (user_id, channel),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM jarvis_audit_proposals
                   WHERE user_id = ? AND status = 'PENDING'
                     AND pushed_at IS NOT NULL
                   ORDER BY created_at DESC""",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_proposals(user_id: str = JARVIS_DEFAULT_USER, status: str | None = None, limit: int = 100) -> list[dict]:
    """Historial completo para Explorar (pieza F) -- status=None trae todo."""
    conn = get_connection()
    try:
        if status:
            rows = conn.execute(
                """SELECT * FROM jarvis_audit_proposals
                   WHERE user_id = ? AND status = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (user_id, status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM jarvis_audit_proposals
                   WHERE user_id = ? ORDER BY created_at DESC LIMIT ?""",
                (user_id, limit),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_pending_individual_proposals_for_channel(
    channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER
) -> list[dict]:
    """Todas las propuestas PENDING individuales (no agrupadas) ya entregadas
    para este chat, ASC por created_at (más vieja primero). Generaliza lo que
    antes hacía get_pending_individual_proposal_for_channel() (LIMIT 1) --
    necesario para poder desambiguar cuando hay 2+ pendientes a la vez, algo
    que el diseño original no contemplaba (ver nota 5 del docstring del
    módulo) y que se vuelve posible en cuanto JARVIS_AUDIT_PUSH_BATCH_SIZE
    sube a 2+ (ver Cerebro/decisiones-implementacion.md, 2026-09-17, entrada
    de desambiguación). Con el default (1) esta lista nunca tiene más de un
    elemento -- el caso simple no cambia.

    Usada por project/mybot/jarvis_handlers.py para decidir si puede resolver
    directo (0 o 1 resultado) o si necesita pedirle al usuario que aclare a
    cuál se refiere (2+ resultados) antes de aplicar resolve_individual_reply().
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM jarvis_audit_proposals
               WHERE channel = ? AND channel_id = ? AND user_id = ? AND status = 'PENDING'
                 AND action_type NOT IN ('flag_contradiction','flag_connection')
                 AND pushed_at IS NOT NULL
               ORDER BY created_at ASC""",
            (channel, str(channel_id), user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_pending_individual_proposal_for_channel(channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER) -> dict | None:
    """La más vieja de las propuestas PENDING individuales (no agrupadas) para
    este chat -- atajo para el caso simple (0 o 1 pendiente), delega en
    list_pending_individual_proposals_for_channel(). Cuando hay 2+, el caller
    debe usar la lista completa para desambiguar (ver esa función) en vez de
    tomar esta ciegamente -- project/mybot/jarvis_handlers.py ya lo hace así.
    """
    pending = list_pending_individual_proposals_for_channel(channel, channel_id, user_id)
    return pending[0] if pending else None


def build_individual_disambiguation_message(proposals: list[dict]) -> str:
    """Mensaje de desambiguación cuando hay 2+ propuestas individuales
    PENDING para el mismo chat a la vez -- mismo criterio de UX que
    build_grouped_message() (listar numeradas, pedir que conteste con el
    número), adaptado: acá cada propuesta se resuelve con una respuesta de
    texto libre real (no solo sí/no agrupado), así que se le pide al usuario
    que anteponga el número a su respuesta real en vez de solo mandar números
    sueltos. Ver Cerebro/decisiones-implementacion.md, 2026-09-17 (entrada de
    desambiguación).
    """
    lines = ["🧠 Tenés más de una pregunta esperando tu respuesta -- decime a cuál te referís:"]
    for i, p in enumerate(proposals, start=1):
        lines.append(f"{i}) {p['question']}")
    lines.append(
        '\nRespondé empezando con el número (ej: "2 sí", "1: no", '
        '"2 en realidad es sobre otra cosa").'
    )
    return "\n".join(lines)


def reject_proposal(proposal_id: str) -> bool:
    proposal = get_proposal(proposal_id)
    if not proposal or proposal["status"] != "PENDING":
        return False
    _resolve_proposal(proposal_id, "REJECTED", None)
    return True


def expire_stale_proposals(now: datetime | None = None) -> int:
    """Expira PENDING con más de JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES desde
    que se LE MANDÓ al usuario (pushed_at), no desde que se creó -- ver
    Cerebro/decisiones-implementacion.md, 2026-09-17. Una fila con
    pushed_at IS NULL (todavía en la cola de throttle) nunca matchea el
    WHERE de abajo y por lo tanto nunca expira -- correcto: el usuario ni
    la vio, no tiene sentido que se le venza.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES)).isoformat()
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                """UPDATE jarvis_audit_proposals
                   SET status = 'EXPIRED', resolved_at = ?
                   WHERE status = 'PENDING' AND pushed_at IS NOT NULL AND pushed_at <= ?""",
                (now.isoformat(), cutoff),
            )
            return cur.rowcount
    finally:
        conn.close()


def _resolve_proposal(proposal_id: str, status: str, entry_id: str | None) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """UPDATE jarvis_audit_proposals
                   SET status = ?, entry_id = ?, resolved_at = ?
                   WHERE id = ?""",
                (status, entry_id, datetime.now(timezone.utc).isoformat(), proposal_id),
            )
    finally:
        conn.close()


# ── Aplicar una acción aceptada ───────────────────────────────────────────────

def accept_proposal(
    proposal_id: str,
    reply_text: str | None = None,
    payload_override: dict | None = None,
) -> dict | None:
    """Aplica la acción de una propuesta PENDING. Devuelve {"entry_id": ...|None}
    (entry_id solo si la acción crea contenido nuevo), o None si la propuesta
    no existe o ya estaba resuelta. reply_text solo se usa para 'clarify'.

    payload_override (2026-09-21, botones de triage_move): si viene, se
    mergea sobre el payload guardado ANTES de despachar por action_type --
    permite aceptar triage_move con un dest_dir_rel elegido a mano (categoría
    manual) en vez del recomendado por el LLM, sin tocar _apply_triage_move().
    """
    proposal = get_proposal(proposal_id)
    if not proposal or proposal["status"] != "PENDING":
        return None

    action_type = proposal["action_type"]
    target_ids = json.loads(proposal["target_entry_ids"])
    payload = json.loads(proposal["payload"]) if proposal["payload"] else {}
    if payload_override:
        payload = {**payload, **payload_override}
    entry_id = None

    if action_type == "create":
        entry_id = _apply_create(proposal, payload)
    elif action_type in ("clarify", "open_question"):
        # open_question comparte la resolución de clarify -- la respuesta de
        # texto libre ES el contenido nuevo, mismo mecanismo, distinto
        # disparador (ver docstring del módulo, 2026-09-03).
        entry_id = _apply_clarify(proposal, reply_text)
    elif action_type in ("flag_contradiction", "flag_connection"):
        pass  # aceptar solo confirma el registro -- nunca muta memory_entries
    elif action_type == "merge":
        _apply_merge(payload)
    elif action_type == "edit":
        _apply_edit(payload)
    elif action_type == "delete":
        _apply_delete(target_ids)
    elif action_type == "retag":
        _apply_retag(target_ids, payload, proposal["user_id"])
    elif action_type == "archive_superseded":
        _apply_archive_superseded(target_ids)
    elif action_type == "triage_move":
        _apply_triage_move(target_ids, payload)

    # Vinculación determinística a las entidades del hallazgo (no solo a las
    # que el texto de la entrada nueva mencione) -- ver Cerebro/decisiones-
    # implementacion.md, 2026-08-31 ("Vinculación", punto 4). Antes de esto,
    # create/clarify dependían solo de que extract_entities() (pipeline
    # normal del worker) volviera a detectar el mismo nombre en el contenido.
    if entry_id and action_type in ("create", "clarify", "open_question"):
        _link_new_entry_to_targets(entry_id, target_ids, proposal["user_id"])

    _resolve_proposal(proposal_id, "ACCEPTED", entry_id)
    return {"entry_id": entry_id}


def _apply_create(proposal: dict, payload: dict) -> str:
    """`create` es el único camino de _apply_* que produce prosa SINTETIZADA
    por el LLM (ver _synthesize_entity_summary()/_CREATE_PROMPT arriba) --
    aunque el usuario aprobó guardarlo, el texto en sí no lo tipeó nadie.
    authorship='jarvis_synthesis' (fusión Jarvis + Bóveda, 2026-09-11) rutea
    esto a Boveda/Jarvis/ en vez del árbol PARA -- ver jarvis/vault/writer.py.
    Es el único _apply_* que pasa este valor; todos los demás (clarify,
    open_question, _resolve_with_new_info) son texto que el usuario tipeó de
    verdad como respuesta, así que quedan en 'user' (default de capture_raw).

    pinned_type='PEOPLE' + pinned_subject_entity_id (fix del 2026-09-19, ver
    Cerebro/decisiones-implementacion.md -- "loop de re-propuesta de hueco de
    entidad"): `create` es EXCLUSIVO de _process_entity_gaps() (único call
    site de create_proposal("create", ...), confirmado), así que payload
    siempre trae `entity_name`. Antes de este fix la entrada resultante
    quedaba a merced de la clasificación/extracción genérica por LLM, que en
    la práctica la dejaba SEMANTIC + relation='mentioned' -- _detect_entity_
    gaps() nunca la contaba como "subject" de una entrada PEOPLE, así que el
    hueco se volvía a proponer en cada corrida (y la entrada nueva sumaba una
    mención más, rompiendo encima el dedup de _already_exists() contra el
    target_ids de la propuesta anterior). Resolver la entidad acá (mismo
    helper que usa el extractor genérico, _find_or_create_entity) para que
    quede el MISMO entity_id -- nunca crea una entidad duplicada.
    """
    from jarvis.entities.service import _find_or_create_entity
    from jarvis.memory.service import capture_raw

    entity_id = _find_or_create_entity(
        payload["entity_name"], "person", proposal["user_id"],
        datetime.now(timezone.utc).isoformat(),
    )

    return capture_raw(
        content=payload["content"],
        source=proposal["channel"],
        channel=proposal["channel_id"],
        source_id=f"audit:{proposal['id']}",
        origin_trust=payload.get("origin_trust") or "system",
        user_id=proposal["user_id"],
        created_by="jarvis_proposal_accepted",
        authorship="jarvis_synthesis",
        pinned_type="PEOPLE",
        pinned_subject_entity_id=entity_id,
    )


def _apply_clarify(proposal: dict, reply_text: str | None) -> str | None:
    """La respuesta del usuario ES el contenido nuevo -- mismo criterio que
    la aclaración de DECISION y que captura pasiva. Sin respuesta, no se crea
    nada (mismo default seguro del resto del sistema).
    """
    from jarvis.memory.service import capture_raw

    text = (reply_text or "").strip()
    if not text:
        return None
    origin_trust = "telegram.user" if proposal["channel"] == "telegram" else "user.authenticated"
    return capture_raw(
        content=text,
        source=proposal["channel"],
        channel=proposal["channel_id"],
        source_id=f"audit:{proposal['id']}",
        origin_trust=origin_trust,
        user_id=proposal["user_id"],
        created_by="jarvis_proposal_accepted",
    )


def _apply_merge(payload: dict) -> None:
    from jarvis.memory.service import get_entry, update_entry

    newer = get_entry(payload["newer_entry_id"])
    valid_to = (newer.get("recorded_at") if newer else None) or datetime.now(timezone.utc).isoformat()
    update_entry(payload["older_entry_id"], valid_to=valid_to)


def _apply_edit(payload: dict) -> None:
    from jarvis.memory.service import edit_entry, get_entry, update_entry

    edit_entry(payload["keep_entry_id"], content=payload["content"])
    keep = get_entry(payload["keep_entry_id"])
    valid_to = (keep.get("recorded_at") if keep else None) or datetime.now(timezone.utc).isoformat()
    update_entry(payload["supersede_entry_id"], valid_to=valid_to)


def _apply_delete(target_ids: list[str]) -> None:
    from jarvis.memory.service import forget_entry

    for eid in target_ids:
        forget_entry(eid)


def _apply_retag(target_ids: list[str], payload: dict, user_id: str) -> None:
    from jarvis.tags.service import replace_tags_for_entry

    entry_id = target_ids[0]
    remove = (payload.get("remove_tag") or "").strip().lower()
    remaining = [t for t in _current_tag_names(entry_id) if t.lower() != remove]
    replace_tags_for_entry(entry_id, remaining, user_id)


def _apply_archive_superseded(target_ids: list[str]) -> None:
    """Mueve el .md de la entrada superseded a `04 - Archivo/` -- fusión
    Jarvis + Bóveda (2026-09-11, addendum punto 1). Nunca aplica sola (llega
    acá solo vía accept_proposal(), gateada); solo aplica a contenido del
    usuario (authorship='user') -- una síntesis de Jarvis marcada superseded
    no tiene archivo en el árbol PARA que mover (vive en Boveda/Jarvis/, no
    forma parte del criterio "vigente vs. archivado" de la Bóveda).
    """
    from jarvis.memory.service import get_entry, update_entry
    from jarvis.vault.writer import move_entry_file

    entry_id = target_ids[0]
    entry = get_entry(entry_id)
    if not entry or entry.get("authorship") == "jarvis_synthesis":
        return
    vault_path = entry.get("vault_path")
    if not vault_path:
        return
    new_path = move_entry_file(vault_path, "04 - Archivo")
    if new_path:
        update_entry(entry_id, vault_path=new_path)


def propose_archive_superseded(
    entry_id: str, reason: str, channel: str, channel_id, user_id: str
) -> str | None:
    """Crea la propuesta gateada para mover una entrada `same_fact`/stale-por-
    edad a `04 - Archivo/` -- llamada desde jarvis/worker/consolidation.py
    justo después de marcar valid_to (ese marcado en SQL sigue siendo
    inmediato, sin gating, como ya funcionaba; lo nuevo es el movimiento
    físico del archivo, que sí requiere confirmación -- ver addendum de
    Cerebro/decisiones-implementacion.md, 2026-09-11, punto 1: el juicio que
    la origina es algorítmico y puede estar mal, mismo precedente del falso
    positivo Madrid/Buenos Aires).
    """
    return create_proposal(
        "archive_superseded", [entry_id], None,
        f"🧠 Esta entrada quedó marcada como superada ({reason}). ¿La archivo?",
        channel, channel_id, user_id,
    )


def _apply_triage_move(target_ids: list[str], payload: dict) -> None:
    """Mueve el .md de una nota del inbox (`00 - Sin categorizar/`) al
    destino sugerido por el LLM -- triage automático del Inbox (Cerebro/
    decisiones-implementacion.md, 2026-09-15). Paralela a
    _apply_archive_superseded(), pero lee `payload["dest_dir_rel"]` en vez de
    un destino fijo -- ver jarvis/ingestion/inbox_triage.py para las 8 rutas
    exactas permitidas. Nunca aplica sola (llega acá solo vía
    accept_proposal(), gateada); solo aplica a contenido del usuario
    (authorship='user') -- las notas del inbox siempre lo son (write_entry()
    nunca rutea síntesis de Jarvis a `00 - Sin categorizar/`), se chequea
    igual por simetría defensiva con _apply_archive_superseded().
    """
    from jarvis.memory.service import get_entry, update_entry
    from jarvis.vault.writer import move_entry_file

    entry_id = target_ids[0]
    entry = get_entry(entry_id)
    if not entry or entry.get("authorship") == "jarvis_synthesis":
        return
    vault_path = entry.get("vault_path")
    dest_dir_rel = (payload or {}).get("dest_dir_rel")
    if not vault_path or not dest_dir_rel:
        return
    new_path = move_entry_file(vault_path, dest_dir_rel)
    if new_path:
        update_entry(entry_id, vault_path=new_path)


def propose_triage_move(
    entry_id: str, dest_dir_rel: str, channel: str, channel_id, user_id: str,
    titulo: str = "",
) -> str | None:
    """Crea la propuesta gateada para mover una nota del inbox a su destino
    sugerido -- llamada desde jarvis/ingestion/inbox_triage.py tras la
    clasificación por LLM. A diferencia de archive_superseded (un único
    destino posible, la pregunta no necesita nombrarlo), acá la pregunta SÍ
    nombra el destino explícito -- pedido explícito de la propuesta aprobada
    (ver Cerebro/decisiones-implementacion.md, 2026-09-15).

    `titulo` (2026-09-21, botones Sí/No/Ver contenido): nombre del archivo
    sin extensión, para que el usuario sepa de qué nota se trata sin tener
    que adivinar por el destino sugerido solo -- ver
    jarvis/ingestion/inbox_triage.py::_titulo_desde_vault_path(). El sufijo
    "Respondé sí/no" ya NO se agrega acá -- push_next_audit_batch() arma el
    teclado inline para este action_type en vez del texto genérico.
    """
    payload = {"dest_dir_rel": dest_dir_rel}
    titulo_txt = f'"{titulo}"\n\n' if titulo else ""
    question = (
        f'🧠 {titulo_txt}Parece lista para archivar en "{dest_dir_rel}". '
        f"¿Qué hacés?"
    )
    return create_proposal(
        "triage_move", [entry_id], payload, question, channel, channel_id, user_id,
    )


# ── Vinculación determinística a las entidades del hallazgo ─────────────────
# Ver Cerebro/decisiones-implementacion.md, 2026-08-31, punto 4.

def _target_entities(target_entry_ids: list[str]) -> list[dict]:
    """Entidades ya vinculadas a las entradas objetivo de un hallazgo
    (dedupeadas), en la forma que espera link_entities_for_entry()."""
    if not target_entry_ids:
        return []
    conn = get_connection()
    try:
        placeholders = ",".join("?" * len(target_entry_ids))
        rows = conn.execute(
            f"""SELECT DISTINCT me.name, me.entity_type FROM memory_entry_entities mee
                JOIN memory_entities me ON me.entity_id = mee.entity_id
                WHERE mee.entry_id IN ({placeholders})""",
            target_entry_ids,
        ).fetchall()
        return [{"name": r["name"], "type": r["entity_type"]} for r in rows]
    finally:
        conn.close()


def _link_new_entry_to_targets(new_entry_id: str, target_entry_ids: list[str], user_id: str) -> None:
    """Vincula una entrada nueva a las mismas entidades que ya tenían las
    entradas objetivo del hallazgo que la originó -- determinístico, no
    depende de que el texto de la entrada nueva repita ningún nombre (a
    diferencia de la extracción automática que igual corre sola cuando el
    worker procese esta entrada vía inbox_queue -- ambas conviven sin
    chocar, _link_entry_entity() ya usa ON CONFLICT DO UPDATE).

    entry_type="RAW" a propósito: la entrada nueva todavía no pasó por
    clasificación async en este punto, así que la relación siempre queda
    'mentioned' (nunca 'subject', que link_entities_for_entry() solo asigna
    para entry_type == 'PEOPLE') -- correcto acá, son correcciones/contexto
    sobre una entidad ya conocida, no una ficha biográfica nueva.
    """
    from jarvis.entities.service import link_entities_for_entry

    entities = _target_entities(target_entry_ids)
    if entities:
        link_entities_for_entry(new_entry_id, entities, entry_type="RAW", user_id=user_id)


# ── Respuestas de texto libre con información nueva (7 acciones != clarify) ──
# Ver Cerebro/decisiones-implementacion.md, 2026-08-31, "respuestas de texto
# libre con información nueva" -- detalle caso por caso de por qué cada
# acción se resuelve distinto.

_CLEAN_NEGATIVE_PHRASES = {
    "no", "n", "nel", "nop", "no gracias", "no, gracias", "no por ahora",
}
_CLEAN_AFFIRMATIVE_PHRASES = {"si", "sí", "yes", "y", "dale", "ok", "obvio"}
_LEGACY_CLARIFY_NEGATIVE_PREFIXES = ("no", "n")


def resolve_individual_reply(proposal_id: str, texto: str) -> dict:
    """Punto de entrada único para interpretar una respuesta de texto libre
    a una propuesta INDIVIDUAL (no agrupada) de jarvis_audit_proposals --
    reemplaza la interpretación que antes vivía repartida en
    project/mybot/jarvis_handlers.py.

    Devuelve {"outcome": "not_found"|"rejected"|"accepted"|
    "resolved_with_new_info", "entry_id": str|None}.

    `clarify` usa el mismo criterio de negativo que ya tenía (cualquier "no"/
    "no <algo>" rechaza, cualquier otra cosa por corta que sea ES la
    respuesta) -- deliberadamente sin cambios, ver el documento de
    decisiones. `open_question` (2026-09-03) usa exactamente el mismo
    criterio que `clarify` -- comparte su forma ("hay una pregunta pendiente,
    la respuesta de texto libre la contesta"), no la de las otras 7 acciones.
    Esas otras 7 usan un negativo limpio más chico y explícito (ver el
    documento, punto 1): una respuesta que empieza con "no" pero sigue con
    contenido real (ej. "no, es sobre mi sueldo de freelance") NO es negativo
    limpio ahí, cae en información nueva.
    """
    proposal = get_proposal(proposal_id)
    if not proposal or proposal["status"] != "PENDING":
        return {"outcome": "not_found", "entry_id": None}

    stripped = texto.strip()
    lowered = stripped.lower()

    if proposal["action_type"] in ("clarify", "open_question"):
        if lowered in _LEGACY_CLARIFY_NEGATIVE_PREFIXES or lowered.startswith("no "):
            reject_proposal(proposal_id)
            return {"outcome": "rejected", "entry_id": None}
        result = accept_proposal(proposal_id, reply_text=stripped)
        entry_id = result.get("entry_id") if result else None
        return {"outcome": "accepted" if entry_id else "not_found", "entry_id": entry_id}

    bare = lowered.rstrip(" .!¡¿?")
    if bare in _CLEAN_NEGATIVE_PHRASES:
        reject_proposal(proposal_id)
        return {"outcome": "rejected", "entry_id": None}

    if lowered in _CLEAN_AFFIRMATIVE_PHRASES:
        result = accept_proposal(proposal_id)
        if not result:
            return {"outcome": "not_found", "entry_id": None}
        return {"outcome": "accepted", "entry_id": result.get("entry_id")}

    return _resolve_with_new_info(proposal, stripped)


def _resolve_with_new_info(proposal: dict, texto: str) -> dict:
    action_type = proposal["action_type"]
    if action_type == "create":
        return _resolve_create_with_new_info(proposal, texto)
    if action_type == "edit":
        return _resolve_edit_with_new_info(proposal, texto)
    if action_type == "retag":
        return _resolve_retag_with_new_info(proposal, texto)
    if action_type == "delete":
        return _resolve_delete_with_new_info(proposal, texto)
    if action_type in (
        "flag_contradiction", "flag_connection", "merge",
        "archive_superseded", "triage_move",
    ):
        # triage_move (2026-09-15, ver Cerebro/decisiones-implementacion.md,
        # punto 4 de la propuesta): una respuesta de texto libre que nombra
        # otro destino ("no, eso va a Salud") NO se parsea para redirigir el
        # movimiento -- mismo riesgo de alucinación que dejar que el LLM
        # invente una ruta fuera del enum de 8 permitidas. Se guarda la
        # corrección como entrada nueva aparte, igual que archive_superseded,
        # sin mover nada con esa inferencia.
        return _resolve_as_new_entry(proposal, texto)
    # Defensivo -- no debería pasar con los 11 action_type conocidos del CHECK.
    reject_proposal(proposal["id"])
    return {"outcome": "rejected", "entry_id": None}


def _capture_new_info_entry(proposal: dict, texto: str) -> str:
    """capture_raw() con el mismo criterio de origin_trust/created_by/source
    que ya usa clarify (punto 5 del documento de decisiones): contenido
    nuevo tipeado de verdad por el usuario, no un derivado sintetizado."""
    from jarvis.memory.service import capture_raw

    channel = proposal["channel"]
    origin_trust = "telegram.user" if channel == "telegram" else "user.authenticated"
    return capture_raw(
        content=texto,
        source=channel,
        channel=proposal["channel_id"],
        source_id=f"audit:{proposal['id']}:newinfo",
        origin_trust=origin_trust,
        user_id=proposal["user_id"],
        created_by="jarvis_proposal_accepted",
    )


def _resolve_as_new_entry(proposal: dict, texto: str) -> dict:
    """flag_contradiction/flag_connection/merge: la mutación normal de
    'aceptar' no crea ni corrige contenido (flag_* solo marca; merge
    supersede asumiendo que el LLM ya identificó bien cuál entrada es la
    vieja, algo que no podemos inferir de forma determinística de la
    respuesta). Se crea una entrada nueva independiente en su lugar, sin
    tocar valid_to de ninguna entrada objetivo -- ver el documento de
    decisiones, punto 2, para el razonamiento completo."""
    target_ids = json.loads(proposal["target_entry_ids"])
    entry_id = _capture_new_info_entry(proposal, texto)
    _link_new_entry_to_targets(entry_id, target_ids, proposal["user_id"])
    _resolve_proposal(proposal["id"], "RESOLVED_WITH_NEW_INFO", entry_id)
    return {"outcome": "resolved_with_new_info", "entry_id": entry_id}


def _resolve_create_with_new_info(proposal: dict, texto: str) -> dict:
    """El contenido nuevo se trata como corrección/ampliación del borrador
    ya sintetizado, no como entrada aparte -- se sigue aplicando 'create'
    (ACCEPTED), solo que con contenido enriquecido. Mismo patrón de sufijo
    que ya usa accept_proposal(extra_text=...) de captura pasiva."""
    payload = json.loads(proposal["payload"]) if proposal["payload"] else {}
    draft = (payload.get("content") or "").strip()
    payload["content"] = f"{draft}\nAclaración: {texto}".strip()
    channel = proposal["channel"]
    payload["origin_trust"] = "telegram.user" if channel == "telegram" else "user.authenticated"

    entry_id = _apply_create(proposal, payload)
    target_ids = json.loads(proposal["target_entry_ids"])
    _link_new_entry_to_targets(entry_id, target_ids, proposal["user_id"])
    _resolve_proposal(proposal["id"], "ACCEPTED", entry_id)
    return {"outcome": "accepted", "entry_id": entry_id}


def _resolve_edit_with_new_info(proposal: dict, texto: str) -> dict:
    """Mismo criterio que create: se amplía payload["content"] (la versión
    combinada que ya proponía el hallazgo) y se aplica 'edit' tal cual --
    ACCEPTED, sin entry_id nuevo (edit nunca lo seteaba, edita en el lugar)."""
    payload = json.loads(proposal["payload"]) if proposal["payload"] else {}
    draft = (payload.get("content") or "").strip()
    payload["content"] = f"{draft}\nAclaración: {texto}".strip()

    _apply_edit(payload)
    _resolve_proposal(proposal["id"], "ACCEPTED", None)
    return {"outcome": "accepted", "entry_id": None}


def _resolve_retag_with_new_info(proposal: dict, texto: str) -> dict:
    """El texto nuevo describe la entrada ya flaggeada (no un hecho del
    mundo aparte) -- se concatena a su content_processed vía edit_entry(), y
    el tag señalado NO se saca (la respuesta contradice el hallazgo de "tag
    incorrecto"; aplicar la remoción igual sería ignorar lo que el usuario
    acaba de decir). No se intenta además agregar un tag mejor -- eso ya lo
    cubre _backfill_catalog_tags(), fuera de esta pieza."""
    from jarvis.memory.service import edit_entry, get_entry

    target_ids = json.loads(proposal["target_entry_ids"])
    entry_id = target_ids[0]
    entry = get_entry(entry_id)
    current = (entry.get("content_processed") or entry.get("content_raw") or "").strip() if entry else ""
    new_content = f"{current}\nAclaración: {texto}".strip() if current else texto

    edit_entry(entry_id, content=new_content)
    _resolve_proposal(proposal["id"], "RESOLVED_WITH_NEW_INFO", entry_id)
    return {"outcome": "resolved_with_new_info", "entry_id": entry_id}


def _resolve_delete_with_new_info(proposal: dict, texto: str) -> dict:
    """El único disparador de 'delete' es contenido vacío -- una respuesta
    con texto real significa "no está vacía, dice esto": se rellena la
    misma entrada vía edit_entry() (sin prefijo "Aclaración:", no hay nada
    previo a lo que amueblar) y no se borra."""
    from jarvis.memory.service import edit_entry

    target_ids = json.loads(proposal["target_entry_ids"])
    entry_id = target_ids[0]
    edit_entry(entry_id, content=texto)
    _resolve_proposal(proposal["id"], "RESOLVED_WITH_NEW_INFO", entry_id)
    return {"outcome": "resolved_with_new_info", "entry_id": entry_id}


# ── Pregunta abierta exploratoria (2026-09-03) ────────────────────────────────
# Ver Cerebro/decisiones-implementacion.md, "pregunta abierta exploratoria".
# Dispara SOLO cuando jarvis/worker/consolidation.py::run_consolidation()
# determinó que la corrida no tuvo NADA más que reportar (pairwise/stale/
# backfill/hallazgos de auditoría todos vacíos, ver _nothing_to_report() ahí).
# No es un cuarto tipo de hueco -- A/B/C siguen intactos, gateados por
# evidencia real; esto es "ya que no encontré nada urgente, aprovecho a
# preguntar algo útil". Jerarquía de fallback, de más a menos específico:
#   1. Entidad mencionada exactamente 1 vez (por debajo del umbral
#      memory_count>=2 del hueco tipo A) -- hay una entrada real de la que
#      colgar la pregunta, no es 100% genérica.
#   2. Si no hay ninguna (memoria vacía o toda entidad ya tiene 2+ menciones)
#      -- pregunta de arranque genérica, rotada al azar de una lista chica.
# La resolución (aceptar/rechazar/guardar la respuesta) es idéntica a
# `clarify` -- ver accept_proposal()/resolve_individual_reply() arriba.

_POLICY_OPEN_QUESTION_LAST_ASKED = "open_question_last_asked"

_BOOTSTRAP_QUESTIONS = [
    "🧠 Ya que no tengo nada más para reportar hoy, aprovecho para preguntar: "
    "¿en qué estás trabajando ahora que no te haya visto anotar todavía?",
    "🧠 Sin nada más para reportar hoy, una pregunta suelta: contame algo "
    "sobre vos que todavía no tenga guardado (a qué te dedicás, qué te "
    "interesa).",
    "🧠 Día tranquilo, sin hallazgos. Aprovecho: ¿hay algún proyecto o tema "
    "importante para vos que no haya mencionado todavía?",
    "🧠 Nada para reportar hoy -- pregunta abierta: ¿alguna persona "
    "importante en tu vida de la que no tenga ninguna nota guardada?",
    "🧠 Sin novedades hoy. Una que me quedó pendiente: ¿cuáles son tus "
    "prioridades ahora mismo, en el trabajo o fuera de él?",
]


def _open_question_cooldown_elapsed(now: datetime) -> bool:
    last = _last_open_question_at()
    return last is None or (now - last) >= timedelta(days=JARVIS_OPEN_QUESTION_COOLDOWN_DAYS)


def _last_open_question_at() -> datetime | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT value FROM jarvis_policies WHERE policy_type = ? ORDER BY created_at DESC LIMIT 1",
            (_POLICY_OPEN_QUESTION_LAST_ASKED,),
        ).fetchone()
        if not row:
            return None
        return datetime.fromisoformat(row["value"])
    finally:
        conn.close()


def _record_open_question_asked(now: datetime) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), _POLICY_OPEN_QUESTION_LAST_ASKED, now.isoformat(), now.isoformat()),
            )
    finally:
        conn.close()


def _detect_single_mention_entities(user_id: str) -> list[dict]:
    """Entidades 'person' mencionadas EXACTAMENTE 1 vez en entradas vigentes
    -- justo por debajo del umbral memory_count>=2 que usa el hueco tipo A
    (_detect_entity_gaps()). No se restringe a subject_count=0 como el hueco
    tipo A porque con 1 sola mención nunca puede haber una entrada PEOPLE
    propia de todos modos (haría falta una segunda entrada). Ordenado por
    last_seen ASC -- mismo criterio de "las más viejas/postergadas primero"
    que ya usa el resto del módulo (_select_tag_block(),
    entry_ids_without_catalog_tags()).
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT e.entity_id, e.name,
                      COUNT(DISTINCT CASE WHEN me.valid_to IS NULL THEN mee.entry_id END) AS memory_count
               FROM memory_entities e
               LEFT JOIN memory_entry_entities mee ON mee.entity_id = e.entity_id
               LEFT JOIN memory_entries me ON me.id = mee.entry_id
               WHERE e.user_id = ? AND e.entity_type = 'person'
               GROUP BY e.entity_id
               HAVING memory_count = 1
               ORDER BY e.last_seen ASC""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _pick_entity_candidate(user_id: str) -> dict | None:
    """Primera entidad de 1 mención que todavía no tiene una open_question ya
    creada sobre su única entrada (dedup exacto vía _already_exists(), mismo
    criterio que el resto de las acciones -- ver create_proposal()). None si
    no hay ninguna disponible -- cae al nivel 2 (pregunta de arranque).
    """
    from jarvis.entities.service import get_entries_for_entity

    for gap in _detect_single_mention_entities(user_id):
        entries = get_entries_for_entity(gap["name"], user_id)
        if len(entries) != 1:
            # Se desalineó desde el SQL de arriba (ej. la entrada dejó de
            # estar vigente entre una query y la otra) -- se salta, no es el
            # candidato limpio que se esperaba.
            continue
        entry = entries[0]
        if _already_exists("open_question", [entry["id"]]):
            continue
        return {"name": gap["name"], "entry_id": entry["id"], "entry": entry}
    return None


def _question_open_entity(name: str, entry: dict) -> str:
    content = _short(entry.get("content_processed") or entry.get("content_raw") or "")
    return (
        f"🧠 Ya que no tengo nada más para reportar hoy, aprovecho para "
        f"preguntar: mencionaste a **{name}** una vez y no sé mucho más --\n"
        f"_{content}_\n¿Quién/qué es {name}?"
    )


def _create_open_question_proposal(
    target_entry_ids: list[str], payload: dict | None, question: str,
    channel: str, chat_id, user_id: str,
) -> str:
    """Igual que create_proposal() pero SIN el chequeo de _already_exists() --
    a propósito. La variante de arranque (target_entry_ids=[], sin ninguna
    entrada concreta de la que colgar el dedup) usaría siempre la misma
    clave action_type+target_entry_ids=[]; con el dedup normal, la primera
    pregunta de arranque jamás resuelta-de-nuevo bloquearía CUALQUIER
    pregunta de arranque futura para siempre, sin importar cuánto tiempo
    pase. Acá el único gate real contra repetir es el cooldown
    (JARVIS_OPEN_QUESTION_COOLDOWN_DAYS), ya aplicado por el caller antes de
    llegar acá -- no la coincidencia de destino.
    """
    proposal_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO jarvis_audit_proposals
                    (id, action_type, target_entry_ids, payload, question,
                     channel, channel_id, status, user_id, created_at)
                   VALUES (?, 'open_question', ?, ?, ?, ?, ?, 'PENDING', ?, ?)""",
                (
                    proposal_id,
                    json.dumps(sorted(target_entry_ids), ensure_ascii=False),
                    json.dumps(payload, ensure_ascii=False) if payload else None,
                    question, channel, str(chat_id) if chat_id is not None else None,
                    user_id, now_iso,
                ),
            )
        return proposal_id
    finally:
        conn.close()


def maybe_ask_open_question(
    now: datetime, channel: str, chat_id, user_id: str = JARVIS_DEFAULT_USER,
) -> dict:
    """Punto de entrada único, llamado desde consolidation.py SOLO cuando
    _nothing_to_report(summary) dio True. Nunca lanza -- cualquier error debe
    quedar en el resumen del caller, no tumbar el reporte diario.

    A propósito NO empuja un mensaje de Telegram por su cuenta (a diferencia
    de _push_created(), que sí lo hace para las propuestas de auditoría
    normales) -- el pedido explícito era que la pregunta abierta (o su
    ausencia) aparezca DENTRO del mismo mensaje de reporte diario, nunca como
    un ping desconectado aparte. La propuesta queda igual creada con el
    channel/channel_id correctos para que, cuando el usuario responda por
    Telegram, se resuelva por el mismo camino que cualquier otra individual.

    Devuelve {"asked": bool, "reason": str} si no preguntó nada, o
    {"asked": True, "tier": "entity_1_mention"|"bootstrap", "question": str,
    "proposal_id": str} si sí.
    """
    if not JARVIS_OPEN_QUESTION_ENABLED:
        return {"asked": False, "reason": "JARVIS_OPEN_QUESTION_ENABLED=0"}
    if not _open_question_cooldown_elapsed(now):
        return {
            "asked": False,
            "reason": f"cooldown activo (< {JARVIS_OPEN_QUESTION_COOLDOWN_DAYS}d desde la última)",
        }

    candidate = _pick_entity_candidate(user_id)
    if candidate:
        question = _question_open_entity(candidate["name"], candidate["entry"])
        pid = create_proposal(
            "open_question", [candidate["entry_id"]],
            {"kind": "entity_gap", "entity_name": candidate["name"]},
            question, channel, chat_id, user_id,
        )
        tier = "entity_1_mention"
    else:
        question = random.choice(_BOOTSTRAP_QUESTIONS)
        pid = _create_open_question_proposal(
            [], {"kind": "bootstrap"}, question, channel, chat_id, user_id,
        )
        tier = "bootstrap"

    if not pid:
        return {"asked": False, "reason": "no se pudo crear la propuesta (dedup)"}

    _record_open_question_asked(now)
    return {"asked": True, "tier": tier, "question": question, "proposal_id": pid}


# ── Mensaje agrupado (flag_contradiction/flag_connection) ────────────────────

def list_grouped_pending(channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM jarvis_audit_proposals
               WHERE channel = ? AND channel_id = ? AND user_id = ? AND status = 'PENDING'
                 AND action_type IN ('flag_contradiction','flag_connection')
                 AND pushed_at IS NOT NULL
               ORDER BY created_at ASC""",
            (channel, str(channel_id), user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def build_grouped_message(proposals: list[dict]) -> str:
    lines = ["🧠 Encontré varias cosas para revisar:"]
    for i, p in enumerate(proposals, start=1):
        lines.append(f"{i}) {p['question']}")
    lines.append(
        '\nRespondé con los números que confirmás (ej: "sí 1,3"), '
        '"no 2" para descartar puntuales, o "no" para descartar todo.'
    )
    return "\n".join(lines)


def resolve_grouped_reply(channel: str, channel_id, text: str, user_id: str = JARVIS_DEFAULT_USER) -> dict:
    """Interpreta una respuesta de texto libre contra el mensaje agrupado
    vigente (numeración = orden de list_grouped_pending() en ese momento --
    estable en la práctica porque el agrupado se pushea una sola vez por
    corrida y se resuelve el mismo día, antes de que haya una corrida nueva).
    """
    pending = list_grouped_pending(channel, channel_id, user_id)
    if not pending:
        return {"accepted": [], "rejected": [], "no_pending": True}

    lowered = text.strip().lower()
    if lowered == "no":
        for p in pending:
            reject_proposal(p["id"])
        return {"accepted": [], "rejected": [p["id"] for p in pending]}

    accept_nums, reject_nums = _parse_grouped_reply(lowered, len(pending))
    accepted, rejected = [], []
    for i, p in enumerate(pending, start=1):
        if i in reject_nums:
            reject_proposal(p["id"])
            rejected.append(p["id"])
        elif i in accept_nums:
            accept_proposal(p["id"])
            accepted.append(p["id"])
    return {"accepted": accepted, "rejected": rejected}


def _parse_grouped_reply(lowered: str, n_pending: int) -> tuple[set, set]:
    """Variantes razonables sin sobre-ingenierizarlo (decisión resuelta el
    2026-08-31): "sí 1,3", "no 2", "1 y 3", "todas"/"todos"/bare "sí"/"dale"/"ok"
    (acepta todo lo pendiente).
    """
    if lowered in ("todas", "todos", "si", "sí", "dale", "ok", "obvio"):
        return set(range(1, n_pending + 1)), set()

    if " no " in f" {lowered} ":
        idx = lowered.find(" no ")
        accept_part, reject_part = lowered[:idx], lowered[idx:]
    elif lowered.startswith("no "):
        accept_part, reject_part = "", lowered
    else:
        accept_part, reject_part = lowered, ""

    accept_nums = {int(n) for n in _NUM_RE.findall(accept_part)}
    reject_nums = {int(n) for n in _NUM_RE.findall(reject_part)}
    return accept_nums, reject_nums


def push_next_audit_batch(channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER) -> list[str]:
    """Empuja el próximo lote (hasta JARVIS_AUDIT_PUSH_BATCH_SIZE) de la cola
    de propuestas individuales de auditoría (_QUEUED_INDIVIDUAL_ACTION_TYPES)
    para este chat -- SOLO si no queda ninguna sin resolver todavía (ninguna
    PENDING ya entregada, pushed_at IS NOT NULL, de esos 8 tipos, para este
    channel_id). FIFO por created_at. No toca flag_contradiction/
    flag_connection (esas van por _push_created()/list_grouped_pending(), un
    solo mensaje agrupado, ya no throttleado) ni open_question (nunca se
    pushea individual). Devuelve los ids efectivamente empujados (puede ser
    []). Llamado desde run_audit() (una vez al final, para que el primer
    lote de una corrida nueva salga sin esperar el próximo tick) y desde
    jarvis/worker/main.py::_maybe_run_passive_capture() (cada tick ocioso
    del loop, ~JARVIS_WORKER_POLL_INTERVAL -- es la vía real de "la próxima
    llega poco después de que contestaste la anterior", ver Cerebro/
    decisiones-implementacion.md, 2026-09-17 para el trade-off vs. esperar
    a la corrida diaria).

    No es un job que pueda tumbar nada más si falla feo (a diferencia de
    run_audit()) -- igual se llama siempre dentro de un try/except en los
    call sites, mismo criterio defensivo del resto del worker.
    """
    if channel != "telegram" or not channel_id:
        return []

    placeholders = ",".join("?" * len(_QUEUED_INDIVIDUAL_ACTION_TYPES))
    conn = get_connection()
    try:
        outstanding = conn.execute(
            f"""SELECT 1 FROM jarvis_audit_proposals
                WHERE channel = ? AND channel_id = ? AND user_id = ?
                  AND status = 'PENDING' AND pushed_at IS NOT NULL
                  AND action_type IN ({placeholders})
                LIMIT 1""",
            (channel, str(channel_id), user_id, *_QUEUED_INDIVIDUAL_ACTION_TYPES),
        ).fetchone()
        if outstanding:
            return []

        rows = conn.execute(
            f"""SELECT * FROM jarvis_audit_proposals
                WHERE channel = ? AND channel_id = ? AND user_id = ?
                  AND status = 'PENDING' AND pushed_at IS NULL
                  AND action_type IN ({placeholders})
                ORDER BY created_at ASC LIMIT ?""",
            (channel, str(channel_id), user_id, *_QUEUED_INDIVIDUAL_ACTION_TYPES,
             JARVIS_AUDIT_PUSH_BATCH_SIZE),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return []

    from jarvis.notify.telegram import send_telegram_message

    now_iso = datetime.now(timezone.utc).isoformat()
    pushed_ids = []
    n = len(rows)
    for idx, row in enumerate(rows, start=1):
        # Numerar "N/M: " cuando el lote trae más de una (solo posible con
        # JARVIS_AUDIT_PUSH_BATCH_SIZE >= 2) -- deja claro cuál es cuál desde
        # el mensaje mismo, antes incluso de que el usuario tenga que
        # responder (ver Cerebro/decisiones-implementacion.md, 2026-09-17,
        # entrada de desambiguación). Con batch=1 (default) n siempre es 1 y
        # esto no cambia nada del mensaje de siempre.
        if row["action_type"] == "triage_move":
            # Botones inline en vez de sí/no de texto libre (2026-09-21) --
            # ver project/mybot/jarvis_handlers.py::handle_triage_callback().
            # Con n>1 (JARVIS_AUDIT_PUSH_BATCH_SIZE >= 2, no es el default)
            # se antepone el mismo prefijo "N/M:" que el resto, el usuario
            # igual resuelve por botón, no por texto, así que no hace falta
            # la instrucción de "empezá con el número".
            prefix = f"{idx}/{n}: " if n > 1 else ""
            text = prefix + row["question"]
            keyboard = {
                "inline_keyboard": [[
                    {"text": "✅ Sí", "callback_data": f"jtriage:yes:{row['id']}"},
                    {"text": "❌ No", "callback_data": f"jtriage:no:{row['id']}"},
                    {"text": "👁 Ver contenido", "callback_data": f"jtriage:view:{row['id']}"},
                ]]
            }
            send_telegram_message(channel_id, text, reply_markup=keyboard)
        elif n > 1:
            text = (
                f"{idx}/{n}: {row['question']}\n\n"
                "Respondé sí/no (o agregá una aclaración). Como tenés más de "
                "una pendiente, empezá tu respuesta con el número (ej: "
                f'"{idx} sí").'
            )
            send_telegram_message(channel_id, text)
        else:
            text = row["question"] + "\n\nRespondé sí/no (o agregá una aclaración)."
            send_telegram_message(channel_id, text)
        _mark_pushed(row["id"], now_iso)
        pushed_ids.append(row["id"])
    return pushed_ids


def _mark_pushed(proposal_id: str, now_iso: str) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "UPDATE jarvis_audit_proposals SET pushed_at = ? WHERE id = ? AND pushed_at IS NULL",
                (now_iso, proposal_id),
            )
    finally:
        conn.close()


def _push_created(created_ids: list[str], channel: str, chat_id, user_id: str) -> None:
    """Pushea de inmediato SOLO lo agrupado (flag_contradiction/
    flag_connection -- un único mensaje combinado, ver build_grouped_message()).
    Los 8 action_types individuales throttleados (ver
    _QUEUED_INDIVIDUAL_ACTION_TYPES) NO se mandan acá -- quedan pushed_at=NULL
    desde create_proposal() y los levanta push_next_audit_batch(), llamado
    aparte (run_audit() lo llama una vez al final; el loop del worker lo
    reintenta en cada tick ocioso). Ver Cerebro/decisiones-implementacion.md,
    2026-09-17.
    """
    from jarvis.notify.telegram import send_telegram_message

    has_grouped = any(
        (p := get_proposal(pid)) and p["action_type"] in ("flag_contradiction", "flag_connection")
        for pid in created_ids
    )
    if has_grouped:
        pending_group = list_grouped_pending(channel, chat_id, user_id)
        if pending_group:
            send_telegram_message(chat_id, build_grouped_message(pending_group))
