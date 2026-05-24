"""Rutas de bundle (PyInstaller) y datos de usuario (fuera de dist/)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "SGR"
PORTABLE_DIR_NAME = "SGR-data"


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def bundle_dir() -> Path:
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent.parent


def project_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def _exe_dir() -> Path:
    return Path(sys.executable).resolve().parent


def _find_repo_data_root() -> Path | None:
    """
    Si el .exe está en project/dist/SGR/, los datos viven en project/
    (database/, uploads/) — fuera de dist, versionables con git.
    """
    start = _exe_dir()
    for base in (start.parent.parent, start.parent.parent.parent):
        if (base / "database").is_dir() or (base / "database" / "app.db").is_file():
            return base
    return None


def data_root() -> Path:
    """
    Raíz de datos del usuario.
    - Dev: project/
    - .exe desde el repo: project/ (detectado subiendo desde dist/SGR/)
    - .exe portable (solo copiaste dist/SGR): carpeta SGR-data/ al lado del .exe
    - Override: SGR_DATA_DIR
    """
    override = os.getenv("SGR_DATA_DIR")
    if override:
        root = Path(override)
    elif is_frozen():
        found = _find_repo_data_root()
        if found:
            root = found
        else:
            root = _exe_dir().parent / PORTABLE_DIR_NAME
    else:
        root = project_dir()
    root.mkdir(parents=True, exist_ok=True)
    return root


def dist_directory() -> Path:
    if is_frozen():
        return bundle_dir() / "frontend" / "dist"
    return project_dir() / "frontend" / "dist"


def uploads_directory() -> Path:
    path = data_root() / "uploads"
    path.mkdir(parents=True, exist_ok=True)
    return path


def database_directory() -> Path:
    path = data_root() / "database"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_db_path() -> str:
    if os.getenv("DB_PATH"):
        return os.getenv("DB_PATH")
    return str(database_directory() / "app.db")
