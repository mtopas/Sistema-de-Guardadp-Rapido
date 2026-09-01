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
