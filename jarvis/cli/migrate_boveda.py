"""
Migracion one-time: Boveda SGR (project/database/app.db) -> Memory Core de
Jarvis (project/database/jarvis.db), como memory_entries tipo SEMANTIC.

D-10 (spec): migracion unica y controlada - backup, script, validacion, corte.
No usa el worker ni el TaskManifest: es un script de un solo uso invocado
directamente por el usuario, no la pieza autonoma de background cuyo blast
radius restringe jarvis/worker/task_manifest.py.

Uso:
    python -m jarvis.cli.migrate_boveda [--dry-run] [--db-path RUTA]
"""
import argparse
import hashlib
import html
import json
import logging
import re
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from jarvis.config import JARVIS_DB_PATH, JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection, init_db
from jarvis.embeddings.client import generate_embedding
from jarvis.embeddings.store import upsert_embedding
from jarvis.vault.writer import write_entry

logger = logging.getLogger(__name__)

_BOVEDA_DB_DEFAULT = Path(__file__).resolve().parent.parent.parent / "project" / "database" / "app.db"
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(raw: str | None) -> str:
    if not raw:
        return ""
    text = _HTML_TAG_RE.sub(" ", raw)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _build_content(hoja: dict) -> str:
    """Arma el texto migrable de una hoja. Nunca lanza por campos ausentes."""
    contenido = (hoja.get("contenido") or "").strip()
    tipo = hoja.get("tipo") or "texto"
    apuntes = _strip_html(hoja.get("apuntes"))

    parts: list[str] = []
    if tipo == "link":
        if contenido:
            parts.append(f"Link: {contenido}")
        preview_raw = hoja.get("link_preview")
        if preview_raw:
            try:
                preview = json.loads(preview_raw)
            except (TypeError, ValueError):
                preview = None
            if preview:
                titulo = (preview.get("title") or "").strip()
                descripcion = (preview.get("description") or "").strip()
                if titulo:
                    parts.append(titulo)
                if descripcion:
                    parts.append(descripcion)
    elif tipo == "foto":
        if contenido:
            parts.append(f"Foto: {contenido}")
    else:
        if contenido:
            parts.append(contenido)

    if apuntes:
        parts.append(apuntes)

    return "\n\n".join(p for p in parts if p)


def _categorias_tiene_local_only(cursor: sqlite3.Cursor) -> bool:
    cursor.execute("PRAGMA table_info(categorias)")
    cols = {row[1] for row in cursor.fetchall()}
    return "local_only" in cols


def _fetch_hojas(boveda_conn: sqlite3.Connection) -> list[dict]:
    cursor = boveda_conn.cursor()
    select_local_only = "c.local_only" if _categorias_tiene_local_only(cursor) else "0"
    cursor.execute(f"""
        SELECT h.id, h.contenido, h.tipo, h.apuntes, h.fecha,
               h.categoria_id, c.nombre, h.link_preview, {select_local_only}
        FROM hojas h
        JOIN categorias c ON c.id = h.categoria_id
        ORDER BY h.id ASC
    """)
    hojas = []
    for r in cursor.fetchall():
        hojas.append({
            "id": r[0],
            "contenido": r[1],
            "tipo": r[2],
            "apuntes": r[3],
            "fecha": r[4],
            "categoria_id": r[5],
            "categoria_nombre": r[6],
            "link_preview": r[7],
            "local_only": bool(r[8]),
        })
    return hojas


def _backup_jarvis_db() -> Path | None:
    if not JARVIS_DB_PATH.exists():
        logger.info("jarvis.db no existe todavia - sin backup necesario")
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = JARVIS_DB_PATH.with_name(f"{JARVIS_DB_PATH.stem}.bak-{stamp}{JARVIS_DB_PATH.suffix}")
    shutil.copy2(JARVIS_DB_PATH, backup_path)
    logger.info("backup creado en %s", backup_path)
    return backup_path


def _find_existing(conn: sqlite3.Connection | None, content_hash: str, user_id: str) -> str | None:
    if conn is None:
        return None
    row = conn.execute(
        "SELECT id FROM memory_entries WHERE content_hash = ? AND user_id = ?",
        (content_hash, user_id),
    ).fetchone()
    return row[0] if row else None


