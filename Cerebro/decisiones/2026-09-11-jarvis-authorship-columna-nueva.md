# `memory_entries` gana la columna `authorship` — corrige la resolución original ("sin campo nuevo")

## Decisión

Se agregó `memory_entries.authorship TEXT DEFAULT 'user' CHECK (authorship IN ('user','jarvis_synthesis'))`,
vía `_add_column_if_missing` (mismo patrón liviano que `created_by`, sin rebuild de tabla).

## Por qué (corrige una resolución anterior)

La entrada de `decisiones-implementacion.md` (2026-09-11) decía explícitamente: "sin campo nuevo en
el schema, evita duplicar una distinción que ya existe en `jarvis_audit_proposals`" — resolver el
ruteo autoría mirando `action_type` de la propuesta de origen en el momento de escribir.

Leyendo el código real (`jarvis/worker/processor.py`), esto no es viable: `capture_raw()` (donde se
conoce `action_type`, ej. en `audit/service.py::_apply_create()`) solo inserta en `memory_entries`/
`inbox_queue` — el `write_entry()` real ocurre MÁS TARDE, cuando el worker procesa la entrada desde
`inbox_queue` (`processor.py::process_entry()`), sin ningún vínculo directo a la propuesta que la
originó salvo re-derivarlo de `source_id` (que además no es fiable: `_apply_create()` y
`_apply_clarify()` usan el mismo formato `audit:{proposal_id}`, no distinguible por patrón).

La señal tiene que sobrevivir desde `capture_raw()` hasta el `write_entry()` posterior — o se
persiste, o se pierde. Se agregó la columna en vez de forzar un diseño que no calzaba con el flujo
real de dos pasos (captura → cola → procesamiento) que ya tiene Jarvis.

## Impacto

`jarvis/memory/service.py::capture_raw()` gana parámetro `authorship: str = "user"`.
`jarvis/audit/service.py::_apply_create()` es el único call site que pasa `authorship="jarvis_synthesis"`
— los demás (clarify, open_question, `_resolve_with_new_info`) usan el default `"user"`.
