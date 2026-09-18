"""
Notas canónicas de entidades/proyectos en el vault (jarvis-spec.html §29,
0.2→0.3 -- Obsidian sync con wikilinks reales).

El vault ya tenía un .md por memory_entry, pero ninguna nota "de la entidad
en sí" a la que esos .md pudieran apuntar -- abrir vault/ en Obsidian daba un
grafo vacío aunque memory_entry_entities/memory_entry_projects ya existieran
en SQLite. Este módulo cierra ese hueco: una nota por entidad (persona/
organización/lugar) y una por proyecto, en INDEX/ENTITIES/ e INDEX/PROJECTS/
(carpetas separadas de PEOPLE/ y PROJECTS/, que guardan memory_entries
individuales -- no la ficha canónica de la entidad, ver database.py).

Cada nota se reescribe COMPLETA desde el estado actual de la DB (mismo
criterio que write_entry() y que el resto de Jarvis: el índice del vault es
reconstruible, nunca la fuente de verdad -- SQLite lo es). Solo entradas
vigentes (valid_to IS NULL) aparecen en la lista de menciones: una entrada
"olvidada" o superseded desaparece de la nota en el próximo sync, igual que
ya desaparece de retrieval/entidades/proyectos/tags.

Límite conocido, documentado a propósito (ver Cerebro/decisiones-implementacion.md):
esto solo se dispara en captura/edición/olvido de una entrada puntual (los
puntos donde el código ya tenía un lugar natural para engancharlo). Si una
entrada se vuelve stale/superseded por consolidación (jarvis/worker/
consolidation.py, varios call sites que tocan valid_to directamente) la nota
de la entidad no se resincroniza sola hasta que algo más la toque -- no
instrumentado en esta pieza, alcance explícitamente acotado a lo pedido.
"""
import logging

from jarvis.config import JARVIS_SYNTH_PATH
from jarvis.db.database import get_connection
from jarvis.vault.writer import entity_note_stem, project_note_stem

logger = logging.getLogger(__name__)

_ENTITY_TYPE_LABEL = {
    "person": "persona",
    "organization": "organización",
    "place": "lugar",
}


def sync_indexes_for_entry(entry_id: str) -> None:
    """Resincroniza las notas canónicas de TODAS las entidades/proyectos ya
    vinculados a esta entrada. Llamado tras escribir/reescribir el .md de la
    entrada (processor.py, memory/service.py) y al olvidarla (forget_entry).
    Best-effort -- nunca lanza.
    """
    try:
        conn = get_connection()
        try:
            entity_ids = [
                r["entity_id"] for r in conn.execute(
                    "SELECT entity_id FROM memory_entry_entities WHERE entry_id = ?",
                    (entry_id,),
                ).fetchall()
            ]
            project_ids = [
                r["project_id"] for r in conn.execute(
                    "SELECT project_id FROM memory_entry_projects WHERE entry_id = ?",
                    (entry_id,),
                ).fetchall()
            ]
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("[jarvis.vault.index] No se pudo leer vínculos de %s: %s", entry_id, exc)
        return

    for entity_id in entity_ids:
        sync_entity_note(entity_id)
    for project_id in project_ids:
        sync_project_note(project_id)


