import logging
import re
import sqlite3
from pathlib import Path

from jarvis.config import JARVIS_BOVEDA_PATH, JARVIS_DB_PATH, JARVIS_SYNTH_PATH
from jarvis.db.schema import SCHEMA

logger = logging.getLogger(__name__)

# Fusión Jarvis + Bóveda (2026-09-11): ya no se crean subcarpetas por `type`
# (RAW/SEMANTIC/...) -- esa organización deja de ser física, sobrevive solo
# como metadato de clasificación (ver jarvis/vault/writer.py). Lo único que
# Jarvis crea de entrada es su propio subárbol dentro de D:\Boveda; el árbol
# PARA en sí (00 - Sin categorizar/, etc.) ya existe de antes, gestionado
# del lado de la Bóveda (project/app/vault/), Jarvis no lo recrea.
_SYNTH_SUBDIRS = ["Entidades", "Proyectos", "Sintesis"]

_MEMORY_ENTRIES_CREATE = re.search(
    r"CREATE TABLE IF NOT EXISTS memory_entries \(.*?\n\);", SCHEMA, re.DOTALL
).group(0)

_AUDIT_PROPOSALS_CREATE = re.search(
    r"CREATE TABLE IF NOT EXISTS jarvis_audit_proposals \(.*?\n\);", SCHEMA, re.DOTALL
).group(0)


def get_connection() -> sqlite3.Connection:
    JARVIS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(JARVIS_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        _migrate(conn)
        _init_fts(conn)
    finally:
        conn.close()

    # No se crea JARVIS_BOVEDA_PATH acá -- D:\Boveda ya existe, gestionado
    # por project/app/vault/ (Milestone 2). Si no existe, es una falla de
    # configuración real (JARVIS_BOVEDA_PATH mal seteado) que preferimos que
    # falle visible en vez de crear un árbol vacío silencioso en el lugar
    # equivocado.
    for sub in _SYNTH_SUBDIRS:
        (JARVIS_SYNTH_PATH / sub).mkdir(parents=True, exist_ok=True)


def _init_fts(conn: sqlite3.Connection) -> bool:
    """Índice léxico FTS5 sobre memory_entries (pieza E, búsqueda híbrida) +
    triggers que lo mantienen sincronizado en cada INSERT/UPDATE/DELETE.

    Deliberadamente FUERA de SCHEMA (executescript aborta todo el batch si
    una sentencia falla, y CREATE VIRTUAL TABLE...USING fts5 puede fallar en
    un SQLite sin el módulo FTS5 compilado) -- se aísla acá con su propio
    try/except para que un SQLite viejo no rompa el resto del schema. Si
    falla, jarvis/retriever/retriever.py cae a un fallback LIKE puro para la
    señal léxica -- nunca bloquea nada más.
    """
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS memory_entries_fts "
            "USING fts5(entry_id UNINDEXED, content, tokenize='unicode61')"
        )
        conn.executescript("""
            CREATE TRIGGER IF NOT EXISTS trg_me_fts_insert AFTER INSERT ON memory_entries BEGIN
                INSERT INTO memory_entries_fts (entry_id, content)
                VALUES (new.id, COALESCE(new.content_processed, new.content_raw));
            END;
            CREATE TRIGGER IF NOT EXISTS trg_me_fts_update
            AFTER UPDATE OF content_raw, content_processed ON memory_entries BEGIN
                DELETE FROM memory_entries_fts WHERE entry_id = old.id;
                INSERT INTO memory_entries_fts (entry_id, content)
                VALUES (new.id, COALESCE(new.content_processed, new.content_raw));
            END;
            CREATE TRIGGER IF NOT EXISTS trg_me_fts_delete AFTER DELETE ON memory_entries BEGIN
                DELETE FROM memory_entries_fts WHERE entry_id = old.id;
            END;
        """)
        # Backfill de entradas preexistentes (idempotente -- NOT IN hace que
        # sea un no-op barato una vez que ya se corrió una vez).
        conn.execute(
            """INSERT INTO memory_entries_fts (entry_id, content)
               SELECT id, COALESCE(content_processed, content_raw) FROM memory_entries
               WHERE id NOT IN (SELECT entry_id FROM memory_entries_fts)"""
        )
        conn.commit()
        return True
    except sqlite3.OperationalError as exc:
        logger.warning(
            "[jarvis.db] FTS5 no disponible en este SQLite (%s) -- la búsqueda "
            "léxica de jarvis.retriever caerá a un fallback LIKE puro.", exc,
        )
        return False


