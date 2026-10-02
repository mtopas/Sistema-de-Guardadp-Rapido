"""Modelo "un solo campo de cuerpo" para la captura de hojas de Bóveda.

Port de `frontend/src/utils/cuerpoHoja.js` al backend, para que el bot de
Telegram (y cualquier otro cliente Python) apliquen exactamente la misma regla
que la app sin depender del frontend.

Decisión de producto 2026-10-02 (#12 + #13): la captura rápida de texto escribe
el CUERPO en `apuntes`; el título (`contenido`) se AUTOGENERA de la primera
línea no vacía del cuerpo. El título queda editable después en DetailScreen. La
seguridad como nombre de archivo y las colisiones las resuelve el vault writer
(`app/vault/writer.py`: sanitize_nombre / nombre único); acá solo producimos un
título legible y no vacío.

Este módulo es Python puro (solo `re` y `urllib.parse`): no importa nada de
FastAPI ni toca la DB, así que el bot lo puede importar sin arrastrar el
backend completo.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Mismo patrón que `_URL_RE` en cuerpoHoja.js: excluye espacios y los cierres
# <, >, ", ', ), ] que suelen venir pegados a una URL.
_URL_RE = re.compile(r"https?://[^\s<>\"')\]]+")


def _primera_linea(cuerpo) -> str:
    """Primera línea no vacía del cuerpo, sin marcadores Markdown de apertura."""
    texto = str(cuerpo if cuerpo is not None else "").replace("\r", "")
    for linea in texto.split("\n"):
        t = linea.strip()
        if t:
            t = re.sub(r"^#{1,6}\s+", "", t)   # encabezados
            t = re.sub(r"^>\s+", "", t)        # citas
            t = re.sub(r"^[-*+]\s+", "", t)    # viñetas
            t = re.sub(r"^\d+[.)]\s+", "", t)  # listas numeradas
            return t.strip()
    return ""


def _dominio(url: str) -> str:
    """Dominio sin "www." de una URL, o la URL cruda si no parsea."""
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return url
    if host.startswith("www."):
        host = host[4:]
    return host or url


def titulo_desde_cuerpo(cuerpo, max_len: int = 80) -> str:
    """Título autogenerado a partir del cuerpo de una nota.

    - Usa la primera línea no vacía (sin markdown de apertura).
    - Si esa línea es solo un link, deriva el dominio.
    - Si tiene texto + link, descarta la URL cruda y conserva el texto.
    - Nunca devuelve vacío (fallback "Sin título").
    - Trunca a `max_len` caracteres.
    """
    linea = _primera_linea(cuerpo)
    if not linea:
        return "Sin título"

    if re.fullmatch(_URL_RE.pattern, linea):
        titulo = _dominio(linea)
    else:
        titulo = _URL_RE.sub("", linea)
        titulo = re.sub(r"\s+", " ", titulo).strip()
        if not titulo:
            m = _URL_RE.search(linea)
            titulo = _dominio(m.group(0)) if m else ""

    titulo = titulo.strip()
    if not titulo:
        return "Sin título"
    return titulo[:max_len].strip() if len(titulo) > max_len else titulo


def texto_plano_a_html(texto) -> str:
    """Convierte texto plano del textarea de captura a HTML simple para `apuntes`.

    Mismo criterio que `textoPlanoAHtml` en cuerpoHoja.js: separa párrafos por
    línea en blanco; dentro de un párrafo, los saltos simples van a <br>. Escapa
    el HTML del usuario. El vault writer lo normaliza a Markdown y TipTap lo
    re-renderiza igual, así que la nota se ve idéntica a la creada desde la app.
    """
    t = str(texto if texto is not None else "").replace("\r", "").strip()
    if not t:
        return ""

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    parrafos = re.split(r"\n{2,}", t)
    return "".join(
        "<p>" + "<br>".join(esc(l) for l in par.split("\n")) + "</p>"
        for par in parrafos
    )


def primer_link_en_cuerpo(cuerpo):
    """Primer link http(s) que aparezca en cualquier parte del cuerpo.

    Devuelve None si no hay. Base de la preview de link (#10): la preview cuelga
    del primer link del cuerpo, no del título.
    """
    if not cuerpo:
        return None
    m = _URL_RE.search(str(cuerpo))
    if not m:
        return None
    return re.sub(r"[.,;:]+$", "", m.group(0))
