"""Escritura física al vault D:\\Boveda -- crear/actualizar/mover notas y carpetas.

Regla dura de todo este módulo: el archivo se escribe/mueve primero; quien
llama (crud.py) recién después actualiza la fila SQL que lo refleja. Nunca al
revés.
"""

from __future__ import annotations

import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Optional

from app.vault.parser import build_frontmatter_text, now_iso

BASURA_CARPETA = "05 - Basura"

_INVALIDOS_WINDOWS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def sanitize_nombre(nombre: str, max_len: int = 80) -> str:
    limpio = _INVALIDOS_WINDOWS.sub("", nombre).strip(" .")
    limpio = re.sub(r"\s+", " ", limpio)
    if not limpio:
        limpio = uuid.uuid4().hex[:8]
    return limpio[:max_len].strip(" .")


def _escribir_atomico(path: Path, texto: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp-{uuid.uuid4().hex[:8]}")
    tmp.write_text(texto, encoding="utf-8")
    os.replace(tmp, path)


def nombre_archivo_unico(carpeta_abs: Path, titulo: str) -> str:
    base = sanitize_nombre(titulo) or "Sin título"
    candidato = f"{base}.md"
    n = 2
    while (carpeta_abs / candidato).exists():
        candidato = f"{base} ({n}).md"
        n += 1
    return candidato


def armar_texto_nota(frontmatter: dict, titulo: str, body_md: str) -> str:
    fm = build_frontmatter_text(frontmatter)
    cuerpo = f"\n# {titulo}\n"
    if body_md and body_md.strip():
        cuerpo += f"\n{body_md.strip()}\n"
    return fm + cuerpo


def crear_nota(vault_root: Path, categoria_ruta: str, titulo: str, frontmatter: dict, body_md: str) -> str:
    """Crea un .md nuevo en `categoria_ruta`. Devuelve la ruta relativa al vault."""
    carpeta_abs = vault_root / categoria_ruta
    carpeta_abs.mkdir(parents=True, exist_ok=True)
    nombre = nombre_archivo_unico(carpeta_abs, titulo)
    ruta_rel = str(Path(categoria_ruta) / nombre)
    _escribir_atomico(vault_root / ruta_rel, armar_texto_nota(frontmatter, titulo, body_md))
    return ruta_rel


def actualizar_nota(vault_root: Path, ruta_rel: str, titulo: str, frontmatter: dict, body_md: str) -> None:
    """Reescribe un .md existente en su ubicación actual (no mueve de carpeta)."""
    _escribir_atomico(vault_root / ruta_rel, armar_texto_nota(frontmatter, titulo, body_md))


def mover_a_categoria(vault_root: Path, ruta_rel_actual: str, categoria_ruta_nueva: str) -> str:
    """Mueve el archivo a otra carpeta de categoría. Devuelve la nueva ruta relativa."""
    origen = vault_root / ruta_rel_actual
    carpeta_destino = vault_root / categoria_ruta_nueva
    carpeta_destino.mkdir(parents=True, exist_ok=True)
    nombre = origen.name
    destino = carpeta_destino / nombre
    if destino.exists() and destino != origen:
        nombre = nombre_archivo_unico(carpeta_destino, origen.stem)
        destino = carpeta_destino / nombre
    shutil.move(str(origen), str(destino))
    return str(Path(categoria_ruta_nueva) / nombre)


def mover_a_basura(vault_root: Path, ruta_rel_actual: str) -> str:
    """Soft-delete: mueve el .md a 05 - Basura/. Devuelve la nueva ruta relativa."""
    return mover_a_categoria(vault_root, ruta_rel_actual, BASURA_CARPETA)


def crear_carpeta_categoria(vault_root: Path, categoria_ruta: str) -> None:
    (vault_root / categoria_ruta).mkdir(parents=True, exist_ok=True)


def mover_carpeta_categoria(vault_root: Path, ruta_vieja: str, ruta_nueva: str) -> None:
    origen = vault_root / ruta_vieja
    destino = vault_root / ruta_nueva
    if origen == destino:
        return
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(origen), str(destino))


def mover_notas_a_basura_y_borrar_carpeta(vault_root: Path, categoria_ruta: str, rutas_notas: list[str]) -> dict[str, str]:
    """Mueve cada nota de `categoria_ruta` a 05 - Basura/, luego borra la carpeta
    (ya vacía). Devuelve {ruta_vieja: ruta_nueva} para que el llamador actualice SQL."""
    nuevas_rutas = {}
    for ruta in rutas_notas:
        nuevas_rutas[ruta] = mover_a_basura(vault_root, ruta)
    carpeta_abs = vault_root / categoria_ruta
    if carpeta_abs.exists() and carpeta_abs.is_dir():
        try:
            carpeta_abs.rmdir()
        except OSError:
            pass  # quedó algo adentro (ej. subcarpeta) -- no forzar un rm -rf
    return nuevas_rutas


def mover_adjunto(vault_root: Path, origen_abs: Path, nombre: Optional[str] = None) -> str:
    """Mueve un archivo (ya subido a uploads/) a VAULT_ROOT/_adjuntos/. Devuelve
    el nombre de archivo final dentro de _adjuntos/."""
    adjuntos_dir = vault_root / "_adjuntos"
    adjuntos_dir.mkdir(parents=True, exist_ok=True)
    nombre_final = nombre or origen_abs.name
    destino = adjuntos_dir / nombre_final
    if destino.exists() and destino != origen_abs:
        destino = adjuntos_dir / f"{uuid.uuid4().hex}{origen_abs.suffix}"
    shutil.move(str(origen_abs), str(destino))
    return destino.name
