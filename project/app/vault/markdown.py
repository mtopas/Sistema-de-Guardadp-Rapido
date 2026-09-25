"""Conversión HTML <-> Markdown para el campo `apuntes` (TipTap) de una hoja.

Escritura: el HTML que manda el frontend (TipTap) se convierte a Markdown
limpio antes de escribir el cuerpo del `.md` en D:\\Boveda.

Lectura: como el `.md` en disco es la fuente de verdad, `GET /hojas` necesita
reconstruir HTML a partir del Markdown guardado para que TipTap lo siga
renderizando igual que antes -- si no, la UI mostraría Markdown crudo.
"""

from __future__ import annotations

import re

import markdown as _markdown
from markdownify import markdownify as _markdownify

IMG_ADJUNTO_PATH_RE = re.compile(r"!\[[^\]]*\]\(_adjuntos/([^)]+)\)")


def html_a_markdown(html: str) -> str:
    if not html or not html.strip():
        return ""
    md = _markdownify(html, heading_style="ATX", bullets="-")
    return md.strip()


def markdown_a_html(md: str) -> str:
    if not md or not md.strip():
        return ""
    return _markdown.markdown(md, extensions=["extra", "sane_lists"])


def construir_apuntes_html_foto(imagen_ref_md: str | None, md_apuntes: str) -> str:
    """Reconstruye `apuntes` con el <img> líder (URL absoluta) + el resto
    convertido de Markdown -- RightPanel.jsx espera que una hoja tipo=foto
    tenga el <img> como primera etiqueta de `apuntes` para separarlo del
    resto en TipTap (mismo patrón que ya usa mybot/bot.py al capturar fotos).
    Usado tanto al crear/editar (app/db/crud.py) como al releer del archivo
    (app/vault/sync.py) -- una sola implementación para no divergir."""
    html = markdown_a_html(md_apuntes) if md_apuntes else ""
    m = IMG_ADJUNTO_PATH_RE.search(imagen_ref_md or "")
    if not m:
        return html
    url_rel = f"/adjuntos/{m.group(1)}"
    img_tag = f'<img src="{url_rel}" alt="" style="max-width:100%;border-radius:8px;margin-top:8px;">'
    return img_tag + html
