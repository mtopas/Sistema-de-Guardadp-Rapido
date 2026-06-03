"""Inspección rápida de tablas fin_* en SQLite. Uso: python scripts/ver_fin_db.py"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import DB_PATH  # noqa: E402

TABLES = [
    "fin_cuentas",
    "fin_categorias",
    "fin_movimientos",
    "fin_config",
    "fin_notas",
    "fin_instrumentos",
    "fin_objetivos",
    "fin_fire_filas",
    "fin_inflacion",
]


def main() -> None:
    print(f"Base de datos: {DB_PATH}\n")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    for table in TABLES:
        cur.execute(f"SELECT COUNT(*) AS n FROM {table}")
        n = cur.fetchone()["n"]
        print(f"=== {table} ({n} filas) ===")
        if n == 0:
            print()
            continue
        cur.execute(f"SELECT * FROM {table} LIMIT 50")
        rows = [dict(r) for r in cur.fetchall()]
        if n > 50:
            print(f"(mostrando 50 de {n})")
        print(json.dumps(rows, ensure_ascii=False, indent=2, default=str).encode("utf-8", "replace").decode("utf-8"))
        print()

    conn.close()


if __name__ == "__main__":
    main()
