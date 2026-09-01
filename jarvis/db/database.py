import logging
import re
import sqlite3
from pathlib import Path

from jarvis.config import JARVIS_DB_PATH, JARVIS_VAULT_PATH
from jarvis.db.schema import SCHEMA

logger = logging.getLogger(__name__)

_VAULT_SUBDIRS = ["RAW", "SEMANTIC", "DECISIONS", "PROJECTS", "PEOPLE"]

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

    for sub in _VAULT_SUBDIRS:
        (JARVIS_VAULT_PATH / sub).mkdir(parents=True, exist_ok=True)


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


def _migrate(conn: sqlite3.Connection) -> None:
    """Migraciones ligeras para DBs de jarvis.db creadas antes de S2."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(memory_entries)")}
    if "embedded_at" not in cols:
        conn.execute("ALTER TABLE memory_entries ADD COLUMN embedded_at DATETIME")
        conn.commit()
    if "valid_to" not in cols:
        conn.execute("ALTER TABLE memory_entries ADD COLUMN valid_to DATETIME")
        conn.commit()
    _migrate_people_type(conn)

    # Multi-chat web (Mejoras_Jarvis.md punto 3): `conversations` ya modelaba una
    # sesión por canal — se le agrega `title` en vez de crear una tabla `chats`
    # nueva, ver Cerebro/decisiones-implementacion.md. Nullable + sin default:
    # sin CHECK de por medio, no hace falta el rebuild completo que exige
    # _migrate_people_type() arriba.
    conv_cols = {row["name"] for row in conn.execute("PRAGMA table_info(conversations)")}
    if "title" not in conv_cols:
        conn.execute("ALTER TABLE conversations ADD COLUMN title TEXT")
        conn.commit()
    if "last_passive_review_at" not in conv_cols:
        conn.execute("ALTER TABLE conversations ADD COLUMN last_passive_review_at DATETIME")
        conn.commit()

    # created_by (pieza C -- captura pasiva): CHECK vía ALTER TABLE ADD COLUMN
    # funciona en SQLite >= 3.25 mientras el CHECK no referencie otras columnas
    # (no es el caso del rebuild completo que exigió el CHECK de 'PEOPLE', que sí
    # tocaba una columna con datos preexistentes fuera de rango). Fallback sin
    # CHECK si la versión de SQLite del entorno no lo soporta -- la validación de
    # valores queda igual a cargo del código (memory/service.py), nunca None.
    if "created_by" not in cols:
        try:
            conn.execute(
                "ALTER TABLE memory_entries ADD COLUMN created_by TEXT NOT NULL DEFAULT 'explicit' "
                "CHECK (created_by IN ('explicit','jarvis_proposal_accepted'))"
            )
        except sqlite3.OperationalError as exc:
            logger.warning(
                "[jarvis.db] ALTER TABLE ADD COLUMN con CHECK falló (%s) -- "
                "agregando 'created_by' sin CHECK (SQLite viejo).", exc,
            )
            conn.execute(
                "ALTER TABLE memory_entries ADD COLUMN created_by TEXT NOT NULL DEFAULT 'explicit'"
            )
        conn.commit()

    # Auditoría proactiva de memoria (extensión de consolidation.py, ver
    # Cerebro/decisiones-implementacion.md 2026-08-31): marca hasta cuándo se
    # revisó cada entrada por última vez en una corrida de audit -- mismo
    # patrón que conversations.last_passive_review_at (pieza C). Nullable,
    # sin CHECK -- no hace falta el rebuild completo.
    if "last_audited_at" not in cols:
        conn.execute("ALTER TABLE memory_entries ADD COLUMN last_audited_at DATETIME")
        conn.commit()

    _migrate_audit_proposals_status(conn)


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
