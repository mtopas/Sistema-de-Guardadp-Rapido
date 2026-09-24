"""
Validación liviana de argumentos contra el JSON-Schema-lite de un ToolSpec.parameters (ver
spec.py) -- siempre un objeto plano de propiedades con tipos primitivos.

No es una librería `jsonschema` completa, a propósito: las 3 tools de esta primera tanda solo
necesitan string/integer/number/boolean con minimum/maximum/enum opcionales sobre un objeto sin
anidar. Si una tool futura necesita schemas anidados o validación más rica, evaluar sumar la
dependencia `jsonschema` en ese momento (no está declarada hoy en jarvis/pyproject.toml) en vez
de ahora, sin necesidad real todavía.
"""
from typing import Any

_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
}


def validate_args(parameters: dict[str, Any], args: dict[str, Any]) -> list[str]:
    """Devuelve la lista de errores de `args` contra `parameters` (vacía = argumentos válidos)."""
    if not isinstance(args, dict):
        return ["los argumentos deben ser un objeto (dict)"]

    errors: list[str] = []
    properties: dict[str, Any] = parameters.get("properties", {}) or {}
    required: list[str] = parameters.get("required", []) or []
    additional_allowed = parameters.get("additionalProperties", False)

    for req in required:
        if req not in args:
            errors.append(f"falta el argumento requerido {req!r}")

    if not additional_allowed:
        for key in args:
            if key not in properties:
                errors.append(f"argumento no reconocido: {key!r}")

    for key, value in args.items():
        prop_schema = properties.get(key)
        if prop_schema is None:
            continue

        prop_type = prop_schema.get("type")
        check = _TYPE_CHECKS.get(prop_type)
        if check and not check(value):
            errors.append(
                f"{key!r} debe ser de tipo {prop_type!r}, recibido {type(value).__name__}"
            )
            continue

        if "enum" in prop_schema and value not in prop_schema["enum"]:
            errors.append(f"{key!r} debe ser uno de {prop_schema['enum']!r}")

        if prop_type in ("integer", "number"):
            minimum = prop_schema.get("minimum")
            maximum = prop_schema.get("maximum")
            if minimum is not None and value < minimum:
                errors.append(f"{key!r} debe ser >= {minimum}")
            if maximum is not None and value > maximum:
                errors.append(f"{key!r} debe ser <= {maximum}")

    return errors
