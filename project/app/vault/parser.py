"""Parseo de frontmatter YAML de notas de D:\\Boveda.

Lógica compartida entre `scripts/vault_indexer.py` (CLI de Milestone 1) y la
sincronización en vivo usada por `app/db/crud.py` (Milestone 2) -- una sola
fuente de verdad para el parseo, nunca duplicarla.

Contrato de frontmatter: ver READMEs de cada carpeta en D:\\Boveda. Campos
"comunes": id, tipo, creado_en, actualizado_en, origen, tags, url (solo
tipo=link). Campos opcionales fuera del contrato común (Milestone 2): icono,
lugar, latitud, longitud -- se omiten si no aplican. fecha_recordatorio no
tiene lugar en el vault (sin uso real en UI, confirmado al cerrar Milestone 2).
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml

TIPOS_VALIDOS = {"texto", "link", "foto"}
ORIGENES_VALIDOS = {"app", "telegram", "migracion", "manual", "agenda"}

FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?\r?\n)---\r?\n?", re.DOTALL)
H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
URL_ONLY_RE = re.compile(r"^\s*(https?://\S+)\s*$")

# Claves opcionales fuera del contrato "común" (Milestone 2) -- se escriben
# solo si vienen con valor.
_CAMPOS_OPCIONALES = ("icono", "lugar", "latitud", "longitud")


@dataclass
class NotaParseada:
    id: str
    tipo: Optional[str]
    creado_en: Optional[str]
    actualizado_en: Optional[str]
    origen: Optional[str]
    tags: list
    url: Optional[str]
    titulo: str
    icono: Optional[str] = None
    lugar: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None


def derive_titulo(body: str, path: Path) -> str:
    m = H1_RE.search(body)
    if m:
        return m.group(1).strip()
    return path.stem


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def mtime_iso(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(timespec="seconds")


def _iso_str(valor) -> Optional[str]:
    """PyYAML auto-parsea timestamps ISO8601 sin comillas a `datetime`/`date`
    nativos -- `str()` de un `datetime` pierde la 'T' (usa espacio), rompiendo
    el formato documentado en los README del vault apenas se re-lee un
    frontmatter ya escrito por la propia app. `.isoformat()` la preserva."""
    if valor is None:
        return None
    if hasattr(valor, "isoformat"):
        return valor.isoformat()
    return str(valor)


def build_frontmatter_text(data: dict) -> str:
    """Arma el bloque `---\\n...\\n---` a partir de un dict de campos.

    Escribe siempre los campos "comunes" (id/tipo/creado_en/actualizado_en/
    origen/tags[/url]); los opcionales (icono/lugar/latitud/longitud) solo si
    vienen con valor no-None.
    """
    tags = data.get("tags") or []
    tags_yaml = "[" + ", ".join(tags) + "]" if tags else "[]"
    lines = [
        "---",
        f"id: {data['id']}",
        f"tipo: {data['tipo']}",
        f"creado_en: {data['creado_en']}",
        f"actualizado_en: {data['actualizado_en']}",
        f"origen: {data['origen']}",
        f"tags: {tags_yaml}",
    ]
    if data.get("tipo") == "link" and data.get("url"):
        lines.append(f"url: {data['url']}")
    for campo in _CAMPOS_OPCIONALES:
        valor = data.get(campo)
        if valor is not None and valor != "":
            lines.append(f"{campo}: {valor}")
    lines.append("---\n")
    return "\n".join(lines)


def assign_missing_id(path: Path, raw_text: str, dry_run: bool) -> tuple[str, dict, str, bool]:
    """Si falta `id` en el frontmatter (o falta el frontmatter entero), lo
    autoasigna y reescribe el archivo -- cubre el caso de un archivo creado a
    mano fuera de la app. Devuelve (texto_actualizado, frontmatter_dict,
    cuerpo, fue_asignado).
    """
    m = FRONTMATTER_RE.match(raw_text)
    if m:
        fm_block = m.group(1)
        body = raw_text[m.end():]
        data = yaml.safe_load(fm_block) or {}
    else:
        body = raw_text
        data = {}

    if data.get("id"):
        return raw_text, data, body, False

    # Frontmatter ausente o sin id: se trata como creado a mano.
    data.setdefault("tags", [])
    data["id"] = str(uuid.uuid4())
    if "tipo" not in data or "url" not in data:
        url_match = URL_ONLY_RE.match(body.strip())
        if url_match:
            data.setdefault("tipo", "link")
            data.setdefault("url", url_match.group(1))
        else:
            data.setdefault("tipo", "texto")
    data.setdefault("creado_en", mtime_iso(path))
    data.setdefault("actualizado_en", mtime_iso(path))
    data.setdefault("origen", "manual")

    new_text = build_frontmatter_text(data) + "\n" + body.lstrip("\n")
    if not dry_run:
        path.write_text(new_text, encoding="utf-8")
    return new_text, data, body, True


def parse_nota(path: Path, dry_run: bool, logger=None) -> tuple[NotaParseada, bool]:
    raw_text = path.read_text(encoding="utf-8")
    _, data, body, id_asignado = assign_missing_id(path, raw_text, dry_run)

    tipo = data.get("tipo")
    if logger and tipo not in TIPOS_VALIDOS:
        logger.warning("%s: tipo %r no está en %s", path, tipo, TIPOS_VALIDOS)

    origen = data.get("origen")
    if logger and origen not in ORIGENES_VALIDOS:
        logger.warning("%s: origen %r no está en %s", path, origen, ORIGENES_VALIDOS)

    tags = data.get("tags") or []
    if not isinstance(tags, list):
        if logger:
            logger.warning("%s: tags no es una lista (%r), se ignora", path, tags)
        tags = []

    if logger and tipo == "link" and not data.get("url"):
        logger.warning("%s: tipo=link sin url", path)

    def _float_or_none(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    nota = NotaParseada(
        id=str(data["id"]),
        tipo=tipo,
        creado_en=_iso_str(data.get("creado_en")),
        actualizado_en=_iso_str(data.get("actualizado_en")),
        origen=origen,
        tags=tags,
        url=data.get("url"),
        titulo=derive_titulo(body, path),
        icono=data.get("icono"),
        lugar=data.get("lugar"),
        latitud=_float_or_none(data.get("latitud")),
        longitud=_float_or_none(data.get("longitud")),
    )
    return nota, id_asignado


def split_frontmatter(raw_text: str) -> tuple[Optional[dict], str]:
    """Devuelve (frontmatter_dict_o_None, cuerpo) sin autoasignar id."""
    m = FRONTMATTER_RE.match(raw_text)
    if not m:
        return None, raw_text
    data = yaml.safe_load(m.group(1)) or {}
    body = raw_text[m.end():]
    return data, body