def _add_column_if_missing(
    conn: sqlite3.Connection, table: str, column: str, *ddl_variants: str
) -> None:
    """Agrega `column` a `table` (con la primera DDL de `ddl_variants` que
    funcione) si todavía no existe.

    bot.py, uvicorn (backend) y el worker llaman init_db() cada uno al
    arrancar contra la misma jarvis.db -- si dos procesos ven la columna
    ausente en el chequeo inicial y ambos corren el ALTER, el segundo falla
    con "duplicate column name". La versión anterior de esta migración
    (created_by) interpretaba esa excepción asumiendo que el SQLite del
    entorno no soportaba CHECK en ADD COLUMN, reintentaba sin CHECK, y ese
    segundo intento fallaba con el mismo "duplicate column name" sin
    capturar -- crash real en producción el 2026-09-01 (project-bot-1,
    RestartCount=1). El resto de las columnas de abajo ni siquiera tenían
    try/except: un ALTER concurrente las tumbaba directo.

    Fix, mismo estándar que ya usa _migrate_people_type(): nunca interpretar
    QUÉ significó la excepción -- volver a leer PRAGMA table_info() después
    de un fallo y decidir en base al estado real. Si la columna ya está,
    fue la carrera benigna de arriba, se ignora. Si no está, el fallo es
    real: se prueba la siguiente variante de DDL (para created_by, la
    ausencia de soporte CHECK sigue existiendo como motivo real de fallo,
    solo que ahora nunca se confunde con la carrera) o se repropaga si no
    queda ninguna.
    """

    def _cols() -> set[str]:
        return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}

    if column in _cols():
        return

    last_exc: sqlite3.OperationalError | None = None
    for i, ddl in enumerate(ddl_variants):
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
            conn.commit()
            return
        except sqlite3.OperationalError as exc:
            conn.rollback()
            if column in _cols():
                logger.warning(
                    "[jarvis.db] _add_column_if_missing(%s.%s): carrera con "
                    "otro proceso arrancando en simultáneo (%s) -- la columna "
                    "ya existe, se ignora.", table, column, exc,
                )
                return
            last_exc = exc
            if i + 1 < len(ddl_variants):
                logger.warning(
                    "[jarvis.db] _add_column_if_missing(%s.%s): variante de "
                    "DDL falló (%s) y la columna sigue ausente -- no es la "
                    "carrera de arriba, probando la siguiente variante.",
                    table, column, exc,
                )
    raise last_exc


