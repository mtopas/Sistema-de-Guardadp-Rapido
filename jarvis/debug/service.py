"""
Debug/observabilidad de Jarvis vía Telegram (/jdebug, /jdebugon, /jdebugoff).

Estado en `jarvis_policies` (policy_type='debug_mode' / 'debug_chat_id') --
mismo patrón que jarvis/worker/consolidation.py: se inserta una fila nueva por
cambio y se lee la más reciente por created_at, nunca UPDATE in place. Sobrevive
reinicios del bot y del worker (proceso separado, misma DB) sin tabla nueva.
"""
import logging
import os
import uuid
from datetime import datetime, timezone

from jarvis.config import JARVIS_LOCAL_MODEL, JARVIS_TELEGRAM_CHAT_ID
from jarvis.db.database import get_connection
from jarvis.notify.telegram import send_telegram_message

logger = logging.getLogger(__name__)

_POLICY_DEBUG_MODE = "debug_mode"
_POLICY_DEBUG_CHAT_ID = "debug_chat_id"


def _latest_policy(conn, policy_type: str) -> str | None:
    row = conn.execute(
        "SELECT value FROM jarvis_policies WHERE policy_type = ? ORDER BY created_at DESC LIMIT 1",
        (policy_type,),
    ).fetchone()
    return row["value"] if row else None


def is_debug_mode() -> bool:
    conn = get_connection()
    try:
        return _latest_policy(conn, _POLICY_DEBUG_MODE) == "1"
    finally:
        conn.close()


def set_debug_mode(enabled: bool) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    _POLICY_DEBUG_MODE,
                    "1" if enabled else "0",
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
    finally:
        conn.close()


def get_debug_chat_id() -> str | None:
    """JARVIS_TELEGRAM_CHAT_ID (env) tiene prioridad; si no está seteado, usa el
    chat_id derivado del primer /j recibido (ver remember_chat_id)."""
    if JARVIS_TELEGRAM_CHAT_ID:
        return JARVIS_TELEGRAM_CHAT_ID
    conn = get_connection()
    try:
        return _latest_policy(conn, _POLICY_DEBUG_CHAT_ID)
    finally:
        conn.close()


def remember_chat_id(chat_id) -> None:
    """Guarda el chat_id del primer /j recibido -- solo si no hay uno ya (env o
    guardado). Llamado desde jarvis_handlers.cmd_j en cada captura; no pisa un
    valor existente para no perder el chat elegido si el usuario usa /j desde
    varios chats."""
    if JARVIS_TELEGRAM_CHAT_ID:
        return
    conn = get_connection()
    try:
        if _latest_policy(conn, _POLICY_DEBUG_CHAT_ID):
            return
        with conn:
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    _POLICY_DEBUG_CHAT_ID,
                    str(chat_id),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
    finally:
        conn.close()


def get_snapshot() -> dict:
    """Estado actual para /jdebug -- funciona aunque debug_mode esté OFF."""
    conn = get_connection()
    try:
        last_entry = conn.execute(
            """SELECT me.id, me.type, me.created_at, iq.status
               FROM memory_entries me
               JOIN inbox_queue iq ON iq.entry_id = me.id
               ORDER BY me.created_at DESC
               LIMIT 1"""
        ).fetchone()

        pending_count = conn.execute(
            "SELECT COUNT(*) AS n FROM inbox_queue WHERE status = 'PENDING'"
        ).fetchone()["n"]

        errors = conn.execute(
            """SELECT entry_id, last_error, updated_at
               FROM inbox_queue
               WHERE status = 'ERROR'
               ORDER BY updated_at DESC
               LIMIT 3"""
        ).fetchall()
    finally:
        conn.close()

    from jarvis.budget.tracker import spent_today
    from jarvis.config import JARVIS_DAILY_BUDGET_USD

    return {
        "last_entry": dict(last_entry) if last_entry else None,
        "pending_count": pending_count,
        "recent_errors": [dict(e) for e in errors],
        "budget_spent": spent_today(),
        "budget_limit": JARVIS_DAILY_BUDGET_USD,
        "external_model_active": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
        "local_model": JARVIS_LOCAL_MODEL,
        "debug_mode": is_debug_mode(),
    }


def format_snapshot_text(snapshot: dict) -> str:
    last = snapshot["last_entry"]
    if last:
        last_txt = (
            f"  ID: `{last['id'][:8]}`\n"
            f"  Tipo: {last['type']}\n"
            f"  Fecha: {last['created_at']}\n"
            f"  Estado: {last['status']}"
        )
    else:
        last_txt = "  (sin entradas todavía)"

    if snapshot["recent_errors"]:
        errores_txt = "\n".join(
            f"  • `{e['entry_id'][:8]}` ({e['updated_at']}): {e['last_error'] or '—'}"
            for e in snapshot["recent_errors"]
        )
    else:
        errores_txt = "  Sin errores recientes."

    return (
        "🔧 *Jarvis — debug*\n\n"
        f"*Última entrada procesada:*\n{last_txt}\n\n"
        f"*Pendientes en cola:* {snapshot['pending_count']}\n\n"
        f"*Errores recientes:*\n{errores_txt}\n\n"
        f"*Presupuesto de hoy:* ${snapshot['budget_spent']:.4f} / ${snapshot['budget_limit']:.2f}\n"
        f"*Modelo externo:* {'activo ✅ (OPENAI_API_KEY configurada)' if snapshot['external_model_active'] else 'inactivo ❌ (sin OPENAI_API_KEY) — usa fallback local'}\n"
        f"*Modelo local:* `{snapshot['local_model']}`\n\n"
        f"*Modo debug:* {'ON ✅' if snapshot['debug_mode'] else 'OFF ❌'}"
    )


def notify_debug_processed(
    entry: dict,
    entry_type: str,
    confidence: float,
    entities: list[dict],
    model_used: str,
) -> None:
    """Manda (o loguea) el detalle de una entrada procesada, solo si debug_mode
    está ON. Nunca lanza -- no debe interrumpir el flujo normal del worker."""
    try:
        if not is_debug_mode():
            return

        asked_clarification = "\nRazón:" in (entry.get("content_raw") or "")
        entidades_txt = (
            ", ".join(f"{e.get('name')} ({e.get('type')})" for e in entities)
            if entities else "ninguna"
        )

        text = (
            "🐛 Debug — entrada procesada\n"
            f"ID: {entry.get('id', '')[:8]}\n"
            f"Tipo detectado: {entry_type}\n"
            f"Confianza: {confidence}\n"
            f"Entidades: {entidades_txt}\n"
            f"¿Pidió aclaración?: {'Sí' if asked_clarification else 'No'}\n"
            f"Modelo usado: {model_used}"
        )

        chat_id = get_debug_chat_id()
        if chat_id:
            send_telegram_message(chat_id, text)
        else:
            logger.info(
                "[jarvis.debug] Sin chat_id configurado (JARVIS_TELEGRAM_CHAT_ID "
                "ni derivado de /j) -- log en consola:\n%s", text,
            )
    except Exception:
        logger.exception("[jarvis.debug] notify_debug_processed falló (ignorado)")
