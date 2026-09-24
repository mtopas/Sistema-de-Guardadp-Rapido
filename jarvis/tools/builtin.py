"""
Tools built-in de la primera tanda (2026-09-23) -- Agenda, Hábitos, Bóveda, en ese orden de
prioridad de producto (Cerebro/decisiones-implementacion.md, 2026-09-22). Finanzas queda
deliberadamente afuera de esta tanda, no descartada.

Las 3 son GET read-only contra la propia API HTTP local de SGR (JARVIS_SGR_API_BASE,
localhost, sin auth) -- mismo patrón ya usado y desplegado desde 0.3 en
jarvis/ingestion/agenda.py::_fetch_recent_events(): requests.get(..., params=..., timeout=...)
+ resp.raise_for_status() antes de leer el JSON. Cero blast radius nuevo, generaliza ese patrón
ya aprobado (ver esa entrada de Cerebro/decisiones-implementacion.md para el detalle completo).

Endpoints reales usados, confirmados contra project/app/main.py:
  - GET /agenda/eventos?desde=&hasta=   (ambos opcionales, la API pone sus propios defaults)
  - GET /habitos/pendientes-hoy?fecha=  (opcional, default hoy)
  - GET /hojas/recientes?limit=         (opcional, 1-100, default 20)
"""
from typing import Any

import requests

from jarvis.config import JARVIS_SGR_API_BASE
from jarvis.tools.registry import ToolRegistry
from jarvis.tools.spec import RiskLevel, ToolSpec

_HTTP_TIMEOUT = 15.0


def _get(path: str, arguments: dict[str, Any]) -> Any:
    params = {k: v for k, v in arguments.items() if v is not None}
    resp = requests.get(f"{JARVIS_SGR_API_BASE}{path}", params=params, timeout=_HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _agenda_list_events(arguments: dict[str, Any], trace_id: str) -> dict:
    return {"eventos": _get("/agenda/eventos", arguments)}


AGENDA_LIST_EVENTS = ToolSpec(
    name="agenda.list_events",
    version="1.0.0",
    description=(
        "Lista eventos de la Agenda de SGR en un rango de fechas. `desde`/`hasta` son "
        "opcionales -- si no se pasan, la API usa su propia ventana por defecto (~1 mes atrás, "
        "~2 meses adelante)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "desde": {
                "type": "string",
                "description": "Fecha/hora ISO desde la cual listar (inclusive). Opcional.",
            },
            "hasta": {
                "type": "string",
                "description": "Fecha/hora ISO hasta la cual listar (inclusive). Opcional.",
            },
        },
        "required": [],
        "additionalProperties": False,
    },
    read_only=True,
    risk=RiskLevel.LOW,
    idempotent=True,
    requires_confirmation=False,
    timeout_seconds=_HTTP_TIMEOUT,
    category="agenda",
)


def _habitos_list_pending_today(arguments: dict[str, Any], trace_id: str) -> dict:
    return {"habitos": _get("/habitos/pendientes-hoy", arguments)}


HABITOS_LIST_PENDING_TODAY = ToolSpec(
    name="habitos.list_pending_today",
    version="1.0.0",
    description=(
        "Lista los hábitos activos programados para un día dado (`fecha` opcional, ISO "
        "YYYY-MM-DD, default hoy)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "fecha": {
                "type": "string",
                "description": "Fecha ISO (YYYY-MM-DD). Opcional, default hoy.",
            },
        },
        "required": [],
        "additionalProperties": False,
    },
    read_only=True,
    risk=RiskLevel.LOW,
    idempotent=True,
    requires_confirmation=False,
    timeout_seconds=_HTTP_TIMEOUT,
    category="habitos",
)


def _boveda_list_recent_notes(arguments: dict[str, Any], trace_id: str) -> dict:
    return {"hojas": _get("/hojas/recientes", arguments)}


BOVEDA_LIST_RECENT_NOTES = ToolSpec(
    name="boveda.list_recent_notes",
    version="1.0.0",
    description="Lista las notas (hojas) más recientes de la Bóveda de SGR (`limit` opcional, 1-100, default 20).",
    parameters={
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Cantidad máxima de hojas a devolver.",
                "minimum": 1,
                "maximum": 100,
            },
        },
        "required": [],
        "additionalProperties": False,
    },
    read_only=True,
    risk=RiskLevel.LOW,
    idempotent=True,
    requires_confirmation=False,
    timeout_seconds=_HTTP_TIMEOUT,
    category="boveda",
)


def register_builtin_tools(registry: ToolRegistry) -> None:
    """Registra las 3 tools de esta tanda en `registry`. Llamar dos veces sobre el mismo
    registry lanza ValueError (tool duplicada, ver registry.py) -- a propósito, no es
    idempotente: cada ToolRegistry se puebla una sola vez."""
    registry.register(AGENDA_LIST_EVENTS, _agenda_list_events)
    registry.register(HABITOS_LIST_PENDING_TODAY, _habitos_list_pending_today)
    registry.register(BOVEDA_LIST_RECENT_NOTES, _boveda_list_recent_notes)
