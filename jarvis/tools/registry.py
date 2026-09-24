"""
Tool Registry — registro con validación, sin conceder permisos.

Registrar una tool solo la hace conocida (nombre+versión únicos, spec bien formada). Nunca
implica que pueda ejecutarse -- eso lo decide el Executor en cada llamada (ver executor.py), que
revalida `read_only` en cada ejecución como defensa en profundidad: el Registry nunca es la
única barrera entre "está registrada" y "se ejecuta".
"""
from dataclasses import dataclass
from typing import Callable

from jarvis.tools.spec import ToolSpec, validate_spec

# (arguments, trace_id) -> dict serializable (el resultado de la tool)
ToolHandler = Callable[[dict, str], dict]


@dataclass(frozen=True)
class RegisteredTool:
    spec: ToolSpec
    handler: ToolHandler


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[tuple[str, str], RegisteredTool] = {}

    def register(self, spec: ToolSpec, handler: ToolHandler) -> None:
        errors = validate_spec(spec)
        if errors:
            raise ValueError(
                f"[jarvis.tools] ToolSpec inválida para {spec.name!r} v{spec.version!r}: "
                + "; ".join(errors)
            )
        key = (spec.name, spec.version)
        if key in self._tools:
            raise ValueError(
                f"[jarvis.tools] Tool ya registrada: {spec.name!r} v{spec.version!r}"
            )
        self._tools[key] = RegisteredTool(spec=spec, handler=handler)

    def get(self, name: str, version: str) -> RegisteredTool | None:
        return self._tools.get((name, version))

    def list_tools(self) -> list[ToolSpec]:
        return [t.spec for t in self._tools.values()]
