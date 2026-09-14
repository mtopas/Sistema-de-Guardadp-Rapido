"""
Backfill de wikilinks reales para entradas ya existentes (0.2→0.3, Obsidian
sync). No forma parte del pipeline de producción -- corre una sola vez (o
cada vez que se quiera reconciliar) sobre entradas escritas ANTES de que
write_entry()/index_writer.py agregaran la sección "## Vinculado a" y las
notas canónicas de INDEX/ENTITIES|PROJECTS.

Reescribe (write_entry) solo las entradas vigentes que ya tienen al menos un
vínculo en memory_entry_entities/memory_entry_projects -- una entrada sin
ningún vínculo no cambia con este backfill (write_entry ya es un no-op para
ella). Después sincroniza la nota canónica de cada entidad/proyecto tocado.

Uso: python -m jarvis.cli.backfill_vault_links   (mismo intérprete que
backend/worker/bot, con JARVIS_DB_PATH/JARVIS_VAULT_PATH apuntando a la DB
real solo cuando se decide explícitamente correrlo ahí -- por default corre
contra lo que JARVIS_DB_PATH/JARVIS_VAULT_PATH ya resuelvan en el entorno).
"""
import logging

from jarvis.db.database import get_connection, init_db
from jarvis.memory.service import get_entry
from jarvis.vault.index_writer import sync_entity_note, sync_project_note
from jarvis.vault.writer import write_entry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run() -> dict:
    init_db()
    conn = get_connection()
    try:
        entry_ids = sorted({
            r["entry_id"] for r in conn.execute(
                "SELECT DISTINCT entry_id FROM memory_entry_entities"
            ).fetchall()
        } | {
            r["entry_id"] for r in conn.execute(
                "SELECT DISTINCT entry_id FROM memory_entry_projects"
            ).fetchall()
        })
        entity_ids = [r["entity_id"] for r in conn.execute("SELECT entity_id FROM memory_entities").fetchall()]
        project_ids = [r["id"] for r in conn.execute("SELECT id FROM memory_projects").fetchall()]
    finally:
        conn.close()

    rewritten = 0
    skipped = 0
    for entry_id in entry_ids:
        entry = get_entry(entry_id)
        if not entry or entry.get("valid_to") or not entry.get("vault_path"):
            skipped += 1
            continue
        write_entry(entry)
        rewritten += 1

    entities_synced = sum(1 for eid in entity_ids if sync_entity_note(eid))
    projects_synced = sum(1 for pid in project_ids if sync_project_note(pid))

    summary = {
        "entries_rewritten": rewritten,
        "entries_skipped": skipped,
        "entity_notes_written": entities_synced,
        "project_notes_written": projects_synced,
    }
    logger.info("[backfill_vault_links] %s", summary)
    return summary


if __name__ == "__main__":
    run()
