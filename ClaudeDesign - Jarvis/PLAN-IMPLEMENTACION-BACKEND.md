# Plan de implementación — Backend de Jarvis (soporte al rediseño frontend + config accesible)

Plan de principio a fin para el trabajo de backend necesario. Dos motivaciones:

1. **Cerrar los huecos de datos** que el rediseño visual del frontend
   (`PLAN-IMPLEMENTACION.md`, esta misma carpeta) necesita y que hoy no existen como endpoint
   (counts por tipo de memoria, proyectos con actividad, entidades enriquecidas, budget por
   modelo).
2. **Sacar del código los valores mágicos** (umbrales, pesos, delays) que hoy están hardcodeados
   sueltos en varios módulos, y centralizarlos donde ya existe el patrón correcto en este
   repo: `jarvis/config.py` con `os.getenv(...)` + default documentado.

Ver también: `PLAN-IMPLEMENTACION.md` (frontend, misma carpeta) — ambos planes se referencian
entre sí donde una fase de uno depende de una fase del otro.

## Documentos de referencia

| Documento | Qué tiene |
|---|---|
| `Cerebro/estado-actual.md` | Estado real construido — se actualiza al cierre de cada fase. |
| `Cerebro/decisiones-implementacion.md` | Decisiones de fondo — incluye el hallazgo del 2026-08-26 sobre el umbral 0.92 de consolidación (ver Fase B0, nota importante). |
| `PLAN-IMPLEMENTACION.md` | Plan frontend — sus Fases 1, 4 y 5 tienen huecos de datos que este plan cierra. |

## Principio transversal: no hardcodear (aplica a todas las fases)

Dos niveles, no uno solo — no todo valor mágico se resuelve igual:

- **Nivel 1 — variable de entorno en `jarvis/config.py`**: para cualquier número que sea
  plausible de ajustar por entorno o por preferencia del usuario sin tocar código (umbrales,
  ratios, delays, tamaños de ventana temporal). Mismo patrón ya usado en el archivo:
  `os.getenv("JARVIS_X", "default")`, comentado con el porqué del default si no es obvio, y
  documentado en `project/.env.example`.
- **Nivel 2 — constante nombrada, agrupada, en el módulo que la usa**: para estructuras que no
  tienen sentido como env var (un diccionario de 5 pesos, una fórmula con varios términos). No
  se convierten en variables de entorno artificialmente — pero **tampoco quedan como literales
  sueltos dentro de una expresión o un `return`**. Se nombran, se agrupan al tope del archivo
  junto a las demás constantes del módulo, y se comentan.

**Regla dura**: ningún número con significado (umbral, peso, duración, límite) aparece suelto
dentro de la lógica de una función. Si aparece dos veces, hay un bug de sincronización esperando
pasar — se nombra una vez y se referencia.

**No es re-calibración**: mover un valor a `config.py` o nombrarlo como constante **no cambia su
valor por defecto**. Si en el camino se nota que un valor parece mal calibrado (como ya pasó con
el umbral de similitud 0.92 — ver `decisiones-implementacion.md`, entrada 2026-08-26), eso se
documenta como hallazgo aparte y se espera confirmación del usuario antes de tocar el número —
mismo criterio ya establecido en este proyecto para parámetros/heurísticas ya calibrados.

## Regla de cada fase

Cada fase termina solo cuando:
1. `python -m py_compile` sobre los archivos tocados, sin errores.
2. Verificación funcional contra una **DB de scratch aislada** (nunca contra
   `project/database/jarvis.db` real directamente durante el desarrollo — mismo patrón ya usado
   en todo el historial del proyecto), comparando el resultado del endpoint/función nueva contra
   una query manual equivalente.
3. Ningún endpoint ni comportamiento existente cambia su salida para los mismos inputs (son
   adiciones o refactors de forma, no de comportamiento — salvo que la fase diga explícitamente
   lo contrario, como B6).
4. Ningún valor mágico nuevo queda sin nombrar — ver principio transversal arriba.
5. Se actualiza `Cerebro/estado-actual.md` con una entrada fechada.
6. Si hubo una decisión de arquitectura real (no cosmética), entrada nueva en
   `Cerebro/decisiones-implementacion.md`.
7. Verificación contra el entorno real (Ollama, `jarvis.db` real, worker corriendo) queda
   pendiente de confirmación del usuario, como el resto del historial de Jarvis — no se asume
   sin decirlo explícitamente en el cierre de fase.

---

## Fase B0 — Centralizar configuración existente (prerrequisito de todo lo demás)

**Objetivo**: sacar del código los valores hardcodeados ya identificados, sin cambiar ningún
default. Refactor de accesibilidad puro.

**Inventario exacto (verificado leyendo el código, no supuesto)**:

