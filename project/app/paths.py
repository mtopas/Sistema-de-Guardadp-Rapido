"""Rutas de bundle (PyInstaller) y datos de usuario (%APPDATA%\\SGR en Windows)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "SGR"


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


def user_data_dir() -> Path:
    override = os.getenv("SGR_DATA_DIR")
    if override:
        root = Path(override)
    elif sys.platform == "win32":
        root = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / APP_NAME
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support" / APP_NAME
    else:
        xdg = os.environ.get("XDG_DATA_HOME")
        base = Path(xdg) if xdg else Path.home() / ".local" / "share"
        root = base / APP_NAME
    root.mkdir(parents=True, exist_ok=True)
    return root


def dist_directory() -> Path:
    if is_frozen():
        return bundle_dir() / "frontend" / "dist"
    return project_dir() / "frontend" / "dist"


def uploads_directory() -> Path:
    if is_frozen():
        path = user_data_dir() / "uploads"
    else:
        path = project_dir() / "uploads"
    path.mkdir(parents=True, exist_ok=True)
    return path


def database_directory() -> Path:
    path = user_data_dir() / "database"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_db_path() -> str:
    if os.getenv("DB_PATH"):
        return os.getenv("DB_PATH")
    if is_frozen():
        return str(database_directory() / "app.db")
    return str(project_dir() / "database" / "app.db")
