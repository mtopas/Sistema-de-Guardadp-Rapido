"""
Backfill de una sola vez: ingesta el contenido que YA EXISTE en D:\\Boveda (árbol
PARA) a la memoria propia de Jarvis (memory_entries + entidades/tags/proyectos +
embeddings).

Contexto (Cerebro/PROXIMAMENTE.md, ítem 1 tras el deploy de la fusión Bóveda-Jarvis,
2026-09-15): Milestone 3 solo conectó el camino de escritura hacia ADELANTE
(contenido nuevo del usuario -> árbol PARA; síntesis de Jarvis -> Boveda/Jarvis/).
Las notas que ya vivían en D:\\Boveda ANTES de la fusión (57 del vault viejo de
Obsidian + 8 hojas reales de la Bóveda de SGR, migradas a mano a archivo) nunca
pasaron por memory_entries -- confirmado en vivo (2026-09-15): memory_entries
tenía 0 filas pese a 71 notas reales en disco.

Diferencia central con jarvis/cli/migrate_boveda.py (script hermano, mismo D-10
"backup -> script -> validación -> corte", pero caso distinto en lo esencial):
ese script migraba FILAS de app.db y llamaba write_entry() para CREAR archivos
nuevos en el vault interno de Jarvis. Acá el contenido YA ES un archivo real en
D:\\Boveda -- este script NUNCA escribe, mueve ni renombra esos archivos (son la
fuente de verdad de la fusión, no algo que un backfill de índice deba tocar).
Lo único que crea son filas de índice (memory_entries + vínculos + embeddings)
que APUNTAN al archivo real vía vault_path -- mismo principio "la Bóveda es
fuente de verdad, jarvis.db es índice reconstruible" que ya rige el resto de la
fusión (ver Cerebro/decisiones-implementacion.md, 2026-09-11).

Reusa el mismo pipeline de clasificación/extracción que una captura nueva
(jarvis/worker/processor.py::process_entry() -- mismo modelo LOCAL vía LiteLLM,
mismo call_classify()/extract_entities()/link_entities_for_entry()/
link_tags_for_entry()/link_project_for_entry()) para que estas notas queden
igual de indexadas/vinculadas que cualquier captura nueva. La única pieza que
se salta a propósito es write_entry(): esa función ESCRIBE el .md, y acá el
.md ya existe -- vault_path se asigna directo a la ruta real (relativa a
JARVIS_BOVEDA_PATH) sin tocar el archivo.

Detalle completo de las 7 decisiones de diseño (id reusado del frontmatter,
alcance de carpetas, origin_trust/source, idempotencia, costo, sin
notificaciones Telegram/debug) en
Cerebro/decisiones/2026-09-15-backfill-boveda-a-memoria-jarvis.md.

Uso:
    python -m jarvis.cli.backfill_vault_content [--dry-run] [--limit N]

Mismo patrón que jarvis/cli/backfill_vault_links.py: sin flags de path -- corre
contra lo que JARVIS_BOVEDA_PATH/JARVIS_DB_PATH/JARVIS_CHROMA_PATH ya resuelvan
en el entorno (setear esas env vars antes de invocar para correr contra una
Bóveda/DB de scratch, nunca contra las reales en el primer intento).
"""
import argparse
import hashlib
import json
import logging
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import yaml

from jarvis.config import JARVIS_BOVEDA_PATH, JARVIS_DB_PATH, JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection, init_db
from jarvis.embeddings.client import generate_embedding
from jarvis.embeddings.store import upsert_embedding
from jarvis.entities.service import extract_entities, link_entities_for_entry
from jarvis.events.service import log_event
from jarvis.llm.client import call_classify
from jarvis.memory.service import update_entry
from jarvis.projects.service import link_project_for_entry
from jarvis.tags.service import link_tags_for_entry, list_tag_catalog
from jarvis.vault.index_writer import sync_indexes_for_entry

logger = logging.getLogger(__name__)

# Alcance de carpetas (Cerebro/decisiones/2026-09-15-backfill-boveda-a-memoria-jarvis.md,
# punto 3): allowlist explícita, no denylist -- que una carpeta PARA nueva
# futura no entre sola sin una decisión consciente acá.
# - incluidas: 00-04 (memoria consultable real, incluido 04 - Archivo: "no es
#   basura, es historia que dejó de requerir atención" según su propio README).
# - excluidas: "05 - Basura" (candidatos a borrar, no memoria -- confirmado en
#   su README) y "Jarvis/" (salida propia de Jarvis, reingerirla sería
#   circular).
_INCLUDE_ROOTS = [
    "00 - Sin categorizar",
    "01 - Proyectos",
    "02 - Areas",
    "03 - Recursos",
    "04 - Archivo",
]

