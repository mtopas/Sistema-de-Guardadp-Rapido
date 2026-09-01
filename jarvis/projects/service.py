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
import uuid

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_MIN_PROJECT_NAME_LEN = 2


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
