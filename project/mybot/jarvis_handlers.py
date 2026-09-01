"""
Handlers de Telegram para Jarvis.

Extiende project/mybot/bot.py sin modificar el flujo existente de SGR.

Comandos registrados:
    /j <texto>   — captura explícita a Jarvis Memory Core
    /jq <texto>  — consulta RAG a Jarvis (S3)
    /jdebug      — snapshot de estado (último procesamiento, errores, presupuesto)
    /jdebugon    — activa el modo debug (el worker avisa por Telegram cada entrada procesada)
    /jdebugoff   — desactiva el modo debug
"""
import asyncio
import logging

from telegram import Update
from telegram.error import BadRequest
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

try:
    from jarvis.audit.service import (
        accept_proposal as _accept_audit_proposal,
        get_pending_individual_proposal_for_channel as _get_pending_individual_audit,
        reject_proposal as _reject_audit_proposal,
        resolve_grouped_reply as _resolve_audit_grouped_reply,
    )
    from jarvis.captures.clarification import infer_type_hint, needs_clarification
    from jarvis.captures.passive import (
        accept_proposal as _accept_passive_proposal,
        get_pending_proposal_for_channel,
        reject_proposal as _reject_passive_proposal,
    )
    from jarvis.db.database import init_db as _jarvis_init_db
    from jarvis.debug.service import (
        format_snapshot_text,
        get_snapshot,
        remember_chat_id,
        set_debug_mode,
    )
    from jarvis.memory.service import capture_raw
    from jarvis.query.service import query as _jarvis_query
    _JARVIS_AVAILABLE = True
except ImportError:
    _JARVIS_AVAILABLE = False
    logger.warning(
        "[jarvis_handlers] Paquete jarvis no instalado. "
        "Ejecutá: cd project && .\\venv\\Scripts\\pip install -e ../jarvis"
    )

# Tiempo máximo de espera por la razón de una DECISION antes de guardar igual
# sin ella -- la captura nunca se pierde, con o sin respuesta del usuario.
JARVIS_CLARIFICATION_TIMEOUT_S = 180


def jarvis_init() -> None:
    if _JARVIS_AVAILABLE:
        _jarvis_init_db()
        logger.info("[jarvis_handlers] jarvis.db inicializada.")
    else:
        logger.warning("[jarvis_handlers] Jarvis no disponible — init omitida.")


