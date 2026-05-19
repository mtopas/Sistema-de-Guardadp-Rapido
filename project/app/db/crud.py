from datetime import datetime
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


def eliminar_hoja(hoja_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM hojas WHERE id = ?", (hoja_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"eliminar_hoja: id={hoja_id} deleted={deleted}")
    return deleted


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
