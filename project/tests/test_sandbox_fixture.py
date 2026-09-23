"""Verifica que la fixture de sandbox (tmp_app_db) nunca toca la DB real del usuario."""
import os
from pathlib import Path

from app.paths import database_directory


def test_tmp_app_db_is_isolated_from_real_db(tmp_app_db):
    # database_directory() ignora DB_PATH -- siempre apunta a project/database real,
    # a diferencia de resolve_db_path() que sí respeta el override de la fixture.
    real_db_dir = database_directory().resolve()
    assert tmp_app_db.resolve() != real_db_dir / "app.db"
    assert not str(tmp_app_db.resolve()).startswith(str(real_db_dir))


def test_tmp_app_db_env_matches_fixture_path(tmp_app_db):
    assert Path(os.environ["DB_PATH"]).resolve() == tmp_app_db.resolve()


def test_tmp_app_db_creates_expected_fin_tables(tmp_app_db):
    import sqlite3

    conn = sqlite3.connect(tmp_app_db)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fin_%'")
    tables = {row[0] for row in cursor.fetchall()}
    conn.close()
    assert {"fin_cuentas", "fin_categorias", "fin_movimientos", "fin_objetivos"} <= tables
