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
            icono    TEXT,
            color    TEXT
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            contenido TEXT NOT NULL,
            fecha     TEXT NOT NULL
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
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre      TEXT NOT NULL UNIQUE,
            color       TEXT,
            tipo        TEXT NOT NULL DEFAULT 'expense',
            oculta      INTEGER NOT NULL DEFAULT 0,
            objetivo_id INTEGER REFERENCES fin_objetivos(id)
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fin_transacciones_instrumento (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            instrumento_id INTEGER NOT NULL REFERENCES fin_instrumentos(id) ON DELETE CASCADE,
            tipo           TEXT NOT NULL,
            fecha          TEXT NOT NULL,
            cantidad       REAL NOT NULL,
            precio         REAL NOT NULL,
            monto_total    REAL NOT NULL,
            nota           TEXT,
            creado_en      TEXT NOT NULL
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
            color  TEXT NOT NULL DEFAULT '#7c3aed',
            pinned INTEGER NOT NULL DEFAULT 0
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

    # "Eliminar por este día" (HOY) salta solo la ocurrencia de una fecha puntual,
    # sin tocar el horario semanal fijo -- agenda_horario_facultad no tiene fechas,
    # así que la excepción vive en tabla aparte en vez de mutar la fila del horario.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agenda_horario_facultad_excepciones (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            horario_facultad_id  INTEGER NOT NULL REFERENCES agenda_horario_facultad(id) ON DELETE CASCADE,
            fecha                TEXT NOT NULL,
            UNIQUE(horario_facultad_id, fecha)
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
    _migrate_fin_saldos_desde_movimientos(cursor)
    _migrate_fin_saldos_signo_v2(cursor)
    _migrate_fin_saldos_transfer_v3(cursor)
    conn.commit()
    conn.close()

    if DEBUG:
        print("init_db: database ready")


def _migrate_fin_saldos_desde_movimientos(cursor):
    """Una vez: alinear saldo_ars/usd con la suma de movimientos existentes."""
    cursor.execute(
        "SELECT valor FROM fin_config WHERE clave = 'saldos_desde_movimientos_v1'"
    )
    if cursor.fetchone():
        return
    from app.db.crud import fin_recalcular_saldos_cuentas

    fin_recalcular_saldos_cuentas(cursor)
    cursor.execute(
        "INSERT OR REPLACE INTO fin_config (clave, valor) VALUES ('saldos_desde_movimientos_v1', '1')"
    )
    if DEBUG:
        print("migration: fin_cuentas saldos recalculados desde movimientos")


def _migrate_fin_saldos_signo_v2(cursor):
    """Recalcula saldos: ingresos suman, gastos restan (fix signo)."""
    cursor.execute(
        "SELECT valor FROM fin_config WHERE clave = 'saldos_signo_income_expense_v2'"
    )
    if cursor.fetchone():
        return
    from app.db.crud import fin_recalcular_saldos_cuentas

    fin_recalcular_saldos_cuentas(cursor)
    cursor.execute(
        "INSERT OR REPLACE INTO fin_config (clave, valor) VALUES ('saldos_signo_income_expense_v2', '1')"
    )
    if DEBUG:
        print("migration: fin_cuentas saldos recalculados (ingreso +, gasto -)")


def _migrate_fin_saldos_transfer_v3(cursor):
    """Transferencias vuelven a mover saldo por cuenta (gasto − / ingreso +)."""
    cursor.execute(
        "SELECT valor FROM fin_config WHERE clave = 'saldos_transfer_cuentas_v3'"
    )
    if cursor.fetchone():
        return
    from app.db.crud import fin_recalcular_saldos_cuentas

    fin_recalcular_saldos_cuentas(cursor)
    cursor.execute(
        "INSERT OR REPLACE INTO fin_config (clave, valor) VALUES ('saldos_transfer_cuentas_v3', '1')"
    )
    if DEBUG:
        print("migration: saldos por cuenta incluyen transferencias")


def _ensure_fin_data(cursor):
    """Idempotent: insert essential rows that must always exist."""
    cursor.execute(
        "INSERT OR IGNORE INTO fin_categorias (nombre, color, tipo) VALUES ('Ajuste', NULL, 'both')"
    )
    cursor.execute(
        "INSERT OR IGNORE INTO fin_categorias (nombre, color, tipo) VALUES ('FIRE', NULL, 'both')"
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


def _migrate_fin_categorias_objetivos(cursor):
    """oculta + objetivo_id; categoría FIRE; objetivo Fondo de emergencia; sync categorías de objetivos."""
    from datetime import datetime as _dt

    fin_cols = _get_columns(cursor, "fin_categorias")
    if "oculta" not in fin_cols:
        cursor.execute("ALTER TABLE fin_categorias ADD COLUMN oculta INTEGER NOT NULL DEFAULT 0")
        if DEBUG:
            print("migration: fin_categorias.oculta added")
    if "objetivo_id" not in fin_cols:
        cursor.execute(
            "ALTER TABLE fin_categorias ADD COLUMN objetivo_id INTEGER REFERENCES fin_objetivos(id)"
        )
        if DEBUG:
            print("migration: fin_categorias.objetivo_id added")

    cursor.execute(
        "INSERT OR IGNORE INTO fin_categorias (nombre, color, tipo, oculta) VALUES ('FIRE', NULL, 'both', 0)"
    )
    cursor.execute(
        "UPDATE fin_categorias SET oculta = 1 WHERE LOWER(nombre) = 'emergencia' AND objetivo_id IS NULL"
    )

    emergencia_nombre = "Fondo de emergencia"
    cursor.execute(
        "SELECT valor FROM fin_config WHERE clave = 'fin_emergencia_objetivo_deshabilitado'"
    )
    _cfg_em = cursor.fetchone()
    emergencia_deshabilitada = _cfg_em is not None and _cfg_em[0] == "1"

    if not emergencia_deshabilitada:
        cursor.execute("SELECT id FROM fin_objetivos WHERE nombre = ? LIMIT 1", (emergencia_nombre,))
        row = cursor.fetchone()
        if not row:
            meta = 0.0
            cursor.execute("SELECT valor FROM fin_config WHERE clave = 'fondo_emergencia_meta'")
            cfg = cursor.fetchone()
            if cfg and cfg[0]:
                try:
                    meta = float(cfg[0])
                except ValueError:
                    meta = 0.0
            cursor.execute(
                """INSERT INTO fin_objetivos (nombre, meta, moneda, fecha_limite, cuota_mensual, fecha_creacion)
                   VALUES (?, ?, 'ARS', NULL, NULL, ?)""",
                (emergencia_nombre, meta, _dt.now().isoformat()),
            )
            oid = cursor.lastrowid
        else:
            oid = row[0]

        cursor.execute("SELECT id FROM fin_categorias WHERE objetivo_id = ?", (oid,))
        cat_row = cursor.fetchone()
        if cat_row:
            cursor.execute(
                "UPDATE fin_categorias SET nombre = ?, oculta = 0, tipo = 'both' WHERE id = ?",
                (emergencia_nombre, cat_row[0]),
            )
        else:
            cursor.execute("SELECT id FROM fin_categorias WHERE nombre = ?", (emergencia_nombre,))
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    "UPDATE fin_categorias SET objetivo_id = ?, oculta = 0, tipo = 'both' WHERE id = ?",
                    (oid, existing[0]),
                )
            else:
                cursor.execute(
                    """INSERT INTO fin_categorias (nombre, color, tipo, oculta, objetivo_id)
                       VALUES (?, NULL, 'both', 0, ?)""",
                    (emergencia_nombre, oid),
                )

    cursor.execute("SELECT id, nombre FROM fin_objetivos")
    for oid, nombre in cursor.fetchall():
        cursor.execute("SELECT id FROM fin_categorias WHERE objetivo_id = ?", (oid,))
        linked = cursor.fetchone()
        if linked:
            cursor.execute(
                "UPDATE fin_categorias SET nombre = ?, oculta = 0, tipo = 'both' WHERE id = ?",
                (nombre, linked[0]),
            )
            continue
        cursor.execute("SELECT id FROM fin_categorias WHERE nombre = ?", (nombre,))
        by_name = cursor.fetchone()
        if by_name:
            cursor.execute(
                "UPDATE fin_categorias SET objetivo_id = ?, oculta = 0, tipo = 'both' WHERE id = ?",
                (oid, by_name[0]),
            )
        else:
            cursor.execute(
                """INSERT INTO fin_categorias (nombre, color, tipo, oculta, objetivo_id)
                   VALUES (?, NULL, 'both', 0, ?)""",
                (nombre, oid),
            )

    if DEBUG:
        print("migration: fin_categorias objetivos/FIRE sync done")


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

    if "color" not in cat_cols:
        cursor.execute("ALTER TABLE categorias ADD COLUMN color TEXT")
        if DEBUG:
            print("migration: categorias.color added")

    # --- categorias: Milestone 2 (D:\Boveda como fuente de verdad) ---
    # `nombre` tenía UNIQUE global; el árbol real de carpetas repite nombre bajo
    # padres distintos (ej. "Facultad" en 02 - Areas/ y en 03 - Recursos/), así
    # que la constraint se retira y se reemplaza por UNIQUE(ruta). SQLite no
    # soporta ALTER TABLE para constraints -- hace falta reconstruir la tabla,
    # igual que ya se hizo con agenda_eventos más abajo en esta función.
    cat_cols = _get_columns(cursor, "categorias")
    if "ruta" not in cat_cols:
        categorias_viejas = {
            "Desarrollo", "React", "Universidad", "Ideas", "General",
            "IAs Noticias", "Sin Categorizar",
        }
        cursor.execute("SELECT nombre FROM categorias")
        nombres_actuales = {row[0] for row in cursor.fetchall()}
        purgar_legacy = nombres_actuales and nombres_actuales <= categorias_viejas

        cursor.connection.commit()
        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute("""
            CREATE TABLE categorias_new (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre      TEXT NOT NULL,
                padre_id    INTEGER REFERENCES categorias(id),
                icono       TEXT,
                color       TEXT,
                ruta        TEXT,
                estructural INTEGER NOT NULL DEFAULT 0
            )
        """)
        if purgar_legacy:
            # Filas viejas (Desarrollo/React/Universidad/Ideas/General/IAs Noticias/
            # Sin Categorizar): su contenido real ya está migrado a D:\Boveda (ver
            # Cerebro/decisiones-implementacion.md 2026-09-11); el resto era basura
            # de prueba. No se copian -- sincronizar_vault() repuebla desde las
            # carpetas reales en el próximo arranque. Las hojas que las
            # referenciaban se borran con ellas (su contenido real, si existía,
            # también vive ya en D:\Boveda como archivo).
            cursor.execute("DELETE FROM hojas WHERE categoria_id IN (SELECT id FROM categorias)")
            if DEBUG:
                print("migration: categorias/hojas legacy purgadas (reemplazadas por árbol PARA)")
        else:
            cursor.execute("""
                INSERT INTO categorias_new (id, nombre, padre_id, icono, color)
                SELECT id, nombre, padre_id, icono, color FROM categorias
            """)
        cursor.execute("DROP TABLE categorias")
        cursor.execute("ALTER TABLE categorias_new RENAME TO categorias")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_ruta ON categorias(ruta)")
        cursor.connection.commit()
        cursor.execute("PRAGMA foreign_keys = ON")
        if DEBUG:
            print("migration: categorias reconstruida con ruta/estructural (UNIQUE nombre retirado)")

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

    # --- hojas: Milestone 2 (D:\Boveda como fuente de verdad) ---
    # `id` (INTEGER PK) sigue siendo el id que ya usan frontend/bot; vault_id/ruta
    # son el vínculo con el archivo real, mtime permite saltar notas sin cambios
    # en sincronizar_vault() (mismo criterio de Milestone 1). UNIQUE vía índice
    # (no constraint inline) porque ALTER TABLE ADD COLUMN no soporta UNIQUE
    # directo en SQLite; múltiples NULL conviven sin problema en un índice único.
    if "vault_id" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN vault_id TEXT")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hojas_vault_id ON hojas(vault_id)")
        if DEBUG:
            print("migration: hojas.vault_id added")

    if "ruta" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN ruta TEXT")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hojas_ruta ON hojas(ruta)")
        if DEBUG:
            print("migration: hojas.ruta added")

    if "mtime" not in hoja_cols:
        cursor.execute("ALTER TABLE hojas ADD COLUMN mtime REAL")
        if DEBUG:
            print("migration: hojas.mtime added")

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

    # --- agenda_listas: pinned (vista canvas, listas "pineadas" primero) ---
    listas_cols = _get_columns(cursor, "agenda_listas")
    if "pinned" not in listas_cols:
        cursor.execute("ALTER TABLE agenda_listas ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
        if DEBUG:
            print("migration: agenda_listas.pinned added")

    # --- agenda_tareas: recurrencia (diario/semanal/mensual), mismo shape que
    # agenda_eventos.regla_repeticion pero materializando filas reales en vez
    # de expandir en tiempo de lectura -- las tareas tienen estado propio
    # (completada) por ocurrencia, a diferencia de los eventos. ---
    tareas_cols = _get_columns(cursor, "agenda_tareas")
    if "se_repite" not in tareas_cols:
        cursor.execute("ALTER TABLE agenda_tareas ADD COLUMN se_repite INTEGER NOT NULL DEFAULT 0")
        if DEBUG:
            print("migration: agenda_tareas.se_repite added")
    if "regla_repeticion" not in tareas_cols:
        cursor.execute("ALTER TABLE agenda_tareas ADD COLUMN regla_repeticion TEXT")
        if DEBUG:
            print("migration: agenda_tareas.regla_repeticion added")
    if "serie_id" not in tareas_cols:
        cursor.execute("ALTER TABLE agenda_tareas ADD COLUMN serie_id INTEGER")
        if DEBUG:
            print("migration: agenda_tareas.serie_id added")

    # --- Index para eventos por fecha ---
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_eventos_inicio ON agenda_eventos(fecha_inicio)"
    )

    # --- agenda_horario_facultad: color por materia ---
    hf_cols = _get_columns(cursor, "agenda_horario_facultad")
    if "color" not in hf_cols:
        cursor.execute(
            "ALTER TABLE agenda_horario_facultad ADD COLUMN color TEXT NOT NULL DEFAULT '#059669'"
        )
        if DEBUG:
            print("migration: agenda_horario_facultad.color added")

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
    for clave, default in [("dolar_oficial_updated_at", ""), ("mes_cierre", "25"), ("dolar_default", ""), ("uva_valor", "")]:
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

    _migrate_fin_categorias_objetivos(cursor)

    # --- fin_transacciones_instrumento: moneda + tipo_cambio por tx ---
    trans_cols = _get_columns(cursor, "fin_transacciones_instrumento")
    if "moneda" not in trans_cols:
        cursor.execute(
            "ALTER TABLE fin_transacciones_instrumento ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS'"
        )
        if DEBUG:
            print("migration: fin_transacciones_instrumento.moneda added")
    if "tipo_cambio" not in trans_cols:
        cursor.execute(
            "ALTER TABLE fin_transacciones_instrumento ADD COLUMN tipo_cambio REAL"
        )
        if DEBUG:
            print("migration: fin_transacciones_instrumento.tipo_cambio added")

    # Índices para el ledger
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_fin_trans_inst "
        "ON fin_transacciones_instrumento(instrumento_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_fin_trans_fecha "
        "ON fin_transacciones_instrumento(instrumento_id, fecha ASC, id ASC)"
    )

    # Backfill: posiciones manuales sin transacciones → tx sintética "Saldo inicial"
    # Solo acciones/ons/crypto con cantidad > 0 y costo_usd conocido
    cursor.execute(
        """SELECT i.id, i.cantidad, i.costo_usd
           FROM fin_instrumentos i
           WHERE i.tipo IN ('acciones', 'ons', 'crypto')
             AND i.cantidad > 0
             AND i.costo_usd IS NOT NULL
             AND NOT EXISTS (
                 SELECT 1 FROM fin_transacciones_instrumento t
                 WHERE t.instrumento_id = i.id
             )"""
    )
    backfill_rows = cursor.fetchall()
    now_iso = datetime.now().isoformat()
    for inst_id, cantidad, costo_usd in backfill_rows:
        precio_usd = costo_usd / cantidad if cantidad > 0 else 0.0
        cursor.execute(
            """INSERT INTO fin_transacciones_instrumento
               (instrumento_id, tipo, fecha, cantidad, precio, monto_total,
                nota, creado_en, moneda, tipo_cambio)
               VALUES (?, 'compra', date('now'), ?, ?, ?, 'Saldo inicial', ?, 'USD', NULL)""",
            (inst_id, cantidad, precio_usd, round(precio_usd * cantidad, 6), now_iso),
        )
        if DEBUG:
            print(f"migration: backfill tx for instrumento_id={inst_id}")
