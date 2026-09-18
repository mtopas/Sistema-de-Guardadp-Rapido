from datetime import datetime, date, timedelta
import calendar as _calendar
import json
import os
import re
import sqlite3
import uuid
from pathlib import Path
from typing import Optional

from app.config import DEBUG, VAULT_ROOT
from app.db.database import get_connection
from app.vault import parser as vault_parser
from app.vault import sync as vault_sync
from app.vault import writer as vault_writer
from app.vault.markdown import html_a_markdown, markdown_a_html, construir_apuntes_html_foto

_TAG_RE = re.compile(r"#([a-zA-Z]\w*)")
_TAG_HTML_STRIP_RE = re.compile(r"<[^>]*>")
_IMG_ADJUNTO_RE = re.compile(r"!\[[^\]]*\]\(_adjuntos/[^)]+\)")
_UPLOAD_PATH_RE = re.compile(r"/uploads/([^\s\"')]+)")
_LEADING_IMG_TAG_RE = re.compile(r"^\s*<img\b[^>]*/?>", re.IGNORECASE)


def _extraer_tags(contenido: str, apuntes_html: Optional[str]) -> list:
    texto = (contenido or "") + " " + _TAG_HTML_STRIP_RE.sub(" ", apuntes_html or "")
    vistos, tags = set(), []
    for m in _TAG_RE.findall(texto):
        low = m.lower()
        if low not in vistos:
            vistos.add(low)
            tags.append(low)
    return tags


def _bajo_prefijo(ruta: str, prefijo: str) -> bool:
    # "/" siempre, nunca os.sep -- `ruta` se guarda con posix-style forward
    # slash (ver app/vault/sync.py, fix 2026-09-16); en Windows os.sep es
    # "\", así que esta comparación nunca matcheaba una categoría hija real.
    return ruta == prefijo or ruta.startswith(prefijo + "/")


def _extraer_upload_filename(contenido: Optional[str], apuntes_html: Optional[str]) -> Optional[str]:
    """Encuentra el archivo en uploads/ para una hoja tipo=foto sin importar
    si vino por el flujo del frontend (contenido=URL de /uploads/) o del bot
    (contenido=título, apuntes trae un <img src="…/uploads/…"> como primera
    etiqueta -- ver mybot/bot.py handle_photo/STEP_PHOTO_TITLE)."""
    for texto in (contenido or "", apuntes_html or ""):
        m = _UPLOAD_PATH_RE.search(texto)
        if m:
            return m.group(1)
    return None


def sincronizar_vault_si_hace_falta() -> None:
    conn = get_connection()
    try:
        vault_sync.sincronizar_vault(VAULT_ROOT, conn)
    finally:
        conn.close()


def _parse_preview(raw):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _hoja_dict(f):
    return {
        "id": f[0],
        "contenido": f[1],
        "fecha": f[2],
        "categoria_id": f[3],
        "categoria_nombre": f[4],
        "tipo": f[5],
        "apuntes": f[6],
        "lugar": f[7],
        "latitud": f[8],
        "longitud": f[9],
        "fecha_recordatorio": f[10],
        "icono": f[11] if len(f) > 11 else None,
        "fecha_actualizado": f[12] if len(f) > 12 else None,
        "link_preview": _parse_preview(f[13]) if len(f) > 13 else None,
    }


# --- Categorias ---
# Las categorías representan carpetas reales de D:\Boveda. `ruta` es la carpeta
# relativa (única); `estructural=1` marca las 6 raíces del árbol PARA + los
# dominios fijos de 02 - Areas/03 - Recursos -- nunca se borran ni renombran/
# mueven por esta vía (decisión 2026-09-11, Milestone 2).

def _categoria_row_dict(row) -> dict:
    return {"id": row[0], "nombre": row[1], "padre_id": row[2], "icono": row[3], "color": row[4]}


def _categoria_descendant_ids(cursor, categoria_id: int) -> list:
    ids = []
    stack = [categoria_id]
    while stack:
        pid = stack.pop()
        cursor.execute("SELECT id FROM categorias WHERE padre_id = ?", (pid,))
        for (cid,) in cursor.fetchall():
            ids.append(cid)
            stack.append(cid)
    return ids


def _reescribir_rutas_descendientes(cursor, categoria_id: int, ruta_vieja: str, ruta_nueva: str) -> None:
    for did in _categoria_descendant_ids(cursor, categoria_id):
        cursor.execute("SELECT ruta FROM categorias WHERE id = ?", (did,))
        r = cursor.fetchone()
        if r and r[0] and _bajo_prefijo(r[0], ruta_vieja):
            cursor.execute(
                "UPDATE categorias SET ruta = ? WHERE id = ?",
                (ruta_nueva + r[0][len(ruta_vieja):], did),
            )
    ids_categorias = [categoria_id] + _categoria_descendant_ids(cursor, categoria_id)
    placeholders = ",".join("?" * len(ids_categorias))
    cursor.execute(f"SELECT id, ruta FROM hojas WHERE categoria_id IN ({placeholders})", ids_categorias)
    for hoja_id, ruta_hoja in cursor.fetchall():
        if ruta_hoja and _bajo_prefijo(ruta_hoja, ruta_vieja):
            cursor.execute(
                "UPDATE hojas SET ruta = ? WHERE id = ?",
                (ruta_nueva + ruta_hoja[len(ruta_vieja):], hoja_id),
            )


def crear_categoria(
    nombre: str,
    padre_id: Optional[int] = None,
    icono: Optional[str] = None,
    color: Optional[str] = None,
) -> Optional[int]:
    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    inherited_color = color
    padre_ruta = None
    if padre_id is not None:
        cursor.execute("SELECT ruta, color FROM categorias WHERE id = ?", (padre_id,))
        parent_row = cursor.fetchone()
        if parent_row is None:
            conn.close()
            return None
        padre_ruta = parent_row[0]
        if inherited_color is None and parent_row[1]:
            inherited_color = parent_row[1]

    nombre_limpio = nombre.strip()
    carpeta = vault_writer.sanitize_nombre(nombre_limpio)
    # .as_posix(), no str() -- mismo fix que app/vault/sync.py (2026-09-16):
    # str(Path(...)) usa el separador nativo del SO ("\" en Windows) aunque
    # padre_ruta ya venga en formato posix desde la DB.
    ruta = (Path(padre_ruta) / carpeta).as_posix() if padre_ruta else carpeta
    cursor.execute("SELECT 1 FROM categorias WHERE ruta = ?", (ruta,))
    if cursor.fetchone() is not None or (VAULT_ROOT / ruta).exists():
        conn.close()
        return None
    try:
        vault_writer.crear_carpeta_categoria(VAULT_ROOT, ruta)
        cursor.execute(
            "INSERT INTO categorias (nombre, padre_id, icono, color, ruta, estructural) VALUES (?, ?, ?, ?, ?, 0)",
            (nombre_limpio, padre_id, icono, inherited_color, ruta),
        )
        cid = cursor.lastrowid
        conn.commit()
        if DEBUG:
            print(f"crear_categoria: id={cid} nombre={nombre} padre_id={padre_id} ruta={ruta}")
        return cid
    except sqlite3.IntegrityError:
        conn.rollback()
        return None
    finally:
        conn.close()


def obtener_categorias():
    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre, padre_id, icono, color FROM categorias ORDER BY id ASC")
    filas = cursor.fetchall()
    conn.close()
    return [_categoria_row_dict(f) for f in filas]


def categoria_existe(categoria_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM categorias WHERE id = ?", (categoria_id,))
    ok = cursor.fetchone() is not None
    conn.close()
    return ok


def eliminar_categoria(categoria_id: int, forzar: bool = False) -> str:
    """Devuelve 'ok' | 'no_encontrada' | 'estructural' | 'tiene_hojas'."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ruta, estructural FROM categorias WHERE id = ?", (categoria_id,))
    row = cursor.fetchone()
    if row is None:
        conn.close()
        return "no_encontrada"
    ruta, estructural = row
    if estructural:
        conn.close()
        return "estructural"

    cursor.execute("SELECT ruta FROM hojas WHERE categoria_id = ?", (categoria_id,))
    rutas_hojas = [r[0] for r in cursor.fetchall() if r[0]]
    if rutas_hojas and not forzar:
        conn.close()
        return "tiene_hojas"

    if rutas_hojas:
        nuevas = vault_writer.mover_notas_a_basura_y_borrar_carpeta(VAULT_ROOT, ruta, rutas_hojas)
        cursor.execute("SELECT id FROM categorias WHERE ruta = ?", (vault_writer.BASURA_CARPETA,))
        basura_row = cursor.fetchone()
        basura_id = basura_row[0] if basura_row else None
        for ruta_vieja, ruta_nueva in nuevas.items():
            cursor.execute(
                "UPDATE hojas SET ruta = ?, categoria_id = COALESCE(?, categoria_id) WHERE ruta = ?",
                (ruta_nueva, basura_id, ruta_vieja),
            )
    else:
        carpeta_abs = VAULT_ROOT / ruta
        if carpeta_abs.exists() and carpeta_abs.is_dir():
            try:
                carpeta_abs.rmdir()
            except OSError:
                pass

    cursor.execute("DELETE FROM categorias WHERE id = ?", (categoria_id,))
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"eliminar_categoria: id={categoria_id} forzar={forzar} hojas_movidas={len(rutas_hojas)}")
    return "ok"


# --- Hojas ---
# Cada hoja es un .md real en D:\Boveda. `hojas.id` (INTEGER, autoincrement)
# sigue siendo el id que ya usan frontend/bot; `vault_id`/`ruta`/`mtime` son el
# vínculo con el archivo -- nunca se exponen en la API. Regla dura: el archivo
# se escribe/mueve primero, la fila se actualiza después (nunca al revés).

_HOJA_SELECT = """
    SELECT h.id, h.contenido, h.fecha, h.categoria_id, c.nombre,
           h.tipo, h.apuntes, h.lugar, h.latitud, h.longitud, h.fecha_recordatorio,
           h.icono, h.fecha_actualizado, h.link_preview
    FROM hojas h
    JOIN categorias c ON c.id = h.categoria_id
"""

_UPDATABLE_HOJA = frozenset({"contenido", "categoria_id", "tipo", "apuntes", "icono", "lugar"})


def crear_hoja(
    contenido: str,
    categoria_id: int,
    tipo: str = "texto",
    apuntes: Optional[str] = None,
    lugar: Optional[str] = None,
    latitud: Optional[float] = None,
    longitud: Optional[float] = None,
    fecha_recordatorio: Optional[str] = None,  # aceptado por compat de firma; sin uso real, se descarta (ver Milestone 2)
    icono: Optional[str] = None,
    link_preview: Optional[dict] = None,
    origen: str = "app",
) -> int:
    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ruta FROM categorias WHERE id = ?", (categoria_id,))
    cat_row = cursor.fetchone()
    if cat_row is None or not cat_row[0]:
        conn.close()
        raise ValueError(f"categoria_id {categoria_id} sin carpeta sincronizada en el vault")
    categoria_ruta = cat_row[0]

    vault_id = str(uuid.uuid4())
    ahora = vault_parser.now_iso()
    titulo = (contenido or "").strip() or "Sin título"

    # Fotos: dos convenciones coexisten hoy (ninguna se toca, se detectan las dos)
    #   - Frontend (CaptureModal): contenido = URL de /uploads/, apuntes vacío.
    #   - Bot (mybot/bot.py handle_photo): contenido = título, apuntes trae un
    #     <img src="URL absoluta de /uploads/…"> como primera etiqueta.
    # En el archivo, la foto queda unificada como imagen Markdown en el cuerpo;
    # `apuntes_final_html` reconstruye el <img> líder que RightPanel.jsx espera.
    imagen_ref = None
    apuntes_sin_img = apuntes
    if tipo == "foto":
        nombre_upload = _extraer_upload_filename(contenido, apuntes)
        contenido_es_upload_path = bool(contenido and contenido.startswith("/uploads/"))
        if nombre_upload:
            from app.paths import uploads_directory
            origen_abs = uploads_directory() / nombre_upload
            if origen_abs.exists():
                nombre_final = vault_writer.mover_adjunto(VAULT_ROOT, origen_abs)
                if contenido_es_upload_path:
                    titulo = "Foto"
                    contenido = f"/adjuntos/{nombre_final}"
                else:
                    titulo = (contenido or "").strip() or "Foto"
                imagen_ref = f"![{titulo}](_adjuntos/{nombre_final})"
                apuntes_sin_img = _LEADING_IMG_TAG_RE.sub("", apuntes or "", count=1)

    md_apuntes = html_a_markdown(apuntes_sin_img) if apuntes_sin_img else ""
    body_parts = [imagen_ref] if imagen_ref else []
    if md_apuntes:
        body_parts.append(md_apuntes)
    body_md = "\n\n".join(body_parts)

    frontmatter = {
        "id": vault_id, "tipo": tipo, "creado_en": ahora, "actualizado_en": ahora,
        "origen": origen, "tags": _extraer_tags(contenido, apuntes),
    }
    if tipo == "link" and contenido:
        frontmatter["url"] = contenido.strip()
    if icono:
        frontmatter["icono"] = icono
    if lugar:
        frontmatter["lugar"] = lugar
    if latitud is not None:
        frontmatter["latitud"] = latitud
    if longitud is not None:
        frontmatter["longitud"] = longitud

    ruta_rel = vault_writer.crear_nota(VAULT_ROOT, categoria_ruta, titulo, frontmatter, body_md)
    mtime = (VAULT_ROOT / ruta_rel).stat().st_mtime
    apuntes_final_html = (
        construir_apuntes_html_foto(imagen_ref, md_apuntes) if tipo == "foto"
        else (markdown_a_html(md_apuntes) if md_apuntes else "")
    )
    preview_json = json.dumps(link_preview) if link_preview else None

    cursor.execute(
        """
        INSERT INTO hojas
            (contenido, fecha, categoria_id, tipo, apuntes, lugar, latitud, longitud,
             icono, fecha_actualizado, link_preview, vault_id, ruta, mtime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (contenido, ahora, categoria_id, tipo, apuntes_final_html, lugar, latitud, longitud,
         icono, ahora, preview_json, vault_id, ruta_rel, mtime),
    )
    conn.commit()
    hid = cursor.lastrowid
    conn.close()
    if DEBUG:
        print(f"crear_hoja: id={hid} tipo={tipo} categoria_id={categoria_id} ruta={ruta_rel}")
    return hid


def obtener_hojas():
    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT h.id, h.contenido, h.fecha, h.categoria_id, c.nombre,
               h.tipo, h.apuntes, h.lugar, h.latitud, h.longitud, h.fecha_recordatorio, h.icono, h.fecha_actualizado, h.link_preview
        FROM hojas h
        JOIN categorias c ON c.id = h.categoria_id
        ORDER BY c.id ASC, h.id ASC
        """
    )
    filas = cursor.fetchall()
    conn.close()
    return [_hoja_dict(f) for f in filas]


def obtener_hoja_por_id(hoja_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT h.id, h.contenido, h.fecha, h.categoria_id, c.nombre,
               h.tipo, h.apuntes, h.lugar, h.latitud, h.longitud, h.fecha_recordatorio, h.icono, h.fecha_actualizado, h.link_preview
        FROM hojas h
        JOIN categorias c ON c.id = h.categoria_id
        WHERE h.id = ?
        """,
        (hoja_id,),
    )
    fila = cursor.fetchone()
    conn.close()
    if fila is None:
        return None
    return _hoja_dict(fila)


