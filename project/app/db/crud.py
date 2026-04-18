from datetime import datetime
import sqlite3
from typing import Optional

from app.config import DEBUG
from app.db.database import get_connection


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
):
    conn = get_connection()
    cursor = conn.cursor()
    fecha = datetime.now().isoformat()
    cursor.execute(
        """
        INSERT INTO hojas
            (contenido, fecha, categoria_id, tipo, apuntes, lugar, latitud, longitud, fecha_recordatorio, icono)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (contenido, fecha, categoria_id, tipo, apuntes, lugar, latitud, longitud, fecha_recordatorio, icono),
    )
    conn.commit()
    hid = cursor.lastrowid
    conn.close()
    if DEBUG:
        print(f"crear_hoja: id={hid} tipo={tipo} categoria_id={categoria_id}")


def obtener_hojas():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT h.id, h.contenido, h.fecha, h.categoria_id, c.nombre,
               h.tipo, h.apuntes, h.lugar, h.latitud, h.longitud, h.fecha_recordatorio, h.icono
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
               h.tipo, h.apuntes, h.lugar, h.latitud, h.longitud, h.fecha_recordatorio, h.icono
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


def actualizar_apuntes(hoja_id: int, apuntes: Optional[str]):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE hojas SET apuntes = ? WHERE id = ?", (apuntes, hoja_id))
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"actualizar_apuntes: id={hoja_id}")


def actualizar_icono(hoja_id: int, icono: Optional[str]):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE hojas SET icono = ? WHERE id = ?", (icono, hoja_id))
    conn.commit()
    conn.close()
    if DEBUG:
        print(f"actualizar_icono: id={hoja_id} icono={icono}")


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