def _migrate(conn: sqlite3.Connection) -> None:
    """Migraciones ligeras para DBs de jarvis.db creadas antes de S2.

    Cada ADD COLUMN pasa por _add_column_if_missing() -- tolera que bot.py,
    uvicorn y el worker corran esta función en paralelo contra la misma DB
    al arrancar (ver su docstring).
    """
    _add_column_if_missing(conn, "memory_entries", "embedded_at", "embedded_at DATETIME")
    _add_column_if_missing(conn, "memory_entries", "valid_to", "valid_to DATETIME")
    _migrate_people_type(conn)

    # Multi-chat web (Mejoras_Jarvis.md punto 3): `conversations` ya modelaba una
    # sesión por canal — se le agrega `title` en vez de crear una tabla `chats`
    # nueva, ver Cerebro/decisiones-implementacion.md. Nullable + sin default:
    # sin CHECK de por medio, no hace falta el rebuild completo que exige
    # _migrate_people_type() arriba.
    _add_column_if_missing(conn, "conversations", "title", "title TEXT")
    _add_column_if_missing(
        conn, "conversations", "last_passive_review_at", "last_passive_review_at DATETIME"
    )

    # created_by (pieza C -- captura pasiva): CHECK vía ALTER TABLE ADD COLUMN
    # funciona en SQLite >= 3.25 mientras el CHECK no referencie otras columnas
    # (no es el caso del rebuild completo que exigió el CHECK de 'PEOPLE', que sí
    # tocaba una columna con datos preexistentes fuera de rango). Fallback sin
    # CHECK si la versión de SQLite del entorno no lo soporta -- la validación de
    # valores queda igual a cargo del código (memory/service.py), nunca None.
    _add_column_if_missing(
        conn, "memory_entries", "created_by",
        "created_by TEXT NOT NULL DEFAULT 'explicit' "
        "CHECK (created_by IN ('explicit','jarvis_proposal_accepted'))",
        "created_by TEXT NOT NULL DEFAULT 'explicit'",
    )

    # Auditoría proactiva de memoria (extensión de consolidation.py, ver
    # Cerebro/decisiones-implementacion.md 2026-08-31): marca hasta cuándo se
    # revisó cada entrada por última vez en una corrida de audit -- mismo
    # patrón que conversations.last_passive_review_at (pieza C). Nullable,
    # sin CHECK -- no hace falta el rebuild completo.
    _add_column_if_missing(conn, "memory_entries", "last_audited_at", "last_audited_at DATETIME")

    # Fusión Jarvis + Bóveda (2026-09-11): eje de autoría -- mismo patrón que
    # created_by (CHECK vía ADD COLUMN, sin rebuild; fallback sin CHECK si el
    # SQLite del entorno no lo soporta).
    _add_column_if_missing(
        conn, "memory_entries", "authorship",
        "authorship TEXT NOT NULL DEFAULT 'user' "
        "CHECK (authorship IN ('user','jarvis_synthesis'))",
        "authorship TEXT NOT NULL DEFAULT 'user'",
    )

    _migrate_audit_proposals_status(conn)
    _migrate_audit_proposals_action_type(conn)
    _migrate_audit_proposals_archive_superseded(conn)

    # Ingestión automática (0.3, Agenda de SGR -- ver Cerebro/decisiones-
    # implementacion.md, 2026-09-03). Columnas nuevas en jarvis_capture_proposals:
    # nullable/con default, sin rebuild -- ver el comentario del schema.
    _add_column_if_missing(
        conn, "jarvis_capture_proposals", "origin_source",
        "origin_source TEXT NOT NULL DEFAULT 'passive_capture' "
        "CHECK (origin_source IN ('passive_capture','agenda_ingestion'))",
        "origin_source TEXT NOT NULL DEFAULT 'passive_capture'",
    )
    _add_column_if_missing(
        conn, "jarvis_capture_proposals", "origin_source_key", "origin_source_key TEXT"
    )
    _migrate_memory_entries_source(conn)


