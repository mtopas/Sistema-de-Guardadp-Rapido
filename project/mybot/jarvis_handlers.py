"""
Handlers de Telegram para Jarvis.

Extiende project/mybot/bot.py sin modificar el flujo existente de SGR.

Comandos registrados:
    /j <texto>   — captura explícita a Jarvis Memory Core
    /jq <texto>  — consulta RAG a Jarvis (S3)
"""
import asyncio
import logging

from telegram import Update
from telegram.error import BadRequest
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

try:
    from jarvis.db.database import init_db as _jarvis_init_db
    from jarvis.memory.service import capture_raw
    from jarvis.query.service import query as _jarvis_query
    _JARVIS_AVAILABLE = True
except ImportError:
    _JARVIS_AVAILABLE = False
    logger.warning(
        "[jarvis_handlers] Paquete jarvis no instalado. "
        "Ejecutá: cd project && .\\venv\\Scripts\\pip install -e ../jarvis"
    )


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

    try:
        entry_id = capture_raw(
            content=content,
            source="telegram",
            channel=str(chat_id),
            source_id=source_id,
            origin_trust="telegram.user",
        )
        inferred_type = _infer_type_hint(content)
        await msg.reply_text(
            f"✅ Guardado en Jarvis — procesando…\n"
            f"_ID: `{entry_id[:8]}`_  |  tipo probable: {inferred_type}",
            parse_mode="Markdown",
        )
        logger.info("[j] capturado entry_id=%s desde chat_id=%s", entry_id, chat_id)
    except Exception as e:
        logger.exception("[j] Error al capturar: %s", e)
        await msg.reply_text(f"❌ Error al guardar en Jarvis: {e}")


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


def _infer_type_hint(content: str) -> str:
    """Clasificación preliminar simple sin LLM — solo para el ACK al usuario."""
    c = content.lower()
    if any(w in c for w in ("decidí", "decidimos", "acordamos", "resolvimos", "vamos a")):
        return "DECISION"
    if any(w in c for w in ("proyecto", "avance", "sprint", "bloqueado", "estado:")):
        return "PROJECT"
    if "http" in c or "www." in c:
        return "RAW (link)"
    return "RAW"
