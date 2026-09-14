"""
Captura pasiva por inactividad (Jarvis 0.2 Slice 4 — pieza C).

Job de fondo (disparado desde jarvis/worker/main.py) que revisa conversaciones
recientes y, tras un período de inactividad, PROPONE capturar lo que valga la
pena en vez de guardarlo directo. Reusa el mismo patrón de gobernanza que ya
existía dos veces en el código antes de esta pieza:
  - memory_projects.created_by='jarvis_proposal_accepted' (propuesta que el
    usuario acepta, ver jarvis/projects/service.py) -- acá se generaliza esa
    misma idea a memory_entries.created_by (ver jarvis/memory/service.py).
  - jarvis/captures/clarification.py (aclaración pre-enqueue) -- acá la
    "pregunta" de la propuesta puede ir desde un simple "¿guardo esto?" hasta
    una aclaración real cuando el contenido es ambiguo.

Canal: Telegram recibe un push activo (mensaje del worker, sin job_queue --
ver nota en _notify_telegram_proposal); desktop/web es pull, mismo patrón que
el inbox (polling de GET /jarvis/proposals). El vencimiento de una propuesta
sin respuesta se resuelve con un sweep periódico del propio worker
(expire_stale_proposals), no con un timer de python-telegram-bot: el worker y
el bot son procesos separados, así que un job_queue del bot no puede
programarse desde acá -- un sweep reusa el mismo patrón "el worker poll
marca estado" que ya usa todo el resto del sistema (retry de inbox_queue,
consolidación diaria), sin necesitar coordinación entre procesos.

TaskManifest: "read_conversations" y "propose_capture" son las operaciones
nuevas que hacen explícito algo que el diseño original ya autorizaba (spec:
"el worker puede leer conversaciones y escribir en el memory store") pero que
hasta esta pieza nunca se ejercía.
"""
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from jarvis.config import (
    JARVIS_DEFAULT_USER,
    JARVIS_LOCAL_MODEL,
    JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES,
    JARVIS_PASSIVE_PROPOSAL_TIMEOUT_MINUTES,
)
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_EVAL_PROMPT = """\
Analizá estos mensajes recientes escritos por el usuario (no incluyen las \
respuestas de Jarvis, su segundo cerebro personal -- solo lo que el usuario \
mismo tipeó) y decidí si contienen algo que valga la pena guardar como \
memoria permanente -- un hecho nuevo, una decisión tomada, un dato sobre un \
proyecto o una persona, algo que el usuario probablemente quiera recordar \
después.

Sé conservador: charla casual, preguntas sueltas ya respondidas, o texto sin \
sustancia real NO ameritan guardar nada. Un bloque de puras PREGUNTAS del \
usuario pidiéndole información a Jarvis (aunque sean varias, sobre temas \
distintos) tampoco amerita guardar nada -- una pregunta es un pedido de \
recuperar algo que ya está guardado, no información nueva para agregar; no \
generes una "memoria" que resuma qué preguntó el usuario.

Responde SOLO con JSON válido, sin texto extra:
{{"worth_capturing": true|false, "content": "..."|null, "question": "..."|null}}

- "content": si worth_capturing es true, un resumen breve y autocontenido de \
lo que valdría la pena guardar (sintetizar el hecho, no copiar el chat literal).
- "question": si algo queda ambiguo y hace falta preguntar antes de guardar, \
una pregunta corta y concreta. Si no hace falta aclarar nada, usá literalmente \
"¿Guardo esto en tu memoria?".

Ejemplos:
Texto: "dale, gracias, después lo veo"
Respuesta: {{"worth_capturing": false, "content": null, "question": null}}

Texto: "che al final decidimos pagar el hosting anual en vez de mensual, sale más barato"
Respuesta: {{"worth_capturing": true, "content": "Decisión: pagar el hosting en plan anual en vez de mensual, sale más barato.", "question": "¿Guardo esto en tu memoria?"}}

Texto: "hoy estuvo lindo el día, mucho sol"
Respuesta: {{"worth_capturing": false, "content": null, "question": null}}

Texto: "che se lo dije a Martín y quedó en confirmar"
Respuesta: {{"worth_capturing": true, "content": "Le comentaste algo a Martín y quedó en confirmar.", "question": "¿Guardo esto? ¿Sobre qué era exactamente lo que Martín tiene que confirmar?"}}

Texto: "¿qué base de datos usamos para Jarvis? ¿y quién es Martín Suárez? ¿en qué está el proyecto del asistente de voz?"
Respuesta: {{"worth_capturing": false, "content": null, "question": null}}

Conversación:
{text}

JSON:"""