def _migrate_people_type(conn: sqlite3.Connection) -> None:
    """Agrega 'PEOPLE' al CHECK(type IN (...)) de memory_entries (0.2 Slice 3).

    SQLite no permite alterar un CHECK constraint existente con ALTER TABLE —
    hay que recrear la tabla. Detecta si ya se migró leyendo el SQL de creación
    desde sqlite_master (evita reconstruir la tabla en cada arranque).

    Nunca renombra `memory_entries` en sí (construye la tabla nueva bajo un
    nombre temporal y al final la renombra a `memory_entries`) -- bug real
    encontrado en producción: la versión anterior hacía
    `ALTER TABLE memory_entries RENAME TO memory_entries_old` con
    `foreign_keys=OFF`. Por eso SQLite (que solo reescribe las cláusulas
    FOREIGN KEY de *otras* tablas cuando foreign_keys está ON al momento del
    rename, ver docs de ALTER TABLE) nunca actualizó las referencias de
    `inbox_queue`, `memory_entry_entities` y `memory_entry_projects`, que
    quedaron con `REFERENCES "memory_entries_old"(id)` grabado para siempre
    en su SQL -- cualquier INSERT posterior en esas tablas (con
    foreign_keys=ON, como usa get_connection()) fallaba con
    "no such table: main.memory_entries_old" en cuanto se borraba esa tabla.
    Con este approach, `memory_entries` nunca deja de existir bajo su nombre
    canónico salvo un instante entre el DROP de la vieja y el RENAME de la
    nueva -- ninguna otra tabla le hace referencia por nombre a
    `memory_entries_new`, así que no hay nada que SQLite tenga que reescribir.
    """
    if _people_type_present(conn):
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("DROP TABLE IF EXISTS memory_entries_new")
        conn.execute(
            _MEMORY_ENTRIES_CREATE.replace(
                "CREATE TABLE IF NOT EXISTS memory_entries (",
                "CREATE TABLE memory_entries_new (",
                1,
            )
        )
        cols = [row["name"] for row in conn.execute("PRAGMA table_info(memory_entries)")]
        col_list = ", ".join(cols)
        conn.execute(
            f"INSERT INTO memory_entries_new ({col_list}) SELECT {col_list} FROM memory_entries"
        )
        conn.execute("DROP TABLE memory_entries")
        conn.execute("ALTER TABLE memory_entries_new RENAME TO memory_entries")
        conn.executescript(SCHEMA)  # recrea índices + tablas nuevas que falten
        conn.commit()
    except sqlite3.OperationalError as exc:
        # No hay lock explícito entre procesos -- bot.py, uvicorn y el worker
        # llaman init_db() cada uno al arrancar, y si dos arrancan casi al
        # mismo tiempo contra una DB que todavía no tiene el 'PEOPLE' pueden
        # colisionar a mitad de esta migración. Si el otro proceso ya dejó el
        # esquema migrado, esto es una carrera inofensiva -- no un error real
        # -- así que no se propaga.
        conn.rollback()
        if _people_type_present(conn):
            logger.warning(
                "[jarvis.db] _migrate_people_type: carrera con otro proceso "
                "arrancando en simultáneo (%s), pero el esquema ya quedó "
                "migrado -- se ignora.", exc,
            )
            return
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _people_type_present(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory_entries'"
    ).fetchone()
    return row is None or "'PEOPLE'" in row["sql"]


def _migrate_audit_proposals_status(conn: sqlite3.Connection) -> None:
    """Agrega 'RESOLVED_WITH_NEW_INFO' al CHECK(status IN (...)) de
    jarvis_audit_proposals (ver Cerebro/decisiones-implementacion.md,
    2026-08-31, "respuestas de texto libre con información nueva").

    Mismo approach que _migrate_people_type() -- SQLite no permite alterar un
    CHECK existente, hay que reconstruir la tabla. Más simple que ese caso:
    ninguna otra tabla tiene una FK que referencie jarvis_audit_proposals (solo
    tiene una FK saliente hacia memory_entries, que la sentencia CREATE ya
    reescribe tal cual), así que no hace falta el cuidado de "nunca dejar la
    tabla sin existir bajo su nombre canónico" contra referencias de OTRAS
    tablas -- igual se sigue el mismo patrón (crear bajo nombre temporal,
    dropear la vieja, renombrar) por consistencia y para minimizar la ventana
    sin la tabla.
    """
    if _audit_proposals_new_status_present(conn):
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("DROP TABLE IF EXISTS jarvis_audit_proposals_new")
        conn.execute(
            _AUDIT_PROPOSALS_CREATE.replace(
                "CREATE TABLE IF NOT EXISTS jarvis_audit_proposals (",
                "CREATE TABLE jarvis_audit_proposals_new (",
                1,
            )
        )
        cols = [row["name"] for row in conn.execute("PRAGMA table_info(jarvis_audit_proposals)")]
        col_list = ", ".join(cols)
        conn.execute(
            f"INSERT INTO jarvis_audit_proposals_new ({col_list}) "
            f"SELECT {col_list} FROM jarvis_audit_proposals"
        )
        conn.execute("DROP TABLE jarvis_audit_proposals")
        conn.execute("ALTER TABLE jarvis_audit_proposals_new RENAME TO jarvis_audit_proposals")
        conn.executescript(SCHEMA)  # recrea índices
        conn.commit()
    except sqlite3.OperationalError as exc:
        # Misma carrera inofensiva entre procesos que _migrate_people_type()
        # ya documenta (bot.py/uvicorn/worker llaman init_db() cada uno al
        # arrancar) -- si el otro proceso ya migró, no es un error real.
        conn.rollback()
        if _audit_proposals_new_status_present(conn):
            logger.warning(
                "[jarvis.db] _migrate_audit_proposals_status: carrera con otro "
                "proceso arrancando en simultáneo (%s), pero el esquema ya "
                "quedó migrado -- se ignora.", exc,
            )
            return
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _audit_proposals_new_status_present(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jarvis_audit_proposals'"
    ).fetchone()
    return row is None or "'RESOLVED_WITH_NEW_INFO'" in row["sql"]


