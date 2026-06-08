"""
Modo desarrollo: reenvía logs y contexto LLM a Telegram (/dev logs …).

Solo chats en BOT_ALLOWED_CHAT_IDS (si está definido) pueden activarlo.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import traceback
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from telegram.ext import Application

LogMode = Literal["off", "all", "errors", "context"]

_STATE_FILE = Path(__file__).parent / "dev_state.json"
_RING: deque[str] = deque(maxlen=200)

_application: Application | None = None
_enabled: bool = False
_log_mode: LogMode = "off"
_subscriber_chat_ids: set[int] = set()
_send_queue: asyncio.Queue[str] | None = None
_worker_task: asyncio.Task | None = None

# Entre mensajes INFO/DEBUG en modo all (Telegram rate limits)
_MIN_SEND_INTERVAL = 1.0
_last_send_at: float = 0.0

logger = logging.getLogger(__name__)

_BOT_PREFIXES = (
    "__main__",
    "bot",
    "finanzas_handlers",
    "agenda_handlers",
    "intent_router",
    "llm_client",
    "assistant",
    "embeddings",
    "dev_reporter",
    "telegram.ext",
)


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
    global _enabled, _subscriber_chat_ids, _log_mode
    try:
        data = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        _enabled = bool(data.get("enabled"))
        _subscriber_chat_ids = {int(x) for x in data.get("chat_ids", [])}
        mode = data.get("log_mode", "off")
        _log_mode = mode if mode in ("off", "all", "errors", "context") else "off"
    except Exception:
        _enabled = False
        _subscriber_chat_ids = set()
        _log_mode = "off"


def _save_state() -> None:
    try:
        _STATE_FILE.write_text(
            json.dumps(
                {
                    "enabled": _enabled,
                    "log_mode": _log_mode,
                    "chat_ids": sorted(_subscriber_chat_ids),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("No se pudo guardar dev_state.json: %s", exc)


def is_enabled() -> bool:
    return _enabled and bool(_subscriber_chat_ids) and _log_mode != "off"


def get_log_mode() -> LogMode:
    return _log_mode


def _mode_label() -> str:
    labels = {
        "off": "OFF ❌",
        "all": "logs *all* 📋",
        "errors": "logs *errors* 🚨",
        "context": "logs *context* 🧠",
    }
    return labels.get(_log_mode, _log_mode)


def status_text() -> str:
    if not _subscriber_chat_ids:
        subs = "ninguno"
    else:
        subs = ", ".join(str(c) for c in sorted(_subscriber_chat_ids))
    state = "ON ✅" if is_enabled() else "OFF ❌"
    lines = [
        f"*Modo dev:* {state}",
        f"*Stream:* {_mode_label()}",
        f"*Chats suscritos:* {subs}",
        "",
        "Comandos:",
        "`/dev logs all` — todos los logs en vivo",
        "`/dev logs errors` — solo errores en vivo",
        "`/dev logs context` — payload enviado a la IA",
        "`/dev off` — cortar stream",
        "`/dev test` — mensaje de prueba",
        "`/dev tail` — últimas líneas del buffer",
        "",
        "`/dev on` — alias de `/dev logs all`",
    ]
    if is_enabled():
        lines.append("")
        if _log_mode == "all":
            lines.append("Reenvío: DEBUG+ del bot en tiempo real.")
        elif _log_mode == "errors":
            lines.append("Reenvío: ERROR+ de cualquier módulo.")
        elif _log_mode == "context":
            lines.append("Reenvío: prompts de classify y chat antes de responder.")
    return "\n".join(lines)


def _apply_log_levels() -> None:
    for name in ("intent_router", "llm_client", "assistant", "finanzas_handlers", "agenda_handlers"):
        logging.getLogger(name).setLevel(logging.DEBUG if _log_mode == "all" else logging.INFO)
    level_name = os.getenv("BOT_DEV_LOG_LEVEL", "DEBUG" if _log_mode == "all" else "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.getLogger("__main__").setLevel(level)


def set_log_mode(chat_id: int, mode: LogMode) -> str:
    global _enabled, _log_mode

    if mode == "off":
        _enabled = False
        _log_mode = "off"
        _save_state()
        _apply_log_levels()
        return "Modo dev *OFF* ❌"

    _subscriber_chat_ids.add(chat_id)
    _enabled = True
    _log_mode = mode
    _save_state()
    _apply_log_levels()

    msgs = {
        "all": (
            "Stream *logs all* 📋\n"
            "Vas a recibir todos los logs del bot en vivo.\n"
            "Usá `/dev off` para cortar."
        ),
        "errors": (
            "Stream *logs errors* 🚨\n"
            "Solo errores y excepciones en vivo.\n"
            "Usá `/dev off` para cortar."
        ),
        "context": (
            "Stream *logs context* 🧠\n"
            "Vas a ver lo que recibe la IA (classify + chat) antes de responder.\n"
            "Usá `/dev off` para cortar."
        ),
    }
    return msgs[mode]


def set_enabled(chat_id: int, on: bool) -> str:
    """Compat: /dev on → logs all; /dev off → off."""
    return set_log_mode(chat_id, "all" if on else "off")


def tail_text(n: int = 25) -> str:
    lines = list(_RING)[-n:]
    if not lines:
        return "Buffer vacío (activá un stream con `/dev logs all` y generá actividad)."
    body = "\n".join(lines)
    if len(body) > 3800:
        body = "…\n" + body[-3800:]
    return f"*Últimas {len(lines)} líneas:*\n```\n{body}\n```"


def _is_bot_logger(name: str) -> bool:
    return any(name == p or name.startswith(p + ".") for p in _BOT_PREFIXES)


def _should_forward(record: logging.LogRecord) -> bool:
    if not is_enabled() or _log_mode not in ("all", "errors"):
        return False
    if _log_mode == "errors":
        return record.levelno >= logging.ERROR
    # all
    if record.levelno >= logging.ERROR:
        return True
    if record.levelno >= logging.DEBUG and _is_bot_logger(record.name):
        return True
    return False


def _chunk_message(text: str, limit: int = 3900) -> list[str]:
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + limit])
        start += limit
    return chunks


def _truncate(text: str, limit: int = 3200) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 20] + "\n… [truncado]"


async def _send_to_subscribers(text: str, *, header: str = "🛠 *SGR dev*\n") -> None:
    global _last_send_at
    if not _application or not _subscriber_chat_ids:
        return

    for chat_id in list(_subscriber_chat_ids):
        for i, chunk in enumerate(_chunk_message(text)):
            prefix = header if i == 0 else ""
            body = f"{prefix}```\n{chunk}\n```"
            try:
                await _application.bot.send_message(
                    chat_id=chat_id,
                    text=body[:4096],
                    parse_mode="Markdown",
                )
            except Exception as exc:
                logger.warning("dev_reporter: no se pudo enviar a %s: %s", chat_id, exc)
    _last_send_at = time.monotonic()


async def _queue_worker() -> None:
    assert _send_queue is not None
    while True:
        item = await _send_queue.get()
        try:
            priority = item.startswith("PRIORITY:")
            text = item[9:] if priority else item
            if not priority:
                wait = _MIN_SEND_INTERVAL - (time.monotonic() - _last_send_at)
                if wait > 0:
                    await asyncio.sleep(wait)
            header = "🧠 *SGR dev · context*\n" if text.startswith("▸ ") else "🛠 *SGR dev*\n"
            await _send_to_subscribers(text, header=header)
        except Exception:
            logger.exception("dev_reporter worker falló")
        finally:
            _send_queue.task_done()


def _enqueue(text: str, *, priority: bool = False) -> None:
    if not is_enabled() or _send_queue is None:
        return
    try:
        loop = asyncio.get_running_loop()
        payload = f"PRIORITY:{text}" if priority else text
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
                priority = record.levelno >= logging.ERROR
                _enqueue(line, priority=priority)
        except Exception:
            self.handleError(record)


def notify_llm_context(
    kind: str,
    *,
    system: str | None = None,
    user: str | None = None,
    messages: list[dict] | None = None,
    model: str | None = None,
) -> None:
    """Reenvía el payload que recibe Ollama (solo modo logs context)."""
    if not is_enabled() or _log_mode != "context":
        return

    parts = [f"▸ *{kind}*"]
    if model:
        parts.append(f"modelo: `{model}`")
    if system:
        parts.append(f"── system ──\n{_truncate(system)}")
    if user:
        parts.append(f"── user ──\n{_truncate(user)}")
    if messages:
        for i, msg in enumerate(messages, 1):
            role = msg.get("role", "?")
            content = msg.get("content", "")
            parts.append(f"── msg {i} ({role}) ──\n{_truncate(str(content))}")

    _enqueue("\n".join(parts), priority=True)


async def send_test(text: str) -> None:
    """Mensaje de prueba a chats suscritos."""
    await _send_to_subscribers(text)


async def notify_exception(
    exc: BaseException,
    *,
    where: str = "",
    update_hint: str = "",
) -> None:
    if _log_mode not in ("all", "errors") or not _subscriber_chat_ids:
        return
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    parts = ["❌ *Excepción no manejada*"]
    if where:
        parts.append(f"_{where}_")
    if update_hint:
        parts.append(update_hint)
    parts.append(f"```\n{tb[-3500:]}\n```")
    _enqueue("\n".join(parts), priority=True)


def install(application: Application) -> None:
    """Llamar desde post_init del Application."""
    global _application, _send_queue, _worker_task

    _application = application
    _load_state()

    root = logging.getLogger()
    if not any(isinstance(h, TelegramDevHandler) for h in root.handlers):
        h = TelegramDevHandler()
        root.addHandler(h)

    for name in ("intent_router", "llm_client", "assistant", "finanzas_handlers", "agenda_handlers"):
        logging.getLogger(name).setLevel(logging.DEBUG if _log_mode == "all" else logging.INFO)

    if _send_queue is None:
        _send_queue = asyncio.Queue(maxsize=500)
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_queue_worker())

    _apply_log_levels()

    if is_enabled():
        logger.info("Modo dev activo — mode=%s chats=%s", _log_mode, sorted(_subscriber_chat_ids))
