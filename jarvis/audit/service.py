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
  5. Cuando hay varias propuestas individuales (no agrupadas) PENDING para
     el mismo chat a la vez, una respuesta de texto libre en Telegram
     resuelve la más VIEJA primero (FIFO) -- el documento asumía una sola
     pendiente a la vez (mismo supuesto que ya tenía captura pasiva), sin
     contemplar que un solo audit run puede generar varias de golpe.
"""
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

from jarvis.config import (
    JARVIS_AUDIT_BLOCK_SIZE,
    JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES,
    JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS,
    JARVIS_DEFAULT_USER,
)
from jarvis.db.database import get_connection
from jarvis.llm.client import call_reason
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_ENTITY_CREATE_LIMIT = 3
_MAX_FRAGMENT_CHARS = 500

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

def run_audit(now: datetime | None = None) -> dict:
    """Corre la auditoría completa. Nunca lanza -- cualquier error queda en
    el resumen (mismo patrón que run_consolidation()/scan_and_propose()).
    """
    MANIFEST.assert_allowed("audit_memory")
    MANIFEST.assert_allowed("propose_audit_action")

    now = now or datetime.now(timezone.utc)
    user_id = JARVIS_DEFAULT_USER
    summary = {"tag_block": 0, "random_block": 0, "proposed": 0, "errors": []}

    from jarvis.debug.service import get_debug_chat_id

    chat_id = get_debug_chat_id()
    channel = "telegram" if chat_id else "desktop"

    created_ids: list[str] = []
    try:
        tag_block = _select_tag_block(user_id)
        summary["tag_block"] = len(tag_block)
        created_ids += _process_block(tag_block, channel, chat_id, user_id, summary)

        seen_ids = {e["id"] for e in tag_block}
        random_block = _select_random_block(user_id, exclude_ids=seen_ids)
        summary["random_block"] = len(random_block)
        created_ids += _process_block(random_block, channel, chat_id, user_id, summary)
        seen_ids |= {e["id"] for e in random_block}

        if seen_ids:
            _mark_audited(seen_ids, now.isoformat())

        created_ids += _process_entity_gaps(user_id, channel, chat_id, summary)
    except Exception as exc:
        logger.exception("[audit] Error en run_audit")
        summary["errors"].append(str(exc))

    summary["proposed"] = len(created_ids)

    if channel == "telegram" and chat_id and created_ids:
        try:
            _push_created(created_ids, channel, chat_id, user_id)
        except Exception as exc:
            logger.exception("[audit] Error empujando propuestas a Telegram")
            summary["errors"].append(str(exc))

    logger.info(
        "[audit] bloque tag=%d bloque random=%d propuestas=%d",
        summary["tag_block"], summary["random_block"], summary["proposed"],
    )
    return summary


# ── Selección de bloques (punto 2) ───────────────────────────────────────────

def _select_tag_block(user_id: str) -> list[dict]:
    """Bloque agrupado por el tag con más entradas sin auditar (last_audited_at
    más viejo dentro del grupo, mismo criterio que entry_ids_without_
    catalog_tags()). [] si no hay ningún tag con entradas vigentes.
    """
    conn = get_connection()
    try:
        tag_row = conn.execute(
            """SELECT mt.tag_id
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
            return []
        rows = conn.execute(
            """SELECT me.* FROM memory_entries me
               JOIN memory_entry_tags met ON met.entry_id = me.id
               WHERE met.tag_id = ? AND me.user_id = ? AND me.valid_to IS NULL
               ORDER BY COALESCE(me.last_audited_at, '') ASC, me.recorded_at ASC
               LIMIT ?""",
            (tag_row["tag_id"], user_id, JARVIS_AUDIT_BLOCK_SIZE),
        ).fetchall()
        return [dict(r) for r in rows]
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


# ── Bloque -> propuestas ──────────────────────────────────────────────────────

def _process_block(entries: list[dict], channel: str, chat_id, user_id: str, summary: dict) -> list[str]:
    if not entries:
        return []
    created: list[str] = []
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
        if pid:
            created.append(pid)

    findings = _review_block(entries)
    for finding in findings:
        try:
            pid = _resolve_finding_to_proposal(finding, entries_by_id, channel, chat_id, user_id)
            if pid:
                created.append(pid)
        except Exception as exc:
            logger.warning("[audit] No se pudo procesar hallazgo %r: %s", finding, exc)
            summary["errors"].append(str(exc))
    return created


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


def _process_entity_gaps(user_id: str, channel: str, chat_id, summary: dict) -> list[str]:
    from jarvis.entities.service import get_entries_for_entity

    created: list[str] = []
    for gap in _detect_entity_gaps(user_id)[:_ENTITY_CREATE_LIMIT]:
        entries = get_entries_for_entity(gap["name"], user_id)
        if not entries:
            continue
        target_ids = [e["id"] for e in entries]
        if _already_exists("create", target_ids):
            continue
        content = _synthesize_entity_summary(gap["name"], entries)
        if not content:
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
        if pid:
            created.append(pid)
    return created


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
        f"_{_content_of(entries_by_id, keep_id)}_\n"
        f"→ ¿la cambio a: {_short(new_content)}?"
    )


