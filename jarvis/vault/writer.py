import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from jarvis.config import JARVIS_BOVEDA_PATH, JARVIS_SYNTH_PATH

logger = logging.getLogger(__name__)

# Fusión Jarvis + Bóveda (Cerebro/decisiones-implementacion.md, 2026-09-11):
# write_entry() ya no rutea por `type` (RAW/SEMANTIC/...) -- ese eje es
# clasificación de contenido, no autoría (confirmado leyendo esta misma
# función antes del rediseño: los 5 tipos pasaban por el mismo código sin
# distinción de quién escribió el texto). El eje real es
# entry["authorship"]: 'user' -> árbol PARA de D:\Boveda (entra por
# `00 - Sin categorizar/`, mismo criterio que cualquier otra captura --
# Jarvis no tiene noción de dominio/Facultad/Salud/etc., así que no puede
# decidir una carpeta PARA más específica); 'jarvis_synthesis' -> subárbol
# `Boveda/Jarvis/` (prosa que Jarvis generó combinando fragmentos, hoy solo
# audit action_type='create' -- ver jarvis/audit/service.py::_apply_create()).

_ORIGEN_DESDE_SOURCE = {
    "telegram": "telegram",
    "desktop": "app",
    "migration": "migracion",
    "agenda": "agenda",
}

_INBOX_REL = "00 - Sin categorizar"


