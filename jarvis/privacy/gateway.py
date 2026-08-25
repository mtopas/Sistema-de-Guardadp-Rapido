"""
Privacy Gateway (spec §17) — filtra qué memory_entries pueden salir
al modelo externo. Ante la duda, bloquea.

Orden de verificación:
  1. entry.local_only            -> bloquear
  2. entry.confidential          -> bloquear
  3. proyecto asociado local_only -> bloquear
  4. regex de secretos evidentes  -> bloquear el fragmento (no la consulta completa)
"""
import logging
import re

from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

# Patrones mínimos de secretos evidentes (spec §17). El detector de PII
# completo (DNI, CUIT, cuentas, teléfonos) se implementa en 0.2.
SECRET_PATTERNS = {
    "openai_key": re.compile(r"sk-[A-Za-z0-9]{20,}"),
    "github_pat": re.compile(r"ghp_[A-Za-z0-9]{36}"),
    "slack_bot_token": re.compile(r"xoxb-[0-9]+-[A-Za-z0-9-]+"),
    "bearer_token": re.compile(r"Bearer [A-Za-z0-9._~+/-]+=*"),
    "password_inline": re.compile(r"password\s*[:=]\s*\S+", re.IGNORECASE),
    "api_key_inline": re.compile(r"api_?key\s*[:=]\s*\S+", re.IGNORECASE),
}


def find_secrets(text: str) -> list[str]:
    """Devuelve los nombres de los patrones de secreto encontrados en el texto."""
    if not text:
        return []
    return [name for name, pattern in SECRET_PATTERNS.items() if pattern.search(text)]


def _project_local_only(entry_id: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT 1 FROM memory_entry_projects mep
               JOIN memory_projects mp ON mp.id = mep.project_id
               WHERE mep.entry_id = ? AND mp.local_only = 1
               LIMIT 1""",
            (entry_id,),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def is_entry_allowed(entry: dict) -> tuple[bool, str | None]:
    """Aplica el orden de verificación del Privacy Gateway a una memory_entry.

    Devuelve (permitido, motivo_bloqueo).
    """
    if entry.get("local_only"):
        return False, "local_only"
    if entry.get("confidential"):
        return False, "confidential"
    if _project_local_only(entry["id"]):
        return False, "project_local_only"

    text = entry.get("content_processed") or entry.get("content_raw") or ""
    secrets = find_secrets(text)
    if secrets:
        return False, f"secret_pattern:{','.join(secrets)}"

    return True, None


def filter_context(entries: list[dict]) -> list[dict]:
    """Filtra memory_entries antes de que salgan como contexto RAG al modelo externo.

    Nunca lanza — las entradas bloqueadas se omiten y quedan logueadas.
    """
    allowed = []
    for entry in entries:
        ok, reason = is_entry_allowed(entry)
        if ok:
            allowed.append(entry)
        else:
            logger.info(
                "[jarvis.privacy] Fragmento bloqueado entry_id=%s motivo=%s",
                entry.get("id"), reason,
            )
    return allowed
