import sqlite3

from app.config import DEBUG, DB_PATH


def get_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


def _get_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categorias (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre   TEXT NOT NULL UNIQUE,
            padre_id INTEGER REFERENCES categorias(id),
            icono    TEXT
        )
    """)

    cursor.execute("SELECT COUNT(*) FROM categorias")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO categorias (nombre) VALUES ('General')")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hojas (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            contenido          TEXT NOT NULL,
            fecha              TEXT NOT NULL,
            categoria_id       INTEGER NOT NULL REFERENCES categorias(id),
            tipo               TEXT NOT NULL DEFAULT 'texto',
            apuntes            TEXT,
            lugar              TEXT,
            latitud            REAL,
            longitud           REAL,
            fecha_recordatorio TEXT
        )
    """)

    _apply_migrations(cursor)
    conn.commit()
    conn.close()

    if DEBUG:
        print("init_db: database ready")


def _apply_migrations(cursor):
    # --- categorias ---
    cat_cols = _get_columns(cursor, "categorias")

    if "padre_id" not in cat_cols:
        cursor.execute("ALTER TABLE categorias ADD COLUMN padre_id INTEGER REFERENCES categorias(id)")
        if DEBUG:
            print("migration: categorias.padre_id added")

    if "icono" not in cat_cols:
        cursor.execute("ALTER TABLE categorias ADD COLUMN icono TEXT")
        if DEBUG:
            print("migration: categorias.icono added")

    # --- hojas ---
    hoja_cols = _get_columns(cursor, "hojas")

    if "categoria_id" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN categoria_id INTEGER")
        cursor.execute("SELECT id FROM categorias ORDER BY id LIMIT 1")
        row = cursor.fetchone()
        default_cat = row[0] if row else None
        if default_cat is None:
            cursor.execute("INSERT INTO categorias (nombre) VALUES ('General')")
            default_cat = cursor.lastrowid
        cursor.execute("UPDATE hojas SET categoria_id = ? WHERE categoria_id IS NULL", (default_cat,))
        if DEBUG:
            print("migration: hojas.categoria_id added")

    if "tipo" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'texto'")
        if DEBUG:
            print("migration: hojas.tipo added")

    if "apuntes" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN apuntes TEXT")
        if DEBUG:
            print("migration: hojas.apuntes added")

    if "lugar" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN lugar TEXT")
        if DEBUG:
            print("migration: hojas.lugar added")

    if "latitud" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN latitud REAL")
        if DEBUG:
            print("migration: hojas.latitud added")

    if "longitud" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN longitud REAL")
        if DEBUG:
            print("migration: hojas.longitud added")

    if "fecha_recordatorio" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN fecha_recordatorio TEXT")
        if DEBUG:
            print("migration: hojas.fecha_recordatorio added")

    if "icono" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN icono TEXT")
        if DEBUG:
            print("migration: hojas.icono added")
