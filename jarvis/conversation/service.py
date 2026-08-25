"""
Gestión de conversaciones en SQLite (spec §10 — conversations + conversation_messages).

Una conversación agrupa los mensajes de una sesión de usuario en un canal.
- Telegram: se reutiliza la conversación más reciente para ese chat_id.
- Desktop:  una conversación por session_id (generado por el cliente).

get_or_create_conversation() → conversation_id (UUID str)
add_message()               → message_id
get_recent_messages()       → lista [{role, content}] en orden cronológico
"""
import uuid
from datetime import datetime, timezone

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection


def get_or_create_conversation(
    channel: str,
    channel_id: str,
    user_id: str = JARVIS_DEFAULT_USER,
) -> str:
    """Devuelve el id de la conversación activa para este canal/channel_id, o crea una nueva."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT id FROM conversations
               WHERE channel = ? AND channel_id = ? AND user_id = ?
               ORDER BY started_at DESC LIMIT 1""",
            (channel, channel_id, user_id),
        ).fetchone()
        if row:
            return row["id"]

        conv_id = str(uuid.uuid4())
        with conn:
            conn.execute(
                """INSERT INTO conversations (id, channel, channel_id, started_at, user_id)
                   VALUES (?, ?, ?, ?, ?)""",
                (conv_id, channel, channel_id, now, user_id),
            )
        return conv_id
    finally:
        conn.close()


def add_message(conv_id: str, role: str, content: str) -> str:
    """Agrega un mensaje a la conversación. Devuelve el message_id."""
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO conversation_messages
                       (id, conversation_id, role, content, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (msg_id, conv_id, role, content, now),
            )
        return msg_id
    finally:
        conn.close()


def get_recent_messages(conv_id: str, limit: int = 10) -> list[dict]:
    """Devuelve los últimos N mensajes en orden cronológico (más viejo primero)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT role, content FROM conversation_messages
               WHERE conversation_id = ?
               ORDER BY created_at DESC LIMIT ?""",
            (conv_id, limit),
        ).fetchall()
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
    finally:
        conn.close()