_MAX_EVAL_CHARS = 4000


def find_idle_conversations(now: datetime | None = None) -> list[dict]:
    """Conversaciones con mensajes de usuario sin revisar y suficiente inactividad.

    "Sin revisar" = hay al menos un mensaje de usuario posterior a
    last_passive_review_at (o la conversación nunca se revisó). "Inactividad"
    = el último mensaje de la conversación (de cualquier rol -- si Jarvis
    respondió recién, la charla sigue viva) es más viejo que el umbral.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES)).isoformat()
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT c.id, c.channel, c.channel_id, c.user_id, c.last_passive_review_at
               FROM conversations c
               WHERE EXISTS (
                   SELECT 1 FROM conversation_messages cm
                   WHERE cm.conversation_id = c.id AND cm.role = 'user'
                     AND (c.last_passive_review_at IS NULL OR cm.created_at > c.last_passive_review_at)
               )
               AND (
                   SELECT MAX(cm2.created_at) FROM conversation_messages cm2
                   WHERE cm2.conversation_id = c.id
               ) <= ?""",
            (cutoff,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_unreviewed_user_text(conversation_id: str, since: str | None) -> str:
    conn = get_connection()
    try:
        if since:
            rows = conn.execute(
                """SELECT content FROM conversation_messages
                   WHERE conversation_id = ? AND role = 'user' AND created_at > ?
                   ORDER BY created_at""",
                (conversation_id, since),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT content FROM conversation_messages
                   WHERE conversation_id = ? AND role = 'user'
                   ORDER BY created_at""",
                (conversation_id,),
            ).fetchall()
        return "\n".join(r["content"] for r in rows)
    finally:
        conn.close()


def evaluate_for_capture(text: str) -> dict | None:
    """¿Esta conversación amerita proponer una captura? Modelo local (nunca el
    externo -- es clasificación barata, mismo criterio que extract_entities()
    y needs_clarification()). Nunca lanza -- None si falla o no aplica.
    """
    from jarvis.llm.client import call_llm

    if not text.strip():
        return None
    try:
        raw = call_llm(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Evaluás si una conversación amerita guardarse en "
                        "memoria permanente. Respondé únicamente con JSON válido."
                    ),
                },
                {"role": "user", "content": _EVAL_PROMPT.format(text=text[:_MAX_EVAL_CHARS])},
            ],
            model=JARVIS_LOCAL_MODEL,
            temperature=0.0,
        )
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start < 0 or end <= start:
            return None
        verdict = json.loads(raw[start:end])
        if not verdict.get("worth_capturing"):
            return None
        content = (verdict.get("content") or "").strip()
        if not content:
            return None
        question = (verdict.get("question") or "").strip() or "¿Guardo esto en tu memoria?"
        return {"content": content, "question": question}
    except Exception as exc:
        logger.warning("[jarvis.captures.passive] Evaluación falló, no se propone nada: %s", exc)
        return None


def scan_and_propose(now: datetime | None = None) -> dict:
    """Revisa conversaciones inactivas y crea propuestas. Nunca lanza -- los
    errores quedan en el resumen devuelto, igual que run_consolidation().
    """
    now = now or datetime.now(timezone.utc)
    summary = {"scanned": 0, "proposed": 0, "errors": []}
    try:
        idle = find_idle_conversations(now)
        summary["scanned"] = len(idle)
        for conv in idle:
            try:
                if _review_conversation(conv, now):
                    summary["proposed"] += 1
            except Exception as exc:
                logger.exception(
                    "[jarvis.captures.passive] Error evaluando conversation_id=%s", conv["id"]
                )
                summary["errors"].append(str(exc))
    except Exception as exc:
        logger.exception("[jarvis.captures.passive] Error en scan_and_propose")
        summary["errors"].append(str(exc))
    return summary


def _review_conversation(conv: dict, now: datetime) -> bool:
    text = get_unreviewed_user_text(conv["id"], conv.get("last_passive_review_at"))
    now_iso = now.isoformat()
    verdict = evaluate_for_capture(text)
    # Se marca revisada SIEMPRE, proponga o no -- si no, el mismo texto
    # descartado se re-evaluaría (y potencialmente re-preguntaría) en cada
    # vuelta del scan mientras la conversación siga sin mensajes nuevos.
    mark_reviewed(conv["id"], now_iso)
    if not verdict:
        return False

    proposal_id = create_proposal(
        conv["id"], conv["channel"], conv["channel_id"],
        verdict["content"], verdict["question"],
        conv.get("user_id") or JARVIS_DEFAULT_USER,
    )
    if conv["channel"] == "telegram" and conv["channel_id"]:
        _notify_telegram_proposal(conv["channel_id"], verdict["question"], verdict["content"])
    logger.info(
        "[jarvis.captures.passive] Propuesta %s creada para conversation_id=%s (channel=%s)",
        proposal_id, conv["id"], conv["channel"],
    )
    return True


def _notify_telegram_proposal(chat_id: str, question: str, content: str) -> None:
    from jarvis.notify.telegram import send_telegram_message

    try:
        send_telegram_message(
            chat_id,
            f"🧠 {question}\n\n{content}\n\nRespondé sí/no (o agregá una aclaración en tu respuesta).",
        )
    except Exception as exc:
        logger.warning("[jarvis.captures.passive] Aviso de propuesta a Telegram falló: %s", exc)


def mark_reviewed(conversation_id: str, when_iso: str) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "UPDATE conversations SET last_passive_review_at = ? WHERE id = ?",
                (when_iso, conversation_id),
            )
    finally:
        conn.close()


def create_proposal(
    conversation_id: str | None, channel: str, channel_id: str | None,
    content: str, question: str, user_id: str,
    origin_source: str = "passive_capture",
    origin_source_key: str | None = None,
) -> str:
    """origin_source/origin_source_key (0.3, ingestión automática -- ver
    Cerebro/decisiones-implementacion.md, 2026-09-03): por default una
    propuesta nace de captura pasiva por inactividad (conversation_id
    obligatorio en ese caso). jarvis/ingestion/agenda.py es el otro llamador
    -- pasa conversation_id=None (no viene de una charla) y
    origin_source='agenda_ingestion' con origin_source_key seteado (clave
    determinística del evento/tarea de origen, usada para no re-proponer lo
    mismo -- ver esa función)."""
    proposal_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO jarvis_capture_proposals
                    (id, conversation_id, channel, channel_id, content, question,
                     status, user_id, created_at, origin_source, origin_source_key)
                   VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)""",
                (
                    proposal_id, conversation_id, channel, channel_id, content, question,
                    user_id, datetime.now(timezone.utc).isoformat(),
                    origin_source, origin_source_key,
                ),
            )
        return proposal_id
    finally:
        conn.close()


def accept_proposal(proposal_id: str, extra_text: str | None = None) -> str | None:
    """Acepta una propuesta -- captura de verdad con
    created_by='jarvis_proposal_accepted'. Devuelve el entry_id, o None si la
    propuesta no existe o ya estaba resuelta.
    """
    from jarvis.memory.service import capture_raw

    proposal = get_proposal(proposal_id)
    if not proposal or proposal["status"] != "PENDING":
        return None

    content = proposal["content"]
    if extra_text and extra_text.strip():
        content = f"{content}\nAclaración: {extra_text.strip()}"

    # Ingestión automática (0.3, Agenda de SGR -- ver Cerebro/decisiones-
    # implementacion.md, 2026-09-03, punto 1.4): el dato vino de la Agenda
    # del propio usuario, no de una conversación por el canal donde se
    # confirmó -- ni ese channel ni 'telegram.user' describen el origen real.
    # source='agenda' (cuarto valor del CHECK, ver jarvis/db/database.py::
    # _migrate_memory_entries_source) y origin_trust='user.authenticated'
    # fijo, sin importar por qué canal se aceptó. source_id determinístico
    # (origin_source_key) en vez de "passive:{proposal_id}" -- así una
    # entrada ya aceptada también cuenta para el dedup de
    # jarvis/ingestion/agenda.py (chequea memory_entries.source_id).
    if proposal.get("origin_source") == "agenda_ingestion":
        source = "agenda"
        origin_trust = "user.authenticated"
        source_id = proposal.get("origin_source_key") or f"passive:{proposal_id}"
    else:
        source = proposal["channel"]
        origin_trust = "telegram.user" if proposal["channel"] == "telegram" else "user.authenticated"
        source_id = f"passive:{proposal_id}"

    entry_id = capture_raw(
        content=content,
        source=source,
        channel=proposal["channel_id"],
        source_id=source_id,
        origin_trust=origin_trust,
        user_id=proposal["user_id"],
        created_by="jarvis_proposal_accepted",
    )
    _resolve_proposal(proposal_id, "ACCEPTED", entry_id)
    return entry_id


def reject_proposal(proposal_id: str) -> bool:
    proposal = get_proposal(proposal_id)
    if not proposal or proposal["status"] != "PENDING":
        return False
    _resolve_proposal(proposal_id, "REJECTED", None)
    return True


def expire_stale_proposals(now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=JARVIS_PASSIVE_PROPOSAL_TIMEOUT_MINUTES)).isoformat()
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                """UPDATE jarvis_capture_proposals
                   SET status = 'EXPIRED', resolved_at = ?
                   WHERE status = 'PENDING' AND created_at <= ?""",
                (now.isoformat(), cutoff),
            )
            return cur.rowcount
    finally:
        conn.close()


