"""
Notificación de "listo" vía Telegram Bot API, directa desde el worker.

El worker corre como proceso Python separado (jarvis/worker/main.py) y no
tiene acceso a la instancia Application de python-telegram-bot que vive en
project/mybot/bot.py -- por eso esto pega directo a la HTTP API de Telegram
con la librería estándar (sin agregar una dependencia nueva a jarvis/) en
vez de importar telegram.ext. Best-effort: si falla (sin token, sin red,
Telegram caído), solo loguea -- nunca debe tumbar el procesamiento de la
entrada que ya terminó.

Texto plano, sin `parse_mode` (decisión 2026-09-04, ver
Cerebro/decisiones-implementacion.md): el contenido de varios mensajes
(reporte diario, preguntas de propuestas de auditoría) embebe texto libre
del usuario -- memoria, tags, nombres de entidades -- que puede traer un
`*`/`_`/``` sin cerrar por accidente. Con `parse_mode: "Markdown"` eso
rompe el parseo de Telegram (400 "can't parse entities") y el mensaje se
pierde -- silenciosamente, porque este envío es best-effort a propósito.
Escapar para MarkdownV2 en cada call site que interpola texto libre era la
alternativa, pero un solo lugar sin escapar reintroduce el mismo bug; texto
plano lo elimina de raíz para todos los call sites presentes y futuros, al
costo de perder negrita/cursiva (aceptable frente a perder el mensaje).
"""
import json
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)

_SEND_MESSAGE_URL = "https://api.telegram.org/bot{token}/sendMessage"


def notify_telegram_done(chat_id: str, text: str) -> None:
    send_telegram_message(chat_id, text)


def send_telegram_message(chat_id: str, text: str) -> None:
    """Envía un mensaje de texto plano a un chat_id vía la HTTP API de Telegram.

    Best-effort: nunca lanza -- si falla (sin token, sin red, Telegram caído,
    o -- ya no debería pasar, pero por las dudas -- un 400 de la Bot API),
    loguea Y deja un evento persistente en jarvis_event_log (level
    "TELEGRAM_FAIL", ver jarvis/events/service.py) para que la falla no
    desaparezca con el próximo restart del contenedor. Compartido por el
    aviso de "listo", el modo debug (jarvis/debug/service.py) y el reporte
    diario (send_report() más abajo) -- misma restricción en todos: nunca
    debe tumbar el procesamiento del worker.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token or not chat_id:
        return

    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
    }).encode("utf-8")
    req = urllib.request.Request(
        _SEND_MESSAGE_URL.format(token=token),
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception as exc:
        logger.warning(
            "[jarvis.notify] No se pudo notificar a Telegram (chat_id=%s): %s",
            chat_id, exc,
        )
        from jarvis.events.service import log_event

        log_event(
            "TELEGRAM_FAIL",
            f"chat_id={chat_id}: {exc} -- texto: {text[:120]!r}",
        )


# Margen bajo el límite real de Telegram (4096 caracteres/mensaje) -- deja
# lugar al prefijo "(parte N/M)" que se antepone cuando un reporte necesita
# más de un mensaje.
_REPORT_MESSAGE_LIMIT = 3900


def send_report(chat_id: str, title: str, sections: list[str]) -> None:
    """Arma y envía un reporte largo (ej. consolidación diaria, ver
    jarvis/worker/consolidation.py) como uno o varios mensajes de Telegram.

    `sections` son bloques de texto ya formados por el caller (uno por paso
    del job) -- se empaquetan de a varios por mensaje mientras entren bajo
    _REPORT_MESSAGE_LIMIT, respetando el límite real de ~4096 caracteres/
    mensaje de la Bot API. Solo se corta a mitad de una sección cuando esa
    sección sola ya supera el límite (último recurso, no debería pasar con
    el tamaño de reporte esperado). Se eligió "varios mensajes" en vez de
    "resumen corto + comando para pedir detalle" para que el detalle
    completo llegue siempre sin que el usuario tenga que pedirlo -- ver
    Cerebro/decisiones-implementacion.md, 2026-09-03, para el resto de las
    alternativas consideradas y por qué se descartaron.
    """
    chunks = _pack_sections([title] + list(sections), _REPORT_MESSAGE_LIMIT)
    total = len(chunks)
    for i, chunk in enumerate(chunks, start=1):
        prefix = f"(parte {i}/{total})\n\n" if total > 1 else ""
        send_telegram_message(chat_id, (prefix + chunk)[:4096])


def _pack_sections(sections: list[str], limit: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for section in sections:
        candidate = f"{current}\n\n{section}" if current else section
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(section) <= limit:
            current = section
        else:
            start = 0
            while start < len(section):
                chunks.append(section[start : start + limit])
                start += limit
            current = ""
    if current:
        chunks.append(current)
    return chunks
