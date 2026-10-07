"""
Vinculación de entradas a proyectos (memory_projects / memory_entry_projects).

Resuelve el gap documentado en Cerebro/como-explotar-jarvis.md §0: el
clasificador (`_CLASSIFY_PROMPT` en jarvis/llm/client.py) ya devuelve un
campo "project" desde S1, pero nada lo usaba — memory_projects y
memory_entry_projects quedaban siempre vacías fuera de inserts manuales, así
que el boost de retrieval por proyecto (`_match_project_entry_ids` en
jarvis/retriever/retriever.py) nunca se activaba en uso normal.

Llamado desde jarvis/worker/processor.py después de clasificar, con el mismo
patrón best-effort que jarvis/entities/service.py: nunca lanza, y el
call site además lo envuelve en su propio try/except (misma razón que la
extracción de entidades — "la vinculación no puede fallar el procesamiento
normal" no puede depender solo de la disciplina interna de este módulo).
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from jarvis.config import JARVIS_BOVEDA_PATH, JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_MIN_PROJECT_NAME_LEN = 2
_VAULT_PROJECTS_SECTION = "01 - Proyectos"
_VAULT_READ_MAX_CHARS = 4000
_FRONTMATTER_DELIMITER = "---"


def link_project_for_entry(entry_id: str, project_name: str | None) -> None:
    """Crea (si no existe) el proyecto nombrado por la clasificación y vincula
    la entrada a él. No-op si `project_name` es None/vacío/muy corto. Nunca lanza.
    """
    name = (project_name or "").strip()
    if len(name) < _MIN_PROJECT_NAME_LEN:
        return
    try:
        project_id = _find_or_create_project(name)
        _link_entry_project(entry_id, project_id)
    except Exception as exc:
        logger.warning(
            "[jarvis.projects] Vinculación al proyecto '%s' falló para entry_id=%s: %s",
            name, entry_id, exc,
        )


def _find_or_create_project(name: str) -> str:
    conn = get_connection()
    try:
        with conn:
            row = conn.execute(
                "SELECT id FROM memory_projects WHERE LOWER(name) = LOWER(?)",
                (name,),
            ).fetchone()
            if row:
                return row["id"]

            project_id = str(uuid.uuid4())
            # created_by='jarvis_proposal_accepted': el CHECK de memory_projects solo
            # admite 'user' | 'jarvis_proposal_accepted' (spec: proyectos propuestos
            # por Jarvis y aceptados por el usuario). No existe todavía un flujo real
            # de propuesta/aceptación (requiere UI, fuera de alcance acá) — se usa este
            # valor porque es el que distingue "creado automáticamente por Jarvis" de
            # "creado a mano por el usuario", que es la distinción real que importa.
            conn.execute(
                """INSERT INTO memory_projects (id, name, description, local_only, created_by)
                   VALUES (?, ?, NULL, 0, 'jarvis_proposal_accepted')""",
                (project_id, name),
            )
            return project_id
    finally:
        conn.close()


def _link_entry_project(entry_id: str, project_id: str) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT OR IGNORE INTO memory_entry_projects
                    (entry_id, project_id, is_primary, assigned_by)
                   VALUES (?, ?, 1, 'jarvis')""",
                (entry_id, project_id),
            )
    finally:
        conn.close()