def get_proposal(proposal_id: str) -> dict | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM jarvis_capture_proposals WHERE id = ?", (proposal_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_pending_proposal_for_channel(channel: str, channel_id) -> dict | None:
    """Última propuesta PENDING para un chat/canal puntual -- usado por el bot
    de Telegram para interpretar una respuesta de texto libre como sí/no.
    """
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT * FROM jarvis_capture_proposals
               WHERE channel = ? AND channel_id = ? AND status = 'PENDING'
               ORDER BY created_at DESC LIMIT 1""",
            (channel, str(channel_id)),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_pending_proposals(user_id: str = JARVIS_DEFAULT_USER, channel: str | None = None) -> list[dict]:
    """Propuestas pendientes -- usado por el frontend (polling, pull en vez de push)."""
    conn = get_connection()
    try:
        if channel:
            rows = conn.execute(
                """SELECT * FROM jarvis_capture_proposals
                   WHERE user_id = ? AND channel = ? AND status = 'PENDING'
                   ORDER BY created_at DESC""",
                (user_id, channel),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM jarvis_capture_proposals
                   WHERE user_id = ? AND status = 'PENDING'
                   ORDER BY created_at DESC""",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _resolve_proposal(proposal_id: str, status: str, entry_id: str | None) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """UPDATE jarvis_capture_proposals
                   SET status = ?, entry_id = ?, resolved_at = ?
                   WHERE id = ?""",
                (status, entry_id, datetime.now(timezone.utc).isoformat(), proposal_id),
            )
    finally:
        conn.close()
