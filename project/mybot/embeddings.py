"""
Capa 4 — cliente de búsqueda de Bóveda para el bot (semántica + keyword).

Funciones públicas:
  search(query, top_k=5, api_base) -> list[dict]
    Búsqueda semántica. Llama a GET /hojas/buscar-semantico?q= (backend → ChromaDB).
    Cada dict es una hoja completa con campo extra "score" (0–1, mayor = más relevante).
    Devuelve [] si el backend no responde o Ollama no está disponible.

  search_keyword(query, api_base) -> list[dict]
    Búsqueda por palabras clave, usada como fallback cuando search() no encuentra nada
    (ver assistant.py::_gather_boveda). Llama a GET /hojas?q= (LIKE sobre contenido/apuntes
    en el backend, sin score de relevancia real).
    Devuelve [] ante cualquier error o si no hay resultados.

El backend es el dueño del índice; el bot solo consume los endpoints REST.
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


def search_keyword(query: str, api_base: str = DEFAULT_API_BASE) -> list[dict]:
    """
    Búsqueda por palabras clave de hojas (GET /hojas?q=, LIKE '%q%' sobre contenido/apuntes).
    Sin score de relevancia real. Devuelve [] ante cualquier error o si no hay resultados.
    """
    try:
        r = requests.get(
            f"{api_base}/hojas",
            params={"q": query},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        logger.warning("[embeddings] search_keyword(%r): %s", query, exc)
        return []
