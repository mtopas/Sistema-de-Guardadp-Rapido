"""
Flujo completo de consulta RAG (spec §7 — Flujo de consulta):

  pregunta → recuperar fragmentos (ChromaDB) → Privacy Gateway →
  construir prompt (contexto + historial) → call_reason() → respuesta

call_reason() ya maneja el fallback a modo local si budget == EXHAUSTED (spec §11).
La Privacy Gateway ya filtra entradas antes del modelo externo (spec §17).
"""
import logging
from datetime import datetime, timezone

from jarvis.chats.service import autoname_if_untitled
from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.conversation.service import (
    add_message,
    ensure_conversation,
    get_or_create_conversation,
    get_recent_messages,
)
from jarvis.entities.service import get_entries_for_entity, match_entities_in_text
from jarvis.llm.client import call_reason
from jarvis.privacy.gateway import filter_context
from jarvis.retriever.retriever import retrieve

logger = logging.getLogger(__name__)


def query(
    question: str,
    conversation_id: str | None = None,
    channel: str = "desktop",
    channel_id: str = "web",
    user_id: str = JARVIS_DEFAULT_USER,
) -> dict:
    """
    Responde una pregunta en lenguaje natural usando RAG sobre la memoria de Jarvis.

    Returns:
        {
            "answer": str,
            "sources": [{"id", "type", "title_hint"}],
            "conversation_id": str,
            "context_count": int,   # fragmentos recuperados de ChromaDB
            "context_sent": int,    # fragmentos que pasaron el Privacy Gateway
        }
    """
    # Conversación
    if conversation_id is None:
        conversation_id = get_or_create_conversation(
            channel=channel,
            channel_id=channel_id,
            user_id=user_id,
        )
    else:
        # conversation_id puede venir del cliente (frontend, localStorage) y quedar
        # huérfano si jarvis.db se resetea/migra — recrearla evita un FOREIGN KEY
        # constraint failed en el add_message() de abajo.
        ensure_conversation(conversation_id, channel=channel, channel_id=channel_id, user_id=user_id)
    add_message(conversation_id, "user", question)
    # Multi-chat (Mejoras_Jarvis.md punto 3): el primer mensaje de un chat sin
    # título le da nombre automáticamente — nunca pisa un título ya puesto por
    # el usuario. No-op para channel='telegram' (esa tabla nunca expone título
    # en UI, ver jarvis/chats/service.py).
    autoname_if_untitled(conversation_id, question)

    # RAG — recuperar fragmentos candidatos (n_results extra para dejar margen al ranking)
    context_entries = retrieve(question, n_results=8, user_id=user_id)

    # Privacy Gateway — bloquear fragmentos que no pueden salir al modelo externo
    safe_entries = filter_context(context_entries)
    blocked = len(context_entries) - len(safe_entries)
    if blocked:
        logger.info(
            "[jarvis.query] %d fragmento(s) bloqueados por Privacy Gateway user=%s",
            blocked, user_id,
        )

    # Historial conversacional (spec §7: últimos 8-10 mensajes)
    history = get_recent_messages(conversation_id, limit=10)
    # La pregunta recién insertada es solo el último mensaje; las anteriores
    # con el mismo texto siguen siendo parte del historial.
    if history and history[-1]["role"] == "user" and history[-1]["content"] == question:
        history = history[:-1]

    # Entidades conocidas mencionadas en la pregunta (0.2 Slice 3) — sección aparte
    # "Lo que sé sobre [nombre]" con sus entradas vinculadas, también filtradas por
    # el Privacy Gateway antes de ir al prompt del modelo externo.
    entity_sections = _build_entity_sections(question, user_id)

    # Construir mensaje para el modelo
    messages = _build_messages(
        question, safe_entries, history, had_blocked=blocked > 0, entity_sections=entity_sections
    )

    # Llamar al modelo de razonamiento (maneja budget EXHAUSTED internamente)
    answer = call_reason(messages)

    # Persistir respuesta
    add_message(conversation_id, "assistant", answer)

    sources = [
        {
            "id": e["id"],
            "type": e.get("type", "RAW"),
            "title_hint": _title_hint(e),
        }
        for e in safe_entries[:5]
    ]

    return {
        "answer": answer,
        "sources": sources,
        "conversation_id": conversation_id,
        "context_count": len(context_entries),
        "context_sent": len(safe_entries),
    }


