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
            fecha_recordatorio TEXT,
            fecha_actualizado  TEXT,
            link_preview       TEXT
        )
    """)

    # --- Finanzas tables ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_cuentas (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre    TEXT NOT NULL,
            tipo      TEXT NOT NULL DEFAULT 'wallet',
            color     TEXT,
            initials  TEXT,
            saldo_ars REAL DEFAULT 0,
            saldo_usd REAL DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_categorias (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            color  TEXT,
            tipo   TEXT NOT NULL DEFAULT 'expense'
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_movimientos (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha        TEXT NOT NULL,
            monto        REAL NOT NULL,
            tipo         TEXT NOT NULL,
            descripcion  TEXT NOT NULL,
            icono        TEXT,
            cuenta_id    INTEGER REFERENCES fin_cuentas(id),
            cuotas       INTEGER,
            categoria_id INTEGER REFERENCES fin_categorias(id),
            moneda       TEXT NOT NULL DEFAULT 'ARS',
            nota         TEXT,
            audit        INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_config (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_notas (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            contenido TEXT NOT NULL,
            fecha     TEXT NOT NULL
        )
    """)

    _seed_finanzas(cursor)
    _apply_migrations(cursor)
    _ensure_fin_data(cursor)
    conn.commit()
    conn.close()

    if DEBUG:
        print("init_db: database ready")


def _ensure_fin_data(cursor):
    """Idempotent: insert essential rows that must always exist."""
    cursor.execute(
        "INSERT OR IGNORE INTO fin_categorias (nombre, color, tipo) VALUES ('Emergencia', NULL, 'both')"
    )
    cursor.execute(
        "INSERT OR IGNORE INTO fin_config (clave, valor) VALUES ('fondo_emergencia_meta', '500000')"
    )