def sync_entity_note(entity_id: str) -> str | None:
    """Reescribe (o crea) la nota canónica de una entidad a partir del estado
    actual de la DB. Devuelve la ruta relativa escrita, o None si la entidad
    no existe o no tiene ninguna entrada vigente que justifique una nota
    (evita notas vacías huérfanas en el vault). Best-effort -- nunca lanza.
    """
    try:
        conn = get_connection()
        try:
            entity = conn.execute(
                """SELECT entity_id, name, aliases, entity_type, first_seen, last_seen, notes
                   FROM memory_entities WHERE entity_id = ?""",
                (entity_id,),
            ).fetchone()
            if not entity:
                return None

            entries = conn.execute(
                """SELECT me.id, me.vault_path, me.type, me.recorded_at,
                          me.content_processed, me.content_raw
                   FROM memory_entry_entities mee
                   JOIN memory_entries me ON me.id = mee.entry_id
                   WHERE mee.entity_id = ? AND me.valid_to IS NULL
                     AND me.vault_path IS NOT NULL
                   ORDER BY me.recorded_at DESC""",
                (entity_id,),
            ).fetchall()
        finally:
            conn.close()

        if not entries:
            return None

        stem = entity_note_stem(entity["entity_id"], entity["name"])
        rel_path = f"Jarvis/Entidades/{stem}.md"
        abs_path = JARVIS_SYNTH_PATH / "Entidades" / f"{stem}.md"
        abs_path.parent.mkdir(parents=True, exist_ok=True)

        import json
        aliases = []
        try:
            aliases = json.loads(entity["aliases"]) if entity["aliases"] else []
        except Exception:
            pass

        label = _ENTITY_TYPE_LABEL.get(entity["entity_type"], entity["entity_type"])
        frontmatter = (
            f"---\n"
            # id estable = entity_id: sin esto, app/vault/parser.py::assign_missing_id()
            # (Bóveda) le asigna un UUID random cada vez que este archivo se reescribe --
            # el vault_id de la fila en `hojas` cambiaba en cada regeneración y chocaba
            # contra la fila vieja (misma ruta, vault_id distinto) -- UNIQUE constraint
            # failed: hojas.ruta. Ver Cerebro/decisiones-implementacion.md, 2026-09-18.
            f"id: {entity['entity_id']}\n"
            f"entity_id: {entity['entity_id']}\n"
            f"entity_type: {entity['entity_type']}\n"
            f"aliases: [{', '.join(aliases)}]\n"
            f"first_seen: {entity['first_seen']}\n"
            f"last_seen: {entity['last_seen']}\n"
            f"---\n\n"
        )
        body = [f"# {entity['name']}", f"\n_{label}_\n"]
        if entity["notes"]:
            body.append(f"\n{entity['notes']}\n")
        body.append("\n## Menciones\n")
        for e in entries:
            entry_stem = _entry_stem(e["vault_path"])
            title = _short_title(e["content_processed"] or e["content_raw"] or "")
            body.append(f"- [[{entry_stem}|{title}]] ({e['type']}, {e['recorded_at'][:10]})")

        abs_path.write_text(frontmatter + "\n".join(body) + "\n", encoding="utf-8")
        return rel_path
    except Exception as exc:
        logger.warning("[jarvis.vault.index] Sync de entidad %s falló: %s", entity_id, exc)
        return None


def sync_project_note(project_id: str) -> str | None:
    """Equivalente a sync_entity_note() para memory_projects. Best-effort."""
    try:
        conn = get_connection()
        try:
            project = conn.execute(
                "SELECT id, name, description FROM memory_projects WHERE id = ?",
                (project_id,),
            ).fetchone()
            if not project:
                return None

            entries = conn.execute(
                """SELECT me.id, me.vault_path, me.type, me.recorded_at,
                          me.content_processed, me.content_raw
                   FROM memory_entry_projects mep
                   JOIN memory_entries me ON me.id = mep.entry_id
                   WHERE mep.project_id = ? AND me.valid_to IS NULL
                     AND me.vault_path IS NOT NULL
                   ORDER BY me.recorded_at DESC""",
                (project_id,),
            ).fetchall()
        finally:
            conn.close()

        if not entries:
            return None

        stem = project_note_stem(project["id"], project["name"])
        rel_path = f"Jarvis/Proyectos/{stem}.md"
        abs_path = JARVIS_SYNTH_PATH / "Proyectos" / f"{stem}.md"
        abs_path.parent.mkdir(parents=True, exist_ok=True)

        # id estable = project_id, mismo motivo que en sync_entity_note() arriba.
        frontmatter = f"---\nid: {project['id']}\nproject_id: {project['id']}\n---\n\n"
        body = [f"# {project['name']}"]
        if project["description"]:
            body.append(f"\n{project['description']}\n")
        body.append("\n## Menciones\n")
        for e in entries:
            entry_stem = _entry_stem(e["vault_path"])
            title = _short_title(e["content_processed"] or e["content_raw"] or "")
            body.append(f"- [[{entry_stem}|{title}]] ({e['type']}, {e['recorded_at'][:10]})")

        abs_path.write_text(frontmatter + "\n".join(body) + "\n", encoding="utf-8")
        return rel_path
    except Exception as exc:
        logger.warning("[jarvis.vault.index] Sync de proyecto %s falló: %s", project_id, exc)
        return None


def _entry_stem(vault_path: str) -> str:
    """De 'RAW/abcd1234-titulo.md' a 'abcd1234-titulo' (target del wikilink)."""
    return vault_path.rsplit("/", 1)[-1].removesuffix(".md")


def _short_title(content: str) -> str:
    first_line = content.strip().splitlines()[0] if content.strip() else ""
    return first_line[:60] or "sin contenido"
