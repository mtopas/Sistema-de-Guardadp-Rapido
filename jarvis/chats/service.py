"""
Multi-chat web (Mejoras_Jarvis.md punto 3): crear/renombrar/eliminar chats,
cada uno con su propio contexto — solo `channel='desktop'`. Telegram sigue
usando `jarvis/conversation/service.py::get_or_create_conversation()` sin
cambios (una sesión continua por `chat_id`, sin gestión desde acá).

Decisión de schema (ver Cerebro/decisiones-implementacion.md): no se creó una
tabla `chats` nueva — `conversations` ya modelaba exactamente esto (una fila
por sesión, `channel`+`channel_id`+`user_id`), así que se le agregó `title`
(migración liviana en jarvis/db/database.py) en vez de duplicar el concepto.

Cada chat nuevo recibe un `channel_id` único (`web:{uuid}`), no el constante
`"web"` que usaba el flujo viejo de una sola sesión compartida. Esto cierra
en el schema el bug raíz reportado ("borra el historial pero Jarvis sigue
recordando cosas de antes"): `get_or_create_conversation()` reutiliza "la
conversación más reciente para este channel_id" — con un channel_id
compartido por todo el chat de escritorio, "borrar historial" del lado del
cliente (que solo limpiaba localStorage) nunca desconectaba de verdad de esa
fila; el próximo mensaje volvía a engancharse a la misma conversación con
todo su `conversation_messages` intacto. Con un channel_id exclusivo por
chat, ese fallback ya no puede reenganchar con una fila ajena.
"""
import logging
import uuid
from datetime import datetime, timezone

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_CHANNEL = "desktop"
_AUTONAME_MAX_LEN = 60


def list_chats(user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Chats de escritorio, más recientemente activo primero (último mensaje,
    o `started_at` si todavía no tiene ninguno)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT c.id, c.title, c.started_at,
                      COUNT(cm.id) AS message_count,
                      COALESCE(MAX(cm.created_at), c.started_at) AS last_message_at
               FROM conversations c
               LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id
               WHERE c.channel = ? AND c.user_id = ?
               GROUP BY c.id
               ORDER BY last_message_at DESC""",
            (_CHANNEL, user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_chat(title: str | None = None, user_id: str = JARVIS_DEFAULT_USER) -> dict:
    chat_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    clean_title = title.strip() if title and title.strip() else None
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO conversations (id, channel, channel_id, title, started_at, user_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (chat_id, _CHANNEL, f"web:{chat_id}", clean_title, now, user_id),
            )
        return {"id": chat_id, "title": clean_title, "started_at": now, "message_count": 0}
    finally:
        conn.close()


def rename_chat(chat_id: str, title: str, user_id: str = JARVIS_DEFAULT_USER) -> bool:
    """True si el chat existía y se renombró. El título puede quedar vacío
    (None) a propósito -- el usuario puede querer "sin título" de nuevo."""
    clean_title = title.strip() if title and title.strip() else None
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                """UPDATE conversations SET title = ?
                   WHERE id = ? AND channel = ? AND user_id = ?""",
                (clean_title, chat_id, _CHANNEL, user_id),
            )
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_chat(chat_id: str, user_id: str = JARVIS_DEFAULT_USER) -> bool:
    """True si el chat existía y se borró. `conversation_messages` cae por
    ON DELETE CASCADE (foreign_keys=ON en get_connection())."""
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                "DELETE FROM conversations WHERE id = ? AND channel = ? AND user_id = ?",
                (chat_id, _CHANNEL, user_id),
            )
        return cur.rowcount > 0
    finally:
        conn.close()


def get_messages(chat_id: str, user_id: str = JARVIS_DEFAULT_USER) -> list[dict] | None:
    """Historial completo de un chat (role/content/created_at), orden
    cronológico. None si el chat no existe (o no es de este usuario) --
    distinto de [] (chat real pero todavía sin mensajes)."""
    conn = get_connection()
    try:
        owner = conn.execute(
            "SELECT id FROM conversations WHERE id = ? AND channel = ? AND user_id = ?",
            (chat_id, _CHANNEL, user_id),
        ).fetchone()
        if not owner:
            return None
        rows = conn.execute(
            """SELECT role, content, created_at FROM conversation_messages
               WHERE conversation_id = ? ORDER BY created_at ASC""",
            (chat_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def autoname_if_untitled(conv_id: str, text: str) -> None:
    """Le pone título al chat a partir de su primer mensaje, si todavía no
    tiene uno. Idempotente por construcción: solo actualiza filas con
    `title IS NULL`, así que una vez puesto (acá o a mano por el usuario)
    ninguna llamada posterior lo vuelve a tocar. No-op para `channel`
    distinto de 'desktop' (Telegram no expone título en ningún lado) o si el
    chat no existe. Nunca lanza -- un fallo acá no debe tumbar la consulta.
    """
    clean = " ".join(text.strip().split())
    if not clean:
        return
    title = clean if len(clean) <= _AUTONAME_MAX_LEN else clean[:_AUTONAME_MAX_LEN].rstrip() + "…"
    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    """UPDATE conversations SET title = ?
                       WHERE id = ? AND channel = ? AND title IS NULL""",
                    (title, conv_id, _CHANNEL),
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("[jarvis.chats] autoname_if_untitled falló para %s: %s", conv_id, exc)