def actualizar_apuntes(hoja_id: int, apuntes: Optional[str]) -> str:
    resultado = actualizar_hoja(hoja_id, {"apuntes": apuntes})
    if DEBUG:
        print(f"actualizar_apuntes: id={hoja_id}")
    return resultado.get("fecha_actualizado") if resultado else datetime.now().isoformat()


def actualizar_icono(hoja_id: int, icono: Optional[str]) -> str:
    resultado = actualizar_hoja(hoja_id, {"icono": icono})
    if DEBUG:
        print(f"actualizar_icono: id={hoja_id} icono={icono}")
    return resultado.get("fecha_actualizado") if resultado else datetime.now().isoformat()


def actualizar_link_preview(hoja_id: int, preview: Optional[dict]):
    conn = get_connection()
    cursor = conn.cursor()
    payload = json.dumps(preview) if preview else None
    cursor.execute("UPDATE hojas SET link_preview = ? WHERE id = ?", (payload, hoja_id))
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"actualizar_link_preview: id={hoja_id}")


def eliminar_hoja(hoja_id: int) -> Optional[str]:
    """Soft-delete: mueve el .md a 05 - Basura/ (decisión Milestone 2 -- coherente
    con la convención del vault, recuperable). Devuelve `contenido` (para el
    cleanup best-effort de /uploads/ legacy en main.py), o None si no existía."""
    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT contenido, ruta FROM hojas WHERE id = ?", (hoja_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    contenido, ruta = row
    if ruta and (VAULT_ROOT / ruta).exists():
        ruta_nueva = vault_writer.mover_a_basura(VAULT_ROOT, ruta)
        nuevo_mtime = (VAULT_ROOT / ruta_nueva).stat().st_mtime
        cursor.execute("SELECT id FROM categorias WHERE ruta = ?", (vault_writer.BASURA_CARPETA,))
        basura_row = cursor.fetchone()
        cursor.execute(
            "UPDATE hojas SET ruta = ?, mtime = ?, categoria_id = COALESCE(?, categoria_id) WHERE id = ?",
            (ruta_nueva, nuevo_mtime, basura_row[0] if basura_row else None, hoja_id),
        )
    else:
        cursor.execute("DELETE FROM hojas WHERE id = ?", (hoja_id,))
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"eliminar_hoja: id={hoja_id} movida_a_basura={bool(ruta)}")
    return contenido


def actualizar_hoja(hoja_id: int, campos: dict) -> Optional[dict]:
    """PATCH genérico: reescribe el .md (y lo mueve si cambia categoria_id)
    antes de actualizar la fila -- mismo criterio que crear_hoja."""
    safe = {k: v for k, v in campos.items() if k in _UPDATABLE_HOJA}
    if not safe:
        return obtener_hoja_por_id(hoja_id)

    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT contenido, categoria_id, tipo, apuntes, icono, lugar, latitud, longitud, "
        "vault_id, ruta, fecha FROM hojas WHERE id = ?",
        (hoja_id,),
    )
    row = cursor.fetchone()
    if row is None:
        conn.close()
        return None
    (contenido_actual, categoria_id_actual, tipo_actual, apuntes_actual, icono_actual,
     lugar_actual, latitud_actual, longitud_actual, vault_id, ruta_actual, creado_en) = row

    if not vault_id or not ruta_actual:
        conn.close()
        return None

    contenido = safe.get("contenido", contenido_actual)
    categoria_id_nuevo = safe.get("categoria_id", categoria_id_actual)
    tipo = safe.get("tipo", tipo_actual)
    apuntes_html = safe.get("apuntes", apuntes_actual)
    icono = safe.get("icono", icono_actual)
    lugar = safe.get("lugar", lugar_actual)

    ruta_abs_actual = VAULT_ROOT / ruta_actual
    origen_existente, url_existente, imagen_ref = "app", None, None
    if ruta_abs_actual.exists():
        try:
            texto_actual = ruta_abs_actual.read_text(encoding="utf-8")
            data_existente, _ = vault_parser.split_frontmatter(texto_actual)
            if data_existente:
                origen_existente = data_existente.get("origen") or "app"
                url_existente = data_existente.get("url")
            m = _IMG_ADJUNTO_RE.search(texto_actual)
            if m:
                imagen_ref = m.group(0)
        except OSError:
            pass

    ruta_rel = ruta_actual
    if categoria_id_nuevo != categoria_id_actual:
        cursor.execute("SELECT ruta FROM categorias WHERE id = ?", (categoria_id_nuevo,))
        cat_row = cursor.fetchone()
        if cat_row is None or not cat_row[0]:
            conn.close()
            return None
        ruta_rel = vault_writer.mover_a_categoria(VAULT_ROOT, ruta_actual, cat_row[0])

    ahora = vault_parser.now_iso()
    titulo = (contenido or "").strip() or "Sin título"
    # RightPanel.jsx re-antepone el <img> líder al guardar apuntes de una hoja
    # foto (ver onUpdate en RightPanel.jsx) -- se saca antes de convertir a MD,
    # la imagen ya vive en `imagen_ref` (leída del archivo más arriba).
    apuntes_sin_img = apuntes_html
    if tipo == "foto" and apuntes_sin_img:
        apuntes_sin_img = _LEADING_IMG_TAG_RE.sub("", apuntes_sin_img, count=1)
    md_apuntes = html_a_markdown(apuntes_sin_img) if apuntes_sin_img else ""
    body_parts = [imagen_ref] if imagen_ref else []
    if md_apuntes:
        body_parts.append(md_apuntes)
    body_md = "\n\n".join(body_parts)

    frontmatter = {
        "id": vault_id, "tipo": tipo, "creado_en": creado_en or ahora, "actualizado_en": ahora,
        "origen": origen_existente, "tags": _extraer_tags(contenido, apuntes_html),
    }
    if tipo == "link":
        frontmatter["url"] = contenido or url_existente
    if icono:
        frontmatter["icono"] = icono
    if lugar:
        frontmatter["lugar"] = lugar
    if latitud_actual is not None:
        frontmatter["latitud"] = latitud_actual
    if longitud_actual is not None:
        frontmatter["longitud"] = longitud_actual

    vault_writer.actualizar_nota(VAULT_ROOT, ruta_rel, titulo, frontmatter, body_md)
    nuevo_mtime = (VAULT_ROOT / ruta_rel).stat().st_mtime
    apuntes_final_html = (
        construir_apuntes_html_foto(imagen_ref, md_apuntes) if tipo == "foto"
        else (markdown_a_html(md_apuntes) if md_apuntes else "")
    )

    sets = {
        "contenido": contenido, "categoria_id": categoria_id_nuevo, "tipo": tipo,
        "apuntes": apuntes_final_html, "icono": icono, "lugar": lugar,
        "fecha_actualizado": ahora, "ruta": ruta_rel, "mtime": nuevo_mtime,
    }
    cols = ", ".join(f"{k} = ?" for k in sets)
    cursor.execute(f"UPDATE hojas SET {cols} WHERE id = ?", list(sets.values()) + [hoja_id])
    conn.commit()
    cursor.execute(_HOJA_SELECT + " WHERE h.id = ?", (hoja_id,))
    result = cursor.fetchone()
    conn.close()
    return _hoja_dict(result) if result else None