def _migrate_one(conn: sqlite3.Connection | None, hoja: dict, dry_run: bool) -> str:
    """Devuelve 'migrada' | 'existente' | 'omitida'."""
    content_raw = _build_content(hoja)
    if not content_raw:
        logger.warning("hoja id=%s sin contenido migrable (foto/link sin texto ni notas) - omitida", hoja["id"])
        return "omitida"

    content_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()

    existing_id = _find_existing(conn, content_hash, JARVIS_DEFAULT_USER)
    if existing_id:
        logger.debug("hoja id=%s ya existia como memory_entry id=%s", hoja["id"], existing_id)
        return "existente"

    if dry_run:
        logger.info("[dry-run] hoja id=%s (categoria=%s, tipo=%s) se migraria", hoja["id"], hoja.get("categoria_nombre"), hoja.get("tipo"))
        return "migrada"

    assert conn is not None

    entry_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    recorded_at = hoja.get("fecha") or now
    tags_json = json.dumps([hoja["categoria_nombre"]] if hoja.get("categoria_nombre") else [], ensure_ascii=False)
    source_id = f"boveda:hoja:{hoja['id']}"

    with conn:
        conn.execute(
            """
            INSERT INTO memory_entries
                (id, type, content_raw, content_processed, source, channel,
                 local_only, confidential, content_hash, tags,
                 valid_from, recorded_at, source_id, origin_trust,
                 user_id, created_at, processed_at)
            VALUES
                (?, 'SEMANTIC', ?, ?, 'migration', 'boveda',
                 ?, 0, ?, ?,
                 ?, ?, ?, 'user.authenticated',
                 ?, ?, ?)
            """,
            (
                entry_id, content_raw, content_raw,
                1 if hoja.get("local_only") else 0,
                content_hash, tags_json,
                recorded_at, recorded_at, source_id,
                JARVIS_DEFAULT_USER, now, now,
            ),
        )

    vault_entry = {
        "id": entry_id,
        "type": "SEMANTIC",
        "content_raw": content_raw,
        "content_processed": content_raw,
        "source": "migration",
        "channel": "boveda",
        "recorded_at": recorded_at,
        "origin_trust": "user.authenticated",
        "tags": tags_json,
    }
    vault_rel_path = write_entry(vault_entry, title=hoja.get("categoria_nombre"))
    with conn:
        conn.execute(
            "UPDATE memory_entries SET vault_path = ? WHERE id = ?",
            (vault_rel_path, entry_id),
        )

    try:
        embedding = generate_embedding(content_raw)
        upsert_embedding(
            entry_id,
            embedding,
            document=content_raw,
            metadata={
                "type": "SEMANTIC",
                "source": "migration",
                "origin_trust": "user.authenticated",
                "local_only": bool(hoja.get("local_only")),
                "confidential": False,
                "vault_path": vault_rel_path,
            },
        )
        with conn:
            conn.execute(
                "UPDATE memory_entries SET embedded_at = ? WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), entry_id),
            )
    except Exception as exc:
        logger.warning(
            "hoja id=%s migrada sin embedding (Ollama/LiteLLM no disponible?) - se puede reprocesar luego: %s",
            hoja["id"], exc,
        )

    logger.info("hoja id=%s migrada -> memory_entry id=%s (vault=%s)", hoja["id"], entry_id, vault_rel_path)
    return "migrada"


def run(dry_run: bool, boveda_db_path: Path) -> dict:
    if not boveda_db_path.exists():
        raise FileNotFoundError(f"No se encontro la DB de la Boveda en: {boveda_db_path}")

    boveda_conn = sqlite3.connect(str(boveda_db_path))
    try:
        hojas = _fetch_hojas(boveda_conn)
    finally:
        boveda_conn.close()

    logger.info("%d hojas encontradas en %s", len(hojas), boveda_db_path)

    conn: sqlite3.Connection | None
    if dry_run:
        logger.info("--dry-run: no se escribira nada")
        if JARVIS_DB_PATH.exists():
            # Conexion de solo lectura: no crea el archivo ni directorios.
            conn = sqlite3.connect(f"file:{JARVIS_DB_PATH.as_posix()}?mode=ro", uri=True)
        else:
            logger.info("jarvis.db no existe todavia - no se puede verificar duplicados, todas cuentan como candidatas")
            conn = None
    else:
        init_db()
        _backup_jarvis_db()
        conn = get_connection()

    counts = {"migrada": 0, "existente": 0, "omitida": 0}
    try:
        for hoja in hojas:
            result = _migrate_one(conn, hoja, dry_run)
            counts[result] += 1
    finally:
        if conn is not None:
            conn.close()

    logger.info(
        "resultado: %d hojas encontradas -> %d migradas, %d ya existian, %d omitidas",
        len(hojas), counts["migrada"], counts["existente"], counts["omitida"],
    )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migra las hojas de la Boveda SGR al Memory Core de Jarvis (tipo SEMANTIC).",
    )
    parser.add_argument("--dry-run", action="store_true", help="Muestra que migraria sin escribir nada")
    parser.add_argument(
        "--db-path",
        type=Path,
        default=_BOVEDA_DB_DEFAULT,
        help=f"Ruta a la DB de la Boveda (default: {_BOVEDA_DB_DEFAULT})",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[migrate_boveda] %(message)s")
    run(dry_run=args.dry_run, boveda_db_path=args.db_path)


if __name__ == "__main__":
    main()