def _build_messages(
    question: str,
    context_entries: list[dict],
    history: list[dict],
    had_blocked: bool,
    entity_sections: str = "",
) -> list[dict]:
    context_text = "\n\n".join(
        f"[{e.get('type', 'RAW')} | {e.get('origin_trust', '?')}] "
        f"{(e.get('content_processed') or e.get('content_raw') or '').strip()}"
        for e in context_entries
    ) or "(sin contexto disponible en la memoria)"

    privacy_note = (
        "\n\n[Nota: uno o más fragmentos de memoria fueron omitidos por razones de privacidad.]"
        if had_blocked
        else ""
    )

    system_msg = {
        "role": "system",
        "content": (
            "Sos Jarvis, el segundo cerebro del usuario. "
            "Respondé en español, en lenguaje natural y conversacional — sintetizá lo que "
            "encontraste en tus propias palabras, como lo haría una persona explicando algo "
            "que recuerda, no citando fichas textuales ni encadenando listas de datos en "
            "negrita salvo que el usuario pida específicamente una lista. "
            "Usá el contexto de memoria provisto como base primaria. "
            "Si el contexto no alcanza para responder con certeza, decilo claramente. "
            "Cuando sea relevante, mencioná el tipo de memoria (DECISION, SEMANTIC, etc.) "
            "de donde proviene la información, pero integrado a la frase, no como etiqueta suelta. "
            "Cada mensaje del historial de esta conversación tiene una marca de tiempo relativa "
            "entre corchetes (ej. '[hace 2 días]') — puede usarla para referirse a cuándo dijo "
            "algo el usuario (ej. 'hace dos días me dijiste que...'), pero nunca la copie tal "
            "cual dentro de la respuesta. "
            "Nunca inventés datos que no estén en el contexto."
            + entity_sections
        ),
    }

    user_msg = {
        "role": "user",
        "content": (
            f"Contexto de memoria:\n{context_text}{privacy_note}"
            f"\n\nPregunta: {question}"
        ),
    }

    timed_history = [
        {"role": m["role"], "content": f"[{_relative_es(m.get('created_at'))}] {m['content']}"}
        for m in history
    ]

    # system + historial (sin la pregunta actual que ya va en user_msg enriquecido)
    return [system_msg] + timed_history + [user_msg]


def _relative_es(iso: str | None) -> str:
    """Edad relativa en español para timestamps ISO UTC del historial de
    conversación — versión Python de utils/formatAge.js (mismo propósito,
    fraseo distinto porque acá el texto va dentro del prompt, no de la UI).
    Nunca lanza — 'hace un tiempo' si el timestamp falta o es inválido.
    """
    if not iso:
        return "hace un tiempo"
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        seconds = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())
    except Exception:
        return "hace un tiempo"

    if seconds < 60:
        return "recién"
    if seconds < 3600:
        return f"hace {int(seconds // 60)} min"
    if seconds < 86400:
        return f"hace {int(seconds // 3600)} h"
    days = int(seconds // 86400)
    return "hace 1 día" if days == 1 else f"hace {days} días"


def _build_entity_sections(question: str, user_id: str) -> str:
    """"Lo que sé sobre [nombre]:" por cada entidad conocida mencionada en la
    pregunta, con sus entradas vinculadas (filtradas por Privacy Gateway).
    Nunca lanza — devuelve "" si la detección de entidades falla.
    """
    try:
        matched = match_entities_in_text(question, user_id)
        if not matched:
            return ""

        blocks = []
        for ent in matched:
            entries = get_entries_for_entity(ent["name"], user_id)
            safe = filter_context(entries)
            if not safe:
                continue
            facts = "\n".join(
                f"- {(e.get('content_processed') or e.get('content_raw') or '').strip()}"
                for e in safe
            )
            blocks.append(f"\n\nLo que sé sobre {ent['name']}:\n{facts}")
        return "".join(blocks)
    except Exception as exc:
        logger.warning("[jarvis.query] Sección de entidades falló, se omite: %s", exc)
        return ""


def _title_hint(entry: dict) -> str:
    text = (entry.get("content_processed") or entry.get("content_raw") or "").strip()
    first_line = text.split("\n")[0]
    return (first_line[:80] + "…") if len(first_line) > 80 else first_line
