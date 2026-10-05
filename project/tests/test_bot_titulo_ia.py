"""Regresión: refinamiento del título por IA en el bot de Telegram (2026-10-05).

- Tras crear una nota de cuerpo único, el bot dispara el refinamiento en segundo
  plano; si la IA pide una aclaración, se la pregunta UNA vez al usuario.
- La respuesta del usuario se consume ANTES del routing de texto libre, se pasa
  al generador y mejora el título. La nota nunca se pierde: ya quedó guardada.
"""
import sys
import time as _time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import bot  # noqa: E402


def _update_con_texto(texto):
    msg = MagicMock()
    msg.text = texto
    msg.reply_text = AsyncMock()
    update = MagicMock()
    update.message = msg
    return update, msg


def _context_con_pending(pending):
    ctx = MagicMock()
    ctx.user_data = {"boveda_title_question": pending} if pending else {}
    return ctx


@pytest.mark.asyncio
class TestHandlePendingTitleQuestion:

    async def test_sin_pendiente_no_consume(self):
        update, msg = _update_con_texto("hola")
        ctx = _context_con_pending(None)
        assert await bot.handle_pending_title_question(update, ctx) is False

    async def test_respuesta_genera_titulo(self, monkeypatch):
        pending = {"hoja_id": 9, "titulo_provisional": "ejemplo.com",
                   "expira_en": _time.time() + 100}
        update, msg = _update_con_texto("es una receta de pan casero")
        ctx = _context_con_pending(pending)
        post = AsyncMock(return_value={"titulo": "Receta de pan casero", "pregunta": None})
        monkeypatch.setattr(bot, "_post_titulo_ia", post)

        assert await bot.handle_pending_title_question(update, ctx) is True
        post.assert_awaited_once_with(9, "ejemplo.com", respuesta="es una receta de pan casero")
        assert "boveda_title_question" not in ctx.user_data
        assert "Receta de pan casero" in msg.reply_text.call_args[0][0]

    async def test_no_se_conserva_provisional(self, monkeypatch):
        pending = {"hoja_id": 9, "titulo_provisional": "ejemplo.com",
                   "expira_en": _time.time() + 100}
        update, msg = _update_con_texto("no sé")
        ctx = _context_con_pending(pending)
        post = AsyncMock()
        monkeypatch.setattr(bot, "_post_titulo_ia", post)

        assert await bot.handle_pending_title_question(update, ctx) is True
        post.assert_not_awaited()  # no llama al generador
        assert "boveda_title_question" not in ctx.user_data

    async def test_pendiente_vencida_no_consume(self, monkeypatch):
        pending = {"hoja_id": 9, "titulo_provisional": "x",
                   "expira_en": _time.time() - 1}
        update, msg = _update_con_texto("cualquier cosa")
        ctx = _context_con_pending(pending)
        post = AsyncMock()
        monkeypatch.setattr(bot, "_post_titulo_ia", post)

        assert await bot.handle_pending_title_question(update, ctx) is False
        post.assert_not_awaited()
        assert "boveda_title_question" not in ctx.user_data  # se limpió

    async def test_sin_titulo_deja_provisional(self, monkeypatch):
        pending = {"hoja_id": 9, "titulo_provisional": "x",
                   "expira_en": _time.time() + 100}
        update, msg = _update_con_texto("mmm no sabría cómo titularlo")
        ctx = _context_con_pending(pending)
        monkeypatch.setattr(bot, "_post_titulo_ia",
                            AsyncMock(return_value={"titulo": None, "pregunta": "¿?"}))
        assert await bot.handle_pending_title_question(update, ctx) is True
        assert "lo dejo con el título" in msg.reply_text.call_args[0][0].lower()


@pytest.mark.asyncio
class TestRefinarTituloBot:

    async def test_titulo_aplicado_avisa(self, monkeypatch):
        msg = MagicMock(); msg.reply_text = AsyncMock()
        ctx = MagicMock(); ctx.user_data = {}
        monkeypatch.setattr(bot, "_post_titulo_ia",
                            AsyncMock(return_value={"titulo": "Título lindo", "pregunta": None}))
        await bot._refinar_titulo_bot(3, "provisional", msg, ctx)
        assert "Título lindo" in msg.reply_text.call_args[0][0]
        assert "boveda_title_question" not in ctx.user_data

    async def test_pregunta_guarda_pendiente_y_pregunta(self, monkeypatch):
        msg = MagicMock(); msg.reply_text = AsyncMock()
        ctx = MagicMock(); ctx.user_data = {}
        monkeypatch.setattr(bot, "_post_titulo_ia",
                            AsyncMock(return_value={"titulo": None, "pregunta": "¿De qué trata?"}))
        await bot._refinar_titulo_bot(3, "provisional", msg, ctx)
        pending = ctx.user_data.get("boveda_title_question")
        assert pending is not None
        assert pending["hoja_id"] == 3
        assert pending["titulo_provisional"] == "provisional"
        assert "¿De qué trata?" in msg.reply_text.call_args[0][0]

    async def test_fallo_silencioso_no_pregunta(self, monkeypatch):
        msg = MagicMock(); msg.reply_text = AsyncMock()
        ctx = MagicMock(); ctx.user_data = {}
        monkeypatch.setattr(bot, "_post_titulo_ia", AsyncMock(return_value=None))
        await bot._refinar_titulo_bot(3, "provisional", msg, ctx)
        msg.reply_text.assert_not_called()
        assert "boveda_title_question" not in ctx.user_data