def list_projects_with_activity(user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Proyectos con memory_count y last_activity crudos (Fase B2).

    No calcula ningún "heat" normalizado — es una decisión de escala visual que le
    corresponde al frontend (contra qué normalizar, si el máximo del propio
    listado o un fijo), y que puede querer cambiar sin tocar el backend.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT p.id, p.name,
                      COUNT(CASE WHEN me.id IS NOT NULL AND me.valid_to IS NULL
                                      AND me.user_id = ? THEN 1 END) AS memory_count,
                      MAX(CASE WHEN me.id IS NOT NULL AND me.valid_to IS NULL
                                    AND me.user_id = ? THEN me.recorded_at END) AS last_activity
               FROM memory_projects p
               LEFT JOIN memory_entry_projects mep ON mep.project_id = p.id
               LEFT JOIN memory_entries me ON me.id = mep.entry_id
               GROUP BY p.id, p.name
               ORDER BY memory_count DESC""",
            (user_id, user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _unquote_frontmatter(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _parse_frontmatter_and_body(text: str) -> tuple[dict, str]:
    """Lee el subconjunto de frontmatter que Jarvis necesita sin agregar YAML."""
    if not text.startswith(_FRONTMATTER_DELIMITER) or not text.startswith(("---\n", "---\r\n")):
        return {}, text.strip()

    match = re.search(r"\r?\n---(?:\r?\n|$)", text[len(_FRONTMATTER_DELIMITER):])
    if match is None:
        return {}, text.strip()
    end = len(_FRONTMATTER_DELIMITER) + match.start()

    frontmatter = {}
    for line in text[len(_FRONTMATTER_DELIMITER) + 1:end].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        if key in {"id", "tipo", "creado_en", "actualizado_en", "origen", "url", "icono"}:
            frontmatter[key] = _unquote_frontmatter(value)
        elif key == "tags":
            raw_tags = value.strip().strip("[]")
            frontmatter[key] = [
                _unquote_frontmatter(tag)
                for tag in raw_tags.split(",")
                if tag.strip()
            ]

    body = text[end + len(match.group(0)):].lstrip("\r\n")
    return frontmatter, body.strip()


def _project_note_title(path: Path, body: str) -> str:
    for line in body.splitlines():
        match = re.match(r"^#\s+(.+?)\s*$", line)
        if match:
            return match.group(1)
    return path.stem


def _mtime_iso(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")


def read_vault_project_section() -> dict:
    """Lee notas activas desde Bóveda/01 - Proyectos, sin escribir ningún índice.

    La ubicación física dentro de la sección es la señal de actividad. No se
    cruzan nombres con memory_projects ni se crean filas a partir de archivos.
    """
    section_dir = Path(JARVIS_BOVEDA_PATH) / _VAULT_PROJECTS_SECTION
    base_response = {
        "section": _VAULT_PROJECTS_SECTION,
        "source": "vault",
        "source_label": "Bóveda",
        "source_path": f"Bóveda/{_VAULT_PROJECTS_SECTION}",
        "read_at": _utc_now(),
        "last_modified_at": None,
        "notes": [],
        "reason": None,
    }

    try:
        if not section_dir.is_dir():
            return {
                **base_response,
                "status": "unavailable",
                "reason": "La sección de proyectos no está disponible.",
            }

        notes = []
        read_errors = []
        for path in sorted(section_dir.rglob("*.md")):
            if not path.is_file() or path.name.lower() == "readme.md":
                continue
            try:
                text = path.read_text(encoding="utf-8")
                frontmatter, body = _parse_frontmatter_and_body(text)
                relative_path = path.relative_to(Path(JARVIS_BOVEDA_PATH)).as_posix()
                modified_at = _mtime_iso(path)
                content = re.sub(r"^\s*#\s+.+?(?:\r?\n|$)", "", body, count=1).strip()
                content = content[:_VAULT_READ_MAX_CHARS]
                notes.append({
                    "source": "vault",
                    "source_id": frontmatter.get("id") or relative_path,
                    "source_path": relative_path,
                    "filename": path.name,
                    "title": _project_note_title(path, body),
                    "content": content,
                    "content_truncated": len(body) > _VAULT_READ_MAX_CHARS,
                    "tipo": frontmatter.get("tipo"),
                    "origen": frontmatter.get("origen"),
                    "tags": frontmatter.get("tags", []),
                    "url": frontmatter.get("url"),
                    "updated_at": frontmatter.get("actualizado_en"),
                    "modified_at": modified_at,
                })
            except (OSError, UnicodeError) as exc:
                read_errors.append(path.name)
                logger.warning("[jarvis.projects] No se pudo leer nota de Bóveda %s: %s", path, exc)

        notes.sort(key=lambda note: note["modified_at"] or "", reverse=True)
        last_modified_at = max((note["modified_at"] for note in notes), default=None)
        status = "available" if notes else "empty"
        reason = None
        if read_errors:
            reason = f"No se pudieron leer {len(read_errors)} notas de la sección."
        return {
            **base_response,
            "status": status,
            "last_modified_at": last_modified_at,
            "notes": notes,
            "reason": reason,
        }
    except (OSError, RuntimeError) as exc:
        logger.warning("[jarvis.projects] Lectura de Bóveda no disponible: %s", exc)
        return {
            **base_response,
            "status": "unavailable",
            "reason": "La sección de proyectos no está disponible.",
        }
