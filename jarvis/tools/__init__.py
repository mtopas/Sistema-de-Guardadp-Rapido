"""
jarvis/tools — ToolSpec v1 + Tool Registry + Tool Executor.

Primera versión (2026-09-23) de un contrato genérico para que Jarvis invoque operaciones sobre
SGR de forma estructurada y auditable, en vez de que cada caso de uso (worker, futuro loop de
tool-calling de un LLM, etc.) hable HTTP crudo por su cuenta. Decisión aprobada en
Cerebro/decisiones-implementacion.md, 2026-09-22 ("PROPUESTA APROBADA: ToolSpec v1 + Tool
Registry + Tool Executor") -- inspirado conceptualmente en OpenJarvis (Apache-2.0, ver
Cerebro/decisiones-implementacion.md para el detalle de qué se tomó y qué no), pero con diseño
propio de SGR: ese detalle no se repite en cada docstring de acá, ver esa entrada.

Piezas (cada una en su propio módulo, sin acoplarse a `project/app/`):
  - spec.py     -- `ToolSpec` (dataclass inmutable, metadata pura) + `RiskLevel` + `validate_spec()`.
  - schema.py   -- `validate_args()`: JSON-Schema-lite de objeto plano (sin dependencia externa).
  - registry.py -- `ToolRegistry`: registra (name, version) -> (spec, handler), valida al
                    registrar, rechaza duplicados y specs mal formadas. Registrar NUNCA concede
                    permisos de ejecución.
  - executor.py -- `ToolExecutor`: valida argumentos, ejecuta, nunca deja pasar una excepción
                    cruda, revalida `read_only` como defensa en profundidad, propaga un
                    `trace_id` (uuid4) de punta a punta en el `ToolResult`.
  - builtin.py  -- las 3 tools read-only de esta tanda (Agenda, Hábitos, Bóveda) + el registro
                    de todas contra un `ToolRegistry` dado.

Cómo agregar una tool nueva:
  1. Escribir el handler: `def mi_handler(arguments: dict, trace_id: str) -> dict: ...` -- solo
     lectura por ahora (esta primera versión no habilita tools de escritura, ver más abajo).
  2. Definir su `ToolSpec` (name/version únicos, parameters como JSON-Schema-lite de objeto
     plano, read_only=True, risk, idempotent, requires_confirmation, timeout_seconds).
  3. `registry.register(MI_SPEC, mi_handler)` -- lanza ValueError si la spec está mal formada o
     ya existe una tool con el mismo (name, version).
  4. Invocar con `executor.execute(name, version, arguments)` -- nunca llamar al handler
     directo: el Executor es el único punto que valida argumentos y bloquea lo no read-only.

Uso rápido (singleton de conveniencia, ver abajo):
    from jarvis.tools import DEFAULT_EXECUTOR
    result = DEFAULT_EXECUTOR.execute("agenda.list_events", "1.0.0", {"desde": "...", "hasta": "..."})
    if result.ok:
        ...result.data...
    else:
        ...result.error["code"], result.error["message"]...

Decisión sobre `jarvis/worker/task_manifest.py` (TaskManifest, allowlist fija de operaciones del
worker de background): en esta primera versión NO convive tocándose ni migra -- quedan como dos
mecanismos separados a propósito. TaskManifest gobierna el blast radius del worker de
background en sí (sus propias lecturas/escrituras ya existentes: `write_vault`,
`notify_telegram`, `read_agenda_source`, etc.), con call sites ya desplegados en
`jarvis/audit/service.py`, `jarvis/ingestion/*.py`, etc. -- migrarlos a pasar por el Registry
ahora sería un cambio de superficie grande sin necesidad real todavía. El Tool Registry, en
cambio, es un contrato nuevo y ortogonal pensado para invocación explícita bajo demanda (el caso
de uso previsto es un futuro loop de tool-calling de un LLM, todavía no implementado -- ver
Fase-0.md/jarvis-spec.html §15,§25 para MCP/Agent Router, explícitamente fuera de esta tanda), y
ya trae su propio gating (`read_only` + validación de argumentos) en el Executor, sin necesidad
de duplicar `MANIFEST.assert_allowed()` por debajo. Si en una sesión futura el worker empieza a
invocar tools a través de este Registry (en vez de llamar HTTP directo como hoy), en ese momento
tiene sentido evaluar si sus operaciones de TaskManifest se expresan como entradas del Registry
-- no antes.

Blast radius (mismo principio que TaskManifest, ver CLAUDE.md): las 3 tools de esta tanda solo
leen la propia API HTTP local de SGR (`JARVIS_SGR_API_BASE`, típicamente
`http://127.0.0.1:8765`, sin auth) -- nunca tocan `project/database/app.db` ni `D:\\Boveda`
directo, y ninguna escribe nada. Sin identidad/scopes reales todavía (la API de SGR no los
tiene en ninguna ruta de negocio) -- aceptado a propósito para esta tanda porque estas tools
las invoca únicamente el propio worker local contra su propia API en localhost, nadie externo
las dispara (ver Cerebro/decisiones-implementacion.md, 2026-09-22, punto 2). Retomar
identidad/scopes recién si se planea exponer estas tools a un canal externo (Telegram de
terceros, MCP a otro agente) -- no antes.

Explícitamente afuera de esta tanda (próxima sesión, no adelantado acá): más tools (Finanzas
incluida), tools de escritura, MCP, Agent Router / Model Router, policy engine real.
"""
from jarvis.tools.builtin import register_builtin_tools
from jarvis.tools.executor import ToolExecutor, ToolResult
from jarvis.tools.registry import RegisteredTool, ToolRegistry
from jarvis.tools.spec import RiskLevel, ToolSpec, validate_spec

DEFAULT_REGISTRY = ToolRegistry()
register_builtin_tools(DEFAULT_REGISTRY)
DEFAULT_EXECUTOR = ToolExecutor(DEFAULT_REGISTRY)

__all__ = [
    "ToolSpec",
    "RiskLevel",
    "validate_spec",
    "ToolRegistry",
    "RegisteredTool",
    "ToolExecutor",
    "ToolResult",
    "register_builtin_tools",
    "DEFAULT_REGISTRY",
    "DEFAULT_EXECUTOR",
]
