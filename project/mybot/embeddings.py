"""
Capa 4 — cliente de búsqueda semántica para el bot.

Llama a GET /hojas/buscar-semantico?q= (backend → ChromaDB).
El backend es el dueño del índice; el bot solo consume el endpoint REST.

Función pública:
  search(query, top_k=5, api_base) -> list[dict]
    Cada dict es una hoja completa con campo extra "score" (0–1, mayor = más relevante).
    Devuelve [] si el backend no responde o Ollama no está disponible.
"""

from __future__ import annotations

import logging
import urllib.parse

import requests

from api_config import API_BASE as DEFAULT_API_BASE

logger = logging.getLogger(__name__)


def search(query: str, top_k: int = 5, api_base: str = DEFAULT_API_BASE) -> list[dict]:
    """
    Búsqueda semántica de hojas. Devuelve lista de hojas con campo 'score'.
    Devuelve [] ante cualquier error (Ollama no disponible, backend caído, etc.).
    """
    try:
        params = {"q": query, "top_k": top_k}
        r = requests.get(
            f"{api_base}/hojas/buscar-semantico",
            params=params,
            timeout=20,
        )
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        logger.warning("[embeddings] search(%r): %s", query, exc)
        return []
