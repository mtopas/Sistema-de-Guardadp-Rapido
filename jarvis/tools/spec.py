"""
ToolSpec v1 — contrato de una tool invocable por Jarvis.

Diseño propio de SGR (Cerebro/decisiones-implementacion.md, 2026-09-22, "PROPUESTA APROBADA:
ToolSpec v1 + Tool Registry + Tool Executor"): el ToolSpec real de OpenJarvis
(openjarvis-core/src/types.rs y su origen Python src/openjarvis/tools/_stubs.py) es más flaco
de lo que sugería el informe comparativo que motivó esta tanda -- no tiene versión, ni enum de
riesgo, ni idempotencia. Esos tres campos (`version`, `risk`, `idempotent`) se agregan acá como
diseño propio de SGR, no como algo "tomado de" esa fuente -- ver esa entrada para el detalle
completo de la verificación.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


_VALID_PARAM_TYPES = {"string", "integer", "number", "boolean"}


@dataclass(frozen=True)
class ToolSpec:
    """Metadata pura (serializable) de una tool. No incluye el handler -- eso lo asocia el
    Registry al registrar (ver registry.py), para que la spec en sí pueda inspeccionarse,
    listarse o exponerse (ej. a un futuro loop de tool-calling de un LLM) sin arrastrar código
    ejecutable."""

    name: str
    version: str
    description: str
    parameters: dict[str, Any]  # JSON-Schema-lite de un objeto plano, ver schema.py
    read_only: bool
    risk: RiskLevel
    idempotent: bool
    requires_confirmation: bool
    timeout_seconds: float
    category: str = "read"
    metadata: dict[str, Any] = field(default_factory=dict)


def validate_spec(spec: ToolSpec) -> list[str]:
    """Devuelve la lista de errores de forma de `spec` (vacía = spec válida). Nunca lanza --
    quien llama decide qué hacer con los errores (el Registry lanza ValueError al registrar,
    ver registry.py; esto permite testear la validación en aislamiento)."""
    errors: list[str] = []
    if not spec.name or not spec.name.strip():
        errors.append("name vacío")
    if not spec.version or not spec.version.strip():
        errors.append("version vacía")
    if not spec.description or not spec.description.strip():
        errors.append("description vacía")
    if not isinstance(spec.risk, RiskLevel):
        errors.append("risk debe ser un RiskLevel")
    if spec.timeout_seconds is None or spec.timeout_seconds <= 0:
        errors.append("timeout_seconds debe ser > 0")
    errors.extend(_validate_parameters_shape(spec.parameters))
    return errors


def _validate_parameters_shape(parameters: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(parameters, dict):
        return ["parameters debe ser un dict (JSON Schema)"]

    if parameters.get("type") != "object":
        errors.append('parameters.type debe ser "object"')

    properties = parameters.get("properties", {})
    if not isinstance(properties, dict):
        errors.append("parameters.properties debe ser un dict")
        properties = {}
    else:
        for prop_name, prop_schema in properties.items():
            if not isinstance(prop_schema, dict):
                errors.append(f"parameters.properties.{prop_name} debe ser un dict")
                continue
            prop_type = prop_schema.get("type")
            if prop_type not in _VALID_PARAM_TYPES:
                errors.append(
                    f"parameters.properties.{prop_name}.type inválido: {prop_type!r} "
                    f"(válidos: {sorted(_VALID_PARAM_TYPES)})"
                )

    required = parameters.get("required", [])
    if not isinstance(required, list):
        errors.append("parameters.required debe ser una lista")
    else:
        for req in required:
            if req not in properties:
                errors.append(f"parameters.required incluye {req!r}, ausente de properties")

    return errors