def buscar_hojas(q: Optional[str] = None, tipo: Optional[str] = None,
                 categoria_id: Optional[int] = None) -> list:
    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    where = []
    params = []
    if q:
        where.append("(h.contenido LIKE ? OR h.apuntes LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    if tipo:
        where.append("h.tipo = ?")
        params.append(tipo)
    if categoria_id:
        where.append("h.categoria_id = ?")
        params.append(categoria_id)
    sql = _HOJA_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY h.fecha DESC"
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()
    return [_hoja_dict(r) for r in rows]


def obtener_hojas_recientes(limit: int = 20) -> list:
    sincronizar_vault_si_hace_falta()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(_HOJA_SELECT + " ORDER BY h.fecha_actualizado DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [_hoja_dict(r) for r in rows]


def categoria_tiene_hojas(categoria_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM hojas WHERE categoria_id = ? LIMIT 1", (categoria_id,))
    has = cursor.fetchone() is not None
    conn.close()
    return has


def actualizar_categoria(categoria_id: int, campos: dict) -> Optional[dict]:
    """Renombrar/mover mueve la carpeta real primero (bloqueado para carpetas
    estructurales -- si no, se podría renombrar una raíz del árbol PARA y
    perder la protección de borrado que depende de reconocer su nombre)."""
    safe = {k: v for k, v in campos.items() if k in {"nombre", "padre_id", "icono", "color"}}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ruta, padre_id, estructural, nombre FROM categorias WHERE id = ?", (categoria_id,))
    row = cursor.fetchone()
    if row is None:
        conn.close()
        return None
    ruta_actual, padre_actual, estructural, nombre_actual = row

    mueve_o_renombra = "nombre" in safe or "padre_id" in safe
    if mueve_o_renombra and estructural:
        conn.close()
        return None

    try:
        ruta_nueva = ruta_actual
        if mueve_o_renombra and ruta_actual:
            nuevo_nombre = (safe.get("nombre") or nombre_actual).strip()
            nuevo_padre_id = safe["padre_id"] if "padre_id" in safe else padre_actual
            padre_ruta = None
            if nuevo_padre_id is not None:
                cursor.execute("SELECT ruta FROM categorias WHERE id = ?", (nuevo_padre_id,))
                prow = cursor.fetchone()
                if prow is None:
                    conn.close()
                    return None
                padre_ruta = prow[0]
            carpeta = vault_writer.sanitize_nombre(nuevo_nombre)
            # .as_posix() -- mismo fix que crear_categoria()/app/vault/sync.py
            ruta_nueva = (Path(padre_ruta) / carpeta).as_posix() if padre_ruta else carpeta
            if ruta_nueva != ruta_actual:
                cursor.execute("SELECT 1 FROM categorias WHERE ruta = ? AND id != ?", (ruta_nueva, categoria_id))
                if cursor.fetchone() is not None:
                    conn.close()
                    return None
                vault_writer.mover_carpeta_categoria(VAULT_ROOT, ruta_actual, ruta_nueva)
                _reescribir_rutas_descendientes(cursor, categoria_id, ruta_actual, ruta_nueva)

        color_val = safe.pop("color", None)
        if color_val is not None and str(color_val).strip():
            color_val = str(color_val).strip()
            ids = [categoria_id] + _categoria_descendant_ids(cursor, categoria_id)
            for cid in ids:
                cursor.execute("UPDATE categorias SET color = ? WHERE id = ?", (color_val, cid))
            if DEBUG:
                print(f"actualizar_categoria: color={color_val} en ids={ids}")

        sets = dict(safe)
        if mueve_o_renombra:
            sets["ruta"] = ruta_nueva
        if sets:
            cols = ", ".join(f"{k} = ?" for k in sets)
            cursor.execute(f"UPDATE categorias SET {cols} WHERE id = ?", list(sets.values()) + [categoria_id])
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        conn.close()
        return None
    cursor.execute(
        "SELECT id, nombre, padre_id, icono, color FROM categorias WHERE id = ?",
        (categoria_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return _categoria_row_dict(row)


# ---------------------------------------------------------------------------
# Finanzas — Cuentas
# ---------------------------------------------------------------------------

def fin_obtener_cuentas():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, nombre, tipo, color, initials, saldo_ars, saldo_usd FROM fin_cuentas ORDER BY tipo, id"
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"id": r[0], "name": r[1], "tipo": r[2], "color": r[3], "initials": r[4], "ars": r[5], "usd": r[6]}
        for r in rows
    ]


def fin_obtener_o_crear_categoria_ajuste(cursor) -> int:
    cursor.execute("SELECT id FROM fin_categorias WHERE nombre = 'Ajuste' LIMIT 1")
    row = cursor.fetchone()
    if row:
        return row[0]
    cursor.execute(
        "INSERT INTO fin_categorias (nombre, color, tipo) VALUES ('Ajuste', NULL, 'both')"
    )
    return cursor.lastrowid


def fin_crear_saldos_iniciales(
    cursor,
    cuenta_id: int,
    saldo_ars: float = 0,
    saldo_usd: float = 0,
) -> None:
    """Registra saldo inicial como movimientos (ingreso / categoría Ajuste), no como piso manual."""
    from datetime import date

    cat_id = fin_obtener_o_crear_categoria_ajuste(cursor)
    fecha = date.today().isoformat()
    if saldo_ars and float(saldo_ars) > 0:
        monto = float(saldo_ars)
        cursor.execute(
            """INSERT INTO fin_movimientos
               (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, audit)
               VALUES (?, ?, 'income', 'Saldo inicial', NULL, ?, NULL, ?, 'ARS', NULL, 0)""",
            (fecha, monto, cuenta_id, cat_id),
        )
        _fin_ajustar_saldo_cuenta(cursor, cuenta_id, monto, 0.0)
    if saldo_usd and float(saldo_usd) > 0:
        monto = float(saldo_usd)
        cursor.execute(
            """INSERT INTO fin_movimientos
               (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, audit)
               VALUES (?, ?, 'income', 'Saldo inicial (USD)', NULL, ?, NULL, ?, 'USD', NULL, 0)""",
            (fecha, monto, cuenta_id, cat_id),
        )
        _fin_ajustar_saldo_cuenta(cursor, cuenta_id, 0.0, monto)


def fin_crear_cuenta(nombre: str, tipo: str = "wallet", color: Optional[str] = None,
                     initials: Optional[str] = None, saldo_ars: float = 0, saldo_usd: float = 0) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO fin_cuentas (nombre, tipo, color, initials, saldo_ars, saldo_usd) VALUES (?, ?, ?, ?, 0, 0)",
        (nombre.strip(), tipo, color, initials),
    )
    cid = cursor.lastrowid
    if float(saldo_ars or 0) > 0 or float(saldo_usd or 0) > 0:
        fin_crear_saldos_iniciales(cursor, cid, saldo_ars, saldo_usd)
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"fin_crear_cuenta: id={cid} nombre={nombre}")
    return cid


def fin_eliminar_cuenta(cuenta_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fin_cuentas WHERE id = ?", (cuenta_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def fin_editar_cuenta(cuenta_id: int, nombre: str, tipo: str, color: Optional[str], initials: Optional[str]) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE fin_cuentas SET nombre = ?, tipo = ?, color = ?, initials = ? WHERE id = ?",
        (nombre.strip(), tipo, color, initials, cuenta_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    if updated:
        cursor.execute(
            "SELECT id, nombre, tipo, color, initials, saldo_ars, saldo_usd FROM fin_cuentas WHERE id = ?",
            (cuenta_id,),
        )
        r = cursor.fetchone()
        conn.close()
        return {"id": r[0], "name": r[1], "tipo": r[2], "color": r[3], "initials": r[4], "ars": r[5], "usd": r[6]}
    conn.close()
    return None


def fin_actualizar_cuenta_saldo(cuenta_id: int, saldo_ars: float, saldo_usd: float) -> Optional[dict]:
    """Obsoleto: los saldos se derivan de movimientos. Usar fin_recalcular_saldos_cuentas."""
    _ = cuenta_id, saldo_ars, saldo_usd
    fin_recalcular_saldos_cuentas()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, nombre, tipo, color, initials, saldo_ars, saldo_usd FROM fin_cuentas WHERE id = ?",
        (cuenta_id,),
    )
    r = cursor.fetchone()
    conn.close()
    if not r:
        return None
    return {"id": r[0], "name": r[1], "tipo": r[2], "color": r[3], "initials": r[4], "ars": r[5], "usd": r[6]}


def fin_buscar_cuenta_por_nombre(nombre: str) -> Optional[int]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM fin_cuentas WHERE nombre = ? LIMIT 1", (nombre,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Finanzas — Categorias
# ---------------------------------------------------------------------------

def _fin_cat_dict(r) -> dict:
    return {
        "id": r[0],
        "name": r[1],
        "color": r[2],
        "tipo": r[3],
        "oculta": bool(r[4]) if len(r) > 4 else False,
        "objetivo_id": r[5] if len(r) > 5 else None,
    }


def fin_obtener_categorias(include_ocultas: bool = False):
    conn = get_connection()
    cursor = conn.cursor()
    sql = "SELECT id, nombre, color, tipo, oculta, objetivo_id FROM fin_categorias"
    if not include_ocultas:
        sql += " WHERE oculta = 0"
    sql += " ORDER BY tipo, id"
    cursor.execute(sql)
    rows = cursor.fetchall()
    conn.close()
    return [_fin_cat_dict(r) for r in rows]


def fin_crear_categoria(nombre: str, color: Optional[str] = None, tipo: str = "expense") -> Optional[int]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO fin_categorias (nombre, color, tipo) VALUES (?, ?, ?)",
            (nombre.strip(), color, tipo),
        )
        cid = cursor.lastrowid
        conn.commit()
        conn.close()
        if DEBUG:
            print(f"fin_crear_categoria: id={cid} nombre={nombre}")
        return cid
    except sqlite3.IntegrityError:
        conn.close()
        return None


FIN_CATEGORIAS_SISTEMA = frozenset({"Transferencia", "Ajuste", "FIRE"})
FIN_CATEGORIAS_RESERVADAS = FIN_CATEGORIAS_SISTEMA
OBJETIVO_EMERGENCIA_NOMBRE = "Fondo de emergencia"
FIN_EMERGENCIA_OBJETIVO_DESHABILITADO = "fin_emergencia_objetivo_deshabilitado"


def _fin_vincular_categoria_objetivo(cursor, objetivo_id: int, nombre: str) -> int:
    nombre = nombre.strip()
    cursor.execute("SELECT id FROM fin_categorias WHERE objetivo_id = ?", (objetivo_id,))
    row = cursor.fetchone()
    if row:
        cursor.execute(
            "UPDATE fin_categorias SET nombre = ?, oculta = 0, tipo = 'both' WHERE id = ?",
            (nombre, row[0]),
        )
        return row[0]
    cursor.execute("SELECT id FROM fin_categorias WHERE nombre = ?", (nombre,))
    by_name = cursor.fetchone()
    if by_name:
        cursor.execute(
            "UPDATE fin_categorias SET objetivo_id = ?, oculta = 0, tipo = 'both' WHERE id = ?",
            (objetivo_id, by_name[0]),
        )
        return by_name[0]
    cursor.execute(
        """INSERT INTO fin_categorias (nombre, color, tipo, oculta, objetivo_id)
           VALUES (?, NULL, 'both', 0, ?)""",
        (nombre, objetivo_id),
    )
    return cursor.lastrowid


def fin_categoria_es_protegida(cat_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT nombre, objetivo_id FROM fin_categorias WHERE id = ?",
        (cat_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return True
    if row[1] is not None:
        return True
    return row[0] in FIN_CATEGORIAS_SISTEMA


def fin_contar_movimientos_categoria(cat_id: int) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM fin_movimientos WHERE categoria_id = ?", (cat_id,))
    n = cursor.fetchone()[0]
    conn.close()
    return int(n or 0)


def fin_eliminar_categoria(cat_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nombre FROM fin_categorias WHERE id = ?", (cat_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    cursor.execute("SELECT objetivo_id FROM fin_categorias WHERE id = ?", (cat_id,))
    obj_row = cursor.fetchone()
    if obj_row and obj_row[0] is not None:
        conn.close()
        return False
    if row[0] in FIN_CATEGORIAS_SISTEMA:
        conn.close()
        return False
    if fin_contar_movimientos_categoria(cat_id) > 0:
        conn.close()
        return False
    try:
        cursor.execute("DELETE FROM fin_categorias WHERE id = ?", (cat_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return deleted
    except sqlite3.IntegrityError:
        conn.rollback()
        conn.close()
        return False


def fin_buscar_categoria_por_nombre(nombre: str) -> Optional[int]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM fin_categorias WHERE nombre = ? LIMIT 1", (nombre,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Finanzas — Movimientos
# ---------------------------------------------------------------------------

def _mov_dict(r) -> dict:
    return {
        "id":               r[0],
        "fecha":            r[1],
        "monto":            r[2],
        "tipo":             r[3],
        "descripcion":      r[4],
        "icono":            r[5],
        "cuenta_id":        r[6],
        "cuenta_nombre":    r[7],
        "cuotas":           r[8],
        "categoria_id":     r[9],
        "categoria_nombre": r[10],
        "moneda":           r[11],
        "nota":             r[12],
        "audit":            bool(r[13]),
    }


def _fin_delta_saldo(
    monto: float,
    moneda: Optional[str],
    tipo: str = "expense",
    categoria_nombre: Optional[str] = None,
) -> tuple:
    """(delta_ars, delta_usd) a sumar en fin_cuentas. Ingresos +, gastos −.

    La categoría Transferencia no cambia este signo: hay que mover saldo entre cuentas
    (gasto en origen, ingreso en destino). Los KPIs de ingreso/gasto excluyen Transferencia en la UI.
    """
    _ = categoria_nombre  # reservado; no altera delta por cuenta
    amt = abs(float(monto))
    signed = amt if (tipo or "expense").lower() == "income" else -amt
    if (moneda or "ARS").upper() == "USD":
        return (0.0, signed)
    return (signed, 0.0)


def _fin_ajustar_saldo_cuenta(cursor, cuenta_id: Optional[int], delta_ars: float, delta_usd: float) -> None:
    if not cuenta_id:
        return
    cursor.execute(
        "UPDATE fin_cuentas SET saldo_ars = COALESCE(saldo_ars, 0) + ?, saldo_usd = COALESCE(saldo_usd, 0) + ? WHERE id = ?",
        (delta_ars, delta_usd, cuenta_id),
    )


def fin_recalcular_saldos_cuentas(cursor=None) -> None:
    """Recalcula saldos desde cero según todos los movimientos (migración / reparación)."""
    own_conn = cursor is None
    conn = get_connection() if own_conn else cursor.connection
    cur = conn.cursor() if own_conn else cursor
    cur.execute("UPDATE fin_cuentas SET saldo_ars = 0, saldo_usd = 0")
    cur.execute(
        """SELECT m.cuenta_id, m.monto, m.moneda, m.tipo, cat.nombre
           FROM fin_movimientos m
           LEFT JOIN fin_categorias cat ON cat.id = m.categoria_id
           WHERE m.cuenta_id IS NOT NULL"""
    )
    for cuenta_id, monto, moneda, tipo, cat_nombre in cur.fetchall():
        d_ars, d_usd = _fin_delta_saldo(monto, moneda, tipo, cat_nombre)
        _fin_ajustar_saldo_cuenta(cur, cuenta_id, d_ars, d_usd)
    if own_conn:
        conn.commit()
        conn.close()
    if DEBUG:
        print("fin_recalcular_saldos_cuentas: done")


def fin_obtener_movimientos(mes: Optional[str] = None):
    conn = get_connection()
    cursor = conn.cursor()
    base = """
        SELECT m.id, m.fecha, m.monto, m.tipo, m.descripcion, m.icono,
               m.cuenta_id, c.nombre,
               m.cuotas, m.categoria_id, cat.nombre,
               m.moneda, m.nota, m.audit
        FROM fin_movimientos m
        LEFT JOIN fin_cuentas c ON c.id = m.cuenta_id
        LEFT JOIN fin_categorias cat ON cat.id = m.categoria_id
    """
    if mes:
        cursor.execute(base + " WHERE strftime('%Y-%m', m.fecha) = ? ORDER BY m.fecha DESC", (mes,))
    else:
        cursor.execute(base + " ORDER BY m.fecha DESC")
    rows = cursor.fetchall()
    conn.close()
    return [_mov_dict(r) for r in rows]


def fin_crear_movimiento(
    fecha: str,
    monto: float,
    tipo: str,
    descripcion: str,
    icono: Optional[str] = None,
    cuenta_id: Optional[int] = None,
    cuotas: Optional[int] = None,
    categoria_id: Optional[int] = None,
    moneda: str = "ARS",
    nota: Optional[str] = None,
    audit: bool = False,
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO fin_movimientos
           (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, audit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, int(audit)),
    )
    mid = cursor.lastrowid
    cat_nombre = None
    if categoria_id:
        cursor.execute("SELECT nombre FROM fin_categorias WHERE id = ?", (categoria_id,))
        row_cat = cursor.fetchone()
        cat_nombre = row_cat[0] if row_cat else None
    d_ars, d_usd = _fin_delta_saldo(monto, moneda, tipo, cat_nombre)
    _fin_ajustar_saldo_cuenta(cursor, cuenta_id, d_ars, d_usd)
    conn.commit()
    cursor.execute(
        """SELECT m.id, m.fecha, m.monto, m.tipo, m.descripcion, m.icono,
                  m.cuenta_id, c.nombre, m.cuotas, m.categoria_id, cat.nombre,
                  m.moneda, m.nota, m.audit
           FROM fin_movimientos m
           LEFT JOIN fin_cuentas c ON c.id = m.cuenta_id
           LEFT JOIN fin_categorias cat ON cat.id = m.categoria_id
           WHERE m.id = ?""",
        (mid,),
    )
    row = cursor.fetchone()
    conn.close()
    if DEBUG:
        print(f"fin_crear_movimiento: id={mid} tipo={tipo} monto={monto}")
    return _mov_dict(row)


def fin_eliminar_movimiento(mov_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT m.cuenta_id, m.monto, m.moneda, m.tipo, cat.nombre
           FROM fin_movimientos m
           LEFT JOIN fin_categorias cat ON cat.id = m.categoria_id
           WHERE m.id = ?""",
        (mov_id,),
    )
    old = cursor.fetchone()
    if old:
        d_ars, d_usd = _fin_delta_saldo(old[1], old[2], old[3], old[4])
        _fin_ajustar_saldo_cuenta(cursor, old[0], -d_ars, -d_usd)
    cursor.execute("DELETE FROM fin_movimientos WHERE id = ?", (mov_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Finanzas — Config
# ---------------------------------------------------------------------------

def fin_obtener_config() -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT clave, valor FROM fin_config")
    rows = cursor.fetchall()
    conn.close()
    result = {}
    for clave, valor in rows:
        try:
            result[clave] = float(valor) if "." in valor else int(valor)
        except (ValueError, TypeError):
            result[clave] = valor
    return result


def fin_actualizar_config(updates: dict) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    for clave, valor in updates.items():
        cursor.execute(
            "INSERT OR REPLACE INTO fin_config (clave, valor) VALUES (?, ?)",
            (clave, str(valor)),
        )
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"fin_actualizar_config: {list(updates.keys())}")
    return fin_obtener_config()


# ---------------------------------------------------------------------------
# Finanzas — Notas
# ---------------------------------------------------------------------------

def fin_obtener_notas():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, contenido, fecha FROM fin_notas ORDER BY fecha DESC")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "contenido": r[1], "fecha": r[2]} for r in rows]


def fin_crear_nota(contenido: str) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    fecha = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO fin_notas (contenido, fecha) VALUES (?, ?)",
        (contenido.strip(), fecha),
    )
    nid = cursor.lastrowid
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"fin_crear_nota: id={nid}")
    return {"id": nid, "contenido": contenido.strip(), "fecha": fecha}


def fin_obtener_emergencia_saldo() -> float:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COALESCE(SUM(
            CASE WHEN m.tipo = 'income' THEN m.monto ELSE -ABS(m.monto) END
        ), 0)
        FROM fin_movimientos m
        JOIN fin_categorias c ON c.id = m.categoria_id
        JOIN fin_objetivos o ON o.id = c.objetivo_id
        WHERE o.nombre = ?
    """, (OBJETIVO_EMERGENCIA_NOMBRE,))
    saldo = cursor.fetchone()[0]
    if saldo == 0:
        cursor.execute("""
            SELECT COALESCE(SUM(
                CASE WHEN m.tipo = 'income' THEN m.monto ELSE -ABS(m.monto) END
            ), 0)
            FROM fin_movimientos m
            JOIN fin_categorias c ON c.id = m.categoria_id
            WHERE LOWER(c.nombre) = LOWER(?)
        """, (OBJETIVO_EMERGENCIA_NOMBRE,))
        saldo = cursor.fetchone()[0]
    conn.close()
    return float(saldo or 0)


def fin_eliminar_nota(nota_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fin_notas WHERE id = ?", (nota_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Finanzas — Movimientos (PATCH)
# ---------------------------------------------------------------------------

_MOV_UPDATABLE = frozenset({
    "fecha", "monto", "tipo", "descripcion", "icono",
    "cuenta_id", "cuotas", "categoria_id", "moneda", "nota", "audit",
})


def fin_actualizar_movimiento(mov_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _MOV_UPDATABLE}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    _mov_saldo_sql = """
        SELECT m.cuenta_id, m.monto, m.moneda, m.tipo, cat.nombre
        FROM fin_movimientos m
        LEFT JOIN fin_categorias cat ON cat.id = m.categoria_id
        WHERE m.id = ?
    """
    cursor.execute(_mov_saldo_sql, (mov_id,))
    old = cursor.fetchone()
    if old:
        d_ars, d_usd = _fin_delta_saldo(old[1], old[2], old[3], old[4])
        _fin_ajustar_saldo_cuenta(cursor, old[0], -d_ars, -d_usd)
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [mov_id]
    cursor.execute(f"UPDATE fin_movimientos SET {sets} WHERE id = ?", vals)
    cursor.execute(_mov_saldo_sql, (mov_id,))
    new = cursor.fetchone()
    if new:
        d_ars, d_usd = _fin_delta_saldo(new[1], new[2], new[3], new[4])
        _fin_ajustar_saldo_cuenta(cursor, new[0], d_ars, d_usd)
    conn.commit()
    cursor.execute(
        """SELECT m.id, m.fecha, m.monto, m.tipo, m.descripcion, m.icono,
                  m.cuenta_id, c.nombre, m.cuotas, m.categoria_id, cat.nombre,
                  m.moneda, m.nota, m.audit
           FROM fin_movimientos m
           LEFT JOIN fin_cuentas c   ON c.id   = m.cuenta_id
           LEFT JOIN fin_categorias cat ON cat.id = m.categoria_id
           WHERE m.id = ?""",
        (mov_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return _mov_dict(row) if row else None


# ---------------------------------------------------------------------------
# Finanzas — Instrumentos (portafolio)
# ---------------------------------------------------------------------------

def _inst_dict(r) -> dict:
    return {
        "id":               r[0],
        "tipo":             r[1],
        "ticker":           r[2],
        "sociedad":         r[3],
        "nombre":           r[4],
        "cantidad":         r[5],
        "costo_usd":        r[6],
        "tipo_cambio":      r[7],
        "precio_actual":    r[8],
        "entidad":          r[9],
        "capital_ars":      r[10],
        "tna":              r[11],
        "fecha_inicio":     r[12],
        "fecha_vencimiento":r[13],
        "fecha":            r[14],
    }


def fin_obtener_instrumentos() -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT i.id, i.tipo, i.ticker, i.sociedad, i.nombre, i.cantidad, i.costo_usd,
                  i.tipo_cambio, i.precio_actual, i.entidad, i.capital_ars, i.tna,
                  i.fecha_inicio, i.fecha_vencimiento, i.fecha,
                  EXISTS(SELECT 1 FROM fin_transacciones_instrumento t WHERE t.instrumento_id = i.id)
           FROM fin_instrumentos i ORDER BY i.tipo, i.id"""
    )
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = _inst_dict(r[:15])
        d["has_transactions"] = bool(r[15])
        result.append(d)
    return result


def fin_crear_instrumento(
    tipo: str,
    nombre: str,
    ticker: Optional[str] = None,
    sociedad: Optional[str] = None,
    cantidad: float = 0,
    costo_usd: Optional[float] = None,
    tipo_cambio: Optional[float] = None,
    precio_actual: Optional[float] = None,
    entidad: Optional[str] = None,
    capital_ars: Optional[float] = None,
    tna: Optional[float] = None,
    fecha_inicio: Optional[str] = None,
    fecha_vencimiento: Optional[str] = None,
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    fecha = datetime.now().isoformat()
    cursor.execute(
        """INSERT INTO fin_instrumentos
           (tipo, ticker, sociedad, nombre, cantidad, costo_usd, tipo_cambio, precio_actual,
            entidad, capital_ars, tna, fecha_inicio, fecha_vencimiento, fecha)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tipo, ticker, sociedad, nombre.strip(), cantidad, costo_usd, tipo_cambio, precio_actual,
         entidad, capital_ars, tna, fecha_inicio, fecha_vencimiento, fecha),
    )
    iid = cursor.lastrowid
    conn.commit()
    cursor.execute(
        """SELECT id, tipo, ticker, sociedad, nombre, cantidad, costo_usd, tipo_cambio,
                  precio_actual, entidad, capital_ars, tna, fecha_inicio,
                  fecha_vencimiento, fecha
           FROM fin_instrumentos WHERE id = ?""",
        (iid,),
    )
    row = cursor.fetchone()
    conn.close()
    if DEBUG:
        print(f"fin_crear_instrumento: id={iid} tipo={tipo} nombre={nombre}")
    return _inst_dict(row)


_INST_UPDATABLE = frozenset({
    "ticker", "sociedad", "nombre", "cantidad", "costo_usd", "tipo_cambio", "precio_actual",
    "entidad", "capital_ars", "tna", "fecha_inicio", "fecha_vencimiento",
})

# Fields that become read-only once the instrument has ledger transactions
_INST_LEDGER_LOCKED = frozenset({"cantidad", "costo_usd", "ticker"})


def fin_instrumento_tiene_transacciones(inst_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM fin_transacciones_instrumento WHERE instrumento_id = ? LIMIT 1",
        (inst_id,),
    )
    r = cursor.fetchone()
    conn.close()
    return r is not None


def fin_actualizar_instrumento(inst_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _INST_UPDATABLE}
    if not safe:
        return None
    # Raise ValueError for locked fields when transactions exist
    locked_requested = _INST_LEDGER_LOCKED & safe.keys()
    if locked_requested and fin_instrumento_tiene_transacciones(inst_id):
        raise ValueError(f"Campo(s) {sorted(locked_requested)} no editables: el instrumento tiene transacciones")
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [inst_id]
    cursor.execute(f"UPDATE fin_instrumentos SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute(
        """SELECT id, tipo, ticker, sociedad, nombre, cantidad, costo_usd, tipo_cambio,
                  precio_actual, entidad, capital_ars, tna, fecha_inicio,
                  fecha_vencimiento, fecha
           FROM fin_instrumentos WHERE id = ?""",
        (inst_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return _inst_dict(row) if row else None


def fin_eliminar_instrumento(inst_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fin_instrumentos WHERE id = ?", (inst_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Finanzas — Objetivos de ahorro
# ---------------------------------------------------------------------------

def _obj_dict(r) -> dict:
    return {
        "id":            r[0],
        "nombre":        r[1],
        "meta":          r[2],
        "moneda":        r[3],
        "fecha_limite":  r[4],
        "cuota_mensual": r[5],
        "fecha_creacion":r[6],
    }


def fin_obtener_objetivos() -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, nombre, meta, moneda, fecha_limite, cuota_mensual, fecha_creacion FROM fin_objetivos ORDER BY id"
    )
    rows = cursor.fetchall()
    conn.close()
    return [_obj_dict(r) for r in rows]


def fin_crear_objetivo(
    nombre: str,
    meta: float,
    moneda: str = "ARS",
    fecha_limite: Optional[str] = None,
    cuota_mensual: Optional[float] = None,
) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    fecha_creacion = datetime.now().isoformat()
    try:
        cursor.execute(
            """INSERT INTO fin_objetivos (nombre, meta, moneda, fecha_limite, cuota_mensual, fecha_creacion)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (nombre.strip(), meta, moneda, fecha_limite, cuota_mensual, fecha_creacion),
        )
        oid = cursor.lastrowid
        _fin_vincular_categoria_objetivo(cursor, oid, nombre.strip())
        conn.commit()
        cursor.execute(
            "SELECT id, nombre, meta, moneda, fecha_limite, cuota_mensual, fecha_creacion FROM fin_objetivos WHERE id = ?",
            (oid,),
        )
        row = cursor.fetchone()
        conn.close()
        if DEBUG:
            print(f"fin_crear_objetivo: id={oid} nombre={nombre}")
        return _obj_dict(row)
    except sqlite3.IntegrityError:
        conn.close()
        return None


_OBJ_UPDATABLE = frozenset({"meta", "moneda", "fecha_limite", "cuota_mensual"})


def fin_actualizar_objetivo(obj_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _OBJ_UPDATABLE}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [obj_id]
    cursor.execute(f"UPDATE fin_objetivos SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute(
        "SELECT id, nombre, meta, moneda, fecha_limite, cuota_mensual, fecha_creacion FROM fin_objetivos WHERE id = ?",
        (obj_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return _obj_dict(row) if row else None


def fin_eliminar_objetivo(obj_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nombre FROM fin_objetivos WHERE id = ?", (obj_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    nombre = row[0]
    if nombre == OBJETIVO_EMERGENCIA_NOMBRE:
        cursor.execute(
            "INSERT OR REPLACE INTO fin_config (clave, valor) VALUES (?, '1')",
            (FIN_EMERGENCIA_OBJETIVO_DESHABILITADO,),
        )
    cursor.execute(
        "UPDATE fin_categorias SET oculta = 1, objetivo_id = NULL WHERE objetivo_id = ?",
        (obj_id,),
    )
    cursor.execute("DELETE FROM fin_objetivos WHERE id = ?", (obj_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Finanzas — FIRE filas (overrides de ahorrado por mes)
# ---------------------------------------------------------------------------

def fin_obtener_fire_filas() -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT mes, ahorrado_override FROM fin_fire_filas")
    rows = cursor.fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}


def fin_upsert_fire_fila(mes: str, ahorrado_override: Optional[float]):
    conn = get_connection()
    cursor = conn.cursor()
    if ahorrado_override is None:
        cursor.execute("DELETE FROM fin_fire_filas WHERE mes = ?", (mes,))
    else:
        cursor.execute(
            "INSERT OR REPLACE INTO fin_fire_filas (mes, ahorrado_override) VALUES (?, ?)",
            (mes, ahorrado_override),
        )
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"fin_upsert_fire_fila: mes={mes} override={ahorrado_override}")


# ---------------------------------------------------------------------------
# Finanzas — Categorías (actualizar)
# ---------------------------------------------------------------------------

_CAT_FIN_UPDATABLE = frozenset({"nombre", "color", "tipo"})


def fin_actualizar_categoria(cat_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _CAT_FIN_UPDATABLE}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT nombre, objetivo_id FROM fin_categorias WHERE id = ?",
        (cat_id,),
    )
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return None
    if existing[1] is not None or existing[0] in FIN_CATEGORIAS_SISTEMA:
        safe.pop("nombre", None)
    if not safe:
        conn.close()
        return None
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [cat_id]
    try:
        cursor.execute(f"UPDATE fin_categorias SET {sets} WHERE id = ?", vals)
        conn.commit()
        cursor.execute(
            "SELECT id, nombre, color, tipo, oculta, objetivo_id FROM fin_categorias WHERE id = ?",
            (cat_id,),
        )
        row = cursor.fetchone()
        conn.close()
        if row is None:
            return None
        return _fin_cat_dict(row)
    except sqlite3.IntegrityError:
        conn.close()
        return None


# ---------------------------------------------------------------------------
# Finanzas — Movimientos duplicados
# ---------------------------------------------------------------------------

def fin_obtener_movimientos_duplicados(ventana_horas: int = 24) -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT m.id, m.fecha, m.monto, m.tipo, m.descripcion, m.icono,
                  m.cuenta_id, c.nombre, m.cuotas, m.categoria_id, cat.nombre,
                  m.moneda, m.nota, m.audit
           FROM fin_movimientos m
           LEFT JOIN fin_cuentas c ON c.id = m.cuenta_id
           LEFT JOIN fin_categorias cat ON cat.id = m.categoria_id
           ORDER BY m.fecha DESC, m.monto, m.tipo"""
    )
    rows = cursor.fetchall()
    conn.close()
    duplicates = []
    seen = []
    for r in rows:
        mov = _mov_dict(r)
        d_fecha = datetime.fromisoformat(mov["fecha"]) if mov["fecha"] else None
        for s in seen:
            if (
                s["tipo"] == mov["tipo"]
                and abs(s["monto"] - mov["monto"]) < 0.01
                and s["categoria_id"] == mov["categoria_id"]
                and d_fecha is not None
            ):
                s_fecha = datetime.fromisoformat(s["fecha"]) if s["fecha"] else None
                if s_fecha and abs((d_fecha - s_fecha).total_seconds()) <= ventana_horas * 3600:
                    duplicates.append(mov)
                    break
        seen.append(mov)
    return duplicates


# ---------------------------------------------------------------------------
# Finanzas — Export / Import CSV
# ---------------------------------------------------------------------------

def fin_export_csv_data() -> list:
    return fin_obtener_movimientos()


def fin_import_movimientos(filas: list) -> list:
    """Importa lista de dicts con campos de movimiento. Devuelve los creados."""
    created = []
    for f in filas:
        tipo   = f.get("tipo") or f.get("type", "expense")
        monto  = float(f.get("monto") or f.get("amount") or 0)
        fecha  = f.get("fecha") or f.get("date", "")
        desc   = f.get("descripcion") or f.get("desc", "")
        cat    = f.get("categoria_nombre") or f.get("cat", "")
        cta    = f.get("cuenta_nombre") or f.get("method", "")
        moneda = f.get("moneda", "ARS")
        nota   = f.get("nota", "")
        cuotas = f.get("cuotas")
        if not fecha or monto == 0 or tipo not in ("income", "expense"):
            continue
        cuenta_id = fin_buscar_cuenta_por_nombre(cta) if cta else None
        categoria_id = fin_buscar_categoria_por_nombre(cat) if cat else None
        if cat and categoria_id is None:
            tipo_cat = "income" if tipo == "income" else "expense"
            categoria_id = fin_crear_categoria(cat, tipo=tipo_cat)
        mov = fin_crear_movimiento(
            fecha=fecha[:10],
            monto=monto,
            tipo=tipo,
            descripcion=desc,
            cuenta_id=cuenta_id,
            cuotas=int(cuotas) if cuotas else None,
            categoria_id=categoria_id,
            moneda=moneda,
            nota=nota or None,
        )
        created.append(mov)
    return created


# ---------------------------------------------------------------------------
# Finanzas — Bulk update / delete movimientos
# ---------------------------------------------------------------------------

def fin_bulk_update_movimientos(updates: list) -> list:
    """updates: [{id, ...campos}]. Devuelve lista de movimientos actualizados."""
    result = []
    for u in updates:
        mov_id = u.get("id")
        if not mov_id:
            continue
        campos = {k: v for k, v in u.items() if k != "id"}
        updated = fin_actualizar_movimiento(int(mov_id), campos)
        if updated:
            result.append(updated)
    return result


def fin_bulk_delete_movimientos(ids: list) -> int:
    """Elimina lista de movimientos. Devuelve cantidad eliminada."""
    count = 0
    for mov_id in ids:
        if fin_eliminar_movimiento(int(mov_id)):
            count += 1
    return count


# ---------------------------------------------------------------------------
# Finanzas — Ledger transacciones por instrumento
# ---------------------------------------------------------------------------

def _trans_dict(r) -> dict:
    return {
        "id":             r[0],
        "instrumento_id": r[1],
        "tipo":           r[2],
        "fecha":          r[3],
        "cantidad":       r[4],
        "precio":         r[5],
        "monto_total":    r[6],
        "nota":           r[7],
        "creado_en":      r[8],
        "moneda":         r[9] if len(r) > 9 else "ARS",
        "tipo_cambio":    r[10] if len(r) > 10 else None,
    }


_TRANS_SELECT = """
    SELECT id, instrumento_id, tipo, fecha, cantidad, precio, monto_total, nota, creado_en,
           moneda, tipo_cambio
    FROM fin_transacciones_instrumento
"""


def _recalcular_posicion(cursor, instrumento_id: int) -> None:
    """Recalculate cantidad+costo_usd for an instrument from its full tx history.
    Must be called inside an open transaction; does NOT commit."""
    cursor.execute(
        """SELECT tipo, cantidad, precio, moneda, tipo_cambio
           FROM fin_transacciones_instrumento
           WHERE instrumento_id = ?
           ORDER BY fecha ASC, id ASC""",
        (instrumento_id,),
    )
    rows = cursor.fetchall()

    cantidad = 0.0
    costo_usd = 0.0

    for tipo, cant, precio, moneda, tc in rows:
        if tipo == "compra":
            if moneda == "ARS":
                if tc and tc > 0:
                    costo_tx = (cant * precio) / tc
                else:
                    cursor.execute("SELECT valor FROM fin_config WHERE clave = 'dolar_mep'")
                    r = cursor.fetchone()
                    tc_fallback = float(r[0]) if (r and r[0]) else 1.0
                    costo_tx = (cant * precio) / tc_fallback
            else:
                costo_tx = cant * precio
            cantidad += cant
            costo_usd += costo_tx
        elif tipo == "venta":
            ppc = costo_usd / cantidad if cantidad > 0 else 0.0
            vendido = min(cant, cantidad)
            costo_usd -= vendido * ppc
            cantidad -= vendido
            if cantidad <= 0:
                cantidad = 0.0
                costo_usd = 0.0

    cursor.execute(
        "UPDATE fin_instrumentos SET cantidad = ?, costo_usd = ? WHERE id = ?",
        (round(cantidad, 8), round(costo_usd, 6), instrumento_id),
    )
    if DEBUG:
        print(f"_recalcular_posicion: inst={instrumento_id} cant={cantidad:.4f} costo={costo_usd:.4f}")


def fin_obtener_transacciones_instrumento(instrumento_id: int) -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        _TRANS_SELECT + "WHERE instrumento_id = ? ORDER BY fecha DESC, id DESC",
        (instrumento_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [_trans_dict(r) for r in rows]


def fin_obtener_transacciones_global(
    ticker: Optional[str] = None,
    tipo_inst: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> list:
    conn = get_connection()
    cursor = conn.cursor()
    where = []
    params: list = []
    if ticker:
        where.append("UPPER(TRIM(i.ticker)) = UPPER(TRIM(?))")
        params.append(ticker)
    if tipo_inst:
        where.append("i.tipo = ?")
        params.append(tipo_inst)
    if desde:
        where.append("t.fecha >= ?")
        params.append(desde)
    if hasta:
        where.append("t.fecha <= ?")
        params.append(hasta)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    cursor.execute(
        f"""SELECT t.id, t.instrumento_id, t.tipo, t.fecha, t.cantidad, t.precio,
                   t.monto_total, t.nota, t.creado_en, t.moneda, t.tipo_cambio,
                   i.ticker, i.nombre, i.tipo AS tipo_instrumento
            FROM fin_transacciones_instrumento t
            JOIN fin_instrumentos i ON i.id = t.instrumento_id
            {clause}
            ORDER BY t.fecha DESC, t.id DESC
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    )
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = _trans_dict(r[:11])
        d["ticker"]            = r[11]
        d["nombre_instrumento"] = r[12]
        d["tipo_instrumento"]  = r[13]
        result.append(d)
    return result


def fin_crear_transaccion_instrumento(
    instrumento_id: int,
    tipo: str,
    fecha: str,
    cantidad: float,
    precio: float,
    nota: Optional[str] = None,
    moneda: str = "ARS",
    tipo_cambio: Optional[float] = None,
) -> dict:
    # Validate venta doesn't exceed current position
    if tipo == "venta":
        conn_check = get_connection()
        cur_check = conn_check.cursor()
        cur_check.execute("SELECT cantidad FROM fin_instrumentos WHERE id = ?", (instrumento_id,))
        r = cur_check.fetchone()
        conn_check.close()
        if r is None:
            raise ValueError("Instrumento no encontrado")
        if cantidad > (r[0] or 0):
            raise ValueError(f"Venta ({cantidad}) supera la posición actual ({r[0] or 0})")

    monto_total = round(cantidad * precio, 6)
    creado_en   = datetime.now().isoformat()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO fin_transacciones_instrumento
           (instrumento_id, tipo, fecha, cantidad, precio, monto_total, nota, creado_en,
            moneda, tipo_cambio)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (instrumento_id, tipo, fecha, cantidad, precio, monto_total, nota, creado_en,
         moneda, tipo_cambio),
    )
    tid = cursor.lastrowid
    _recalcular_posicion(cursor, instrumento_id)
    conn.commit()
    cursor.execute(
        _TRANS_SELECT + "WHERE id = ?",
        (tid,),
    )
    row = cursor.fetchone()
    conn.close()
    if DEBUG:
        print(f"fin_crear_transaccion_instrumento: id={tid} inst={instrumento_id} tipo={tipo}")
    return _trans_dict(row)


def fin_actualizar_transaccion_instrumento(
    trans_id: int,
    campos: dict,
) -> Optional[dict]:
    _UPDATABLE = frozenset({"tipo", "fecha", "cantidad", "precio", "nota", "moneda", "tipo_cambio"})
    safe = {k: v for k, v in campos.items() if k in _UPDATABLE}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT instrumento_id FROM fin_transacciones_instrumento WHERE id = ?", (trans_id,)
    )
    r = cursor.fetchone()
    if r is None:
        conn.close()
        return None
    instrumento_id = r[0]
    # Recompute monto_total if cantidad or precio changed
    if "cantidad" in safe or "precio" in safe:
        cursor.execute(
            "SELECT cantidad, precio FROM fin_transacciones_instrumento WHERE id = ?", (trans_id,)
        )
        cur_row = cursor.fetchone()
        cant  = safe.get("cantidad", cur_row[0])
        prec  = safe.get("precio",   cur_row[1])
        safe["monto_total"] = round(cant * prec, 6)
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [trans_id]
    cursor.execute(f"UPDATE fin_transacciones_instrumento SET {sets} WHERE id = ?", vals)
    _recalcular_posicion(cursor, instrumento_id)
    conn.commit()
    cursor.execute(_TRANS_SELECT + "WHERE id = ?", (trans_id,))
    row = cursor.fetchone()
    conn.close()
    return _trans_dict(row) if row else None


def fin_crear_transaccion_unificada(
    tipo: str,
    instrumento_tipo: str,
    ticker: str,
    nombre: str,
    fecha: str,
    cantidad: float,
    precio: float,
    nota: Optional[str] = None,
    moneda: str = "ARS",
    tipo_cambio: Optional[float] = None,
) -> dict:
    """Find-or-create instrument by (tipo, UPPER(ticker)), then record the transaction."""
    ticker_norm = ticker.upper().strip()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id FROM fin_instrumentos
           WHERE tipo = ? AND UPPER(TRIM(ticker)) = ?""",
        (instrumento_tipo, ticker_norm),
    )
    row = cursor.fetchone()
    if row:
        instrumento_id = row[0]
    else:
        now_iso = datetime.now().isoformat()
        cursor.execute(
            """INSERT INTO fin_instrumentos
               (tipo, ticker, nombre, cantidad, fecha)
               VALUES (?, ?, ?, 0, ?)""",
            (instrumento_tipo, ticker_norm, nombre.strip(), now_iso),
        )
        instrumento_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return fin_crear_transaccion_instrumento(
        instrumento_id=instrumento_id,
        tipo=tipo,
        fecha=fecha,
        cantidad=cantidad,
        precio=precio,
        nota=nota,
        moneda=moneda,
        tipo_cambio=tipo_cambio,
    )


def fin_eliminar_transaccion_instrumento(trans_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT instrumento_id FROM fin_transacciones_instrumento WHERE id = ?", (trans_id,)
    )
    r = cursor.fetchone()
    if r is None:
        conn.close()
        return False
    instrumento_id = r[0]
    cursor.execute("DELETE FROM fin_transacciones_instrumento WHERE id = ?", (trans_id,))
    _recalcular_posicion(cursor, instrumento_id)
    conn.commit()
    conn.close()
    return True


# ---------------------------------------------------------------------------
# Finanzas — Inflación mensual
# ---------------------------------------------------------------------------

def fin_obtener_inflacion() -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT mes, inflacion FROM fin_inflacion ORDER BY mes")
    rows = cursor.fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}


def fin_upsert_inflacion(mes: str, inflacion: Optional[float]):
    conn = get_connection()
    cursor = conn.cursor()
    if inflacion is None:
        cursor.execute("DELETE FROM fin_inflacion WHERE mes = ?", (mes,))
    else:
        cursor.execute(
            "INSERT OR REPLACE INTO fin_inflacion (mes, inflacion) VALUES (?, ?)",
            (mes, inflacion),
        )
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"fin_upsert_inflacion: mes={mes} inflacion={inflacion}")


# ---------------------------------------------------------------------------
# Agenda — Calendarios
# ---------------------------------------------------------------------------

def agenda_obtener_calendarios() -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre, color, activo FROM agenda_calendarios ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "nombre": r[1], "color": r[2], "activo": bool(r[3])} for r in rows]


def agenda_crear_calendario(nombre: str, color: str = "#2563eb") -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO agenda_calendarios (nombre, color, activo) VALUES (?, ?, 1)",
        (nombre.strip(), color),
    )
    cid = cursor.lastrowid
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"agenda_crear_calendario: id={cid} nombre={nombre}")
    return {"id": cid, "nombre": nombre.strip(), "color": color, "activo": True}


_CAL_UPDATABLE = frozenset({"nombre", "color", "activo"})


def agenda_actualizar_calendario(cal_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _CAL_UPDATABLE}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [cal_id]
    cursor.execute(f"UPDATE agenda_calendarios SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute("SELECT id, nombre, color, activo FROM agenda_calendarios WHERE id = ?", (cal_id,))
    row = cursor.fetchone()
    conn.close()
    return {"id": row[0], "nombre": row[1], "color": row[2], "activo": bool(row[3])} if row else None


def agenda_eliminar_calendario(cal_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM agenda_calendarios WHERE id = ?", (cal_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Agenda — Eventos
# ---------------------------------------------------------------------------

def _evento_dict(r) -> dict:
    return {
        "id":                r[0],
        "titulo":            r[1],
        "descripcion":       r[2],
        "fecha_inicio":      r[3],
        "fecha_fin":         r[4],
        "todo_el_dia":       bool(r[5]),
        "se_repite":         bool(r[6]),
        "regla_repeticion":  r[7],
        "calendario_id":     r[8],
        "calendario_color":  r[9] or "#2563eb",
        "calendario_nombre": r[10] or "",
    }


def _expand_recurring(evento: dict, desde: str, hasta: str) -> list:
    """Expands a recurring event into individual occurrences within [desde, hasta]."""
    try:
        regla = evento.get("regla_repeticion")
        if isinstance(regla, str):
            regla = json.loads(regla)
        if not regla:
            return [evento]
    except Exception:
        return [evento]

    frecuencia = regla.get("frecuencia", "semanal")
    dias       = regla.get("dias") or []          # [0=Mon..6=Sun] for weekly
    hasta_rule = regla.get("hasta")

    base_str  = evento["fecha_inicio"][:10]
    time_part = evento["fecha_inicio"][10:]       # e.g. "T08:00:00" or ""
    duration  = None
    if evento.get("fecha_fin"):
        try:
            duration = datetime.fromisoformat(evento["fecha_fin"]) - datetime.fromisoformat(evento["fecha_inicio"])
        except Exception:
            pass

    range_start = max(date.fromisoformat(desde[:10]), date.fromisoformat(base_str))
    range_end   = date.fromisoformat(hasta[:10])
    if hasta_rule:
        try:
            range_end = min(range_end, date.fromisoformat(hasta_rule))
        except Exception:
            pass

    occurrences = []
    cur = date.fromisoformat(base_str)

    while cur <= range_end:
        scheduled = False
        if frecuencia == "diario":
            scheduled = True
        elif frecuencia == "semanal":
            scheduled = (not dias) or (cur.weekday() in dias)
        elif frecuencia == "mensual":
            scheduled = cur.day == date.fromisoformat(base_str).day

        if scheduled and cur >= range_start:
            occ = dict(evento)
            occ["fecha_inicio"] = cur.isoformat() + time_part
            if duration is not None:
                occ["fecha_fin"] = (datetime.fromisoformat(occ["fecha_inicio"]) + duration).isoformat()
            occurrences.append(occ)

        if frecuencia == "mensual":
            m, y = cur.month + 1, cur.year
            if m > 12:
                m, y = 1, y + 1
            day = min(cur.day, _calendar.monthrange(y, m)[1])
            cur = date(y, m, day)
        else:
            cur += timedelta(days=1)

    return occurrences


def agenda_obtener_eventos(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> list:
    conn = get_connection()
    cursor = conn.cursor()
    # fecha_inicio se compara como texto (formato "YYYY-MM-DDTHH:MM:SS") -- un
    # fecha_hasta "pelado" (solo fecha, sin hora, ej. "2026-09-16") queda
    # lexicográficamente MENOR que cualquier timestamp de ese mismo día con
    # hora ("2026-09-16T15:00:00" > "2026-09-16"), así que "<= fecha_hasta"
    # excluía TODOS los eventos del día con hora asignada -- mismo bug ya
    # encontrado y arreglado en jarvis/browse/service.py (date_to), se
    # normaliza acá con el mismo criterio.
    if fecha_hasta and "T" not in fecha_hasta:
        fecha_hasta = f"{fecha_hasta}T23:59:59.999999"
    # Fetch all recurring events regardless of start date so expansion can cover the range
    query = """
        SELECT e.id, e.titulo, e.descripcion, e.fecha_inicio, e.fecha_fin,
               e.todo_el_dia, e.se_repite, e.regla_repeticion, e.calendario_id,
               COALESCE(c.color, '#2563eb'), COALESCE(c.nombre, '')
        FROM agenda_eventos e
        LEFT JOIN agenda_calendarios c ON c.id = e.calendario_id
    """
    params: list = []
    if fecha_desde and fecha_hasta:
        query += " WHERE (e.fecha_inicio >= ? AND e.fecha_inicio <= ?) OR e.se_repite = 1"
        params = [fecha_desde, fecha_hasta]
    elif fecha_desde:
        query += " WHERE e.fecha_inicio >= ? OR e.se_repite = 1"
        params = [fecha_desde]
    query += " ORDER BY e.fecha_inicio"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        ev = _evento_dict(r)
        if ev["se_repite"] and fecha_desde and fecha_hasta:
            results.extend(_expand_recurring(ev, fecha_desde, fecha_hasta))
        else:
            results.append(ev)
    return results


def agenda_crear_evento(
    titulo: str,
    fecha_inicio: str,
    descripcion: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    todo_el_dia: bool = False,
    se_repite: bool = False,
    regla_repeticion: Optional[str] = None,
    calendario_id: Optional[int] = None,
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO agenda_eventos
           (titulo, descripcion, fecha_inicio, fecha_fin, todo_el_dia,
            se_repite, regla_repeticion, calendario_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (titulo.strip(), descripcion, fecha_inicio, fecha_fin,
         int(todo_el_dia), int(se_repite), regla_repeticion, calendario_id),
    )
    eid = cursor.lastrowid
    conn.commit()
    cursor.execute(
        """SELECT e.id, e.titulo, e.descripcion, e.fecha_inicio, e.fecha_fin,
                  e.todo_el_dia, e.se_repite, e.regla_repeticion, e.calendario_id,
                  COALESCE(c.color, '#2563eb'), COALESCE(c.nombre, '')
           FROM agenda_eventos e
           LEFT JOIN agenda_calendarios c ON c.id = e.calendario_id
           WHERE e.id = ?""",
        (eid,),
    )
    row = cursor.fetchone()
    conn.close()
    if DEBUG:
        print(f"agenda_crear_evento: id={eid} titulo={titulo}")
    return _evento_dict(row)


_EVT_UPDATABLE = frozenset({
    "titulo", "descripcion", "fecha_inicio", "fecha_fin",
    "todo_el_dia", "se_repite", "regla_repeticion", "calendario_id",
})


def agenda_actualizar_evento(evt_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _EVT_UPDATABLE}
    if not safe:
        return None
    safe['actualizado_en'] = datetime.now().isoformat()
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [evt_id]
    cursor.execute(f"UPDATE agenda_eventos SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute(
        """SELECT e.id, e.titulo, e.descripcion, e.fecha_inicio, e.fecha_fin,
                  e.todo_el_dia, e.se_repite, e.regla_repeticion, e.calendario_id,
                  COALESCE(c.color, '#2563eb'), COALESCE(c.nombre, '')
           FROM agenda_eventos e
           LEFT JOIN agenda_calendarios c ON c.id = e.calendario_id
           WHERE e.id = ?""",
        (evt_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return _evento_dict(row) if row else None


def agenda_eliminar_evento(evt_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM agenda_eventos WHERE id = ?", (evt_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Agenda — Listas de tareas
# ---------------------------------------------------------------------------

def agenda_obtener_listas() -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre, color, pinned FROM agenda_listas ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "nombre": r[1], "color": r[2], "pinned": bool(r[3])} for r in rows]


def agenda_crear_lista(nombre: str, color: str = "#7c3aed") -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO agenda_listas (nombre, color) VALUES (?, ?)",
        (nombre.strip(), color),
    )
    lid = cursor.lastrowid
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"agenda_crear_lista: id={lid} nombre={nombre}")
    return {"id": lid, "nombre": nombre.strip(), "color": color, "pinned": False}


_LISTA_UPDATABLE = frozenset({"nombre", "color", "pinned"})


def agenda_actualizar_lista(lista_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _LISTA_UPDATABLE}
    if not safe:
        return None
    if "pinned" in safe:
        safe["pinned"] = 1 if safe["pinned"] else 0
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [lista_id]
    cursor.execute(f"UPDATE agenda_listas SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute("SELECT id, nombre, color, pinned FROM agenda_listas WHERE id = ?", (lista_id,))
    row = cursor.fetchone()
    conn.close()
    return {"id": row[0], "nombre": row[1], "color": row[2], "pinned": bool(row[3])} if row else None


def agenda_eliminar_lista(lista_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM agenda_tareas WHERE lista_id = ?", (lista_id,))
    cursor.execute("DELETE FROM agenda_listas WHERE id = ?", (lista_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Agenda — Tareas
# ---------------------------------------------------------------------------

def _tarea_dict(r) -> dict:
    return {
        "id":                r[0],
        "titulo":            r[1],
        "descripcion":       r[2],
        "fecha_opcional":    r[3],
        "hora_opcional":     r[4],
        "hora_bloque":       r[5],
        "duracion_estimada": r[6],
        "completada":        bool(r[7]),
        "lista_id":          r[8],
        "lista_color":       r[9] or "#7c3aed",
        "lista_nombre":      r[10] or "",
    }


def agenda_obtener_tareas(
    lista_id: Optional[int] = None,
    solo_pendientes: bool = False,
) -> list:
    conn = get_connection()
    cursor = conn.cursor()
    query = """
        SELECT t.id, t.titulo, t.descripcion, t.fecha_opcional, t.hora_opcional,
               t.hora_bloque, t.duracion_estimada, t.completada, t.lista_id,
               COALESCE(l.color, '#7c3aed'), COALESCE(l.nombre, '')
        FROM agenda_tareas t
        LEFT JOIN agenda_listas l ON l.id = t.lista_id
        WHERE 1=1
    """
    params = []
    if lista_id is not None:
        query += " AND t.lista_id = ?"
        params.append(lista_id)
    if solo_pendientes:
        query += " AND t.completada = 0"
    query += " ORDER BY t.fecha_opcional ASC, t.id ASC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [_tarea_dict(r) for r in rows]


def agenda_crear_tarea(
    titulo: str,
    lista_id: Optional[int] = None,
    descripcion: Optional[str] = None,
    fecha_opcional: Optional[str] = None,
    hora_opcional: Optional[str] = None,
    hora_bloque: Optional[str] = None,
    duracion_estimada: Optional[int] = None,
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO agenda_tareas
           (titulo, descripcion, fecha_opcional, hora_opcional, hora_bloque, duracion_estimada, completada, lista_id)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)""",
        (titulo.strip(), descripcion, fecha_opcional, hora_opcional, hora_bloque, duracion_estimada, lista_id),
    )
    tid = cursor.lastrowid
    conn.commit()
    cursor.execute(
        """SELECT t.id, t.titulo, t.descripcion, t.fecha_opcional, t.hora_opcional,
                  t.hora_bloque, t.duracion_estimada, t.completada, t.lista_id,
                  COALESCE(l.color, '#7c3aed'), COALESCE(l.nombre, '')
           FROM agenda_tareas t
           LEFT JOIN agenda_listas l ON l.id = t.lista_id
           WHERE t.id = ?""",
        (tid,),
    )
    row = cursor.fetchone()
    conn.close()
    if DEBUG:
        print(f"agenda_crear_tarea: id={tid} titulo={titulo}")
    return _tarea_dict(row)


_TAREA_UPDATABLE = frozenset({
    "titulo", "descripcion", "fecha_opcional", "hora_opcional",
    "hora_bloque", "duracion_estimada", "completada", "lista_id",
})


def agenda_actualizar_tarea(tarea_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _TAREA_UPDATABLE}
    if not safe:
        return None
    safe['actualizado_en'] = datetime.now().isoformat()
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [tarea_id]
    cursor.execute(f"UPDATE agenda_tareas SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute(
        """SELECT t.id, t.titulo, t.descripcion, t.fecha_opcional, t.hora_opcional,
                  t.hora_bloque, t.duracion_estimada, t.completada, t.lista_id,
                  COALESCE(l.color, '#7c3aed'), COALESCE(l.nombre, '')
           FROM agenda_tareas t
           LEFT JOIN agenda_listas l ON l.id = t.lista_id
           WHERE t.id = ?""",
        (tarea_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return _tarea_dict(row) if row else None


def agenda_eliminar_tarea(tarea_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM agenda_tareas WHERE id = ?", (tarea_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Agenda — Horario facultad
# ---------------------------------------------------------------------------

def agenda_obtener_horario_facultad() -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, dia_semana, hora_inicio, hora_fin, materia, descripcion
           FROM agenda_horario_facultad ORDER BY dia_semana, hora_inicio"""
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"id": r[0], "dia_semana": r[1], "hora_inicio": r[2],
         "hora_fin": r[3], "materia": r[4], "descripcion": r[5]}
        for r in rows
    ]


def agenda_crear_horario_facultad(
    dia_semana: int,
    hora_inicio: str,
    hora_fin: str,
    materia: str,
    descripcion: Optional[str] = None,
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO agenda_horario_facultad
           (dia_semana, hora_inicio, hora_fin, materia, descripcion)
           VALUES (?, ?, ?, ?, ?)""",
        (dia_semana, hora_inicio, hora_fin, materia.strip(), descripcion),
    )
    hid = cursor.lastrowid
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"agenda_crear_horario_facultad: id={hid} materia={materia}")
    return {
        "id": hid, "dia_semana": dia_semana, "hora_inicio": hora_inicio,
        "hora_fin": hora_fin, "materia": materia.strip(), "descripcion": descripcion,
    }


_HF_UPDATABLE = frozenset({"dia_semana", "hora_inicio", "hora_fin", "materia", "descripcion"})


def agenda_actualizar_horario_facultad(hf_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _HF_UPDATABLE}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [hf_id]
    cursor.execute(f"UPDATE agenda_horario_facultad SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute(
        "SELECT id, dia_semana, hora_inicio, hora_fin, materia, descripcion FROM agenda_horario_facultad WHERE id = ?",
        (hf_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return (
        {"id": row[0], "dia_semana": row[1], "hora_inicio": row[2],
         "hora_fin": row[3], "materia": row[4], "descripcion": row[5]}
        if row else None
    )


def agenda_eliminar_horario_facultad(hf_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM agenda_horario_facultad WHERE id = ?", (hf_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def agenda_resumen_semana(desde: str, hasta: str) -> dict:
    """Resumen semanal para /revision del bot y tab Revisión."""
    # Mismo bug/fix que agenda_obtener_eventos(): un "hasta" pelado (sin hora)
    # queda por debajo de cualquier fecha_inicio con hora de ese mismo día en
    # la comparación de texto -- normalizado a fin de día.
    if hasta and "T" not in hasta:
        hasta = f"{hasta}T23:59:59.999999"
    conn = get_connection()
    cursor = conn.cursor()

    # Tareas completadas en el rango (con fecha en el rango)
    cursor.execute(
        """SELECT COUNT(*) FROM agenda_tareas
           WHERE completada = 1 AND fecha_opcional >= ? AND fecha_opcional <= ?""",
        (desde, hasta),
    )
    completadas = cursor.fetchone()[0]

    # Tareas incompletas con fecha en el rango
    cursor.execute(
        """SELECT COUNT(*) FROM agenda_tareas
           WHERE completada = 0 AND fecha_opcional >= ? AND fecha_opcional <= ?""",
        (desde, hasta),
    )
    incompletas = cursor.fetchone()[0]

    # Tareas vencidas: fecha < desde y no completadas
    cursor.execute(
        """SELECT COUNT(*) FROM agenda_tareas
           WHERE completada = 0 AND fecha_opcional IS NOT NULL AND fecha_opcional < ?""",
        (desde,),
    )
    vencidas = cursor.fetchone()[0]

    # Minutos de eventos por calendario
    cursor.execute(
        """SELECT c.nombre, c.color,
                  SUM(
                    CAST((strftime('%s', e.fecha_fin) - strftime('%s', e.fecha_inicio)) / 60 AS INTEGER)
                  ) as minutos
           FROM agenda_eventos e
           LEFT JOIN agenda_calendarios c ON c.id = e.calendario_id
           WHERE e.fecha_inicio >= ? AND e.fecha_inicio <= ?
             AND e.todo_el_dia = 0 AND e.fecha_fin IS NOT NULL
           GROUP BY e.calendario_id""",
        (desde, hasta),
    )
    rows = cursor.fetchall()
    por_calendario = [
        {"nombre": r[0] or "Sin calendario", "color": r[1] or "#2563eb", "minutos": r[2] or 0}
        for r in rows
    ]

    # Total eventos en el rango
    cursor.execute(
        "SELECT COUNT(*) FROM agenda_eventos WHERE fecha_inicio >= ? AND fecha_inicio <= ?",
        (desde, hasta),
    )
    total_eventos = cursor.fetchone()[0]

    conn.close()
    return {
        "desde": desde,
        "hasta": hasta,
        "completadas": completadas,
        "incompletas": incompletas,
        "vencidas": vencidas,
        "total_eventos": total_eventos,
        "por_calendario": por_calendario,
    }


def agenda_buscar(q: str) -> dict:
    """Full-text search over event titles/descriptions and task titles/descriptions."""
    like = f"%{q.strip()}%"
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT e.id, e.titulo, e.descripcion, e.fecha_inicio, e.fecha_fin,
                  e.todo_el_dia, e.se_repite, e.regla_repeticion, e.calendario_id,
                  COALESCE(c.color, '#2563eb'), COALESCE(c.nombre, '')
           FROM agenda_eventos e
           LEFT JOIN agenda_calendarios c ON c.id = e.calendario_id
           WHERE e.titulo LIKE ? OR e.descripcion LIKE ?
           ORDER BY e.fecha_inicio DESC
           LIMIT 20""",
        (like, like),
    )
    eventos = [_evento_dict(r) for r in cursor.fetchall()]

    cursor.execute(
        """SELECT t.id, t.titulo, t.descripcion, t.fecha_opcional, t.hora_opcional,
                  t.hora_bloque, t.duracion_estimada, t.completada, t.lista_id,
                  COALESCE(l.color, '#7c3aed'), COALESCE(l.nombre, '')
           FROM agenda_tareas t
           LEFT JOIN agenda_listas l ON l.id = t.lista_id
           WHERE t.titulo LIKE ? OR t.descripcion LIKE ?
           ORDER BY t.fecha_opcional DESC NULLS LAST
           LIMIT 20""",
        (like, like),
    )
    tareas = [_tarea_dict(r) for r in cursor.fetchall()]

    conn.close()
    return {"eventos": eventos, "tareas": tareas}


# ---------------------------------------------------------------------------
# Hábitos
# ---------------------------------------------------------------------------

_HABITO_SELECT = """SELECT id, nombre, descripcion, color, categoria, frecuencia_tipo,
                          dias_semana, hora, activo, creado_en, archivado_en,
                          notificar, minutos_antes
                   FROM habitos"""


def _habito_dict(r) -> dict:
    return {
        "id":              r[0],
        "nombre":          r[1],
        "descripcion":     r[2],
        "color":           r[3],
        "categoria":       r[4],
        "frecuencia_tipo": r[5],
        "dias_semana":     r[6],
        "hora":            r[7],
        "activo":          bool(r[8]),
        "creado_en":       r[9],
        "archivado_en":    r[10] if len(r) > 10 else None,
        "notificar":       bool(r[11]) if len(r) > 11 else False,
        "minutos_antes":   r[12] if len(r) > 12 else 0,
    }


def habitos_obtener() -> list:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(_HABITO_SELECT + " ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [_habito_dict(r) for r in rows]


def habitos_crear(
    nombre: str,
    descripcion: Optional[str] = None,
    color: str = "#7c3aed",
    categoria: Optional[str] = None,
    frecuencia_tipo: str = "diario",
    dias_semana: Optional[str] = None,
    hora: Optional[str] = None,
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    creado_en = datetime.now().isoformat()
    cursor.execute(
        """INSERT INTO habitos (nombre, descripcion, color, categoria, frecuencia_tipo,
                                dias_semana, hora, activo, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
        (nombre.strip(), descripcion, color, categoria, frecuencia_tipo, dias_semana, hora, creado_en),
    )
    hid = cursor.lastrowid
    conn.commit()
    cursor.execute(_HABITO_SELECT + " WHERE id = ?", (hid,))
    row = cursor.fetchone()
    conn.close()
    if DEBUG:
        print(f"habitos_crear: id={hid} nombre={nombre}")
    return _habito_dict(row)


_HABITO_UPDATABLE = frozenset({"nombre", "descripcion", "color", "categoria", "frecuencia_tipo", "dias_semana", "hora", "activo", "archivado_en", "notificar", "minutos_antes"})


def habitos_actualizar(habito_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _HABITO_UPDATABLE}
    if not safe:
        return None
    # Auto-set archivado_en when deactivating
    if safe.get("activo") == 0 and "archivado_en" not in safe:
        safe["archivado_en"] = datetime.now().isoformat()
    elif safe.get("activo") == 1 and "archivado_en" not in safe:
        safe["archivado_en"] = None
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [habito_id]
    cursor.execute(f"UPDATE habitos SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute(_HABITO_SELECT + " WHERE id = ?", (habito_id,))
    row = cursor.fetchone()
    conn.close()
    return _habito_dict(row) if row else None


def habitos_pendientes_hoy(fecha_hoy: str) -> list:
    """Return active habits scheduled for today, each with today's registro if it exists."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(_HABITO_SELECT + " WHERE activo = 1 ORDER BY id")
    hab_rows = cursor.fetchall()
    cursor.execute(
        "SELECT id, habito_id, fecha, valor, nota, creado_en FROM habitos_registros WHERE fecha = ?",
        (fecha_hoy,),
    )
    reg_rows = {r[1]: _registro_dict(r) for r in cursor.fetchall()}
    conn.close()
    result = []
    import json as _json
    for r in hab_rows:
        h = _habito_dict(r)
        freq = h["frecuencia_tipo"]
        if freq == "diario":
            scheduled = True
        else:
            try:
                dias = _json.loads(h["dias_semana"] or "[]")
            except Exception:
                dias = []
            from datetime import date as _date
            dow = _date.fromisoformat(fecha_hoy).weekday()
            # weekday(): Mon=0..Sun=6 → convert to JS convention Sun=0..Sat=6
            dow_js = (dow + 1) % 7
            scheduled = dow_js in dias
        if scheduled:
            h["registro_hoy"] = reg_rows.get(h["id"])
            result.append(h)
    return result


def habitos_eliminar(habito_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM habitos WHERE id = ?", (habito_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Hábitos — Registros de completación
# ---------------------------------------------------------------------------

def _registro_dict(r) -> dict:
    return {
        "id":        r[0],
        "habito_id": r[1],
        "fecha":     r[2],
        "valor":     r[3],
        "nota":      r[4],
        "creado_en": r[5],
    }


def habitos_registros_obtener(
    habito_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> list:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT id, habito_id, fecha, valor, nota, creado_en FROM habitos_registros"
    params = []
    conds = []
    if habito_id:
        conds.append("habito_id = ?")
        params.append(habito_id)
    if fecha_desde:
        conds.append("fecha >= ?")
        params.append(fecha_desde)
    if fecha_hasta:
        conds.append("fecha <= ?")
        params.append(fecha_hasta)
    if conds:
        query += " WHERE " + " AND ".join(conds)
    query += " ORDER BY fecha DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [_registro_dict(r) for r in rows]


def habitos_registros_upsert(
    habito_id: int,
    fecha: str,
    valor: float,
    nota: Optional[str] = None,
) -> dict:
    if valor not in (0.5, 1.0):
        raise ValueError(f"valor debe ser 0.5 o 1.0, recibido: {valor}")
    conn = get_connection()
    cursor = conn.cursor()
    creado_en = datetime.now().isoformat()
    cursor.execute(
        """INSERT INTO habitos_registros (habito_id, fecha, valor, nota, creado_en)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(habito_id, fecha) DO UPDATE SET valor = excluded.valor, nota = excluded.nota""",
        (habito_id, fecha, valor, nota, creado_en),
    )
    rid = cursor.lastrowid
    conn.commit()
    cursor.execute(
        "SELECT id, habito_id, fecha, valor, nota, creado_en FROM habitos_registros WHERE habito_id = ? AND fecha = ?",
        (habito_id, fecha),
    )
    row = cursor.fetchone()
    conn.close()
    if DEBUG:
        print(f"habitos_registros_upsert: habito_id={habito_id} fecha={fecha} valor={valor}")
    return _registro_dict(row)


def habitos_registros_eliminar(registro_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM habitos_registros WHERE id = ?", (registro_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def habitos_stats(habito_id: int) -> Optional[dict]:
    """Return pre-computed stats for a single habit (reduces client-side calculation)."""
    from datetime import date as _date
    import json as _json

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(_HABITO_SELECT + " WHERE id = ?", (habito_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    h = _habito_dict(row)

    today = _date.today()
    # All registros for this habit
    cursor.execute(
        "SELECT fecha, valor FROM habitos_registros WHERE habito_id = ? ORDER BY fecha",
        (habito_id,),
    )
    reg_rows = cursor.fetchall()
    conn.close()

    reg_map = {r[0]: r[1] for r in reg_rows}

    def is_scheduled(fecha_str: str) -> bool:
        d = _date.fromisoformat(fecha_str)
        if h["frecuencia_tipo"] == "diario":
            return True
        try:
            dias = _json.loads(h["dias_semana"] or "[]")
        except Exception:
            return False
        dow_js = (d.weekday() + 1) % 7
        return dow_js in dias

    start_str = h["creado_en"][:10] if h["creado_en"] else "2000-01-01"
    today_str  = today.isoformat()

    # Current streak (backwards from today)
    streak_cur = 0
    d = today
    for _ in range(400):
        ds = d.isoformat()
        if ds < start_str:
            break
        if is_scheduled(ds):
            v = reg_map.get(ds, 0)
            if v and v > 0:
                streak_cur += 1
            elif d <= today:
                break
        from datetime import timedelta
        d = d - timedelta(days=1)

    # Max streak (forward pass)
    streak_max = 0
    cur = 0
    from datetime import date as _d2, timedelta as _td
    d = _d2.fromisoformat(start_str)
    while d <= today:
        ds = d.isoformat()
        if is_scheduled(ds):
            v = reg_map.get(ds, 0)
            if v and v > 0:
                cur += 1
                streak_max = max(streak_max, cur)
            else:
                cur = 0
        d += _td(days=1)

    # % this month
    y, m = today.year, today.month
    import calendar as _cal
    days_in_month = _cal.monthrange(y, m)[1]
    sched_m = done_m = 0
    for day in range(1, min(days_in_month, today.day) + 1):
        ds = f"{y:04d}-{m:02d}-{day:02d}"
        if is_scheduled(ds):
            sched_m += 1
            v = reg_map.get(ds, 0)
            if v:
                done_m += v
    pct_mes = round((done_m / sched_m) * 100) if sched_m else 0

    # % previous month
    if m == 1:
        pm, py = 12, y - 1
    else:
        pm, py = m - 1, y
    days_prev = _cal.monthrange(py, pm)[1]
    sched_p = done_p = 0
    for day in range(1, days_prev + 1):
        ds = f"{py:04d}-{pm:02d}-{day:02d}"
        if is_scheduled(ds):
            sched_p += 1
            v = reg_map.get(ds, 0)
            if v:
                done_p += v
    pct_mes_anterior = round((done_p / sched_p) * 100) if sched_p else 0

    return {
        "habito_id":        habito_id,
        "racha_actual":     streak_cur,
        "racha_max":        streak_max,
        "pct_mes":          pct_mes,
        "pct_mes_anterior": pct_mes_anterior,
    }


def habitos_registros_batch_upsert(items: list) -> list:
    """Upsert multiple registros at once. Each item: {habito_id, fecha, valor, nota?}."""
    conn = get_connection()
    cursor = conn.cursor()
    creado_en = datetime.now().isoformat()
    results = []
    for item in items:
        v = item.get("valor")
        if v not in (0.5, 1.0):
            continue  # skip invalid; caller should validate
        habito_id = item["habito_id"]
        fecha     = item["fecha"]
        nota      = item.get("nota")
        cursor.execute(
            """INSERT INTO habitos_registros (habito_id, fecha, valor, nota, creado_en)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(habito_id, fecha) DO UPDATE SET valor = excluded.valor, nota = excluded.nota""",
            (habito_id, fecha, v, nota, creado_en),
        )
        cursor.execute(
            "SELECT id, habito_id, fecha, valor, nota, creado_en FROM habitos_registros WHERE habito_id=? AND fecha=?",
            (habito_id, fecha),
        )
        row = cursor.fetchone()
        if row:
            results.append(_registro_dict(row))
    conn.commit()
    conn.close()
    return results
