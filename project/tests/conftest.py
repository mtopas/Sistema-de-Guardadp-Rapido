"""Fixtures compartidas para toda la suite de SGR.

IMPORTANTE: `DB_PATH` y `VAULT_ROOT` se leen una sola vez a nivel de módulo en `app.config`
(`app/db/database.py` hace `from app.config import DEBUG, DB_PATH` en su import).
Por eso los overrides de env var tienen que pasar ANTES de que cualquier test o
fixture importe `app.config` / `app.db.database` / `app.db.crud` por primera vez
en todo el proceso de pytest -- este archivo es el primer lugar donde eso puede
pasar, así que los `os.environ[...]` van arriba de todo, antes de cualquier `import app`.

Nunca apunta a `project/database/app.db` ni a `D:\Boveda` reales: siempre archivos de scratch en
%TEMP% (o equivalente), descartables entre tests.
"""
import os
import shutil
import tempfile
from pathlib import Path

_SANDBOX_DIR = Path(tempfile.mkdtemp(prefix="sgr_pytest_"))
os.environ["DB_PATH"] = str(_SANDBOX_DIR / "test_app.db")

_VAULT_SANDBOX_DIR = Path(tempfile.mkdtemp(prefix="sgr_pytest_vault_"))
os.environ["VAULT_ROOT"] = str(_VAULT_SANDBOX_DIR)

import pytest  # noqa: E402

from app.db.database import init_db  # noqa: E402


@pytest.fixture
def tmp_app_db():
    """DB SQLite real (sandbox en %TEMP%) con el esquema recién creado, vacía.

    Se recrea desde cero en cada test que la use -- nunca reutiliza estado de
    un test anterior, y nunca toca `project/database/app.db`.
    """
    db_path = Path(os.environ["DB_PATH"])
    if db_path.exists():
        db_path.unlink()
    init_db()
    yield db_path
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def tmp_vault():
    """Vault real (sandbox en %TEMP%) con estructura inicial, limpia en cada test.

    Se recrea desde cero en cada test que la use -- nunca reutiliza estado de
    un test anterior, y nunca toca `D:\Boveda` real.
    """
    vault_dir = Path(os.environ["VAULT_ROOT"])
    if vault_dir.exists():
        shutil.rmtree(vault_dir)
    vault_dir.mkdir(parents=True, exist_ok=True)
    yield vault_dir
    if vault_dir.exists():
        shutil.rmtree(vault_dir)
