import sqlite3
from pathlib import Path

from jarvis.config import JARVIS_DB_PATH, JARVIS_VAULT_PATH
from jarvis.db.schema import SCHEMA

_VAULT_SUBDIRS = ["RAW", "SEMANTIC", "DECISIONS", "PROJECTS"]


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
    finally:
        conn.close()

    for sub in _VAULT_SUBDIRS:
        (JARVIS_VAULT_PATH / sub).mkdir(parents=True, exist_ok=True)


def _migrate(conn: sqlite3.Connection) -> None:
    """Migraciones ligeras para DBs de jarvis.db creadas antes de S2."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(memory_entries)")}
    if "embedded_at" not in cols:
        conn.execute("ALTER TABLE memory_entries ADD COLUMN embedded_at DATETIME")
        conn.commit()
