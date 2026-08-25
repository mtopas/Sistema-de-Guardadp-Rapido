"""
Flujo completo de consulta RAG (spec §7 — Flujo de consulta):

  pregunta → recuperar fragmentos (ChromaDB) → Privacy Gateway →
  construir prompt (contexto + historial) → call_reason() → respuesta

call_reason() ya maneja el fallback a modo local si budget == EXHAUSTED (spec §11).
La Privacy Gateway ya filtra entradas antes del modelo externo (spec §17).
"""
import logging

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.conversation.service import (
    add_message,
    get_or_create_conversation,
    get_recent_messages,
)
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
    add_message(conversation_id, "user", question)

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
    # Excluir el último par user/assistant que aún no existe para evitar duplicar la pregunta
    history = [m for m in history if not (m["role"] == "user" and m["content"] == question)]

    # Construir mensaje para el modelo
    messages = _build_messages(question, safe_entries, history, had_blocked=blocked > 0)

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
            "Respondé en español usando el contexto de memoria provisto como base primaria. "
            "Si el contexto no alcanza para responder con certeza, decilo claramente. "
            "Cuando sea relevante, mencioná el tipo de memoria (DECISION, SEMANTIC, etc.) "
            "de donde proviene la información. "
            "Nunca inventés datos que no estén en el contexto."
        ),
    }

    user_msg = {
        "role": "user",
        "content": (
            f"Contexto de memoria:\n{context_text}{privacy_note}"
            f"\n\nPregunta: {question}"
        ),
    }

    # system + historial (sin la pregunta actual que ya va en user_msg enriquecido)
    return [system_msg] + history + [user_msg]


def _title_hint(entry: dict) -> str:
    text = (entry.get("content_processed") or entry.get("content_raw") or "").strip()
    first_line = text.split("\n")[0]
    return (first_line[:80] + "…") if len(first_line) > 80 else first_line
