"""
Conteos agregados de memoria (Fase B1 — panel izquierdo del frontend).
"""
import logging

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)


def count_entries_by_type(user_id: str = JARVIS_DEFAULT_USER) -> dict[str, int]:
    """Cantidad de entradas vigentes (valid_to IS NULL) por tipo.

    No rellena los 5 tipos con 0 — devuelve solo los que efectivamente tienen
    entradas. El frontend decide si mostrar 0 o nada para los ausentes.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT type, COUNT(*) AS n FROM memory_entries
               WHERE user_id = ? AND valid_to IS NULL
               GROUP BY type""",
            (user_id,),
        ).fetchall()
        return {r["type"]: r["n"] for r in rows}
    finally:
        conn.close()
