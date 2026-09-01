import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from jarvis.config import JARVIS_VAULT_PATH

logger = logging.getLogger(__name__)

_TYPE_TO_SUBDIR = {
    "RAW": "RAW",
    "SEMANTIC": "SEMANTIC",
    "DECISION": "DECISIONS",
    "PROJECT": "PROJECTS",
    "PEOPLE": "PEOPLE",
}


def _slug(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = text[:48].strip("-")
    return text or "entrada"


def write_entry(entry: dict, title: str | None = None) -> str:
    """Escribe la entrada como .md en el vault y devuelve la ruta relativa."""
    entry_id: str = entry["id"]
    entry_type: str = entry.get("type", "RAW")
    subdir = _TYPE_TO_SUBDIR.get(entry_type, "RAW")

    display_title = title or _derive_title(entry.get("content_raw", ""))
    filename = f"{entry_id[:8]}-{_slug(display_title)}.md"
    vault_dir = JARVIS_VAULT_PATH / subdir
    vault_dir.mkdir(parents=True, exist_ok=True)
    abs_path = vault_dir / filename

    tags_raw = entry.get("tags") or "[]"
    if isinstance(tags_raw, str):
        import json
        try:
            tags_list = json.loads(tags_raw)
        except Exception:
            tags_list = []
    else:
        tags_list = tags_raw

    tags_yaml = ", ".join(tags_list) if tags_list else ""

    frontmatter = (
        f"---\n"
        f"id: {entry_id}\n"
        f"type: {entry_type}\n"
        f"source: {entry.get('source', '')}\n"
        f"channel: {entry.get('channel', '') or ''}\n"
        f"recorded_at: {entry.get('recorded_at', '')}\n"
        f"origin_trust: {entry.get('origin_trust', '')}\n"
        f"tags: [{tags_yaml}]\n"
        f"---\n\n"
    )

    content_block = entry.get("content_processed") or entry.get("content_raw") or ""

    abs_path.write_text(frontmatter + content_block, encoding="utf-8")

    # Ruta relativa al vault root (e.g. "RAW/12345678-titulo.md")
    return f"{subdir}/{filename}"


def delete_entry_file(vault_rel_path: str | None) -> None:
    """Borra el .md de un vault_rel_path si existe -- usado al editar una
    entrada (pieza B): write_entry() siempre deriva un filename nuevo del
    contenido/tipo actuales, así que un vault_path viejo puede quedar
    huérfano tras la edición. Nunca lanza -- best-effort, igual que el resto
    de las operaciones del vault.
    """
    if not vault_rel_path:
        return
    try:
        abs_path = JARVIS_VAULT_PATH / vault_rel_path
        if abs_path.exists():
            abs_path.unlink()
    except Exception as exc:
        logger.warning("[jarvis.vault] No se pudo borrar %s: %s", vault_rel_path, exc)


def _derive_title(content: str) -> str:
    first_line = (content or "").strip().splitlines()[0] if content else ""
    return first_line[:60] or "sin-titulo"