_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?\r?\n)---\r?\n?", re.DOTALL)


def _iter_candidate_files():
    for root_name in _INCLUDE_ROOTS:
        root = JARVIS_BOVEDA_PATH / root_name
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.md")):
            if path.name.lower() == "readme.md":
                continue
            yield path


def _parse_frontmatter(path: Path) -> tuple[dict | None, str]:
    """Lee id/creado_en del frontmatter sin autoasignar nada si falta (punto 2
    de la decisión: eso es responsabilidad de app/vault/sync.py /
    scripts/vault_indexer.py, que ya corren antes de que este backfill se
    ejecute -- duplicar esa lógica acá sumaría un segundo lugar que puede
    asignar ids de forma inconsistente)."""
    raw_text = path.read_text(encoding="utf-8")
    m = _FRONTMATTER_RE.match(raw_text)
    if not m:
        return None, raw_text
    data = yaml.safe_load(m.group(1)) or {}
    body = raw_text[m.end():]
    return data, body


def _iso(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _open_ro_if_exists() -> sqlite3.Connection | None:
    """Conexión de solo lectura a jarvis.db, o None si todavía no existe --
    mismo criterio que jarvis/cli/migrate_boveda.py: en --dry-run nunca se crea
    el archivo (sqlite3.connect() normal lo crearía como efecto secundario)."""
    if not JARVIS_DB_PATH.exists():
        return None
    return sqlite3.connect(f"file:{JARVIS_DB_PATH.as_posix()}?mode=ro", uri=True)


def _classify(content: str, tag_catalog: list[str]) -> dict:
    raw = call_classify(content, tag_catalog)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception as e:
        logger.warning("[backfill_vault_content] classify JSON inválido: %s | raw=%r", e, raw[:200])
    return {"type": "RAW", "title": content[:60], "tags": [], "project": None}


def _process_one(path: Path, dry_run: bool, ro_conn: sqlite3.Connection | None) -> str:
    """Devuelve 'ingerida' | 'existente' | 'omitida'."""
    rel_path = path.relative_to(JARVIS_BOVEDA_PATH).as_posix()
    data, body = _parse_frontmatter(path)
    if not data or not data.get("id"):
        logger.warning(
            "%s: sin id en frontmatter -- omitida (asignar id es responsabilidad "
            "de app/vault/sync.py, no de este backfill)", rel_path,
        )
        return "omitida"

    entry_id = str(data["id"])
    content_raw = body.strip()
    if not content_raw:
        logger.warning("%s: nota sin contenido (solo frontmatter) -- omitida", rel_path)
        return "omitida"

    # Idempotencia (punto 6): dedup por id del frontmatter, reusado tal cual
    # como memory_entries.id -- no por content_hash (dos notas reales
    # distintas podrían compartir texto corto por casualidad y cada una tiene
    # su propio archivo que merece su propia fila).
    if dry_run:
        exists = ro_conn is not None and ro_conn.execute(
            "SELECT 1 FROM memory_entries WHERE id = ?", (entry_id,)
        ).fetchone() is not None
    else:
        conn = get_connection()
        try:
            exists = conn.execute(
                "SELECT 1 FROM memory_entries WHERE id = ?", (entry_id,)
            ).fetchone() is not None
        finally:
            conn.close()

    if exists:
        return "existente"
    if dry_run:
        return "ingerida"

    creado_en = _iso(data.get("creado_en"))
    recorded_at = creado_en or datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat()
    content_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    source_id = f"boveda:vault:{entry_id}"

    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO memory_entries
                    (id, type, content_raw, content_processed, source, channel,
                     local_only, confidential, content_hash,
                     valid_from, recorded_at, source_id, origin_trust,
                     user_id, created_at, created_by, authorship, vault_path)
                VALUES
                    (?, 'RAW', ?, ?, 'migration', NULL,
                     0, 0, ?,
                     ?, ?, ?, 'user.authenticated',
                     ?, ?, 'explicit', 'user', ?)
                """,
                (
                    entry_id, content_raw, content_raw,
                    content_hash,
                    recorded_at, recorded_at, source_id,
                    JARVIS_DEFAULT_USER, now, rel_path,
                ),
            )
    finally:
        conn.close()

    # Mismo pipeline que jarvis/worker/processor.py::process_entry(), salvo
    # write_entry() (el .md ya existe, vault_path ya quedó seteado arriba).
    tag_catalog = list_tag_catalog(JARVIS_DEFAULT_USER)
    classification = _classify(content_raw, tag_catalog)
    entry_type = classification.get("type", "RAW")
    if entry_type not in ("RAW", "SEMANTIC", "DECISION", "PROJECT", "PEOPLE"):
        entry_type = "RAW"
    tags = classification.get("tags") or []
    if not isinstance(tags, list):
        tags = []

    update_entry(entry_id, type=entry_type, tags=tags, extraction_confidence=0.8)
    log_event("BACKFILL_CLASSIFY", f"{entry_id[:8]} → {entry_type} ({rel_path})", entry_id)

    try:
        link_tags_for_entry(entry_id, tags, JARVIS_DEFAULT_USER)
    except Exception as exc:
        logger.warning("%s: vinculación de tags falló: %s", rel_path, exc)

    extracted: list[dict] = []
    try:
        extracted = extract_entities(content_raw)
        if extracted:
            link_entities_for_entry(entry_id, extracted, entry_type, JARVIS_DEFAULT_USER)
            log_event(
                "BACKFILL_ENTITY",
                "extraídas: " + ", ".join(e["name"] for e in extracted),
                entry_id,
            )
    except Exception as exc:
        logger.warning("%s: extracción/vinculación de entidades falló: %s", rel_path, exc)

    try:
        link_project_for_entry(entry_id, classification.get("project"))
    except Exception as exc:
        logger.warning("%s: vinculación de proyecto falló: %s", rel_path, exc)

    update_entry(entry_id, processed_at=datetime.now(timezone.utc).isoformat())

    # Escribe (o actualiza) SOLO las notas canónicas de entidad/proyecto en
    # Boveda/Jarvis/ -- nunca toca el archivo real de la nota migrada, que
    # queda sin la sección "## Vinculado a" que sí llevan las capturas nuevas
    # (limitación documentada, ver decisión: el vínculo hacia adelante
    # entidad->menciones funciona igual; el de nota->entidad no se retrofitea).
    try:
        sync_indexes_for_entry(entry_id)
    except Exception as exc:
        logger.warning("%s: sync de notas canónicas de entidad/proyecto falló: %s", rel_path, exc)

    try:
        embedding = generate_embedding(content_raw)
        upsert_embedding(
            entry_id,
            embedding,
            document=content_raw,
            metadata={
                "type": entry_type,
                "source": "migration",
                "origin_trust": "user.authenticated",
                "local_only": False,
                "confidential": False,
            },
        )
        update_entry(entry_id, embedded_at=datetime.now(timezone.utc).isoformat())
        log_event("BACKFILL_EMBED", "embedding generado y guardado en Chroma", entry_id)
    except Exception as exc:
        logger.warning(
            "%s: embedding falló (Ollama no disponible?) -- memory_entry ya quedó "
            "creada, se puede reprocesar más tarde: %s", rel_path, exc,
        )

    logger.info("%s -> memory_entry id=%s type=%s", rel_path, entry_id, entry_type)
    return "ingerida"


def run(dry_run: bool, limit: int | None) -> dict:
    if not dry_run:
        init_db()

    ro_conn = _open_ro_if_exists() if dry_run else None
    counts = {"ingerida": 0, "existente": 0, "omitida": 0}
    try:
        nuevas_procesadas = 0
        for path in _iter_candidate_files():
            if limit is not None and nuevas_procesadas >= limit:
                break
            result = _process_one(path, dry_run, ro_conn)
            counts[result] += 1
            if result == "ingerida":
                nuevas_procesadas += 1
    finally:
        if ro_conn is not None:
            ro_conn.close()

    total = sum(counts.values())
    logger.info(
        "resultado%s: %d notas candidatas -> %d ingeridas, %d ya existían, %d omitidas",
        " (dry-run)" if dry_run else "",
        total, counts["ingerida"], counts["existente"], counts["omitida"],
    )
    if not dry_run:
        log_event(
            "BACKFILL_DONE",
            f"{counts['ingerida']} ingeridas, {counts['existente']} ya existían, "
            f"{counts['omitida']} omitidas",
        )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Reporta qué haría sin escribir nada")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Ingerir como máximo N notas nuevas en esta corrida (para correr por tandas)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[backfill_vault_content] %(message)s")
    run(dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    main()
