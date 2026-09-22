"""Indexador/poller de D:\\Boveda (CLI de auditoría manual).

Lee el árbol PARA completo de la Bóveda (Markdown con frontmatter YAML) y arma un
índice en SQLite separado (`database/vault_index.db`, no `app.db`). Milestone 1
de la fusión Jarvis+Bóveda -- desde Milestone 2 la sincronización real que usa
la app vive en `app/vault/sync.py` (escribe directo a `hojas`/`categorias`);
este script sigue siendo útil como auditoría manual independiente de la API
(no requiere levantar el backend), y reusa el mismo parseo de frontmatter
(`app/vault/parser.py`) para no duplicar esa lógica.

Uso:
    python scripts/vault_indexer.py                # corrida normal contra D:\\Boveda
    python scripts/vault_indexer.py --dry-run       # no reescribe archivos sin id
    python scripts/vault_indexer.py --vault-root X --db-path Y   # para pruebas
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.vault import parser  # noqa: E402

logger = logging.getLogger("vault_indexer")

DEFAULT_VAULT_ROOT = ROOT.parent.parent / "Boveda"  # sibling del repo, portable
DEFAULT_DB_PATH = ROOT / "database" / "vault_index.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS vault_notas (
    id TEXT PRIMARY KEY,
    ruta TEXT NOT NULL UNIQUE,
    carpeta TEXT NOT NULL,
    carpeta_raiz TEXT NOT NULL,
    titulo TEXT,
    tipo TEXT,
    creado_en TEXT,
    actualizado_en TEXT,
    origen TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    url TEXT,
    mtime REAL NOT NULL,
    tamano_bytes INTEGER NOT NULL,
    indexado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vault_notas_carpeta_raiz ON vault_notas(carpeta_raiz);
CREATE INDEX IF NOT EXISTS idx_vault_notas_tipo ON vault_notas(tipo);

CREATE TABLE IF NOT EXISTS vault_corridas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    iniciado_en TEXT NOT NULL,
    finalizado_en TEXT,
    vault_root TEXT NOT NULL,
    archivos_totales INTEGER NOT NULL DEFAULT 0,
    archivos_nuevos INTEGER NOT NULL DEFAULT 0,
    archivos_actualizados INTEGER NOT NULL DEFAULT 0,
    archivos_sin_cambios INTEGER NOT NULL DEFAULT 0,
    archivos_con_error INTEGER NOT NULL DEFAULT 0,
    ids_asignados INTEGER NOT NULL DEFAULT 0,
    notas_eliminadas INTEGER NOT NULL DEFAULT 0
);
"""


