import sqlite3
from datetime import datetime

from app.config import DEBUG, DB_PATH


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_instrumentos (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo              TEXT NOT NULL,
            ticker            TEXT,
            sociedad          TEXT,
            nombre            TEXT NOT NULL,
            cantidad          REAL NOT NULL DEFAULT 0,
            costo_usd         REAL,
            tipo_cambio       REAL,
            precio_actual     REAL,
            entidad           TEXT,
            capital_ars       REAL,
            tna               REAL,
            fecha_inicio      TEXT,
            fecha_vencimiento TEXT,
            fecha             TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_objetivos (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre         TEXT NOT NULL UNIQUE,
            meta           REAL NOT NULL,
            moneda         TEXT NOT NULL DEFAULT 'ARS',
            fecha_limite   TEXT,
            cuota_mensual  REAL,
            fecha_creacion TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_fire_filas (
            mes               TEXT PRIMARY KEY,
            ahorrado_override REAL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_inflacion (
            mes       TEXT PRIMARY KEY,
            inflacion REAL NOT NULL
        )
    """)

    # --- Agenda tables ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agenda_calendarios (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            color  TEXT NOT NULL DEFAULT '#2563eb',
            activo INTEGER NOT NULL DEFAULT 1
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agenda_eventos (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo           TEXT NOT NULL,
            descripcion      TEXT,
            fecha_inicio     TEXT NOT NULL,
            fecha_fin        TEXT,
            todo_el_dia      INTEGER NOT NULL DEFAULT 0,
            se_repite        INTEGER NOT NULL DEFAULT 0,
            regla_repeticion TEXT,
            calendario_id    INTEGER REFERENCES agenda_calendarios(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agenda_listas (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            color  TEXT NOT NULL DEFAULT '#7c3aed'
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agenda_tareas (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo            TEXT NOT NULL,
            descripcion       TEXT,
            fecha_opcional    TEXT,
            hora_opcional     TEXT,
            hora_bloque       TEXT,
            duracion_estimada INTEGER,
            completada        INTEGER NOT NULL DEFAULT 0,
            lista_id          INTEGER REFERENCES agenda_listas(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agenda_horario_facultad (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_semana  INTEGER NOT NULL,
            hora_inicio TEXT NOT NULL,
            hora_fin    TEXT NOT NULL,
            materia     TEXT NOT NULL,
            descripcion TEXT
        )
    """)

    # --- Hábitos tables ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS habitos (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre          TEXT NOT NULL,
            descripcion     TEXT,
            color           TEXT NOT NULL DEFAULT '#7c3aed',
            categoria       TEXT,
            frecuencia_tipo TEXT NOT NULL DEFAULT 'diario',
            dias_semana     TEXT,
            hora            TEXT,
            activo          INTEGER NOT NULL DEFAULT 1,
            creado_en       TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS habitos_registros (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            habito_id INTEGER NOT NULL REFERENCES habitos(id) ON DELETE CASCADE,
            fecha     TEXT NOT NULL,
            valor     REAL NOT NULL,
            nota      TEXT,
            creado_en TEXT NOT NULL,
            UNIQUE(habito_id, fecha)
        )
    """)

    _seed_finanzas(cursor)
    _seed_agenda(cursor)
    _seed_habitos(cursor)
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
        "INSERT OR IGNORE INTO fin_categorias (nombre, color, tipo) VALUES ('Ahorro', NULL, 'both')"
    )
    cursor.execute(
        "INSERT OR IGNORE INTO fin_config (clave, valor) VALUES ('fondo_emergencia_meta', '0')"
    )
    today_mes = datetime.now().strftime("%Y-%m")
    fire_defaults = [
        ("fire_aumento_aporte",     "1.20"),
        ("fire_rentabilidad_anual", "6.00"),
        ("fire_fecha_nacimiento",   ""),
        ("fire_aporte_inicial",     "0"),
        ("fire_saldo_inicial",      "0"),
        ("fire_inicio_mes",         today_mes),
        ("fire_meta_usd",           "0"),
        ("tasa_ahorro_objetivo",    "30"),
    ]
    for clave, valor in fire_defaults:
        cursor.execute(
            "INSERT OR IGNORE INTO fin_config (clave, valor) VALUES (?, ?)", (clave, valor)
        )


def _seed_agenda(cursor):
    pass


def _seed_habitos(cursor):
    pass


def _seed_finanzas(cursor):
    pass


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

    inst_cols = {row[1] for row in cursor.execute("PRAGMA table_info(fin_instrumentos)")}
    if "sociedad" not in inst_cols:
        cursor.execute("ALTER TABLE fin_instrumentos ADD COLUMN sociedad TEXT")
        if DEBUG:
            print("migration: fin_instrumentos.sociedad added")

    # --- agenda_eventos: add ON DELETE CASCADE on calendario_id ---
    # SQLite doesn't support ALTER TABLE to add FK constraints; recreate the table.
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='agenda_eventos'")
    row = cursor.fetchone()
    if row and "ON DELETE CASCADE" not in row[0]:
        cursor.execute("""
            CREATE TABLE agenda_eventos_new (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo           TEXT NOT NULL,
                descripcion      TEXT,
                fecha_inicio     TEXT NOT NULL,
                fecha_fin        TEXT,
                todo_el_dia      INTEGER NOT NULL DEFAULT 0,
                se_repite        INTEGER NOT NULL DEFAULT 0,
                regla_repeticion TEXT,
                calendario_id    INTEGER REFERENCES agenda_calendarios(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            INSERT INTO agenda_eventos_new
            SELECT id, titulo, descripcion, fecha_inicio, fecha_fin,
                   todo_el_dia, se_repite, regla_repeticion, calendario_id
            FROM agenda_eventos
        """)
        cursor.execute("DROP TABLE agenda_eventos")
        cursor.execute("ALTER TABLE agenda_eventos_new RENAME TO agenda_eventos")
        if DEBUG:
            print("migration: agenda_eventos rebuilt with ON DELETE CASCADE")

    # --- agenda_tareas / agenda_eventos: creado_en, actualizado_en ---
    for tabla in ('agenda_tareas', 'agenda_eventos'):
        cols = _get_columns(cursor, tabla)
        if 'creado_en' not in cols:
            cursor.execute(f"ALTER TABLE {tabla} ADD COLUMN creado_en TEXT")
            cursor.execute(f"UPDATE {tabla} SET creado_en = datetime('now') WHERE creado_en IS NULL")
            if DEBUG:
                print(f"migration: {tabla}.creado_en added")
        if 'actualizado_en' not in cols:
            cursor.execute(f"ALTER TABLE {tabla} ADD COLUMN actualizado_en TEXT")
            cursor.execute(f"UPDATE {tabla} SET actualizado_en = datetime('now') WHERE actualizado_en IS NULL")
            if DEBUG:
                print(f"migration: {tabla}.actualizado_en added")

    # --- Index para eventos por fecha ---
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_eventos_inicio ON agenda_eventos(fecha_inicio)"
    )

    # --- hojas: índices de rendimiento ---
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hojas_categoria ON hojas(categoria_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hojas_fecha ON hojas(fecha DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hojas_tipo ON hojas(tipo)")

    # --- fin_movimientos: índices de rendimiento ---
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_fin_mov_fecha ON fin_movimientos(fecha)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_fin_mov_categoria ON fin_movimientos(categoria_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_fin_mov_tipo_fecha ON fin_movimientos(tipo, fecha)"
    )

    # --- fin_config: claves nuevas ---
    for clave, default in [("dolar_oficial_updated_at", ""), ("mes_cierre", "25"), ("dolar_default", "")]:
        cursor.execute(
            "INSERT OR IGNORE INTO fin_config (clave, valor) VALUES (?, ?)",
            (clave, default),
        )

    # --- habitos: archivado_en, notificar, minutos_antes ---
    hab_cols = _get_columns(cursor, "habitos")
    if "archivado_en" not in hab_cols:
        cursor.execute("ALTER TABLE habitos ADD COLUMN archivado_en TEXT")
        if DEBUG:
            print("migration: habitos.archivado_en added")
    if "notificar" not in hab_cols:
        cursor.execute("ALTER TABLE habitos ADD COLUMN notificar INTEGER NOT NULL DEFAULT 0")
        if DEBUG:
            print("migration: habitos.notificar added")
    if "minutos_antes" not in hab_cols:
        cursor.execute("ALTER TABLE habitos ADD COLUMN minutos_antes INTEGER NOT NULL DEFAULT 0")
        if DEBUG:
            print("migration: habitos.minutos_antes added")
