"""
Notificación de "listo" vía Telegram Bot API, directa desde el worker.

El worker corre como proceso Python separado (jarvis/worker/main.py) y no
tiene acceso a la instancia Application de python-telegram-bot que vive en
project/mybot/bot.py -- por eso esto pega directo a la HTTP API de Telegram
con la librería estándar (sin agregar una dependencia nueva a jarvis/) en
vez de importar telegram.ext. Best-effort: si falla (sin token, sin red,
Telegram caído), solo loguea -- nunca debe tumbar el procesamiento de la
entrada que ya terminó.
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
    """Envía un mensaje de texto a un chat_id vía la HTTP API de Telegram.

    Best-effort: nunca lanza -- si falla (sin token, sin red, Telegram caído),
    solo loguea. Compartido por el aviso de "listo" y por el modo debug
    (jarvis/debug/service.py) -- misma restricción en ambos: nunca debe tumbar
    el procesamiento del worker.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token or not chat_id:
        return

    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
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
        prefix = f"_(parte {i}/{total})_\n\n" if total > 1 else ""
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
