"""Sincronización en vivo de D:\\Boveda -> categorias/hojas en app.db.

Se llama al arrancar FastAPI y al inicio de los GET de Bóveda -- barato porque
salta archivos sin cambios (mtime), igual que el indexador de Milestone 1.
Es una red de seguridad para cambios hechos fuera de la app (a mano en el
explorador, Obsidian, etc.): los movimientos que hace la propia API
(PATCH/DELETE) ya actualizan la fila SQL directo, sin esperar al próximo sync.
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from pathlib import Path

from app.vault import parser
from app.vault.markdown import markdown_a_html, construir_apuntes_html_foto

logger = logging.getLogger("vault_sync")

_ADJUNTOS_DIR = "_adjuntos"
_ROOTS_ESTRUCTURALES = {
    "00 - Sin categorizar", "01 - Proyectos", "02 - Areas",
    "03 - Recursos", "04 - Archivo", "05 - Basura",
}
_DOMINIOS_ESTRUCTURALES = {"Facultad", "Carrera Profesional", "Salud", "Desarrollo Personal"}
_PREFIJO_NUMERICO_RE = re.compile(r"^\d+\s*-\s*")
_IMG_ADJUNTO_RE = re.compile(r"!\[[^\]]*\]\(_adjuntos/([^)]+)\)")


def _es_estructural(rel_path: Path) -> bool:
    parts = rel_path.parts
    if len(parts) == 1:
        return parts[0] in _ROOTS_ESTRUCTURALES
    if len(parts) == 2 and parts[0] in ("02 - Areas", "03 - Recursos"):
        return parts[1] in _DOMINIOS_ESTRUCTURALES
    return False


def _nombre_desde_carpeta(nombre_carpeta: str) -> str:
    return _PREFIJO_NUMERICO_RE.sub("", nombre_carpeta).strip() or nombre_carpeta


def _iter_carpetas(vault_root: Path):
    carpetas = [
        p for p in vault_root.rglob("*")
        if p.is_dir() and p.name != _ADJUNTOS_DIR and _ADJUNTOS_DIR not in p.relative_to(vault_root).parts
    ]
    carpetas.sort(key=lambda p: len(p.relative_to(vault_root).parts))
    return carpetas


def _iter_notas(vault_root: Path):
    for path in sorted(vault_root.rglob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        if _ADJUNTOS_DIR in path.relative_to(vault_root).parts:
            continue
        yield path


def _derivar_contenido(nota: parser.NotaParseada, body: str) -> str:
    """`contenido` es el título para texto/foto (igual que escribe crud.py al
    crear/editar), y la URL para link."""
    if nota.tipo == "link" and nota.url:
        return nota.url
    return nota.titulo


def _imagen_ref_del_cuerpo(body: str) -> str | None:
    m = _IMG_ADJUNTO_RE.search(body)
    return m.group(0) if m else None


def _cuerpo_sin_titulo(body: str) -> str:
    """Cuerpo después del H1 (si lo hay), para convertir a `apuntes` HTML."""
    m = parser.H1_RE.search(body)
    if not m:
        return body.strip()
    resto = body[m.end():]
    resto = _IMG_ADJUNTO_RE.sub("", resto, count=1)  # la imagen del adjunto no es "apuntes"
    return resto.strip()


def sincronizar_vault(vault_root: Path, conn: sqlite3.Connection) -> dict:
    cursor = conn.cursor()
    stats = dict(carpetas=0, notas=0, notas_con_error=0, carpetas_borradas=0, notas_borradas=0)

    if not vault_root.exists():
        logger.warning("VAULT_ROOT %s no existe -- sync omitido", vault_root)
        return stats

    # --- Categorías: upsert por ruta, padres antes que hijos ---
    existentes = {row[0]: row[1] for row in cursor.execute("SELECT ruta, id FROM categorias WHERE ruta IS NOT NULL")}
    rutas_vistas: set[str] = set()
    ruta_a_id: dict[str, int] = dict(existentes)

    for carpeta in _iter_carpetas(vault_root):
        rel = carpeta.relative_to(vault_root)
        rel_str = str(rel)
        rutas_vistas.add(rel_str)
        nombre = _nombre_desde_carpeta(carpeta.name)
        padre_ruta = str(rel.parent) if rel.parent != Path(".") else None
        padre_id = ruta_a_id.get(padre_ruta) if padre_ruta else None
        estructural = 1 if _es_estructural(rel) else 0

        if rel_str in existentes:
            cursor.execute(
                "UPDATE categorias SET nombre = ?, padre_id = ?, ruta = ?, estructural = ? WHERE id = ?",
                (nombre, padre_id, rel_str, estructural, existentes[rel_str]),
            )
        else:
            cursor.execute(
                "INSERT INTO categorias (nombre, padre_id, ruta, estructural) VALUES (?, ?, ?, ?)",
                (nombre, padre_id, rel_str, estructural),
            )
            ruta_a_id[rel_str] = cursor.lastrowid
        stats["carpetas"] += 1

    # --- Notas: upsert por vault_id ---
    existentes_hojas = {
        row[0]: (row[1], row[2])  # vault_id -> (id, mtime)
        for row in cursor.execute("SELECT vault_id, id, mtime FROM hojas WHERE vault_id IS NOT NULL")
    }
    vault_ids_vistos: set[str] = set()

    for path in _iter_notas(vault_root):
        rel = path.relative_to(vault_root)
        rel_str = str(rel)
        st = path.stat()

        try:
            raw_text = path.read_text(encoding="utf-8")
            data, _ = parser.split_frontmatter(raw_text)
            vault_id_previo = data.get("id") if data else None
        except Exception as exc:
            logger.error("Error leyendo frontmatter de %s: %s", path, exc)
            stats["notas_con_error"] += 1
            continue

        prev = existentes_hojas.get(vault_id_previo) if vault_id_previo else None
        if prev is not None and prev[1] == st.st_mtime:
            vault_ids_vistos.add(vault_id_previo)
            continue

        try:
            nota, _id_asignado = parser.parse_nota(path, dry_run=False, logger=logger)
            _, body = parser.split_frontmatter(path.read_text(encoding="utf-8"))
            contenido = _derivar_contenido(nota, body)
        except Exception as exc:
            logger.error("Error procesando %s: %s", path, exc)
            stats["notas_con_error"] += 1
            continue
        tipo = nota.tipo if nota.tipo in parser.TIPOS_VALIDOS else "texto"
        md_apuntes = _cuerpo_sin_titulo(body)
        if tipo == "foto":
            apuntes_html = construir_apuntes_html_foto(_imagen_ref_del_cuerpo(body), md_apuntes)
        else:
            apuntes_html = markdown_a_html(md_apuntes)
        fecha_creado = nota.creado_en or parser.mtime_iso(path)
        fecha_actualizado = nota.actualizado_en or fecha_creado
        categoria_ruta = str(rel.parent)
        categoria_id = ruta_a_id.get(categoria_ruta)
        if categoria_id is None:
            logger.error("%s: carpeta %s sin categoría sincronizada -- se ignora", path, categoria_ruta)
            stats["notas_con_error"] += 1
            continue

        vault_ids_vistos.add(nota.id)
        cursor.execute(
            """
            INSERT INTO hojas
                (contenido, fecha, categoria_id, tipo, apuntes, lugar, latitud, longitud,
                 icono, fecha_actualizado, vault_id, ruta, mtime)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(vault_id) DO UPDATE SET
                contenido=excluded.contenido, fecha=excluded.fecha, categoria_id=excluded.categoria_id,
                tipo=excluded.tipo, apuntes=excluded.apuntes, lugar=excluded.lugar,
                latitud=excluded.latitud, longitud=excluded.longitud, icono=excluded.icono,
                fecha_actualizado=excluded.fecha_actualizado, ruta=excluded.ruta, mtime=excluded.mtime
            """,
            (
                contenido, fecha_creado, categoria_id, tipo, apuntes_html,
                nota.lugar, nota.latitud, nota.longitud, nota.icono,
                fecha_actualizado, nota.id, rel_str, st.st_mtime,
            ),
        )
        stats["notas"] += 1

    # --- Borrar lo que ya no existe en disco (borradas/renombradas fuera de la app) ---
    ids_hojas_borrar = [
        row[1] for vid, row in existentes_hojas.items() if vid not in vault_ids_vistos
    ]
    if ids_hojas_borrar:
        placeholders = ",".join("?" * len(ids_hojas_borrar))
        cursor.execute(f"DELETE FROM hojas WHERE id IN ({placeholders})", ids_hojas_borrar)
        stats["notas_borradas"] = len(ids_hojas_borrar)

    rutas_categoria_borrar = [r for r in existentes if r not in rutas_vistas]
    if rutas_categoria_borrar:
        placeholders = ",".join("?" * len(rutas_categoria_borrar))
        cursor.execute(f"DELETE FROM categorias WHERE ruta IN ({placeholders})", rutas_categoria_borrar)
        stats["carpetas_borradas"] = len(rutas_categoria_borrar)

    conn.commit()
    return stats
