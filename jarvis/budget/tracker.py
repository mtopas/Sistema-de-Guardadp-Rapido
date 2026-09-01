"""
Budget tracker (spec §11) — acumula gasto real por llamada LLM externa
y determina el estado del presupuesto diario.

Estados (spec §11): ACTIVE (<80%), LOW (80-100%), EXHAUSTED (>=100%).
OVERRIDE requiere aprobación explícita del usuario — se implementa
cuando exista la interfaz /jarvis (S4).
"""
import logging
from datetime import datetime, timezone

from jarvis.config import (
    JARVIS_BUDGET_LOW_RATIO,
    JARVIS_DAILY_BUDGET_USD,
    JARVIS_LOCAL_FALLBACK_MODEL,
    JARVIS_LOCAL_MODEL,
    JARVIS_REASON_MODEL,
)
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
    if spent >= JARVIS_BUDGET_LOW_RATIO * JARVIS_DAILY_BUDGET_USD:
        return "LOW"
    return "ACTIVE"


def _role_for_model(model: str) -> str:
    """Clasifica un nombre de modelo real contra las 3 constantes de config.py que
    son la fuente de verdad de "cuál es el modelo grande" y "cuál el chico" en este
    sistema — la única comparación de este tipo vive acá (spec: Fase B4, no se
    inventa un mapeo nuevo en otra capa; el frontend solo etiqueta `role`).
    """
    if model == JARVIS_REASON_MODEL:
        return "reason"
    if model in (JARVIS_LOCAL_MODEL, JARVIS_LOCAL_FALLBACK_MODEL):
        return "local"
    return "other"


def spent_today_by_model() -> list[dict]:
    """Desglose del gasto de hoy por modelo real, con `role` (reason/local/other)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT model, SUM(cost_usd) AS total FROM budget_usage WHERE date = ? GROUP BY model",
            (_today(),),
        ).fetchall()
        return [
            {"model": r["model"], "cost_usd": round(float(r["total"]), 6), "role": _role_for_model(r["model"])}
            for r in rows
        ]
    finally:
        conn.close()
