# `authorship` de una entrada aceptada de Agenda ya era correcto — no hizo falta tocar `passive.py`

## Contexto

Pedido de verificación (2026-09-15): confirmar si `jarvis/captures/passive.py::accept_proposal()`
seteaba `authorship` correctamente para el caso `origin_source == "agenda_ingestion"`, dado que
0.3 (Ingestión de Agenda, 2026-09-03) es anterior a que la columna `authorship` existiera
(2026-09-11, ver `2026-09-11-jarvis-authorship-columna-nueva.md`) y nadie había revisado si ese
call site necesitaba actualizarse.

## Decisión

Ninguna — se confirma que el código ya está bien, sin cambios.

`accept_proposal()` llama `capture_raw()` sin pasar `authorship` en absoluto, para el caso agenda
igual que para el caso passive_capture genérico. `capture_raw()` (`jarvis/memory/service.py`)
tiene `authorship: str = "user"` como default. El resultado: toda entrada aceptada de Agenda queda
con `authorship='user'`, que es exactamente lo que corresponde — `jarvis/vault/writer.py` la rutea
al árbol PARA (`00 - Sin categorizar/`), no a `Boveda/Jarvis/`.

## Por qué es correcto (no solo "por default")

El criterio documentado en `2026-09-11-jarvis-authorship-columna-nueva.md` es explícito:
`'jarvis_synthesis'` es exclusivo de `jarvis/audit/service.py::_apply_create()` — prosa que el LLM
genera combinando fragmentos de memoria. El contenido de una propuesta de Agenda
(`jarvis/ingestion/agenda.py::_event_content_and_question()`/`_task_content_and_question()`) es una
plantilla de texto fijo rellenada con datos que el usuario ya escribió en su propia Agenda
(título, fecha, descripción) — no hay LLM de por medio, no hay combinación de fragmentos, no hay
interpretación. Es información real sobre la vida del usuario con otro formato de origen, no
síntesis de Jarvis. `'user'` es la clasificación correcta.

## Por qué nadie necesitó tocar `passive.py` a pesar de ser código pre-`authorship`

`capture_raw()` fue diseñado con `authorship='user'` como default seguro (ver su docstring:
"'user' (default -- el texto es palabra del usuario, sea cual sea created_by/canal)"). Cualquier
call site que no conozca ni necesite el concepto de síntesis de Jarvis — que es la inmensa mayoría,
incluida toda la captura pasiva — cae en el comportamiento correcto sin tener que enterarse de que
la columna existe. El único call site que sí necesitaba enterarse (`_apply_create()`) es
precisamente el único que se tocó cuando se agregó la columna.

## Verificación

Lectura de código (`accept_proposal()`, `capture_raw()`, `write_entry()`) — sin necesidad de correr
nada, la ruta no tiene ninguna rama condicional que dependa de `origin_source` para `authorship`.
Confirmado además que el código desplegado en el homelab es idéntico byte a byte (sha256) al de
este branch en los 5 archivos relevantes. Ver la entrada de verificación completa en
`Cerebro/estado-actual.md` (2026-09-15) para la prueba real de punta a punta (propuesta real →
Telegram real → rechazo real en DB) — el camino de ACEPTAR contra `jarvis.db` de producción con
datos 100% reales de HOY quedó sin completar a pedido del usuario, así que el `.md` real resultante
de una aceptación de Agenda no se inspeccionó hoy en disco; queda cubierto por la verificación en
sandbox de Milestone 3 (`Cerebro/estado-actual.md`, 2026-09-11) que sí probó `origen: agenda` de
punta a punta contra Ollama real, aunque no contra el `jarvis.db` real de producción.