def _slug(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = text[:48].strip("-")
    return text or "entrada"


def _now_iso_offset() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _build_para_frontmatter(entry: dict) -> str:
    """Frontmatter "común" del árbol PARA -- mismo contrato exacto que
    project/app/vault/parser.py::build_frontmatter_text() (READMEs de
    D:\\Boveda). Duplicado a propósito, no importado cruzando el límite
    jarvis/<->app/: son dos subsistemas con ciclos de deploy independientes
    (Jarvis corre en Docker en el homelab; app/ corre embebido en el .exe de
    Windows además del backend) -- depender de un import entre paquetes
    hermanos que no se instalan juntos en todos los entornos es más frágil
    que 15 líneas duplicadas y estables (el contrato de frontmatter cambia
    poquísimo, y si cambia, ambos lados ya se tocan a mano de todos modos).
    """
    entry_id = entry["id"]
    origen = _ORIGEN_DESDE_SOURCE.get(entry.get("source") or "", "app")
    creado_en = entry.get("recorded_at") or _now_iso_offset()
    tags = _tags_list(entry.get("tags"))
    tags_yaml = "[" + ", ".join(tags) + "]" if tags else "[]"
    lines = [
        "---",
        f"id: {entry_id}",
        "tipo: texto",
        f"creado_en: {creado_en}",
        f"actualizado_en: {creado_en}",
        f"origen: {origen}",
        f"tags: {tags_yaml}",
        "---\n",
    ]
    return "\n".join(lines)


def _build_synth_frontmatter(entry: dict) -> str:
    """Frontmatter rico para Boveda/Jarvis/ -- confidence/origin_trust/
    valid_from/valid_to/source_id SÍ se escriben acá (a diferencia del árbol
    PARA). Confirmado que la versión anterior de este writer NUNCA escribía
    estos campos al .md (vivían solo en SQLite) -- esto es la primera vez que
    se reflejan en archivo, exclusivo de contenido sintetizado por Jarvis.
    """
    entry_id = entry["id"]
    tags = _tags_list(entry.get("tags"))
    tags_yaml = "[" + ", ".join(tags) + "]" if tags else "[]"
    lines = [
        "---",
        f"id: {entry_id}",
        f"type: {entry.get('type', 'RAW')}",
        f"source: {entry.get('source', '')}",
        f"channel: {entry.get('channel', '') or ''}",
        f"recorded_at: {entry.get('recorded_at', '')}",
        f"confidence: {entry.get('confidence', 1.0)}",
        f"origin_trust: {entry.get('origin_trust', '')}",
        f"valid_from: {entry.get('valid_from', '') or ''}",
        f"valid_to: {entry.get('valid_to', '') or ''}",
        f"source_id: {entry.get('source_id', '') or ''}",
        f"tags: {tags_yaml}",
        "---\n",
    ]
    return "\n".join(lines)


def _tags_list(tags_raw) -> list:
    if not tags_raw:
        return []
    if isinstance(tags_raw, str):
        import json
        try:
            return json.loads(tags_raw)
        except Exception:
            return []
    return tags_raw


def write_entry(entry: dict, title: str | None = None) -> str:
    """Escribe la entrada como .md y devuelve la ruta relativa a
    JARVIS_BOVEDA_PATH (raíz común de todo D:\\Boveda, incluido su subárbol
    Boveda/Jarvis/ -- una sola raíz para que vault_path sea comparable sin
    importar de qué lado del árbol viene).

    Reusa el nombre de archivo ya asignado si la entrada ya tiene vault_path
    (reescritura, no primera escritura) -- mismo fix que ya tenía esta
    función (bug real, backfill de wikilinks, 2026-09-03): re-derivar el
    nombre del contenido en cada reescritura deja huérfano el archivo que
    vault_path en SQLite todavía señala.
    """
    entry_id: str = entry["id"]
    is_synthesis = entry.get("authorship") == "jarvis_synthesis"

    existing_vault_path = entry.get("vault_path")
    if title is None and existing_vault_path:
        abs_path = JARVIS_BOVEDA_PATH / existing_vault_path
        rel_to_root = existing_vault_path
        content_block = entry.get("content_processed") or entry.get("content_raw") or ""
        content_block += _linked_wikilinks_section(entry_id)
        frontmatter = _build_synth_frontmatter(entry) if is_synthesis else _build_para_frontmatter(entry)
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(frontmatter + content_block, encoding="utf-8")
        return rel_to_root

    display_title = title or _derive_title(entry.get("content_raw", ""))
    filename = f"{entry_id[:8]}-{_slug(display_title)}.md"

    if is_synthesis:
        vault_dir = JARVIS_SYNTH_PATH / "Sintesis"
        rel_to_root = f"Jarvis/Sintesis/{filename}"
    else:
        vault_dir = JARVIS_BOVEDA_PATH / _INBOX_REL
        rel_to_root = f"{_INBOX_REL}/{filename}"

    vault_dir.mkdir(parents=True, exist_ok=True)
    abs_path = vault_dir / filename

    frontmatter = _build_synth_frontmatter(entry) if is_synthesis else _build_para_frontmatter(entry)
    content_block = entry.get("content_processed") or entry.get("content_raw") or ""
    content_block += _linked_wikilinks_section(entry_id)

    abs_path.write_text(frontmatter + content_block, encoding="utf-8")
    return rel_to_root


def delete_entry_file(vault_rel_path: str | None) -> None:
    """Borra el .md de un vault_rel_path (relativo a JARVIS_BOVEDA_PATH) si
    existe. Best-effort -- nunca lanza.
    """
    if not vault_rel_path:
        return
    try:
        abs_path = JARVIS_BOVEDA_PATH / vault_rel_path
        if abs_path.exists():
            abs_path.unlink()
    except Exception as exc:
        logger.warning("[jarvis.vault] No se pudo borrar %s: %s", vault_rel_path, exc)


def move_entry_file(vault_rel_path: str | None, dest_dir_rel: str) -> str | None:
    """Mueve el .md de una entrada a otra carpeta del árbol PARA (ej.
    `04 - Archivo` o `05 - Basura`), preservando el nombre de archivo.
    Devuelve la nueva ruta relativa, o None si no había archivo que mover.
    Best-effort -- nunca lanza (mismo criterio que el resto del módulo).

    Usado por: forget_entry() (-> 05 - Basura, sin propuesta, confirmación ya
    dada) y accept_proposal('archive_superseded') (-> 04 - Archivo, gateado).
    """
    if not vault_rel_path:
        return None
    try:
        src = JARVIS_BOVEDA_PATH / vault_rel_path
        if not src.exists():
            logger.warning("[jarvis.vault] move_entry_file: %s no existe, nada que mover", src)
            return None
        dest_dir = JARVIS_BOVEDA_PATH / dest_dir_rel
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / src.name
        src.rename(dest)
        return f"{dest_dir_rel}/{src.name}"
    except Exception as exc:
        logger.warning(
            "[jarvis.vault] No se pudo mover %s a %s: %s", vault_rel_path, dest_dir_rel, exc
        )
        return None


def _derive_title(content: str) -> str:
    first_line = (content or "").strip().splitlines()[0] if content else ""
    return first_line[:60] or "sin-titulo"


def entity_note_stem(entity_id: str, name: str) -> str:
    """Nombre de archivo (sin extensión) de la nota canónica de una entidad --
    mismo criterio que write_entry() para los .md de entrada (prefijo de 8 hex
    del id + slug del nombre): garantiza unicidad sin depender de que el
    nombre sea único (dos entidades de tipo distinto pueden compartir nombre)."""
    return f"{entity_id[:8]}-{_slug(name)}"


def project_note_stem(project_id: str, name: str) -> str:
    return f"{project_id[:8]}-{_slug(name)}"


def _linked_wikilinks_section(entry_id: str) -> str:
    """Sección '## Vinculado a' con [[wikilinks]] reales a las notas canónicas
    de las entidades/proyectos ya vinculados a esta entrada en el momento de
    escribir el .md (memory_entry_entities / memory_entry_projects).

    Deliberadamente un bloque aparte al final del contenido, no una sustitución
    de texto dentro de la prosa capturada: reemplazar menciones inline por regex
    es frágil (coincidencias parciales, mayúsculas, alias) y podría corromper en
    silencio el contenido tal cual el usuario lo escribió. Un bloque de enlaces
    reales al final sigue dando un grafo de Obsidian no vacío (el objetivo
    pedido) sin ese riesgo. Ver Cerebro/decisiones-implementacion.md.

    Best-effort -- nunca lanza, nunca bloquea la escritura del vault si la
    consulta a la DB falla (mismo criterio que el resto de este módulo).
    """
    try:
        from jarvis.db.database import get_connection

        conn = get_connection()
        try:
            entities = conn.execute(
                """SELECT e.entity_id, e.name FROM memory_entry_entities mee
                   JOIN memory_entities e ON e.entity_id = mee.entity_id
                   WHERE mee.entry_id = ?
                   ORDER BY e.name""",
                (entry_id,),
            ).fetchall()
            projects = conn.execute(
                """SELECT p.id, p.name FROM memory_entry_projects mep
                   JOIN memory_projects p ON p.id = mep.project_id
                   WHERE mep.entry_id = ?
                   ORDER BY p.name""",
                (entry_id,),
            ).fetchall()
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("[jarvis.vault] No se pudo leer vínculos de %s: %s", entry_id, exc)
        return ""

    if not entities and not projects:
        return ""

    lines = ["\n\n## Vinculado a"]
    for e in entities:
        stem = entity_note_stem(e["entity_id"], e["name"])
        lines.append(f"- [[{stem}|{e['name']}]]")
    for p in projects:
        stem = project_note_stem(p["id"], p["name"])
        lines.append(f"- [[{stem}|{p['name']}]]")
    return "\n".join(lines) + "\n"