def _question_delete_empty(entry_id):
    return f"🧠 Esta entrada parece vacía (id `{entry_id[:8]}`). ¿La borro?"


def _question_clarify(entries_by_id, entry_id, reference):
    return (
        f"🧠 En esta entrada mencionás a **{reference}** sin más contexto:\n"
        f"_{_content_of(entries_by_id, entry_id)}_\n¿Quién/qué es?"
    )


def _question_retag(entries_by_id, entry_id, wrong_tag):
    return (
        f"🧠 El tag `{wrong_tag}` no parece corresponder a esta entrada:\n"
        f"_{_content_of(entries_by_id, entry_id)}_\n¿Lo saco?"
    )


def _question_create(name, n_mentions, content):
    return (
        f"🧠 Encontré {n_mentions} menciones de **{name}** sin ninguna entrada "
        f"propia. ¿Guardo esto?\n_{_short(content)}_"
    )


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
    """
    if _already_exists(action_type, target_entry_ids):
        return None

    proposal_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO jarvis_audit_proposals
                    (id, action_type, target_entry_ids, payload, question,
                     channel, channel_id, status, user_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)""",
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
                   ORDER BY created_at DESC""",
                (user_id, channel),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM jarvis_audit_proposals
                   WHERE user_id = ? AND status = 'PENDING'
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


def get_pending_individual_proposal_for_channel(channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER) -> dict | None:
    """Próxima propuesta PENDING individual (no agrupada) para este chat, la
    más vieja primero -- FIFO simple para cuando el mismo audit run generó
    varias de golpe (ver nota 5 del docstring del módulo: el documento de
    diseño no contemplaba más de una pendiente por chat a la vez).
    """
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT * FROM jarvis_audit_proposals
               WHERE channel = ? AND channel_id = ? AND user_id = ? AND status = 'PENDING'
                 AND action_type NOT IN ('flag_contradiction','flag_connection')
               ORDER BY created_at ASC LIMIT 1""",
            (channel, str(channel_id), user_id),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def reject_proposal(proposal_id: str) -> bool:
    proposal = get_proposal(proposal_id)
    if not proposal or proposal["status"] != "PENDING":
        return False
    _resolve_proposal(proposal_id, "REJECTED", None)
    return True


def expire_stale_proposals(now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES)).isoformat()
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                """UPDATE jarvis_audit_proposals
                   SET status = 'EXPIRED', resolved_at = ?
                   WHERE status = 'PENDING' AND created_at <= ?""",
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

def accept_proposal(proposal_id: str, reply_text: str | None = None) -> dict | None:
    """Aplica la acción de una propuesta PENDING. Devuelve {"entry_id": ...|None}
    (entry_id solo si la acción crea contenido nuevo), o None si la propuesta
    no existe o ya estaba resuelta. reply_text solo se usa para 'clarify'.
    """
    proposal = get_proposal(proposal_id)
    if not proposal or proposal["status"] != "PENDING":
        return None

    action_type = proposal["action_type"]
    target_ids = json.loads(proposal["target_entry_ids"])
    payload = json.loads(proposal["payload"]) if proposal["payload"] else {}
    entry_id = None

    if action_type == "create":
        entry_id = _apply_create(proposal, payload)
    elif action_type == "clarify":
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

    _resolve_proposal(proposal_id, "ACCEPTED", entry_id)
    return {"entry_id": entry_id}


def _apply_create(proposal: dict, payload: dict) -> str:
    from jarvis.memory.service import capture_raw

    return capture_raw(
        content=payload["content"],
        source=proposal["channel"],
        channel=proposal["channel_id"],
        source_id=f"audit:{proposal['id']}",
        origin_trust=payload.get("origin_trust") or "system",
        user_id=proposal["user_id"],
        created_by="jarvis_proposal_accepted",
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


# ── Mensaje agrupado (flag_contradiction/flag_connection) ────────────────────

def list_grouped_pending(channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM jarvis_audit_proposals
               WHERE channel = ? AND channel_id = ? AND user_id = ? AND status = 'PENDING'
                 AND action_type IN ('flag_contradiction','flag_connection')
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


def _push_created(created_ids: list[str], channel: str, chat_id, user_id: str) -> None:
    from jarvis.notify.telegram import send_telegram_message

    individual, has_grouped = [], False
    for pid in created_ids:
        p = get_proposal(pid)
        if not p:
            continue
        if p["action_type"] in ("flag_contradiction", "flag_connection"):
            has_grouped = True
        else:
            individual.append(p)

    for p in individual:
        send_telegram_message(
            chat_id, p["question"] + "\n\n_Respondé sí/no (o agregá una aclaración)._"
        )

    if has_grouped:
        pending_group = list_grouped_pending(channel, chat_id, user_id)
        if pending_group:
            send_telegram_message(chat_id, build_grouped_message(pending_group))
