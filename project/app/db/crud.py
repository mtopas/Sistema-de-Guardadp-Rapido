from datetime import datetime, date, timedelta
import calendar as _calendar
import json
import sqlite3
from typing import Optional

from app.config import DEBUG
from app.db.database import get_connection


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

def crear_categoria(
    nombre: str,
    padre_id: Optional[int] = None,
    icono: Optional[str] = None,
) -> Optional[int]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO categorias (nombre, padre_id, icono) VALUES (?, ?, ?)",
            (nombre.strip(), padre_id, icono),
        )
        cid = cursor.lastrowid
        conn.commit()
        if DEBUG:
            print(f"crear_categoria: id={cid} nombre={nombre} padre_id={padre_id}")
        return cid
    except sqlite3.IntegrityError:
        conn.rollback()
        return None
    finally:
        conn.close()


def obtener_categorias():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre, padre_id, icono FROM categorias ORDER BY id ASC")
    filas = cursor.fetchall()
    conn.close()
    return [{"id": f[0], "nombre": f[1], "padre_id": f[2], "icono": f[3]} for f in filas]


def categoria_existe(categoria_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM categorias WHERE id = ?", (categoria_id,))
    ok = cursor.fetchone() is not None
    conn.close()
    return ok


def eliminar_categoria(categoria_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM categorias WHERE id = ?", (categoria_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"eliminar_categoria: id={categoria_id} deleted={deleted}")
    return deleted


# --- Hojas ---

def crear_hoja(
    contenido: str,
    categoria_id: int,
    tipo: str = "texto",
    apuntes: Optional[str] = None,
    lugar: Optional[str] = None,
    latitud: Optional[float] = None,
    longitud: Optional[float] = None,
    fecha_recordatorio: Optional[str] = None,
    icono: Optional[str] = None,
    link_preview: Optional[dict] = None,
) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    fecha = datetime.now().isoformat()
    preview_json = json.dumps(link_preview) if link_preview else None
    cursor.execute(
        """
        INSERT INTO hojas
            (contenido, fecha, categoria_id, tipo, apuntes, lugar, latitud, longitud, fecha_recordatorio, icono, fecha_actualizado, link_preview)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (contenido, fecha, categoria_id, tipo, apuntes, lugar, latitud, longitud, fecha_recordatorio, icono, fecha, preview_json),
    )
    conn.commit()
    hid = cursor.lastrowid
    conn.close()
    if DEBUG:
        print(f"crear_hoja: id={hid} tipo={tipo} categoria_id={categoria_id}")
    return hid


def obtener_hojas():
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
    conn = get_connection()
    cursor = conn.cursor()
    ahora = datetime.now().isoformat()
    cursor.execute(
        "UPDATE hojas SET apuntes = ?, fecha_actualizado = ? WHERE id = ?",
        (apuntes, ahora, hoja_id),
    )
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"actualizar_apuntes: id={hoja_id}")
    return ahora


def actualizar_icono(hoja_id: int, icono: Optional[str]) -> str:
    conn = get_connection()
    cursor = conn.cursor()
    ahora = datetime.now().isoformat()
    cursor.execute(
        "UPDATE hojas SET icono = ?, fecha_actualizado = ? WHERE id = ?",
        (icono, ahora, hoja_id),
    )
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"actualizar_icono: id={hoja_id} icono={icono}")
    return ahora


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
    """Delete hoja; returns its `contenido` (needed to clean up uploaded files), or None if not found."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT contenido FROM hojas WHERE id = ?", (hoja_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    contenido = row[0]
    cursor.execute("DELETE FROM hojas WHERE id = ?", (hoja_id,))
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"eliminar_hoja: id={hoja_id}")
    return contenido


_HOJA_SELECT = """
    SELECT h.id, h.contenido, h.fecha, h.categoria_id, c.nombre,
           h.tipo, h.apuntes, h.lugar, h.latitud, h.longitud, h.fecha_recordatorio,
           h.icono, h.fecha_actualizado, h.link_preview
    FROM hojas h
    JOIN categorias c ON c.id = h.categoria_id
"""

_UPDATABLE_HOJA = frozenset({"contenido", "categoria_id", "tipo", "apuntes", "icono",
                              "lugar", "fecha_recordatorio"})


def actualizar_hoja(hoja_id: int, campos: dict) -> Optional[dict]:
    """Generic PATCH for a hoja; always stamps fecha_actualizado."""
    safe = {k: v for k, v in campos.items() if k in _UPDATABLE_HOJA}
    if not safe:
        return obtener_hoja_por_id(hoja_id)
    conn = get_connection()
    cursor = conn.cursor()
    ahora = datetime.now().isoformat()
    safe["fecha_actualizado"] = ahora
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [hoja_id]
    cursor.execute(f"UPDATE hojas SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute(_HOJA_SELECT + " WHERE h.id = ?", (hoja_id,))
    row = cursor.fetchone()
    conn.close()
    return _hoja_dict(row) if row else None


def buscar_hojas(q: Optional[str] = None, tipo: Optional[str] = None,
                 categoria_id: Optional[int] = None) -> list:
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
    safe = {k: v for k, v in campos.items() if k in {"nombre", "padre_id", "icono"}}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [categoria_id]
    try:
        cursor.execute(f"UPDATE categorias SET {sets} WHERE id = ?", vals)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        conn.close()
        return None
    cursor.execute("SELECT id, nombre, padre_id, icono FROM categorias WHERE id = ?", (categoria_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row[0], "nombre": row[1], "padre_id": row[2], "icono": row[3]}


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


def fin_crear_cuenta(nombre: str, tipo: str = "wallet", color: Optional[str] = None,
                     initials: Optional[str] = None, saldo_ars: float = 0, saldo_usd: float = 0) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO fin_cuentas (nombre, tipo, color, initials, saldo_ars, saldo_usd) VALUES (?, ?, ?, ?, ?, ?)",
        (nombre.strip(), tipo, color, initials, saldo_ars, saldo_usd),
    )
    cid = cursor.lastrowid
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


def fin_actualizar_cuenta_saldo(cuenta_id: int, saldo_ars: float, saldo_usd: float) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE fin_cuentas SET saldo_ars = ?, saldo_usd = ? WHERE id = ?",
        (saldo_ars, saldo_usd, cuenta_id),
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

def fin_obtener_categorias():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre, color, tipo FROM fin_categorias ORDER BY tipo, id")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "color": r[2], "tipo": r[3]} for r in rows]


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


def fin_eliminar_categoria(cat_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fin_categorias WHERE id = ?", (cat_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


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
        SELECT COALESCE(SUM(CASE WHEN m.tipo = 'income' THEN m.monto ELSE -ABS(m.monto) END), 0)
        FROM fin_movimientos m
        JOIN fin_categorias c ON c.id = m.categoria_id
        WHERE LOWER(c.nombre) = 'emergencia'
    """)
    saldo = cursor.fetchone()[0]
    conn.close()
    return float(saldo)


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
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [mov_id]
    cursor.execute(f"UPDATE fin_movimientos SET {sets} WHERE id = ?", vals)
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
        """SELECT id, tipo, ticker, sociedad, nombre, cantidad, costo_usd, tipo_cambio,
                  precio_actual, entidad, capital_ars, tna, fecha_inicio,
                  fecha_vencimiento, fecha
           FROM fin_instrumentos ORDER BY tipo, id"""
    )
    rows = cursor.fetchall()
    conn.close()
    return [_inst_dict(r) for r in rows]


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


def fin_actualizar_instrumento(inst_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _INST_UPDATABLE}
    if not safe:
        return None
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


_OBJ_UPDATABLE = frozenset({"nombre", "meta", "moneda", "fecha_limite", "cuota_mensual"})


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
    cursor.execute("SELECT id, nombre, color FROM agenda_listas ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "nombre": r[1], "color": r[2]} for r in rows]


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
    return {"id": lid, "nombre": nombre.strip(), "color": color}


_LISTA_UPDATABLE = frozenset({"nombre", "color"})


def agenda_actualizar_lista(lista_id: int, campos: dict) -> Optional[dict]:
    safe = {k: v for k, v in campos.items() if k in _LISTA_UPDATABLE}
    if not safe:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [lista_id]
    cursor.execute(f"UPDATE agenda_listas SET {sets} WHERE id = ?", vals)
    conn.commit()
    cursor.execute("SELECT id, nombre, color FROM agenda_listas WHERE id = ?", (lista_id,))
    row = cursor.fetchone()
    conn.close()
    return {"id": row[0], "nombre": row[1], "color": row[2]} if row else None


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
