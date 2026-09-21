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

Canal: Telegram recibe un push activo (mensaje del worker, sin job_queue);
desktop/web es pull, mismo patrón que el inbox (polling de GET
/jarvis/proposals). El vencimiento de una propuesta sin respuesta se resuelve
con un sweep periódico del propio worker (expire_stale_proposals), no con un
timer de python-telegram-bot: el worker y el bot son procesos separados, así
que un job_queue del bot no puede programarse desde acá -- un sweep reusa el
mismo patrón "el worker poll marca estado" que ya usa todo el resto del
sistema (retry de inbox_queue, consolidación periódica), sin necesitar
coordinación entre procesos.

Throttle de propuestas (2026-09-17, ver Cerebro/decisiones-implementacion.md):
el push a Telegram ya NO es inmediato al crear la propuesta -- create_proposal()
la deja encolada (pushed_at=NULL para canal telegram) y push_next_capture_batch()
la entrega de a JARVIS_CAPTURE_PUSH_BATCH_SIZE por vez, solo cuando no queda
ninguna sin resolver para ese chat (mismo patrón, calcado, que
jarvis/audit/service.py aplicó el mismo día a jarvis_audit_proposals -- ver esa
entrada para el contexto completo del bug que esto arregla: 20 EXPIRED + 1
REJECTED + 0 ACCEPTED sobre 21 propuestas reales de Agenda, ninguna resuelta a
tiempo).

Desambiguación (2026-09-17, mismo día, entrada aparte en Cerebro/decisiones-
implementacion.md): con el batch size en 1 nunca hay más de una PENDING+pushed
a la vez, pero subirlo a 2+ sí puede dejar 2+ esperando respuesta al mismo
tiempo -- list_pending_proposals_for_channel()/build_disambiguation_message()
(abajo) existen para ese caso; project/mybot/jarvis_handlers.py los usa para
pedirle al usuario que aclare a cuál se refiere en vez de aplicar la
respuesta a ciegas a la más vieja/reciente.

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
    JARVIS_CAPTURE_PUSH_BATCH_SIZE,
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

    # Empuja el próximo lote de la cola de propuestas de captura (throttle,
    # ver Cerebro/decisiones-implementacion.md, 2026-09-17) -- incondicional,
    # igual que jarvis.audit.service.run_audit(): puede haber algo de la cola
    # de una corrida anterior esperando turno aunque esta corrida no haya
    # propuesto nada nuevo. Usa el mismo chat_id "debug" que ya usan
    # jarvis/ingestion/agenda.py, agenda_patterns.py y run_audit() para esto
    # (get_debug_chat_id(), sistema de un solo usuario) -- distinto del
    # channel_id por-conversación que create_proposal() guarda en cada fila,
    # que en la práctica es el mismo chat en este sistema personal.
    try:
        from jarvis.debug.service import get_debug_chat_id

        chat_id = get_debug_chat_id()
        if chat_id:
            push_next_capture_batch("telegram", chat_id, JARVIS_DEFAULT_USER)
    except Exception as exc:
        logger.exception("[jarvis.captures.passive] Error empujando el próximo lote de la cola de captura")
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
    # 2026-09-17 (throttle de propuestas de captura, Cerebro/decisiones-
    # implementacion.md): ya no se pushea acá de inmediato -- create_proposal()
    # deja la fila en cola (pushed_at=NULL para canal telegram) y
    # push_next_capture_batch() la entrega cuando corresponda (cada tick
    # ocioso del worker + al final de scan_and_propose()/run_agenda_ingestion()/
    # run_agenda_pattern_synthesis()), respetando JARVIS_CAPTURE_PUSH_BATCH_SIZE
    # sin resolver por chat.
    logger.info(
        "[jarvis.captures.passive] Propuesta %s creada para conversation_id=%s (channel=%s)",
        proposal_id, conv["id"], conv["channel"],
    )
    return True


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


