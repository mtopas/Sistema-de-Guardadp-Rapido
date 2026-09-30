"""
Regresión — handle_message() en bot.py invoca jh.register_telegram_message()
para texto libre (bloque step is None) y NO la invoca para pasos
estructurados de Finanzas/Agenda ni respuestas a propuestas pendientes.

Causa raíz documentada: commit ef8993c agregó la llamada, pero los tests solo
cubrían la función en jarvis_handlers, no el cableado desde bot.py.
"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import bot  # noqa: E402
import jarvis_handlers as jh  # noqa: E402
import agenda_handlers as ah  # noqa: E402
import finanzas_handlers as fh  # noqa: E402


def _make_update_and_context(text, chat_id=123, step=None):
    """Crea mocks de Update y Context mínimos para handle_message()."""
    msg = MagicMock()
    msg.text = text
    msg.caption = None
    msg.chat.id = chat_id
    msg.forward_origin = None
    msg.reply_text = AsyncMock()

    update = MagicMock()
    update.message = msg

    user_data = {}
    if step is not None:
        user_data["step"] = step
    bot_data = {"chat_id": chat_id}

    context = MagicMock()
    context.user_data = user_data
    context.bot_data = bot_data

    return update, context


@pytest.mark.asyncio
class TestHandleMessageRegisterCableado:

    async def test_texto_libre_invoca_register(self):
        """Texto libre sin step activo → register_telegram_message() se llama."""
        update, context = _make_update_and_context("decidimos pagar anual")

        with patch.object(jh, "handle_pending_clarification", new_callable=AsyncMock, return_value=False), \
             patch.object(jh, "handle_pending_passive_proposal", new_callable=AsyncMock, return_value=False), \
             patch.object(jh, "handle_pending_audit_proposal", new_callable=AsyncMock, return_value=False), \
             patch.object(ah, "handle_agenda_step", new_callable=AsyncMock, return_value=False), \
             patch.object(fh, "handle_finanzas_step", new_callable=AsyncMock, return_value=False), \
             patch.object(ah, "handle_quick_capture", new_callable=AsyncMock, return_value=False), \
             patch.object(fh, "handle_fin_quick_capture", new_callable=AsyncMock, return_value=False), \
             patch.object(jh, "register_telegram_message") as mock_register, \
             patch.object(bot, "_is_bare_link", return_value=False), \
             patch("intent_router.route") as mock_route:
            mock_route.return_value = MagicMock(action="fallback")
            await bot.handle_message(update, context)

        mock_register.assert_called_once_with("123", "decidimos pagar anual")

    async def test_paso_finanzas_no_invoca_register(self):
        """Step de Finanzas activo → register_telegram_message() NO se llama."""
        update, context = _make_update_and_context("1500", step=fh.STEP_FIN_MONTO)

        with patch.object(jh, "handle_pending_clarification", new_callable=AsyncMock, return_value=False) as mock_clar, \
             patch.object(jh, "handle_pending_passive_proposal", new_callable=AsyncMock, return_value=False) as mock_pass, \
             patch.object(jh, "handle_pending_audit_proposal", new_callable=AsyncMock, return_value=False) as mock_audit, \
             patch.object(ah, "handle_agenda_step", new_callable=AsyncMock, return_value=False), \
             patch.object(fh, "handle_finanzas_step", new_callable=AsyncMock, return_value=True), \
             patch.object(jh, "register_telegram_message") as mock_register:
            await bot.handle_message(update, context)

        mock_register.assert_not_called()
        mock_clar.assert_not_called()
        mock_pass.assert_not_called()
        mock_audit.assert_not_called()

    async def test_paso_agenda_no_invoca_register(self):
        """Step de Agenda activo → register_telegram_message() NO se llama."""
        update, context = _make_update_and_context("Mi lista", step=ah.STEP_AGENDA_CHOOSE_LISTA)

        with patch.object(jh, "handle_pending_clarification", new_callable=AsyncMock, return_value=False) as mock_clar, \
             patch.object(ah, "handle_agenda_step", new_callable=AsyncMock, return_value=True), \
             patch.object(jh, "register_telegram_message") as mock_register:
            await bot.handle_message(update, context)

        mock_register.assert_not_called()
        mock_clar.assert_not_called()

    async def test_propuesta_pasiva_pendiente_no_invoca_register(self):
        """Respuesta a propuesta pasiva de Jarvis → register_telegram_message() NO se llama."""
        update, context = _make_update_and_context("sí")

        with patch.object(jh, "handle_pending_clarification", new_callable=AsyncMock, return_value=False), \
             patch.object(jh, "handle_pending_passive_proposal", new_callable=AsyncMock, return_value=True), \
             patch.object(jh, "register_telegram_message") as mock_register:
            await bot.handle_message(update, context)

        mock_register.assert_not_called()

    async def test_aclaracion_pendiente_no_invoca_register(self):
        """Respuesta a aclaración de Jarvis → register_telegram_message() NO se llama."""
        update, context = _make_update_and_context("es sobre el proyecto X")

        with patch.object(jh, "handle_pending_clarification", new_callable=AsyncMock, return_value=True), \
             patch.object(jh, "register_telegram_message") as mock_register:
            await bot.handle_message(update, context)

        mock_register.assert_not_called()
