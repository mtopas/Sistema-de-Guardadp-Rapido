"""
Única puerta de entrada a LLMs en Jarvis.
Nunca importar openai.* ni ollama.* directamente — siempre vía LiteLLM.
"""
import logging
from typing import Any

import litellm

from jarvis.config import (
    JARVIS_CLASSIFY_MODEL,
    JARVIS_REASON_MODEL,
    JARVIS_LOCAL_FALLBACK_MODEL,
    JARVIS_OLLAMA_API_BASE,
    is_ollama_model,
)

logger = logging.getLogger(__name__)

litellm.drop_params = True


def call_llm(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.0,
    **kwargs: Any,
) -> str:
    """Llama al LLM vía LiteLLM y devuelve el texto de respuesta.

    Siempre usa LiteLLM como gateway — nunca openai.* ni ollama.* directamente.
    Registra el gasto real en el budget tracker para modelos externos (no-Ollama).
    """
    if model is None:
        model = JARVIS_CLASSIFY_MODEL

    call_kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        **kwargs,
    }

    if is_ollama_model(model):
        call_kwargs["api_base"] = JARVIS_OLLAMA_API_BASE

    try:
        response = litellm.completion(**call_kwargs)
        usage = getattr(response, "usage", None)
        if usage:
            logger.debug(
                "[jarvis.llm] model=%s tokens_in=%s tokens_out=%s",
                model,
                getattr(usage, "prompt_tokens", "?"),
                getattr(usage, "completion_tokens", "?"),
            )
        if not is_ollama_model(model):
            _record_cost(model, response, usage)
        return response.choices[0].message.content or ""
    except Exception as e:
        logger.error("[jarvis.llm] Error en call_llm (model=%s): %s", model, e)
        raise


def _record_cost(model: str, response: Any, usage: Any) -> None:
    from jarvis.budget.tracker import record_usage

    try:
        cost = litellm.completion_cost(completion_response=response)
    except Exception as e:
        logger.warning("[jarvis.llm] No se pudo calcular costo (model=%s): %s", model, e)
        cost = 0.0

    tokens_in = getattr(usage, "prompt_tokens", 0) if usage else 0
    tokens_out = getattr(usage, "completion_tokens", 0) if usage else 0
    record_usage(model, tokens_in, tokens_out, cost)


def call_classify(content: str) -> str:
    """Clasifica contenido usando el modelo local de clasificación."""
    return call_llm(
        messages=[
            {
                "role": "system",
                "content": (
                    "Eres un clasificador de memorias. "
                    "Responde ÚNICAMENTE con JSON válido, sin texto extra."
                ),
            },
            {
                "role": "user",
                "content": _CLASSIFY_PROMPT.format(content=content),
            },
        ],
        model=JARVIS_CLASSIFY_MODEL,
        temperature=0.0,
    )


def call_reason(messages: list[dict]) -> str:
    """Llama al modelo externo de razonamiento.

    Si el presupuesto diario está agotado, cae automáticamente a modo local
    (spec §11 — estado EXHAUSTED) y prefija la respuesta con "[modo local]".
    Si la llamada externa falla por cualquier otro motivo (sin API key,
    sin red, proveedor caído), también cae a modo local en lugar de
    propagar el error — Jarvis debe seguir siendo usable sin depender de
    un servicio externo disponible.
    """
    from jarvis.budget.tracker import get_status

    if get_status() == "EXHAUSTED":
        logger.warning(
            "[jarvis.llm] Presupuesto diario agotado — usando modo local (%s)",
            JARVIS_LOCAL_FALLBACK_MODEL,
        )
        text = call_llm(messages=messages, model=JARVIS_LOCAL_FALLBACK_MODEL)
        return f"[modo local] {text}"

    try:
        return call_llm(messages=messages, model=JARVIS_REASON_MODEL)
    except Exception as exc:
        logger.warning(
            "[jarvis.llm] Modelo externo (%s) no disponible (%s) — usando modo local (%s)",
            JARVIS_REASON_MODEL, exc, JARVIS_LOCAL_FALLBACK_MODEL,
        )
        text = call_llm(messages=messages, model=JARVIS_LOCAL_FALLBACK_MODEL)
        return f"[modo local] {text}"


def call_reason_with_context(question: str, context_entries: list[dict]) -> str:
    """Responde una pregunta usando memory_entries como contexto RAG.

    Los fragmentos pasan primero por el Privacy Gateway (spec §17) — ante
    la duda, se bloquean. Pensado para que S3 lo use en cuanto exista
    recuperación (RAG); acá ya deja el boundary externo protegido.
    """
    from jarvis.privacy.gateway import filter_context

    safe_entries = filter_context(context_entries)
    context_text = "\n\n".join(
        f"[{e.get('origin_trust', '?')}] {e.get('content_processed') or e.get('content_raw') or ''}"
        for e in safe_entries
    ) or "(sin contexto disponible)"

    messages = [
        {
            "role": "system",
            "content": (
                "Sos Jarvis, el segundo cerebro del usuario. Respondé usando "
                "únicamente el contexto provisto. Si no alcanza, decilo."
            ),
        },
        {"role": "user", "content": f"Contexto:\n{context_text}\n\nPregunta: {question}"},
    ]
    return call_reason(messages)


_CLASSIFY_PROMPT = """\
Clasifica el siguiente texto y extrae metadatos. Responde SOLO con JSON válido con estos campos:
- "type": uno de "RAW", "SEMANTIC", "DECISION", "PROJECT"
- "title": título descriptivo corto (máx 60 caracteres)
- "tags": array de 1-5 keywords en minúsculas
- "project": null o nombre del proyecto si el texto claramente pertenece a uno

Reglas para type:
- RAW: apuntes, cosas para recordar, links, hechos sueltos, frases
- SEMANTIC: conocimiento extraído, explicaciones, conceptos definidos
- DECISION: decisiones tomadas con razonamiento ("decidí que...", "acordamos...")
- PROJECT: estado de proyectos, contexto, avances

Texto: {content}

JSON:"""