async def cmd_j(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Captura texto a Jarvis: /j <texto>"""
    if not _JARVIS_AVAILABLE:
        await update.message.reply_text(
            "⚠ Jarvis no está instalado. Ejecutá:\n"
            "`cd project && .\\venv\\Scripts\\pip install -e ../jarvis`",
            parse_mode="Markdown",
        )
        return

    content = " ".join(context.args).strip() if context.args else ""
    if not content:
        await update.message.reply_text(
            "Usá `/j <texto>` para guardar algo en Jarvis.\n"
            "Ejemplo: `/j Reunión con Ana el jueves, hablar sobre el presupuesto.`",
            parse_mode="Markdown",
        )
        return

    msg = update.message
    chat_id = msg.chat.id
    message_id = msg.message_id
    source_id = f"telegram:{chat_id}:{message_id}"
    remember_chat_id(chat_id)
    inferred_type = infer_type_hint(content)

    needs, question = needs_clarification(content, inferred_type)
    if needs:
        await _start_clarification(update, context, content, source_id, question)
        return

    await _do_capture(msg, content, source_id, display_type=_display_type(content, inferred_type))


async def _do_capture(msg, content: str, source_id: str, display_type: str) -> None:
    try:
        entry_id = capture_raw(
            content=content,
            source="telegram",
            channel=str(msg.chat.id),
            source_id=source_id,
            origin_trust="telegram.user",
        )
        await msg.reply_text(
            f"✅ Guardado en Jarvis — procesando…\n"
            f"_ID: `{entry_id[:8]}`_  |  tipo probable: {display_type}",
            parse_mode="Markdown",
        )
        logger.info("[j] capturado entry_id=%s desde chat_id=%s", entry_id, msg.chat.id)
    except Exception as e:
        logger.exception("[j] Error al capturar: %s", e)
        await msg.reply_text(f"❌ Error al guardar en Jarvis: {e}")


async def _start_clarification(
    update: Update, context: ContextTypes.DEFAULT_TYPE, content: str, source_id: str, question: str
) -> None:
    """Guarda el pendiente y programa el timeout -- nunca bloquea la captura."""
    msg = update.message
    chat_id = msg.chat.id
    job_name = f"jarvis_clar_{chat_id}_{msg.message_id}"

    context.user_data["jarvis_clarification"] = {
        "content": content,
        "source_id": source_id,
        "chat_id": chat_id,
        "job_name": job_name,
    }

    if context.job_queue:
        context.job_queue.run_once(
            _clarification_timeout,
            JARVIS_CLARIFICATION_TIMEOUT_S,
            chat_id=chat_id,
            data={"content": content, "source_id": source_id, "chat_id": chat_id},
            name=job_name,
        )
    else:
        logger.warning(
            "[j] job_queue no disponible -- sin timeout automático de aclaración (%s). "
            "Instalá python-telegram-bot[job-queue].",
            source_id,
        )

    await msg.reply_text(
        f"🤔 {question}\n"
        "_Si no respondés en 3 minutos, lo guardo igual sin la razón._",
        parse_mode="Markdown",
    )


async def _clarification_timeout(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Si el usuario no respondió a tiempo, guarda la captura original igual.

    No depende de context.user_data -- un job de JobQueue solo tiene ese
    scope poblado si se le pasó user_id= al programarlo (acá solo se pasa
    chat_id=). Toda la información que necesita viaja en job.data.
    handle_pending_clarification() cancela este job por nombre si el
    usuario responde antes de que se dispare.
    """
    job = context.job
    pending = job.data
    try:
        entry_id = capture_raw(
            content=pending["content"],
            source="telegram",
            channel=str(pending["chat_id"]),
            source_id=pending["source_id"],
            origin_trust="telegram.user",
        )
        await context.bot.send_message(
            pending["chat_id"],
            f"⏱ No hubo respuesta — guardado sin razón.\n_ID: `{entry_id[:8]}`_",
            parse_mode="Markdown",
        )
        logger.info("[j] capturado (timeout de aclaración) entry_id=%s", entry_id)
    except Exception as e:
        logger.exception("[j] Error al capturar tras timeout de aclaración: %s", e)
        await context.bot.send_message(pending["chat_id"], f"❌ Error al guardar en Jarvis: {e}")


async def handle_pending_clarification(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Consume la respuesta a una pregunta de aclaración pendiente, si hay una.

    Debe llamarse ANTES que cualquier otro routing de texto libre en bot.py --
    de lo contrario la respuesta a "¿Por qué...?" se interpretaría como una
    captura nueva de la Bóveda. Devuelve True si consumió el mensaje.
    """
    if not _JARVIS_AVAILABLE:
        return False

    ud = context.user_data
    pending = ud.get("jarvis_clarification")
    if not pending:
        return False

    msg = update.message
    texto = (msg.text or "").strip() if msg and msg.text else ""
    if not texto:
        return False

    ud.pop("jarvis_clarification", None)
    if context.job_queue:
        for job in context.job_queue.get_jobs_by_name(pending["job_name"]):
            job.schedule_removal()

    full_content = f"{pending['content']}\nRazón: {texto}"
    try:
        entry_id = capture_raw(
            content=full_content,
            source="telegram",
            channel=str(pending["chat_id"]),
            source_id=pending["source_id"],
            origin_trust="telegram.user",
        )
        await msg.reply_text(
            f"✅ Guardado con razón — procesando…\n_ID: `{entry_id[:8]}`_",
            parse_mode="Markdown",
        )
        logger.info("[j] capturado (con aclaración) entry_id=%s", entry_id)
    except Exception as e:
        logger.exception("[j] Error al capturar tras aclaración: %s", e)
        await msg.reply_text(f"❌ Error al guardar en Jarvis: {e}")
    return True


_NEGATIVE_PREFIXES = ("no", "n")
_AFFIRMATIVE_PREFIXES = ("si", "sí", "yes", "y", "dale", "ok", "obvio")


async def handle_pending_passive_proposal(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Consume la respuesta a una propuesta de captura pasiva pendiente (pieza C).

    Debe llamarse junto con handle_pending_clarification, ANTES que cualquier
    otro routing de texto libre -- de lo contrario la respuesta a "¿Guardo
    esto?" se interpretaría como una hoja nueva de la Bóveda o una pregunta al
    router LLM. Devuelve True si consumió el mensaje.

    Interpretación: "no"/variantes -> rechaza. "sí"/variantes cortas -> acepta
    tal cual. Cualquier otro texto -> se toma como aclaración y se concatena
    al contenido antes de guardar (mismo criterio que la aclaración de
    DECISION: una respuesta de texto libre a una pregunta pendiente ES la
    respuesta, no un mensaje nuevo sin relación).
    """
    if not _JARVIS_AVAILABLE:
        return False

    msg = update.message
    if not msg or not (msg.text or "").strip():
        return False

    chat_id = msg.chat.id
    proposal = get_pending_proposal_for_channel("telegram", chat_id)
    if not proposal:
        return False

    texto = msg.text.strip()
    lowered = texto.lower()

    if lowered in _NEGATIVE_PREFIXES or lowered.startswith("no "):
        _reject_passive_proposal(proposal["id"])
        await msg.reply_text("Descartado.")
        return True

    extra = None if lowered in _AFFIRMATIVE_PREFIXES else texto
    try:
        entry_id = _accept_passive_proposal(proposal["id"], extra_text=extra)
    except Exception as e:
        logger.exception("[passive] Error al aceptar propuesta: %s", e)
        await msg.reply_text(f"❌ Error al guardar en Jarvis: {e}")
        return True

    if entry_id:
        suffix = " con tu aclaración" if extra else ""
        await msg.reply_text(
            f"✅ Guardado{suffix} — procesando…\n_ID: `{entry_id[:8]}`_", parse_mode="Markdown"
        )
    else:
        await msg.reply_text("❌ Esa propuesta ya no está disponible (venció o ya se resolvió).")
    return True


async def handle_pending_audit_proposal(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Consume la respuesta a una propuesta de auditoría de memoria pendiente
    (jarvis.audit.service, ver Cerebro/decisiones-implementacion.md
    2026-08-31). Debe llamarse junto con handle_pending_clarification y
    handle_pending_passive_proposal, ANTES que cualquier otro routing de
    texto libre. Devuelve True si consumió el mensaje.

    Dos formas de pendiente pueden coexistir en el mismo chat: individual
    (una pregunta puntual -- create/clarify/merge/edit/delete/retag) y
    agrupada (flag_contradiction/flag_connection, numeradas en un solo
    mensaje-resumen). Si el texto trae números, se interpreta como respuesta
    al agrupado; si no los trae y hay una individual pendiente, se resuelve
    esa primero (la más vieja, FIFO -- ver la nota 5 del docstring de
    jarvis/audit/service.py: el diseño original no contemplaba más de una
    pregunta individual pendiente a la vez).
    """
    if not _JARVIS_AVAILABLE:
        return False

    msg = update.message
    if not msg or not (msg.text or "").strip():
        return False

    chat_id = msg.chat.id
    texto = msg.text.strip()
    lowered = texto.lower()
    has_digit = any(ch.isdigit() for ch in texto)

    individual = _get_pending_individual_audit("telegram", chat_id)

    if has_digit or not individual:
        result = _resolve_audit_grouped_reply("telegram", chat_id, texto)
        if not result.get("no_pending"):
            await msg.reply_text(_format_audit_grouped_result(result))
            return True

    if not individual:
        return False

    return await _resolve_individual_audit_proposal(msg, individual, lowered, texto)


async def _resolve_individual_audit_proposal(msg, proposal: dict, lowered: str, texto: str) -> bool:
    proposal_id = proposal["id"]
    action_type = proposal["action_type"]

    if lowered in _NEGATIVE_PREFIXES or lowered.startswith("no "):
        _reject_audit_proposal(proposal_id)
        await msg.reply_text("Descartado.")
        return True

    if action_type == "clarify":
        # Mismo criterio que la aclaración de DECISION y que captura pasiva:
        # texto libre a una pregunta pendiente ES la respuesta.
        try:
            result = _accept_audit_proposal(proposal_id, reply_text=texto)
        except Exception as e:
            logger.exception("[audit] Error al aceptar aclaración %s: %s", proposal_id, e)
            await msg.reply_text(f"❌ Error al guardar: {e}")
            return True
        entry_id = result.get("entry_id") if result else None
        if entry_id:
            await msg.reply_text(
                f"✅ Guardado — procesando…\n_ID: `{entry_id[:8]}`_", parse_mode="Markdown"
            )
        else:
            await msg.reply_text("❌ Esa propuesta ya no está disponible (venció o ya se resolvió).")
        return True

    if lowered not in _AFFIRMATIVE_PREFIXES:
        # Texto libre que no es "no" ni una confirmación clara -> rechazo con
        # motivo (alcance de v1: no se reinterpreta como una instrucción
        # distinta, ver Cerebro/decisiones-implementacion.md).
        logger.info("[audit] Propuesta %s rechazada con motivo: %r", proposal_id, texto)
        _reject_audit_proposal(proposal_id)
        await msg.reply_text("Descartado.")
        return True

    try:
        result = _accept_audit_proposal(proposal_id)
    except Exception as e:
        logger.exception("[audit] Error al aplicar propuesta %s: %s", proposal_id, e)
        await msg.reply_text(f"❌ Error al aplicar: {e}")
        return True
    if result is None:
        await msg.reply_text("❌ Esa propuesta ya no está disponible (venció o ya se resolvió).")
        return True
    entry_id = result.get("entry_id")
    if entry_id:
        await msg.reply_text(f"✅ Confirmado — procesando…\n_ID: `{entry_id[:8]}`_", parse_mode="Markdown")
    else:
        await msg.reply_text("✅ Confirmado.")
    return True


def _format_audit_grouped_result(result: dict) -> str:
    n_ok, n_no = len(result.get("accepted") or []), len(result.get("rejected") or [])
    if not n_ok and not n_no:
        return "No encontré nada pendiente en esa lista."
    parts = []
    if n_ok:
        parts.append(f"{n_ok} confirmada(s)")
    if n_no:
        parts.append(f"{n_no} descartada(s)")
    return "✅ " + ", ".join(parts) + "."


async def cmd_jq(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Consulta RAG a Jarvis: /jq <pregunta>"""
    if not _JARVIS_AVAILABLE:
        await update.message.reply_text(
            "⚠ Jarvis no está instalado. Ejecutá:\n"
            "`cd project && .\\venv\\Scripts\\pip install -e ../jarvis`",
            parse_mode="Markdown",
        )
        return

    question = " ".join(context.args).strip() if context.args else ""
    if not question:
        await update.message.reply_text(
            "Usá `/jq <pregunta>` para consultar tu memoria.\n"
            "Ejemplo: `/jq ¿Qué decidimos sobre el stack de Jarvis?`",
            parse_mode="Markdown",
        )
        return

    msg = update.message
    chat_id = str(msg.chat.id)

    # Feedback inmediato mientras se procesa (< 2s spec §18)
    thinking_msg = await msg.reply_text("🔍 Buscando en tu memoria…")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: _jarvis_query(
                question=question,
                channel="telegram",
                channel_id=chat_id,
            ),
        )
    except Exception as exc:
        logger.exception("[jq] Error al consultar Jarvis: %s", exc)
        await thinking_msg.edit_text(f"❌ Error al consultar Jarvis: {exc}")
        return

    answer = result["answer"]
    ctx_total = result["context_count"]
    ctx_sent = result["context_sent"]
    blocked = ctx_total - ctx_sent

    # Nota de fuentes al pie
    footer = ""
    if ctx_sent > 0:
        footer += f"\n\n_📎 {ctx_sent} fragmento(s) de memoria consultados_"
    if blocked > 0:
        footer += f" _⚠ {blocked} omitido(s) por privacidad_"
    if ctx_total == 0:
        footer += "\n\n_ℹ Sin contexto previo — la memoria está vacía o aún procesándose._"

    final_text = f"{answer}{footer}"

    try:
        await thinking_msg.edit_text(final_text, parse_mode="Markdown")
    except BadRequest as exc:
        # El texto del LLM (o el username/hashtag de una fuente citada) puede traer
        # un numero impar de "_"/"*"/"`" sueltos que, sumados a los que el footer usa
        # a proposito para la cursiva, rompen el parser de Markdown legacy de Telegram
        # ("Can't parse entities..."). Nunca vale la pena perder la respuesta real por
        # un error de formato — reintentar en texto plano.
        logger.warning("[jq] Markdown inválido en la respuesta (%s) — reintentando sin formato", exc)
        await thinking_msg.edit_text(final_text)

    logger.info(
        "[jq] respondido conv_id=%s context=%d/%d",
        result["conversation_id"], ctx_sent, ctx_total,
    )


async def cmd_jdebug(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Snapshot del estado de Jarvis: /jdebug. Funciona aunque debug_mode esté OFF."""
    if not _JARVIS_AVAILABLE:
        await update.message.reply_text(
            "⚠ Jarvis no está instalado. Ejecutá:\n"
            "`cd project && .\\venv\\Scripts\\pip install -e ../jarvis`",
            parse_mode="Markdown",
        )
        return

    try:
        snapshot = get_snapshot()
        text = format_snapshot_text(snapshot)
    except Exception as e:
        logger.exception("[jdebug] Error al leer el estado: %s", e)
        text = f"❌ Error al leer el estado de Jarvis: {e}"

    await update.message.reply_text(text, parse_mode="Markdown")


async def cmd_jdebugon(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Activa el modo debug: el worker manda un mensaje por cada entrada procesada."""
    if not _JARVIS_AVAILABLE:
        await update.message.reply_text(
            "⚠ Jarvis no está instalado. Ejecutá:\n"
            "`cd project && .\\venv\\Scripts\\pip install -e ../jarvis`",
            parse_mode="Markdown",
        )
        return

    remember_chat_id(update.message.chat.id)
    set_debug_mode(True)
    await update.message.reply_text(
        "🐛 Modo debug *ON* ✅ — el worker te va a avisar por cada entrada que procese.",
        parse_mode="Markdown",
    )


async def cmd_jdebugoff(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Desactiva el modo debug."""
    if not _JARVIS_AVAILABLE:
        await update.message.reply_text(
            "⚠ Jarvis no está instalado. Ejecutá:\n"
            "`cd project && .\\venv\\Scripts\\pip install -e ../jarvis`",
            parse_mode="Markdown",
        )
        return

    set_debug_mode(False)
    await update.message.reply_text("Modo debug *OFF* ❌", parse_mode="Markdown")


def _display_type(content: str, inferred_type: str) -> str:
    """Etiqueta cosmética para el ACK de /j -- distingue un link de un RAW suelto.

    infer_type_hint() (compartida con la API) no hace esta distinción porque
    no importa para needs_clarification(); acá sí importa para el mensaje.
    """
    c = content.lower()
    if inferred_type == "RAW" and ("http" in c or "www." in c):
        return "RAW (link)"
    return inferred_type