| Constante | Hoy | Pasa a |
|---|---|---|
| Umbral de similitud de consolidación | `jarvis/worker/consolidation.py:39 _SIMILARITY_THRESHOLD = 0.92` | `config.py: JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD` (env, default `0.92`) |
| Días para marcar stale por edad | `consolidation.py:40 _STALE_DAYS = 90` | `config.py: JARVIS_CONSOLIDATION_STALE_DAYS` (env, default `90`) |
| Confianza al marcar stale | `consolidation.py:41 _STALE_CONFIDENCE = 0.4` | `config.py: JARVIS_CONSOLIDATION_STALE_CONFIDENCE` (env, default `0.4`) |
| Delays de reintento del worker | `jarvis/worker/processor.py:20 _RETRY_DELAYS = [60, 300, 1800]` | `config.py: JARVIS_RETRY_DELAYS_SECONDS` (env CSV, default `"60,300,1800"`, parseado a `list[int]` en `config.py`, no en `processor.py`) |
| Umbral LOW de presupuesto | `jarvis/budget/tracker.py:57` — `0.8` literal dentro de `if spent >= 0.8 * JARVIS_DAILY_BUDGET_USD` | `config.py: JARVIS_BUDGET_LOW_RATIO` (env, default `0.8`) |
| Pesos de tipo en el ranking del retriever | `jarvis/retriever/retriever.py:55-61 _TYPE_WEIGHT` dict | se queda como constante de código (un dict de 5 claves no es un buen env var) — permanece en `retriever.py`, pero se agrega un comentario explícito "punto único de edición de estos pesos" para que no se dupliquen en otro lado |
| Términos de la fórmula de ranking | `retriever.py:473` — `similarity * 0.5 + type_weight * 0.4 + recency_bonus` (0.5 y 0.4 literales dentro del `return`) | constantes nombradas junto a `_RECENCY_BONUS` ya existente: `_SIMILARITY_WEIGHT = 0.5`, `_TYPE_WEIGHT_FACTOR = 0.4` |
| Términos del desempate por recencia | `retriever.py:467` — `similarity * 0.5 + type_weight * 0.5` literales | mismas constantes de arriba reusadas donde aplique, o nombradas aparte si el desempate necesita pesos distintos a propósito (verificar intención original antes de fusionar) |

**No se toca** (ya cumplen el principio o no aplica): `_MIN_PROJECT_NAME_LEN`,
`_MIN_ENTITY_NAME_LEN`, `_RECENCY_DAYS`, `_RECENCY_BONUS` (ya son constantes nombradas al tope
del módulo), `Query(default=20)` de `/jarvis/inbox` (es un parámetro de API con su propio
default por request, no una config de deploy).

**Archivos**: `jarvis/config.py` (crece), `jarvis/worker/consolidation.py`,
`jarvis/worker/processor.py`, `jarvis/budget/tracker.py`, `jarvis/retriever/retriever.py`,
`project/.env.example` (cada variable nueva documentada, comentada, con default).

**Verificación**: `run_consolidation()`, `retrieve()` y `get_status()` corridos contra los
mismos casos de prueba ya documentados en `estado-actual.md` (bake-off, casos de control de
Slice 2) deben devolver exactamente los mismos resultados que antes del refactor — es la prueba
de que no cambió comportamiento, solo estructura.

**Cierre de fase**: `estado-actual.md` + entrada en `decisiones-implementacion.md` dejando
explícito que los valores no cambiaron, solo se centralizaron — para no confundir esto con una
respuesta al hallazgo pendiente sobre el umbral 0.92.

---

## Fase B1 — `GET /jarvis/stats/types` (counts por tipo de memoria)

**Objetivo**: cerrar el hueco del panel izquierdo del frontend ("Tipos de memoria" con count) —
hoy no existe ningún endpoint que devuelva cuántas entradas vigentes hay por tipo.

**Diseño**: `SELECT type, COUNT(*) FROM memory_entries WHERE valid_to IS NULL AND user_id = ?
GROUP BY type` → `{tipo: count}`. **No hardcodea la lista de 5 tipos** — devuelve lo que
efectivamente hay en la tabla; si un tipo tiene 0 entradas, simplemente no aparece en la
respuesta (el frontend decide si mostrar 0 o nada). El backend tampoco sabe nada de colores —
esa responsabilidad queda en `jarvisPalette.js` del frontend, no se duplica acá.

**Archivos**: nuevo `jarvis/stats/service.py` (`count_entries_by_type(user_id)`), endpoint en
`jarvis/api/router.py`.

**Verificación**: contra `jarvis.db` real (solo lectura, sin mutar nada), comparar contra la
query manual equivalente corrida a mano.

**Cierre de fase**: `estado-actual.md`.

**Desbloquea**: `PLAN-IMPLEMENTACION.md` Fase 1 (panel izquierdo con counts reales, en vez de
sin counts).