def iter_markdown_files(root: Path):
    for path in sorted(root.rglob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        yield path


def carpeta_raiz_de(rel_path: Path) -> str:
    return rel_path.parts[0]


def run(vault_root: Path, db_path: Path, dry_run: bool = False) -> dict:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)

    iniciado_en = parser.now_iso()
    cur = con.execute(
        "INSERT INTO vault_corridas (iniciado_en, vault_root) VALUES (?, ?)",
        (iniciado_en, str(vault_root)),
    )
    corrida_id = cur.lastrowid

    existentes = {
        row[0]: (row[1], row[2])  # ruta -> (id, mtime)
        for row in con.execute("SELECT ruta, id, mtime FROM vault_notas")
    }
    ids_previos = {v[0] for v in existentes.values()}

    stats = dict(
        archivos_totales=0,
        archivos_nuevos=0,
        archivos_actualizados=0,
        archivos_sin_cambios=0,
        archivos_con_error=0,
        ids_asignados=0,
        notas_eliminadas=0,
    )
    seen_ids: set[str] = set()

    for path in iter_markdown_files(vault_root):
        rel_path = path.relative_to(vault_root)
        rel_path_str = str(rel_path)
        stats["archivos_totales"] += 1
        st = path.stat()

        prev = existentes.get(rel_path_str)
        if prev is not None and prev[1] == st.st_mtime:
            # Sin cambios desde la última corrida: no re-parsea, pero
            # igual cuenta como "visto" para no borrarlo al final.
            seen_ids.add(prev[0])
            stats["archivos_sin_cambios"] += 1
            continue

        try:
            nota, id_asignado = parser.parse_nota(path, dry_run, logger=logger)
        except Exception as exc:
            logger.error("Error procesando %s: %s", path, exc)
            stats["archivos_con_error"] += 1
            continue

        if id_asignado:
            stats["ids_asignados"] += 1
            st = path.stat()  # el archivo se reescribió, mtime cambió

        if nota.id in seen_ids:
            logger.error(
                "ID duplicado %s en %s -- se ignora esta nota, la primera con ese id ya quedó indexada",
                nota.id,
                path,
            )
            stats["archivos_con_error"] += 1
            continue
        seen_ids.add(nota.id)

        carpeta_raiz = carpeta_raiz_de(rel_path)
        carpeta = str(rel_path.parent)

        # Limpia cualquier fila vieja que ocupara esta ruta con otro id
        # (archivo reescrito a mano perdiendo su id anterior, etc.)
        con.execute(
            "DELETE FROM vault_notas WHERE ruta = ? AND id != ?",
            (rel_path_str, nota.id),
        )

        is_new = nota.id not in ids_previos
        con.execute(
            """
            INSERT INTO vault_notas
                (id, ruta, carpeta, carpeta_raiz, titulo, tipo, creado_en,
                 actualizado_en, origen, tags, url, mtime, tamano_bytes, indexado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                ruta=excluded.ruta, carpeta=excluded.carpeta,
                carpeta_raiz=excluded.carpeta_raiz, titulo=excluded.titulo,
                tipo=excluded.tipo, creado_en=excluded.creado_en,
                actualizado_en=excluded.actualizado_en, origen=excluded.origen,
                tags=excluded.tags, url=excluded.url, mtime=excluded.mtime,
                tamano_bytes=excluded.tamano_bytes, indexado_en=excluded.indexado_en
            """,
            (
                nota.id,
                rel_path_str,
                carpeta,
                carpeta_raiz,
                nota.titulo,
                nota.tipo,
                nota.creado_en,
                nota.actualizado_en,
                nota.origen,
                json.dumps(nota.tags, ensure_ascii=False),
                nota.url,
                st.st_mtime,
                st.st_size,
                parser.now_iso(),
            ),
        )
        if is_new:
            stats["archivos_nuevos"] += 1
        else:
            stats["archivos_actualizados"] += 1

    # Notas indexadas antes que ya no corresponden a ningún archivo actual.
    ids_a_borrar = ids_previos - seen_ids
    if ids_a_borrar:
        placeholders = ",".join("?" * len(ids_a_borrar))
        con.execute(
            f"DELETE FROM vault_notas WHERE id IN ({placeholders})",
            tuple(ids_a_borrar),
        )
        stats["notas_eliminadas"] = len(ids_a_borrar)

    con.execute(
        """
        UPDATE vault_corridas SET
            finalizado_en=?, archivos_totales=?, archivos_nuevos=?,
            archivos_actualizados=?, archivos_sin_cambios=?, archivos_con_error=?,
            ids_asignados=?, notas_eliminadas=?
        WHERE id=?
        """,
        (
            parser.now_iso(),
            stats["archivos_totales"],
            stats["archivos_nuevos"],
            stats["archivos_actualizados"],
            stats["archivos_sin_cambios"],
            stats["archivos_con_error"],
            stats["ids_asignados"],
            stats["notas_eliminadas"],
            corrida_id,
        ),
    )
    con.commit()
    con.close()
    return stats


def print_summary(db_path: Path) -> None:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    print("\n=== Resumen del índice ===")
    print("Por carpeta raíz:")
    for row in con.execute(
        "SELECT carpeta_raiz, COUNT(*) n FROM vault_notas GROUP BY carpeta_raiz ORDER BY carpeta_raiz"
    ):
        print(f"  {row['carpeta_raiz']}: {row['n']}")
    print("Por tipo:")
    for row in con.execute(
        "SELECT tipo, COUNT(*) n FROM vault_notas GROUP BY tipo ORDER BY tipo"
    ):
        print(f"  {row['tipo']}: {row['n']}")
    print("Por origen:")
    for row in con.execute(
        "SELECT origen, COUNT(*) n FROM vault_notas GROUP BY origen ORDER BY origen"
    ):
        print(f"  {row['origen']}: {row['n']}")
    n_link_sin_url = con.execute(
        "SELECT COUNT(*) FROM vault_notas WHERE tipo='link' AND (url IS NULL OR url='')"
    ).fetchone()[0]
    print(f"Links sin url: {n_link_sin_url}")
    con.close()


def main() -> None:
    parser_arg = argparse.ArgumentParser(description=__doc__)
    parser_arg.add_argument("--vault-root", type=Path, default=DEFAULT_VAULT_ROOT)
    parser_arg.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    parser_arg.add_argument("--dry-run", action="store_true", help="no reescribe archivos sin id")
    parser_arg.add_argument("--verbose", action="store_true")
    args = parser_arg.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    if not args.vault_root.exists():
        logger.error("No existe %s", args.vault_root)
        sys.exit(1)

    stats = run(args.vault_root, args.db_path, dry_run=args.dry_run)
    print(f"\nCorrida terminada contra {args.vault_root}")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print_summary(args.db_path)


if __name__ == "__main__":
    main()
