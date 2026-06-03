"""
Modo desarrollo: reenvía logs y errores del bot a Telegram (/dev on|off).

Solo chats en BOT_ALLOWED_CHAT_IDS (si está definido) pueden activarlo.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import traceback
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from telegram.ext import Application

_STATE_FILE = Path(__file__).parent / "dev_state.json"
_RING: deque[str] = deque(maxlen=100)

_application: Application | None = None
_enabled: bool = False
_subscriber_chat_ids: set[int] = set()
_send_queue: asyncio.Queue[str] | None = None
_worker_task: asyncio.Task | None = None

# Mínimo 1,2 s entre mensajes INFO/DEBUG para no spamear Telegram
_MIN_SEND_INTERVAL = 1.2
_last_send_at: float = 0.0

logger = logging.getLogger(__name__)


def _get_allowed_ids() -> set[int]:
    raw = os.getenv("BOT_ALLOWED_CHAT_IDS", "")
    ids: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            ids.add(int(part))
    return ids


def is_chat_allowed(chat_id: int) -> bool:
    allowed = _get_allowed_ids()
    return not allowed or chat_id in allowed


def _load_state() -> None:
    global _enabled, _subscriber_chat_ids
    try:
        data = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        _enabled = bool(data.get("enabled"))
        _subscriber_chat_ids = {int(x) for x in data.get("chat_ids", [])}
    except Exception:
        _enabled = False
        _subscriber_chat_ids = set()


def _save_state() -> None:
    try:
        _STATE_FILE.write_text(
            json.dumps(
                {
                    "enabled": _enabled,
                    "chat_ids": sorted(_subscriber_chat_ids),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("No se pudo guardar dev_state.json: %s", exc)


def is_enabled() -> bool:
    return _enabled and bool(_subscriber_chat_ids)


def status_text() -> str:
    if not _subscriber_chat_ids:
        subs = "ninguno"
    else:
        subs = ", ".join(str(c) for c in sorted(_subscriber_chat_ids))
    state = "ON ✅" if is_enabled() else "OFF ❌"
    lines = [
        f"*Modo dev:* {state}",
        f"*Chats suscritos:* {subs}",
        "",
        "Comandos:",
        "`/dev on` — activar y suscribir este chat",
        "`/dev off` — desactivar",
        "`/dev test` — mensaje de prueba",
        "`/dev tail` — últimas líneas del buffer",
    ]
    if is_enabled():
        lines.append("")
        lines.append("Reenvío: WARNING+ del bot; ERROR de cualquier módulo.")
    return "\n".join(lines)


def set_enabled(chat_id: int, on: bool) -> str:
    global _enabled
    if on:
        _subscriber_chat_ids.add(chat_id)
        _enabled = True
        _save_state()
        return (
            "Modo dev *ON* ✅\n"
            "Vas a recibir logs (WARNING+) y errores de este proceso del bot.\n"
            "Usá `/dev off` para cortar."
        )
    _enabled = False
    _save_state()
    return "Modo dev *OFF* ❌"


def tail_text(n: int = 25) -> str:
    lines = list(_RING)[-n:]
    if not lines:
        return "Buffer vacío (activá `/dev on` y generá actividad)."
    body = "\n".join(lines)
    if len(body) > 3800:
        body = "…\n" + body[-3800:]
    return f"*Últimas {len(lines)} líneas:*\n```\n{body}\n```"


def _should_forward(record: logging.LogRecord) -> bool:
    if not is_enabled():
        return False
    if record.levelno >= logging.ERROR:
        return True
    if record.levelno < logging.WARNING:
        return False
    name = record.name
    prefixes = (
        "__main__",
        "bot",
        "finanzas_handlers",
        "agenda_handlers",
        "intent_router",
        "llm_client",
        "dev_reporter",
        "telegram.ext",
    )
    return any(name == p or name.startswith(p + ".") for p in prefixes)


def _chunk_message(text: str, limit: int = 4000) -> list[str]:
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + limit])
        start += limit
    return chunks


async def _send_to_subscribers(text: str, *, force: bool = False) -> None:
    global _last_send_at
    if not _application or not _subscriber_chat_ids:
        return

    import time

    now = time.monotonic()
    if not force and (now - _last_send_at) < _MIN_SEND_INTERVAL:
        return
    _last_send_at = now

    prefix = "🛠 *SGR dev*\n"
    for chat_id in list(_subscriber_chat_ids):
        for i, chunk in enumerate(_chunk_message(text)):
            header = prefix if i == 0 else ""
            body = f"{header}```\n{chunk}\n```"
            try:
                await _application.bot.send_message(
                    chat_id=chat_id,
                    text=body[:4096],
                    parse_mode="Markdown",
                )
            except Exception as exc:
                logger.warning("dev_reporter: no se pudo enviar a %s: %s", chat_id, exc)


async def _queue_worker() -> None:
    assert _send_queue is not None
    while True:
        item = await _send_queue.get()
        try:
            if item.startswith("ERROR:"):
                await _send_to_subscribers(item[6:], force=True)
            else:
                await _send_to_subscribers(item, force=False)
        except Exception:
            logger.exception("dev_reporter worker falló")
        finally:
            _send_queue.task_done()


def _enqueue(text: str, *, is_error: bool = False) -> None:
    if not is_enabled() or _send_queue is None:
        return
    try:
        loop = asyncio.get_running_loop()
        payload = f"ERROR:{text}" if is_error else text
        loop.call_soon_threadsafe(_send_queue.put_nowait, payload)
    except RuntimeError:
        pass


class TelegramDevHandler(logging.Handler):
    """Handler sync; encola envío async al worker."""

    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    def emit(self, record: logging.LogRecord) -> None:
        try:
            line = self.format(record)
            _RING.append(line)
            if _should_forward(record):
                _enqueue(line, is_error=record.levelno >= logging.ERROR)
        except Exception:
            self.handleError(record)


async def send_test(text: str) -> None:
    """Mensaje de prueba a chats suscritos."""
    await _send_to_subscribers(text, force=True)


async def notify_exception(
    exc: BaseException,
    *,
    where: str = "",
    update_hint: str = "",
) -> None:
    if not is_enabled():
        return
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    parts = ["❌ *Excepción no manejada*"]
    if where:
        parts.append(f"_{where}_")
    if update_hint:
        parts.append(update_hint)
    parts.append(f"```\n{tb[-3500:]}\n```")
    _enqueue("\n".join(parts), is_error=True)


def install(application: Application) -> None:
    """Llamar desde post_init del Application."""
    global _application, _send_queue, _worker_task

    _application = application
    _load_state()

    root = logging.getLogger()
    if not any(isinstance(h, TelegramDevHandler) for h in root.handlers):
        h = TelegramDevHandler()
        root.addHandler(h)

    for name in ("intent_router", "llm_client", "finanzas_handlers", "agenda_handlers"):
        logging.getLogger(name).setLevel(logging.INFO)

    if _send_queue is None:
        _send_queue = asyncio.Queue(maxsize=200)
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_queue_worker())

    level_name = os.getenv("BOT_DEV_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.getLogger("__main__").setLevel(level)

    if is_enabled():
        logger.info("Modo dev activo — chats %s", sorted(_subscriber_chat_ids))
