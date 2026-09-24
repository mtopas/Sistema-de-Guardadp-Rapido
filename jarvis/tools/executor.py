"""
Tool Executor — valida argumentos, ejecuta, nunca deja pasar una excepción cruda, propaga un
trace_id de punta a punta.

No imita el patrón de `ToolExecutor` (Rust) de OpenJarvis, que mide tiempo transcurrido DESPUÉS
de correr sincrónicamente en vez de cortar la conexión real (ver Cerebro/decisiones-
implementacion.md, 2026-09-22). Acá alcanza con que cada handler le pase su propio
`timeout_seconds` a la librería HTTP (`requests`, mismo patrón que
jarvis/ingestion/agenda.py::_fetch_recent_events()) -- eso corta la conexión de verdad, no solo
la mide después.

Logging: nunca se loguean `arguments` ni `data` crudos acá (podrían contener valores sensibles
en una tool futura, aunque ninguna de las 3 de esta tanda los tiene) -- solo nombre/versión/
trace_id/código de resultado. Mantener este mismo criterio al sumar tools nuevas.
"""
import logging
import uuid
from dataclasses import dataclass
from typing import Any

import requests

from jarvis.tools.registry import ToolRegistry
from jarvis.tools.schema import validate_args

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    trace_id: str
    data: Any = None
    error: dict[str, str] | None = None


class ToolExecutor:
    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    def execute(
        self, name: str, version: str, arguments: dict[str, Any] | None = None
    ) -> ToolResult:
        trace_id = str(uuid.uuid4())
        arguments = arguments or {}

        tool = self._registry.get(name, version)
        if tool is None:
            logger.warning(
                "[jarvis.tools] Bloqueada: tool no registrada %s v%s (trace_id=%s)",
                name, version, trace_id,
            )
            return ToolResult(
                ok=False,
                trace_id=trace_id,
                error={"code": "not_found", "message": f"Tool no registrada: {name} v{version}"},
            )

        # Defensa en profundidad -- ver docstring del módulo. Hoy las 3 tools registradas son
        # read_only=True, pero el Executor nunca confía en que "está en el Registry" implique
        # "es segura de correr": si algún día se registra una tool de escritura, esta rama la
        # bloquea igual hasta que exista un mecanismo explícito de confirmación/permisos.
        if not tool.spec.read_only:
            logger.warning(
                "[jarvis.tools] Bloqueada: tool no read-only %s v%s (trace_id=%s)",
                name, version, trace_id,
            )
            return ToolResult(
                ok=False,
                trace_id=trace_id,
                error={
                    "code": "not_read_only",
                    "message": f"Tool no es read-only, ejecución bloqueada: {name} v{version}",
                },
            )

        errors = validate_args(tool.spec.parameters, arguments)
        if errors:
            return ToolResult(
                ok=False,
                trace_id=trace_id,
                error={"code": "invalid_arguments", "message": "; ".join(errors)},
            )

        try:
            data = tool.handler(arguments, trace_id)
        except requests.exceptions.Timeout as exc:
            logger.warning(
                "[jarvis.tools] Timeout ejecutando %s v%s (trace_id=%s): %s",
                name, version, trace_id, exc,
            )
            return ToolResult(
                ok=False, trace_id=trace_id, error={"code": "timeout", "message": str(exc)}
            )
        except requests.exceptions.HTTPError as exc:
            logger.warning(
                "[jarvis.tools] Error HTTP ejecutando %s v%s (trace_id=%s): %s",
                name, version, trace_id, exc,
            )
            return ToolResult(
                ok=False, trace_id=trace_id, error={"code": "http_error", "message": str(exc)}
            )
        except Exception as exc:
            logger.exception(
                "[jarvis.tools] Error inesperado ejecutando %s v%s (trace_id=%s)",
                name, version, trace_id,
            )
            return ToolResult(
                ok=False,
                trace_id=trace_id,
                error={"code": "execution_error", "message": str(exc)},
            )

        logger.info(
            "[jarvis.tools] Ejecutada %s v%s OK (trace_id=%s)", name, version, trace_id
        )
        return ToolResult(ok=True, trace_id=trace_id, data=data)
