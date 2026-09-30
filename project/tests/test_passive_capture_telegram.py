"""
Regresión — el bot de Telegram registra mensajes de texto libre en
conversation_messages para que scan_and_propose() (captura pasiva de Jarvis)
pueda evaluarlos.

Causa raíz original: handle_message() nunca llamaba a add_message(), así que
find_idle_conversations() siempre retornaba vacío y evaluate_for_capture()
nunca se ejecutaba — el usuario nunca recibía propuestas "¿Guardo esto en tu
memoria?" por Telegram.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import jarvis_handlers as jh  # noqa: E402


class TestRegisterTelegramMessage:
    """jarvis_handlers.register_telegram_message() debe insertar el mensaje
    del usuario en conversation_messages vía el servicio de conversaciones."""

    def test_registra_mensaje_en_conversation(self):
        mock_get_or_create = MagicMock(return_value="conv-123")
        mock_add_message = MagicMock()

        with patch.object(jh, "_JARVIS_AVAILABLE", True), \
             patch("jarvis.conversation.service.get_or_create_conversation", mock_get_or_create), \
             patch("jarvis.conversation.service.add_message", mock_add_message):
            jh.register_telegram_message("456", "decidimos pagar anual")

        mock_get_or_create.assert_called_once_with("telegram", "456")
        mock_add_message.assert_called_once_with("conv-123", "user", "decidimos pagar anual")

    def test_no_registra_si_jarvis_no_disponible(self):
        with patch.object(jh, "_JARVIS_AVAILABLE", False):
            jh.register_telegram_message("456", "algo")

    def test_no_lanza_si_falla_la_db(self):
        with patch.object(jh, "_JARVIS_AVAILABLE", True), \
             patch("jarvis.conversation.service.get_or_create_conversation",
                   side_effect=Exception("db locked")):
            jh.register_telegram_message("456", "algo")
