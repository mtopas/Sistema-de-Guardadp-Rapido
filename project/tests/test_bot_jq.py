"""Regresiones del comando /jq para respuestas largas de Telegram."""

import asyncio
import sys
from pathlib import Path

from telegram.error import BadRequest

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import jarvis_handlers  # noqa: E402


class _FakeMessage:
    def __init__(self, *, reject_markdown=False):
        self.edits = []
        self.replies = []
        self.reject_markdown = reject_markdown

    async def reply_text(self, text, **kwargs):
        reply = _FakeMessage(reject_markdown=self.reject_markdown)
        self.replies.append((text, kwargs, reply))
        return reply

    async def edit_text(self, text, **kwargs):
        if kwargs.get("parse_mode") == "Markdown" and self.reject_markdown:
            raise BadRequest("Can't parse entities")
        self.edits.append((text, kwargs))


class _FakeUpdate:
    def __init__(self, message):
        self.message = message
        message.chat = type("Chat", (), {"id": 123})()


class _FakeContext:
    args = ["¿Qué", "decidimos?"]


def test_jq_entrega_respuesta_larga_completa_si_markdown_es_invalido(monkeypatch):
    answer = "respuesta *invalida " + ("x" * 9000)
    monkeypatch.setattr(
        jarvis_handlers,
        "_jarvis_query",
        lambda **kwargs: {
            "answer": answer,
            "context_count": 0,
            "context_sent": 0,
            "conversation_id": "conv-test",
        },
    )

    message = _FakeMessage(reject_markdown=True)
    asyncio.run(jarvis_handlers.cmd_jq(_FakeUpdate(message), _FakeContext()))

    thinking = message.replies[0][2]
    assert len(thinking.edits) == 1
    assert thinking.edits[0][1] == {}
    additional_replies = message.replies[1:]
    assert len(additional_replies) >= 2
    delivered = thinking.edits[0][0] + "".join(reply[0] for reply in additional_replies)
    assert delivered == answer + "\n\n_ℹ Sin contexto previo — la memoria está vacía o aún procesándose._"
    assert all(len(reply[0]) <= 3900 for reply in additional_replies)