def _seed_finanzas(cursor):
    cursor.execute("SELECT COUNT(*) FROM fin_cuentas")
    if cursor.fetchone()[0] > 0:
        return  # Already seeded

    cuentas = [
        ("Ualá",         "wallet", "#7C3AED", "UA", 284500.0, 0.0),
        ("Mercado Pago", "wallet", "#2563EB", "MP", 412000.0, 0.0),
        ("Brubank",      "wallet", "#059669", "BB",  78000.0, 120.0),
        ("Galicia",      "bank",   "#DC2626", "GA", 920000.0, 0.0),
        ("Galicia USD",  "bank",   "#D97706", "G$",      0.0, 1360.0),
        ("En mano",      "cash",   "#6B7280", "$$", 148000.0, 0.0),
    ]
    for c in cuentas:
        cursor.execute(
            "INSERT INTO fin_cuentas (nombre, tipo, color, initials, saldo_ars, saldo_usd) VALUES (?, ?, ?, ?, ?, ?)",
            c,
        )

    categorias = [
        ("Comida",        None, "expense"),
        ("Alquiler",      None, "expense"),
        ("Transporte",    None, "expense"),
        ("Suscripciones", None, "expense"),
        ("Salud",         None, "expense"),
        ("Ocio",          None, "expense"),
        ("Trabajo",       None, "income"),
        ("Freelance",     None, "income"),
        ("Dividendos",    None, "income"),
        ("Otros",         None, "both"),
    ]
    for cat in categorias:
        cursor.execute(
            "INSERT INTO fin_categorias (nombre, color, tipo) VALUES (?, ?, ?)",
            cat,
        )

    cursor.execute("SELECT id, nombre FROM fin_cuentas")
    cm = {row[1]: row[0] for row in cursor.fetchall()}
    cursor.execute("SELECT id, nombre FROM fin_categorias")
    catm = {row[1]: row[0] for row in cursor.fetchall()}

    movimientos = [
        # (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, audit)
        ("2026-05-01T09:00:00",  1500000, "income",  "Sueldo",                 "💼", cm["Galicia"],     None, catm["Trabajo"],       "ARS", None, 0),
        ("2026-05-03T11:00:00",   350000, "income",  "Proyecto web",           "💻", cm["Ualá"],        None, catm["Freelance"],      "ARS", None, 0),
        ("2026-05-05T10:00:00",   130000, "income",  "Dividendos broker",      "📈", cm["Galicia USD"], None, catm["Dividendos"],     "ARS", None, 0),
        ("2026-05-06T14:00:00",  -120000, "expense", "Compra Amazon",          "📦", cm["Brubank"],     6,    catm["Otros"],          "ARS", None, 0),
        ("2026-05-07T20:30:00",   -12000, "expense", "Teatro",                 "🎭", cm["Galicia"],     None, catm["Ocio"],           "ARS", None, 0),
        ("2026-05-08T13:00:00",   -15000, "expense", "Delivery Mercado Libre", "🛒", cm["Ualá"],        None, catm["Comida"],         "ARS", None, 0),
        ("2026-05-09T22:00:00",    -7800, "expense", "Netflix",                "📺", cm["Galicia"],     None, catm["Suscripciones"],  "ARS", None, 0),
        ("2026-05-10T08:00:00",  -380000, "expense", "Alquiler Mayo",          "🏠", cm["Galicia"],     None, catm["Alquiler"],       "ARS", None, 0),
        ("2026-05-11T09:30:00",    -4500, "expense", "Spotify Familiar",       "📡", cm["Galicia"],     None, catm["Suscripciones"],  "ARS", None, 0),
        ("2026-05-11T11:00:00",    -6300, "expense", "Farmacia",               "💊", cm["Mercado Pago"],None, catm["Salud"],          "ARS", None, 0),
        ("2026-05-11T15:00:00",    -1900, "expense", "iCloud 200GB",           "☁️", cm["Ualá"],        None, catm["Suscripciones"],  "ARS", None, 0),
        ("2026-05-12T12:00:00",   -34200, "expense", "Supermercado Coto",      "🛒", cm["Galicia"],     None, catm["Comida"],         "ARS", None, 0),
        ("2026-05-12T21:00:00",   -18500, "expense", "Cine + cena",            "🎬", cm["Ualá"],        None, catm["Ocio"],           "ARS", None, 0),
        ("2026-05-13T12:30:00",    -8400, "expense", "Almuerzo La Birra",      "🍱", cm["Ualá"],        None, catm["Comida"],         "ARS", None, 0),
        ("2026-05-13T16:00:00",    -2000, "expense", "SUBE recarga",           "🚇", cm["Mercado Pago"],None, catm["Transporte"],     "ARS", None, 0),
        ("2026-05-13T18:00:00",   480000, "income",  "Honorarios proyecto",    "💼", cm["Galicia"],     None, catm["Trabajo"],        "ARS", None, 1),
        ("2026-05-14T09:00:00",   -12000, "expense", "Médico clínico",         "🏥", cm["Mercado Pago"],None, catm["Salud"],          "ARS", None, 0),
        ("2026-05-14T11:00:00",   -45000, "expense", "Nafta",                  "⛽", cm["En mano"],     None, catm["Transporte"],     "ARS", None, 0),
        ("2026-05-14T19:00:00",   -77500, "expense", "Ropa y zapatillas",      "👟", cm["Ualá"],        3,    catm["Otros"],          "ARS", None, 0),
    ]
    for mov in movimientos:
        cursor.execute(
            """INSERT INTO fin_movimientos
               (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, audit)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            mov,
        )

    config = [
        ("dolar_oficial",        "1245"),
        ("fire_meta_usd",        "500000"),
        ("fire_year",            "2041"),
        ("fire_monthly_usd",     "2400"),
        ("tasa_ahorro_objetivo", "40"),
    ]
    for entry in config:
        cursor.execute("INSERT OR IGNORE INTO fin_config (clave, valor) VALUES (?, ?)", entry)

    if DEBUG:
        print("_seed_finanzas: test data inserted")


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

    if "fecha_actualizado" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN fecha_actualizado TEXT")
        cursor.execute("UPDATE hojas SET fecha_actualizado = fecha WHERE fecha_actualizado IS NULL")
        if DEBUG:
            print("migration: hojas.fecha_actualizado added")

    if "link_preview" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN link_preview TEXT")
        if DEBUG:
            print("migration: hojas.link_preview added")
