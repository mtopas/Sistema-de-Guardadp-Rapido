"""
Única puerta de entrada a LLMs en Jarvis.
Nunca importar openai.* ni ollama.* directamente — siempre vía LiteLLM.
"""
import logging
import re
from typing import Any

import litellm

from jarvis.config import (
    JARVIS_LOCAL_MODEL,
    JARVIS_REASON_MODEL,
    JARVIS_LOCAL_FALLBACK_MODEL,
    JARVIS_OLLAMA_API_BASE,
    JARVIS_OLLAMA_TIMEOUT,
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
        model = JARVIS_LOCAL_MODEL

    call_kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        **kwargs,
    }

    if is_ollama_model(model):
        call_kwargs["api_base"] = JARVIS_OLLAMA_API_BASE
        call_kwargs.setdefault("timeout", JARVIS_OLLAMA_TIMEOUT)

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


def call_classify(content: str, tag_catalog: list[str] | None = None) -> str:
    """Clasifica contenido usando el modelo local de clasificación.

    tag_catalog (pieza A, catálogo de tags): lista de nombres de tags ya
    existentes para este usuario (jarvis.tags.service.list_tag_catalog).
    Si se pasa, el prompt le pide al modelo elegir tags de ahí -- mismo
    criterio conservador que _find_or_create_entity() para fusionar alias:
    solo inventa un tag nuevo si ninguno del catálogo encaja razonablemente.
    Sin catálogo (None o []), el prompt no menciona el bloque y el modelo
    inventa libremente, igual que antes de esta pieza.
    """
    catalog_block = ""
    if tag_catalog:
        catalog_block = (
            "\nCatálogo de tags ya existentes (preferí elegir de acá si "
            "alguno encaja razonablemente; creá uno nuevo SOLO si ninguno "
            "aplica): " + ", ".join(tag_catalog) + "\n"
        )
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
                "content": _CLASSIFY_PROMPT.format(content=content, catalog_block=catalog_block),
            },
        ],
        model=JARVIS_LOCAL_MODEL,
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
        return f"[modo local] {_strip_local_prefix(text)}"

    try:
        return call_llm(messages=messages, model=JARVIS_REASON_MODEL)
    except Exception as exc:
        logger.warning(
            "[jarvis.llm] Modelo externo (%s) no disponible (%s) — usando modo local (%s)",
            JARVIS_REASON_MODEL, exc, JARVIS_LOCAL_FALLBACK_MODEL,
        )
        text = call_llm(messages=messages, model=JARVIS_LOCAL_FALLBACK_MODEL)
        return f"[modo local] {_strip_local_prefix(text)}"


_LOCAL_PREFIX_RE = re.compile(r"^\s*\[?modo local\]?\s*", re.IGNORECASE)


def _strip_local_prefix(text: str) -> str:
    """Evita "[modo local] modo local ...": el propio "[modo local] " que se le agrega
    a la respuesta anterior queda en el historial de la conversación (spec §7), y un
    modelo chico como llama3.2:3b a veces lo imita al arrancar su próxima respuesta.
    """
    return _LOCAL_PREFIX_RE.sub("", text, count=1)


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
- "type": uno de "RAW", "SEMANTIC", "DECISION", "PROJECT", "PEOPLE"
- "title": título descriptivo corto (máx 60 caracteres)
- "tags": array de 1-5 keywords en minúsculas
- "project": null o nombre del proyecto si el texto claramente pertenece a uno
{catalog_block}
Reglas para type:
- RAW: apuntes, cosas para recordar, links, hechos sueltos, frases
- SEMANTIC: conocimiento extraído, explicaciones, conceptos definidos
- DECISION: decisiones tomadas con razonamiento ("decidí que...", "acordamos...")
- PROJECT: estado de proyectos, contexto, avances
- PEOPLE: información específica sobre una persona (quién es, cómo la conociste,
  preferencias, datos de la relación, algo que dijo o hizo)

Texto: {content}

JSON:"""
