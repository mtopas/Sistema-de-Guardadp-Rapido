"""Autoetiquetado conservador de hojas de Bóveda.

Reusa el clasificador local y el catálogo canónico de Jarvis, pero exige una
confianza explícita del modelo. La ausencia de señal se trata como ausencia de
tags: guardar una hoja nunca obliga a inventar una etiqueta.
"""
import json
import logging
import re

from jarvis.llm.client import call_classify
from jarvis.tags.service import list_tag_catalog

logger = logging.getLogger(__name__)

_MIN_CONTENT_CHARS = 40
_MIN_TAG_CONFIDENCE = 0.8
_MAX_TAGS = 5
_MAX_TAG_LENGTH = 48
_TAG_RE = re.compile(r"^[\w-]+$", re.UNICODE)


def _parse_json(raw: str) -> dict:
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            value = json.loads(raw[start:end])
            return value if isinstance(value, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return {}


def _clean_tags(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    result, seen = [], set()
    for value in raw:
        if not isinstance(value, str):
            continue
        tag = value.strip().lstrip("#").lower()
        if not tag or len(tag) > _MAX_TAG_LENGTH or not _TAG_RE.fullmatch(tag):
            continue
        if tag not in seen:
            seen.add(tag)
            result.append(tag)
    return result[:_MAX_TAGS]


def sugerir_tags_para_hoja(contenido: str, apuntes: str | None = None) -> list[str]:
    """Devuelve solo tags confiables; ante duda devuelve ``[]``."""
    cuerpo = re.sub(r"<[^>]+>", " ", apuntes or "")
    texto = re.sub(r"\s+", " ", f"{contenido or ''} {cuerpo}").strip()
    if len(texto) < _MIN_CONTENT_CHARS:
        return []

    catalogo = list_tag_catalog()
    try:
        resultado = _parse_json(call_classify(texto, catalogo))
        confianza = resultado.get("tags_confidence", resultado.get("tag_confidence"))
        confianza = float(confianza)
    except Exception as exc:
        logger.warning("[jarvis.captures.tags] clasificación no confiable: %s", exc)
        return []

    if confianza < _MIN_TAG_CONFIDENCE:
        return []

    candidatos = _clean_tags(resultado.get("tags"))
    if not candidatos:
        return []

    catalogo_lower = {str(tag).strip().lower() for tag in catalogo}
    existentes = [tag for tag in candidatos if tag in catalogo_lower]
    if existentes:
        return existentes
    # Si nada del catálogo encaja, permitir como máximo una etiqueta nueva.
    return candidatos[:1]