---

## Fase B2 — `GET /jarvis/projects` (proyectos con actividad)

**Objetivo**: cerrar el hueco de "Proyectos activos" del panel izquierdo. Las tablas
`memory_projects`/`memory_entry_projects` ya existen y se pueblan (auto-linking, ver
`estado-actual.md` — fix del 2026-08-26), pero no hay ningún endpoint que las exponga.

**Diseño**: por proyecto, `memory_count` (join con `memory_entry_projects` + `memory_entries`
vigentes) y `last_activity` (`MAX(recorded_at)` de esas entradas). **El backend no calcula un
"heat" normalizado** — devuelve los números crudos; la barra de calor del mock es una decisión
de escala visual (contra qué se normaliza: el máximo del propio listado, un fijo, etc.) que le
corresponde al frontend y que además puede querer cambiar sin tocar el backend.

**Archivos**: `jarvis/projects/service.py` (agregar `list_projects_with_activity(user_id)` —
el módulo ya existe con `link_project_for_entry()`, se extiende, no se duplica), endpoint en
`jarvis/api/router.py`.

**Verificación**: contra `jarvis.db` real, comparar `memory_count`/`last_activity` de al menos
un proyecto real (ej. el vinculado por el fix de auto-linking) contra join manual.

**Cierre de fase**: `estado-actual.md`.

**Desbloquea**: `PLAN-IMPLEMENTACION.md` Fase 1 (sección "Proyectos activos" con datos reales).

---

## Fase B3 — Entidades enriquecidas

**Objetivo**: `list_entities()` (`jarvis/entities/service.py:269`) hoy solo selecciona
`name, entity_type, last_seen` — la columna `notes` de `memory_entities` existe en el schema
pero nunca se lee, y no hay conteo de memorias ni breakdown de tipos por entidad (los "dots"
de colores del mock).

**Diseño**: extender el `SELECT` para incluir `notes`; agregar `memory_count` y `types` (lista
de tipos distintos, vía join `memory_entry_entities` → `memory_entries.type`, `GROUP BY
entity_id`). **Sin cambiar la firma del endpoint** — son campos nuevos en la respuesta, no
rompe al frontend actual (que hoy no los usa, así que no le afectan) ni a ningún otro
consumidor de `GET /jarvis/entities`.

**Archivos**: `jarvis/entities/service.py::list_entities()`.

**Verificación**: contra una entidad real con entradas de al menos 2 tipos distintos vinculadas
(hay casos así documentados en el QA de Slice 3, `estado-actual.md`), confirmar `types` y
`memory_count` correctos.

**Cierre de fase**: `estado-actual.md`.

**Desbloquea**: `PLAN-IMPLEMENTACION.md` Fase 5 (cards de entidades con nota, count y dots
reales en vez de campos adaptados/vacíos).

---

## Fase B4 — Budget desglosado por modelo

**Objetivo**: `budget_usage` ya registra `model` y `cost_usd` por cada llamada externa
(`jarvis/budget/tracker.py::record_usage()`), pero `GET /jarvis/budget` solo devuelve el total
del día — el panel derecho del mock ("GASTO DE HOY") muestra un desglose por modelo.

**Diseño**: nueva `spent_today_by_model()` — `SELECT model, SUM(cost_usd) FROM budget_usage
WHERE date = ? GROUP BY model`. El backend expone el desglose **por el nombre real del modelo**
(ej. `openai/gpt-4o-mini`), no por etiquetas inventadas "GRANDE"/"CHICO" — esa clasificación,
si se quiere mostrar así, se resuelve comparando contra `JARVIS_REASON_MODEL`/
`JARVIS_LOCAL_MODEL`/`JARVIS_LOCAL_FALLBACK_MODEL` (que ya son la fuente de verdad de cuál es
"el modelo grande" y cuál "el chico" en este sistema — no se inventa un mapeo nuevo en ninguna
capa).

**Archivos**: `jarvis/budget/tracker.py`, endpoint `jarvis/api/router.py` (extiende
`budget_endpoint()`, mismo criterio de no romper la forma actual — agrega un campo
`by_model: [...]`, no reemplaza los existentes).

**Verificación**: contra `budget_usage` real del día (si hay registros — puede estar vacío en
un día sin consultas al modelo externo, caso a probar también), sumar manualmente por modelo y
comparar.

**Cierre de fase**: `estado-actual.md`.

**Desbloquea**: `PLAN-IMPLEMENTACION.md` Fase 4 (sub-sección de costo por modelo en el panel
derecho, en vez de omitirla).

---

## Fase B5 — Endpoint de Debug (opcional / diferido)

