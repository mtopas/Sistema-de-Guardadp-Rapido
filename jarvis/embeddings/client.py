"""
Generación de embeddings vía LiteLLM — nunca ollama.* directamente.
"""
import logging
from typing import Any

import litellm

from jarvis.config import JARVIS_EMBED_MODEL, JARVIS_OLLAMA_API_BASE, is_ollama_model

logger = logging.getLogger(__name__)


def generate_embedding(text: str, model: str | None = None) -> list[float]:
    """Genera el embedding de un texto vía LiteLLM. Devuelve el vector."""
    if model is None:
        model = JARVIS_EMBED_MODEL

    call_kwargs: dict[str, Any] = {"model": model, "input": [text]}
    if is_ollama_model(model):
        call_kwargs["api_base"] = JARVIS_OLLAMA_API_BASE

    response = litellm.embedding(**call_kwargs)
    return response["data"][0]["embedding"]