def _initial_pushed_at(channel: str, now_iso: str) -> str | None:
    """None si la propuesta debe esperar en la cola de throttle (recién se
    entrega cuando push_next_capture_batch() la levante); now_iso si se la
    considera "entregada" de entrada -- canal 'desktop' (pull vía polling del
    frontend, no hay ráfaga de notificaciones que evitar). Más simple que la
    homónima de jarvis/audit/service.py -- este módulo no tiene el concepto
    de "action_type", una jarvis_capture_proposals es siempre "¿guardo esto?"
    sin importar si nace de passive_capture o agenda_ingestion (incluidos los
    patrones de agenda_patterns.py) -- ambos orígenes van a la MISMA cola por
    igual, sin ninguna excepción de tipo. Ver Cerebro/decisiones-
    implementacion.md, 2026-09-17.
    """
    return now_iso if channel != "telegram" else None


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
    mismo -- ver esa función).

    pushed_at queda NULL (en cola) o se setea de inmediato según
    _initial_pushed_at() -- ver Cerebro/decisiones-implementacion.md,
    2026-09-17. No afecta ningún dedup existente (jarvis/ingestion/agenda.py::
    _already_proposed() sigue mirando solo origin_source_key, ajeno a
    pushed_at/status).
    """
    proposal_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    pushed_at = _initial_pushed_at(channel, now)
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO jarvis_capture_proposals
                    (id, conversation_id, channel, channel_id, content, question,
                     status, user_id, created_at, origin_source, origin_source_key,
                     pushed_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)""",
                (
                    proposal_id, conversation_id, channel, channel_id, content, question,
                    user_id, now,
                    origin_source, origin_source_key, pushed_at,
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
    #
    # authorship (2026-09-15, síntesis de patrones de Agenda -- ver
    # Cerebro/decisiones-implementacion.md): origin_source_key con prefijo
    # "agenda:patron:" (jarvis/ingestion/agenda_patterns.py) es prosa/
    # transformación que SINTETIZÓ Jarvis, no contenido literal que el
    # usuario tipeó en su Agenda -- mismo criterio que
    # jarvis/audit/service.py::_apply_create(), 'jarvis_synthesis' rutea a
    # Boveda/Jarvis/ en vez del árbol PARA (jarvis/vault/writer.py). El resto
    # de origin_source_key bajo "agenda_ingestion" (namespace "agenda:evento:.../
    # agenda:tarea:...", contenido literal de 0.3) sigue en 'user', default de
    # capture_raw() -- sin cambio de comportamiento para ese caso.
    if proposal.get("origin_source") == "agenda_ingestion":
        source = "agenda"
        origin_trust = "user.authenticated"
        source_id = proposal.get("origin_source_key") or f"passive:{proposal_id}"
        authorship = "jarvis_synthesis" if source_id.startswith("agenda:patron:") else "user"
    else:
        source = proposal["channel"]
        origin_trust = "telegram.user" if proposal["channel"] == "telegram" else "user.authenticated"
        source_id = f"passive:{proposal_id}"
        authorship = "user"

    entry_id = capture_raw(
        content=content,
        source=source,
        channel=proposal["channel_id"],
        source_id=source_id,
        origin_trust=origin_trust,
        user_id=proposal["user_id"],
        created_by="jarvis_proposal_accepted",
        authorship=authorship,
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
    """Expira PENDING con más de JARVIS_PASSIVE_PROPOSAL_TIMEOUT_MINUTES desde
    que se LE MANDÓ al usuario (pushed_at), no desde que se creó -- mismo fix
    aplicado el mismo día a jarvis_audit_proposals, ver Cerebro/decisiones-
    implementacion.md, 2026-09-17. Una fila con pushed_at IS NULL (todavía en
    la cola de throttle) nunca matchea el WHERE de abajo y por lo tanto nunca
    expira -- correcto: el usuario ni la vio, no tiene sentido que se le
    venza.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=JARVIS_PASSIVE_PROPOSAL_TIMEOUT_MINUTES)).isoformat()
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                """UPDATE jarvis_capture_proposals
                   SET status = 'EXPIRED', resolved_at = ?
                   WHERE status = 'PENDING' AND pushed_at IS NOT NULL AND pushed_at <= ?""",
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


def list_pending_proposals_for_channel(
    channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER
) -> list[dict]:
    """Todas las propuestas PENDING ya entregadas para este chat, ASC por
    created_at (más vieja primero). Generaliza lo que antes hacía
    get_pending_proposal_for_channel() (LIMIT 1, DESC -- la MÁS RECIENTE) --
    necesario para poder desambiguar cuando hay 2+ pendientes a la vez, algo
    que solo puede pasar desde que JARVIS_CAPTURE_PUSH_BATCH_SIZE es
    env-configurable a 2+ (ver Cerebro/decisiones-implementacion.md,
    2026-09-17, entrada de desambiguación). Con el default (1) esta lista
    nunca tiene más de un elemento -- el caso simple no cambia.

    Nota sobre el orden: la función vieja tomaba la más RECIENTE (DESC),
    mientras que la homóloga de auditoría (jarvis/audit/service.py::
    get_pending_individual_proposal_for_channel()) tomaba la más VIEJA (ASC)
    -- asimetría real entre los dos subsistemas, sin ninguna razón
    documentada, confirmada leyendo ambas funciones antes de este cambio. Con
    el mecanismo de desambiguación nuevo deja de importar cuál se elegía "por
    default" cuando hay ambigüedad real (ya no se resuelve a ciegas ninguna
    de las dos) -- pero no hay motivo para mantener la asimetría en el caso
    simple, así que acá también se unifica a ASC.

    Usada por project/mybot/jarvis_handlers.py para decidir si puede resolver
    directo (0 o 1 resultado) o si necesita pedirle al usuario que aclare a
    cuál se refiere (2+ resultados).
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM jarvis_capture_proposals
               WHERE channel = ? AND channel_id = ? AND user_id = ? AND status = 'PENDING'
                 AND pushed_at IS NOT NULL
               ORDER BY created_at ASC""",
            (channel, str(channel_id), user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_pending_proposal_for_channel(channel: str, channel_id) -> dict | None:
    """La más vieja de las propuestas PENDING para este chat -- atajo para el
    caso simple (0 o 1 pendiente), delega en
    list_pending_proposals_for_channel(). Cuando hay 2+, el caller debe usar
    la lista completa para desambiguar (ver esa función) en vez de tomar esta
    ciegamente -- project/mybot/jarvis_handlers.py ya lo hace así. Ver
    Cerebro/decisiones-implementacion.md, 2026-09-17 (nota sobre el cambio de
    orden DESC->ASC).
    """
    pending = list_pending_proposals_for_channel(channel, channel_id)
    return pending[0] if pending else None


def build_disambiguation_message(proposals: list[dict]) -> str:
    """Mensaje de desambiguación cuando hay 2+ propuestas de captura PENDING
    para el mismo chat a la vez -- mismo criterio de UX que
    jarvis.audit.service.build_individual_disambiguation_message() (listar
    numeradas, pedir que conteste con el número antepuesto a su respuesta
    real). Se antepone también el contenido propuesto (no solo la pregunta),
    igual que el mensaje normal de push_next_capture_batch(), para que la
    lista numerada sea reconocible contra los mensajes que el usuario ya
    recibió. Ver Cerebro/decisiones-implementacion.md, 2026-09-17 (entrada de
    desambiguación).
    """
    lines = ["🧠 Tenés más de una propuesta de captura esperando tu respuesta -- decime a cuál te referís:"]
    for i, p in enumerate(proposals, start=1):
        lines.append(f"{i}) {p['question']}\n   {p['content']}")
    lines.append(
        '\nRespondé empezando con el número (ej: "2 sí", "1: no", '
        '"2 con esta aclaración...").'
    )
    return "\n".join(lines)


def list_pending_proposals(user_id: str = JARVIS_DEFAULT_USER, channel: str | None = None) -> list[dict]:
    """Propuestas pendientes -- usado por el frontend (polling, pull en vez de
    push). pushed_at IS NOT NULL en ambas ramas -- no debe listar algo que el
    usuario todavía no vio (ver Cerebro/decisiones-implementacion.md,
    2026-09-17).
    """
    conn = get_connection()
    try:
        if channel:
            rows = conn.execute(
                """SELECT * FROM jarvis_capture_proposals
                   WHERE user_id = ? AND channel = ? AND status = 'PENDING'
                     AND pushed_at IS NOT NULL
                   ORDER BY created_at DESC""",
                (user_id, channel),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM jarvis_capture_proposals
                   WHERE user_id = ? AND status = 'PENDING'
                     AND pushed_at IS NOT NULL
                   ORDER BY created_at DESC""",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def push_next_capture_batch(channel: str, channel_id, user_id: str = JARVIS_DEFAULT_USER) -> list[str]:
    """Empuja el próximo lote (hasta JARVIS_CAPTURE_PUSH_BATCH_SIZE) de la cola
    de jarvis_capture_proposals para este chat -- SOLO si no queda ninguna sin
    resolver todavía (ninguna PENDING ya entregada, pushed_at IS NOT NULL,
    para este channel_id). FIFO por created_at. Sin distinción de
    origin_source: passive_capture, agenda_ingestion y los patrones de
    agenda_patterns.py (origin_source_key "agenda:patron:...") van a la MISMA
    cola por igual -- a diferencia de jarvis.audit.service.push_next_audit_batch()
    (que excluye tipos agrupados/open_question), acá no hay ninguna excepción
    de tipo que excluir. Devuelve los ids efectivamente empujados (puede ser
    []). Calcada de push_next_audit_batch() -- ver Cerebro/decisiones-
    implementacion.md, 2026-09-17.

    Llamada desde jarvis/worker/main.py::_maybe_run_passive_capture() (cada
    tick ocioso del loop) y al final de scan_and_propose(),
    jarvis.ingestion.agenda.run_agenda_ingestion() y jarvis.ingestion.
    agenda_patterns.run_agenda_pattern_synthesis() -- para que el primer lote
    de una corrida recién terminada salga sin esperar el próximo tick.

    No es un job que pueda tumbar nada más si falla feo -- igual se llama
    siempre dentro de un try/except en los call sites, mismo criterio
    defensivo que push_next_audit_batch().
    """
    if channel != "telegram" or not channel_id:
        return []

    conn = get_connection()
    try:
        outstanding = conn.execute(
            """SELECT 1 FROM jarvis_capture_proposals
               WHERE channel = ? AND channel_id = ? AND user_id = ?
                 AND status = 'PENDING' AND pushed_at IS NOT NULL
               LIMIT 1""",
            (channel, str(channel_id), user_id),
        ).fetchone()
        if outstanding:
            return []

        rows = conn.execute(
            """SELECT * FROM jarvis_capture_proposals
               WHERE channel = ? AND channel_id = ? AND user_id = ?
                 AND status = 'PENDING' AND pushed_at IS NULL
               ORDER BY created_at ASC LIMIT ?""",
            (channel, str(channel_id), user_id, JARVIS_CAPTURE_PUSH_BATCH_SIZE),
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
        # JARVIS_CAPTURE_PUSH_BATCH_SIZE >= 2) -- mismo criterio que
        # push_next_audit_batch() (ver Cerebro/decisiones-implementacion.md,
        # 2026-09-17, entrada de desambiguación). Con batch=1 (default) n
        # siempre es 1 y el mensaje no cambia.
        if n > 1:
            text = (
                f"🧠 {idx}/{n}: {row['question']}\n\n{row['content']}\n\n"
                "Respondé sí/no (o agregá una aclaración). Como tenés más de "
                "una pendiente, empezá tu respuesta con el número (ej: "
                f'"{idx} sí").'
            )
        else:
            text = f"🧠 {row['question']}\n\n{row['content']}\n\nRespondé sí/no (o agregá una aclaración en tu respuesta)."
        send_telegram_message(channel_id, text)
        _mark_pushed(row["id"], now_iso)
        pushed_ids.append(row["id"])
    return pushed_ids


def _mark_pushed(proposal_id: str, now_iso: str) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "UPDATE jarvis_capture_proposals SET pushed_at = ? WHERE id = ? AND pushed_at IS NULL",
                (now_iso, proposal_id),
            )
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