**No forma parte del ciclo actual.** El plan de frontend (Fase 6) ya decidió, confirmado con el
usuario, que el panel Debug queda como placeholder sin backend nuevo por ahora. Esta fase queda
documentada para cuando se decida retomarla explícitamente — no ejecutar por inferencia.

**Objetivo si se retoma**: `GET /jarvis/debug/snapshot` envolviendo
`jarvis/debug/service.py::get_snapshot()` (ya existe, hoy solo se usa desde Telegram vía
`/jdebug`). El "log stream" del mock no tiene fuente hoy — `processor.py` solo loguea a
stdout/archivo de proceso, sin persistencia estructurada. Dos caminos posibles, **a decidir con
el usuario en ese momento, no acá**:
- (a) tabla nueva `jarvis_event_log` — el worker escribe una fila por evento relevante
  (clasificación, embedding, error). Costo: escritura extra en el hot path del worker.
- (b) tail de archivo de log real con rotación, expuesto vía endpoint que lee las últimas N
  líneas. Más simple, menos estructurado, no queryable.

**Cierre de fase, si se ejecuta**: `estado-actual.md` + `decisiones-implementacion.md` (es una
decisión de arquitectura real).

---

## Fase B6 — Señal real de "worker vivo" (opcional)

**Objetivo**: el plan de frontend (Fase 1) deriva el health indicator (verde "worker activo" /
pink "modo local") del estado del budget, como simplificación consciente — no es una señal real
de que el proceso worker esté corriendo. Esta fase agrega la señal real, si se decide que vale
la pena.

**Diseño**: el worker persiste un heartbeat (timestamp) en `jarvis_policies` en cada vuelta del
loop de polling — mismo patrón ya usado para `consolidation_last_run` (INSERT nuevo por
cambio, se lee el más reciente por `created_at`, nunca `UPDATE` in place). Nuevo
`GET /jarvis/health` → `{"worker_alive": bool}`, calculado como
`(now - último_heartbeat) < JARVIS_WORKER_POLL_INTERVAL * JARVIS_HEALTH_STALE_MULTIPLIER`
— **la ventana de tolerancia es una constante nueva en `config.py`**
(`JARVIS_HEALTH_STALE_MULTIPLIER`, env, default `3`), no un número inline en el endpoint.

**Archivos**: `jarvis/worker/main.py` (+heartbeat), `jarvis/api/router.py` (+endpoint),
`jarvis/config.py`.

**Cierre de fase**: `estado-actual.md`. No bloquea nada — el frontend ya tiene un fallback
funcional sin esto.

---

## Fase B7 — QA de regresión + `.env.example` completo

**Objetivo**: cierre del plan. Correr worker + bot de Telegram + API con todos los endpoints
nuevos activos y confirmar que nada de lo existente cambió de comportamiento (mismo patrón de
QA end-to-end ya usado para 0.1 y 0.2 — ver `estado-actual.md`). Confirmar que
`project/.env.example` documenta **todas** las variables nuevas de `config.py` agregadas en
este plan, con su default y una línea de qué controla cada una.

**Cierre de fase**: entrada final en `estado-actual.md` con una tabla de qué endpoints quedaron
listos para consumir desde el frontend (B1-B4) y cuáles quedaron opcionales/sin implementar
(B5, B6 si no se ejecutaron) — para que una sesión futura sepa, sin tener que releer todo este
plan, qué fallback sigue vigente en `PLAN-IMPLEMENTACION.md`.

---

## Resumen de archivos por fase

| Fase | Nuevos | Tocados |
|---|---|---|
| B0 | — | `config.py`, `consolidation.py`, `processor.py`, `tracker.py`, `retriever.py`, `.env.example` |
| B1 | `jarvis/stats/service.py` | `api/router.py` |
| B2 | — | `projects/service.py`, `api/router.py` |
| B3 | — | `entities/service.py` |
| B4 | — | `budget/tracker.py`, `api/router.py` |
| B5 (opcional) | posible `jarvis/db` migración de tabla nueva | `debug/service.py`, `api/router.py` |
| B6 (opcional) | — | `worker/main.py`, `api/router.py`, `config.py` |
| B7 | — | `.env.example` |

## Cómo se conecta con el plan de frontend

| Fase backend | Desbloquea en `PLAN-IMPLEMENTACION.md` |
|---|---|
| B0 | Ninguna directamente — prerrequisito de higiene antes de tocar más código backend. |
| B1 | Fase 1 — panel izquierdo, counts reales por tipo. |
| B2 | Fase 1 — panel izquierdo, proyectos activos con actividad real. |
| B3 | Fase 5 — panel de Entidades con nota/count/dots reales. |
| B4 | Fase 4 — panel derecho, desglose de costo por modelo. |
| B5 | Fase 6 — panel Debug completo (hoy placeholder a propósito). |
| B6 | Fase 1 — health indicator con señal real en vez de la simplificación vía budget. |
