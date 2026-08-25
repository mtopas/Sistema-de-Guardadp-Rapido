"""
Generación de embeddings vía LiteLLM — nunca ollama.* directamente.
"""
import logging
from typing import Any

import litellm
from litellm.llms.custom_httpx.http_handler import AsyncHTTPHandler

from jarvis.config import (
    JARVIS_EMBED_MODEL,
    JARVIS_OLLAMA_API_BASE,
    JARVIS_OLLAMA_TIMEOUT,
    is_ollama_model,
)

logger = logging.getLogger(__name__)


def generate_embedding(text: str, model: str | None = None) -> list[float]:
    """Genera el embedding de un texto vía LiteLLM. Devuelve el vector."""
    if model is None:
        model = JARVIS_EMBED_MODEL

    call_kwargs: dict[str, Any] = {"model": model, "input": [text]}
    if is_ollama_model(model):
        call_kwargs["api_base"] = JARVIS_OLLAMA_API_BASE
        call_kwargs["timeout"] = JARVIS_OLLAMA_TIMEOUT
        # litellm==1.60.2 (litellm/llms/ollama/completion/handler.py::ollama_embeddings)
        # implementa la llamada sync envolviendo la async (ollama_aembeddings) en
        # asyncio.run(), pero esa función usa litellm.module_level_aclient — un
        # httpx.AsyncClient singleton de todo el proceso creado una sola vez al importar
        # litellm. asyncio.run() cierra su event loop al terminar; el singleton queda
        # atado a ese loop ya cerrado, y la SIGUIENTE llamada a embeddings en el mismo
        # proceso (worker de larga duración, o el bot de Telegram) revienta con
        # "RuntimeError: Event loop is closed" — visto en vivo probando /jq dos veces
        # seguidas por Telegram (la 2da consulta degradó en silencio al fallback de
        # keywords en SQLite). Se fuerza un cliente nuevo antes de cada llamada para que
        # quede atado al loop que asyncio.run() está por crear, no al de la llamada previa.
        litellm.module_level_aclient = AsyncHTTPHandler(
            timeout=JARVIS_OLLAMA_TIMEOUT, client_alias="module level aclient"
        )

    response = litellm.embedding(**call_kwargs)
    return response["data"][0]["embedding"]
