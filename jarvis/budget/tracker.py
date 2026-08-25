"""
Budget tracker (spec §11) — acumula gasto real por llamada LLM externa
y determina el estado del presupuesto diario.

Estados (spec §11): ACTIVE (<80%), LOW (80-100%), EXHAUSTED (>=100%).
OVERRIDE requiere aprobación explícita del usuario — se implementa
cuando exista la interfaz /jarvis (S4).
"""
import logging
from datetime import datetime, timezone

from jarvis.config import JARVIS_DAILY_BUDGET_USD
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def record_usage(model: str, tokens_in: int, tokens_out: int, cost_usd: float) -> None:
    """Registra el gasto real de una llamada al modelo externo."""
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO budget_usage
                       (date, model, tokens_in, tokens_out, cost_usd, daily_budget_usd)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (_today(), model, tokens_in, tokens_out, cost_usd, JARVIS_DAILY_BUDGET_USD),
            )
    finally:
        conn.close()


def spent_today() -> float:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM budget_usage WHERE date = ?",
            (_today(),),
        ).fetchone()
        return float(row["total"]) if row else 0.0
    finally:
        conn.close()


def get_status() -> str:
    """ACTIVE | LOW | EXHAUSTED según el gasto acumulado hoy vs. JARVIS_DAILY_BUDGET_USD."""
    if JARVIS_DAILY_BUDGET_USD <= 0:
        return "EXHAUSTED"

    spent = spent_today()
    if spent >= JARVIS_DAILY_BUDGET_USD:
        return "EXHAUSTED"
    if spent >= 0.8 * JARVIS_DAILY_BUDGET_USD:
        return "LOW"
    return "ACTIVE"