def _migrate_audit_proposals_action_type(conn: sqlite3.Connection) -> None:
    """Agrega 'open_question' al CHECK(action_type IN (...)) de
    jarvis_audit_proposals (ver Cerebro/decisiones-implementacion.md,
    2026-09-03, "pregunta abierta exploratoria").

    Mismo approach que _migrate_audit_proposals_status() (rebuild completo,
    detección vía sqlite_master.sql, tolerancia a la carrera benigna entre
    procesos) -- CHECK distinto de la misma tabla, se trata como una
    migración separada e idempotente propia en vez de generalizar la función
    de status, para no mezclar dos condiciones de "ya migró" en una sola
    función (cada CHECK se agrega en un momento distinto del historial del
    código, y una futura migración de cualquiera de los dos CHECK no debe
    depender de tocar la otra).
    """
    if _audit_proposals_open_question_present(conn):
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("DROP TABLE IF EXISTS jarvis_audit_proposals_new")
        conn.execute(
            _AUDIT_PROPOSALS_CREATE.replace(
                "CREATE TABLE IF NOT EXISTS jarvis_audit_proposals (",
                "CREATE TABLE jarvis_audit_proposals_new (",
                1,
            )
        )
        cols = [row["name"] for row in conn.execute("PRAGMA table_info(jarvis_audit_proposals)")]
        col_list = ", ".join(cols)
        conn.execute(
            f"INSERT INTO jarvis_audit_proposals_new ({col_list}) "
            f"SELECT {col_list} FROM jarvis_audit_proposals"
        )
        conn.execute("DROP TABLE jarvis_audit_proposals")
        conn.execute("ALTER TABLE jarvis_audit_proposals_new RENAME TO jarvis_audit_proposals")
        conn.executescript(SCHEMA)  # recrea índices
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.rollback()
        if _audit_proposals_open_question_present(conn):
            logger.warning(
                "[jarvis.db] _migrate_audit_proposals_action_type: carrera con "
                "otro proceso arrancando en simultáneo (%s), pero el esquema ya "
                "quedó migrado -- se ignora.", exc,
            )
            return
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _audit_proposals_open_question_present(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jarvis_audit_proposals'"
    ).fetchone()
    return row is None or "'open_question'" in row["sql"]


def _migrate_audit_proposals_archive_superseded(conn: sqlite3.Connection) -> None:
    """Agrega 'archive_superseded' al CHECK(action_type IN (...)) de
    jarvis_audit_proposals -- fusión Jarvis + Bóveda (Cerebro/decisiones-
    implementacion.md, 2026-09-11, addendum punto 1). Décimo action_type:
    cuando consolidation.py marca una entrada `same_fact`/stale-por-edad
    (juicio algorítmico, puede estar mal -- mismo precedente del falso
    positivo Madrid/Buenos Aires), se propone moverla a `04 - Archivo/` en
    vez de moverla sola. NO se dispara desde forget_entry() (esa confirmación
    humana ya existió al pedir "olvidar" -- mueve directo a `05 - Basura/`
    sin propuesta nueva, ver jarvis/memory/service.py::forget_entry()).

    Mismo approach que las otras migraciones de action_type/status de esta
    tabla (rebuild completo bajo nombre temporal, detección vía
    sqlite_master.sql, misma carrera benigna tolerada) -- función separada
    por el mismo motivo que _migrate_audit_proposals_action_type() ya
    documenta: cada CHECK se agrega en un momento distinto, una futura
    migración de cualquiera no debe depender de tocar las otras.
    """
    if _audit_proposals_archive_superseded_present(conn):
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("DROP TABLE IF EXISTS jarvis_audit_proposals_new")
        conn.execute(
            _AUDIT_PROPOSALS_CREATE.replace(
                "CREATE TABLE IF NOT EXISTS jarvis_audit_proposals (",
                "CREATE TABLE jarvis_audit_proposals_new (",
                1,
            )
        )
        cols = [row["name"] for row in conn.execute("PRAGMA table_info(jarvis_audit_proposals)")]
        col_list = ", ".join(cols)
        conn.execute(
            f"INSERT INTO jarvis_audit_proposals_new ({col_list}) "
            f"SELECT {col_list} FROM jarvis_audit_proposals"
        )
        conn.execute("DROP TABLE jarvis_audit_proposals")
        conn.execute("ALTER TABLE jarvis_audit_proposals_new RENAME TO jarvis_audit_proposals")
        conn.executescript(SCHEMA)  # recrea índices
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.rollback()
        if _audit_proposals_archive_superseded_present(conn):
            logger.warning(
                "[jarvis.db] _migrate_audit_proposals_archive_superseded: carrera "
                "con otro proceso arrancando en simultáneo (%s), pero el esquema "
                "ya quedó migrado -- se ignora.", exc,
            )
            return
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _audit_proposals_archive_superseded_present(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jarvis_audit_proposals'"
    ).fetchone()
    return row is None or "'archive_superseded'" in row["sql"]


def _migrate_memory_entries_source(conn: sqlite3.Connection) -> None:
    """Agrega 'agenda' al CHECK(source IN (...)) de memory_entries (0.3,
    ingestión automática -- ver Cerebro/decisiones-implementacion.md,
    2026-09-03, punto 1.4 de la propuesta aprobada: ninguno de los 3 valores
    existentes ('telegram'/'desktop'/'migration') describe honestamente
    "vino de la Agenda de SGR" -- 'migration' ya significa específicamente la
    migración one-time de la Bóveda (0.2 Slice 5), reusarlo hubiera sido
    engañoso para cualquier futura auditoría de proveniencia.

    Mismo approach que _migrate_people_type() (rebuild completo bajo un
    nombre temporal, nunca dejar memory_entries sin existir bajo su nombre
    canónico, tolerancia a la misma carrera benigna entre procesos). Si
    _migrate_people_type() ya corrió en esta misma llamada a _migrate() (DB
    vieja sin 'PEOPLE'), esta función es un no-op: ambas reconstruyen la
    tabla a partir del MISMO _MEMORY_ENTRIES_CREATE (derivado de SCHEMA tal
    como está ahora, con 'agenda' ya incluido), así que la primera que corra
    deja el CHECK completo listo.
    """
    if _source_agenda_present(conn):
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("DROP TABLE IF EXISTS memory_entries_new")
        conn.execute(
            _MEMORY_ENTRIES_CREATE.replace(
                "CREATE TABLE IF NOT EXISTS memory_entries (",
                "CREATE TABLE memory_entries_new (",
                1,
            )
        )
        cols = [row["name"] for row in conn.execute("PRAGMA table_info(memory_entries)")]
        col_list = ", ".join(cols)
        conn.execute(
            f"INSERT INTO memory_entries_new ({col_list}) SELECT {col_list} FROM memory_entries"
        )
        conn.execute("DROP TABLE memory_entries")
        conn.execute("ALTER TABLE memory_entries_new RENAME TO memory_entries")
        conn.executescript(SCHEMA)  # recrea índices + tablas nuevas que falten
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.rollback()
        if _source_agenda_present(conn):
            logger.warning(
                "[jarvis.db] _migrate_memory_entries_source: carrera con otro "
                "proceso arrancando en simultáneo (%s), pero el esquema ya "
                "quedó migrado -- se ignora.", exc,
            )
            return
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _source_agenda_present(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory_entries'"
    ).fetchone()
    return row is None or "'agenda'" in row["sql"]
