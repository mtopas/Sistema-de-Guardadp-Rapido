# Estado Actual de Jarvis
Última actualización: 2026-09-23

## FIX: columna de nivel del Log del Worker (Jarvis/Debug) se pisaba con la columna de mensaje (2026-09-23)

Reportado por el usuario: en `/jarvis` → Debug → "LOG DEL WORKER", la segunda columna (nivel
del evento, ej. `BACKFILL_DONE`) se superponía visualmente con la tercera (mensaje).

**Causa real**: `JarvisDebugPanel.jsx` fija el grid de cada fila en `78px 88px 1fr` (hora /
nivel / mensaje). Los `88px` de la columna de nivel se dimensionaron en la fase 0.1, cuando los
niveles conocidos eran cortos (`CLASSIFY`, `ENTITY`, `EMBED`, `LINK`, `ERROR`, 4-8 caracteres).
Los niveles agregados después por el backfill one-time (`jarvis/cli/backfill_vault_content.py`,
2026-09-15) son bastante más largos — `BACKFILL_CLASSIFY` (17), `BACKFILL_EMBED` (14),
`BACKFILL_DONE` (13), `TELEGRAM_FAIL` (13) — y nadie actualizó el ancho de columna. Además,
a diferencia de la columna de mensaje (que ya tenía `overflow: hidden` +
`textOverflow: ellipsis` + `whiteSpace: nowrap`), la columna de nivel no tenía ningún manejo de
overflow, así que el texto que no entraba se derramaba visualmente sobre la columna siguiente
en vez de cortarse.

**Fix**: columna de nivel ampliada a `150px` (cubre cómodo el caso más largo conocido,
`BACKFILL_CLASSIFY`) + `minWidth: 0`, `overflow: hidden`, `textOverflow: ellipsis`,
`whiteSpace: nowrap` (mismo tratamiento que ya tenía la columna de mensaje) + `title={ev.level}`
para poder ver el valor completo en un tooltip si algún nivel futuro igual no entra. Así,
cualquier nivel nuevo que se agregue más adelante trunca con "…" en vez de volver a pisar la
columna de al lado.

**Verificado**: `npx vite build` limpio, sin errores nuevos (mismo warning de chunk grande que
ya existía antes, no relacionado). No se verificó visualmente en navegador contra datos reales
con un evento `BACKFILL_DONE` real — la próxima vez que corra el backfill o alguien abra ese
panel con datos de backfill reales conviene confirmarlo a ojo.

Impacto: `project/frontend/src/components/jarvis/JarvisDebugPanel.jsx` únicamente.

---

## CONTINUACIÓN TANDA 1 (Finanzas): cobertura de formateo + rutas HTTP (2026-09-23, segunda sesión)

Retoma de donde quedó la tanda 1 sin resolver: las 4 áreas de Finanzas que faltaban cobertura.

**Tests nuevos, los 47 en verde**:
- **Frontend (40 tests)**: `project/frontend/src/data/finanzas.formato.test.js` — nuevo archivo.
  - Formateo: `fmtARS`, `fmtUSD`, `fmtARSShort`, `fmtCantidad`, `fmtDolarQuote` (23 tests).
  - Conversión y matemática de fechas: `contribucionFireUSD`, `mesesCalendarioHasta`, `cuotaMensualObjetivo` (17 tests).
- **Backend (7 tests)**: `project/tests/test_fin_routes.py` — nuevo archivo con rutas HTTP/FastAPI.
  - `GET /fin/categorias` (vacía, con data, con parámetro `?include_ocultas`) — 3 tests.
  - `GET /fin/movimientos/resumen` (vacía, con data, excluye transferencias) — 3 tests.
  - `PATCH /fin/cuentas/{id}/saldo` (verifica que da 410 Gone deprecated) — 1 test.

**Suite completa verificada**:
- Frontend: 68 tests en verde (28 anterior + 40 nuevo formateo).
- Backend: 17 tests en verde (10 anterior + 7 nuevo rutas HTTP).
- Total: 85 tests sin fallos.

**Bugs reales encontrados al correr contra código real** (1 en esta sesión):
1. `fmtARSShort(999_999)` devuelve `'$1.000,00K'`, no `'$999,99K'` — edge case de redondeo:
   `999_999 / 1000 = 999.999` → redondea a `1000.00` con 2 decimales. No es un bug del código
   (es cómo funciona `toLocaleString`), pero se documenta en el test (`999_950` test límite que no redondea).
   **Decisión**: documentar el comportamiento real, no bajar la exigencia del test.

**No cubierto aún en Finanzas** (evaluar si agotar antes de Tanda 2 Hábitos o pasar adelante):
- Rutas HTTP adicionales (ej: `POST /fin/categorias`, `PATCH /fin/movimientos/{id}`, etc.) — candidas pero no P0.
- Datos específicos de Demo (`seed_demo.py` — genera data de ejemplo, aún usa cat. `Ahorro` legacy).
- Edge cases de parsing de fechas en `mesesCalendarioHasta` con formatos ISO8601 complejos (hora/tz).
- Integración end-to-end con dólar real (`GET /fin/dolar/cotizacion`) — requeriría red/cache.

**Decisión para continuar**: Finanzas módulo 1 considerado "suficientemente cubierto" (4 áreas→4 tandas
completadas: cajón/categorías/formateo/rutas). Pasar a **Tanda 2: Hábitos** del plan (backend CRUD +
frontend utilities de tracking diario/heatmap/streak).

---

## IMPLEMENTADO: infraestructura de testing + tanda 1 (Finanzas) del plan de testing con modelo local (2026-09-23)

Ejecuta la tanda 1 del plan aprobado en `Cerebro/decisiones-implementacion.md`
(`2026-09-22 — PROPUESTA APROBADA: plan de testing de todo el sistema con modelo local...`).
No es una sesión de auditoría aparte — el propio orquestador corrió el loop generar (modelo
local) → auditar (orquestador) en esta sesión, no delegado a otra.

**Infraestructura nueva** (prerrequisito del plan, antes no existía nada):
- Backend: `pytest`+`pytest-asyncio` (`project/requirements-dev.txt`, nuevo),
  `project/pytest.ini` (marker `integration`), `project/tests/conftest.py` con fixture
  `tmp_app_db` (SQLite real en `%TEMP%`, nunca `project/database/app.db`; overridea `DB_PATH`
  antes de que se importe `app.config`/`app.db.crud` por primera vez — ver comentario en el
  propio archivo). `project/tests/test_sandbox_fixture.py` verifica el aislamiento de la
  fixture contra la DB real.
- Frontend: Vitest (`project/frontend/vitest.config.js`, `package.json` con script `test`).

**Modelo local usado — cambio respecto al plan original**: se probó `gemma3:12b` (el ganador
del bake-off de extracción del 26/08) para la primera tanda, tardó varios minutos por archivo.
Se comparó contra `qwen2.5-coder:7b` (modelo de código, más chico) sobre el mismo prompt: 3-4x
más rápido (281s/527s/246s por tanda vs. gemma3:12b sin cronometrar con precisión pero
sensiblemente más lento) y calidad equivalente — ambos necesitan el mismo nivel de auditoría
real, no se detectó que el modelo más chico generara peor cobertura. **Se adoptó
`qwen2.5-coder:7b` para el resto del plan** (Ollama local, `http://localhost:11434`, mismo
host que ya usa Jarvis) — no vía LiteLLM porque es tooling de generación de tests, no código de
producto de `jarvis/` (el invariante de LiteLLM aplica al pipeline de Jarvis, no a este script).

**Tests nuevos, los 3 en verde**:
- `project/frontend/src/data/finanzas.cajon.test.js` (5 tests): `isTransferencia`,
  `movimientoAsignadoACajon`, `contribucionCategoria`, `contribucionFire`,
  `acumuladoPorCategoriaNombre`.
- `project/frontend/src/data/finanzas.categorias.test.js` (23 tests): `normalizeMovimiento`,
  `isFinCategoriaObjetivo`, `isFinCategoriaReservada`, `categoriaAplicaATipo`,
  `filterCategoriasPorTipo`, `pickDefaultCategoria`.
- `project/tests/test_fin_saldos_objetivos.py` (7 tests, `@pytest.mark.integration` contra
  `tmp_app_db` real): saldos ARS/USD separados por movimiento, `fin_recalcular_saldos_cuentas`
  idempotente y equivalente al cálculo incremental, `fin_crear_objetivo` crea categoría
  homónima visible, `fin_eliminar_objetivo` la oculta sin borrarla (`oculta=1`,
  `objetivo_id=NULL`), id inexistente da `False` sin excepción.

**Bugs reales encontrados en los borradores del modelo, corregidos antes de aceptar cada
tanda** (evidencia de que la auditoría no es opcional, ni con el modelo de código):
1. `movimientoAsignadoACajon({categoria_nombre:'otra categoria'}, 'otra categoria')` — el
   modelo asumió `false` (que el matcher solo sirve para "FIRE"); es genérico, da `true`.
2. `acumuladoPorCategoriaNombre` con dos movimientos donde solo uno matchea la categoría —
   el modelo sumó igual el que no matchea (`-50` en vez de `-100`).
3. `normalizeMovimiento` con ambos esquemas presentes para el mismo campo (`type` Y `tipo` a
   la vez) — el modelo asumió que gana el esquema nuevo; en realidad gana el que aparece
   PRIMERO en el `??` de la fuente, que es el viejo (`m.type ?? m.tipo`).
4. `filterCategoriasPorTipo`/`categoriaAplicaATipo` compuestos — el modelo no arrastró
   correctamente la regla "Transferencia aplica a cualquier tipoMov" al armar los arrays
   esperados de la función de filtro (3 de 4 casos con arrays incorrectos), y asumió que
   `tipoMov==='both'` actúa como comodín para todas las categorías cuando en realidad solo
   matchea categorías cuyo propio campo `tipo` sea literalmente `'both'`.
5. `pickDefaultCategoria` — 2 de 6 casos con el resultado esperado equivocado: asumió que
   `lastSaved` siempre gana si es válido (ignora que además tiene que cumplir
   `t==='both' || t===tipoMov`), y asumió que `'Transferencia'` podía ser el resultado de la
   función cuando el código la excluye explícitamente del pool (comentario fuente: "nunca
   Transferencia").
6. Backend: `fin_crear_objetivo(...)` devuelve un dict (`{"id":..., "nombre":..., ...}`), el
   modelo lo trató como si fuera directamente el id numérico — comparaciones y llamadas
   posteriores (`fin_eliminar_objetivo(objetivo_id)`) habrían fallado o comparado mal.
7. Backend: 3 de 4 llamadas a `fin_crear_movimiento(...)` omitían `descripcion` (argumento
   posicional obligatorio) — `TypeError` al ejecutar, no un error silencioso.
8. (Bug del propio orquestador, no del modelo, encontrado corriendo el test) — la primera
   versión de la corrección usaba `c["nombre"]` para leer el nombre de una categoría desde
   `fin_obtener_categorias()`; la clave real del dict es `c["name"]` (`_fin_cat_dict` en
   `crud.py`), no `"nombre"` (aunque la columna SQL sí se llame `nombre`).

Ninguno de estos bugs quedó silenciado bajando la exigencia del test — se corrigió el
assert/código de test para que refleje el comportamiento real verificado contra la fuente
(y, en varios casos, corriendo el test antes y después del fix para confirmar).

**No cubierto en esta pasada de tanda 1** (queda para retomar si se sigue con Finanzas antes
de pasar a la tanda 2 del plan — Hábitos): `contribucionFireUSD` (conversión USD/dólar),
`mesesCalendarioHasta`/`cuotaMensualObjetivo` (matemática de fechas del objetivo FIRE),
formateo (`fmtARS`/`fmtUSD`/etc.), y ninguna ruta HTTP de `/fin/*` probada a nivel FastAPI
(`TestClient`) — solo las funciones de `crud.py` directo contra la DB de sandbox.

**Verificado**: suite completa corrida al final (`npx vitest run` + `pytest tests/`), 38 tests
en verde (28 frontend + 10 backend), sin tocar `project/database/app.db` real en ningún
momento (confirmado por `test_tmp_app_db_is_isolated_from_real_db`).

---

## CAMBIO DE ESTADO: el repo pasó a público en GitHub (2026-09-22)

`mtopas/Sistema-de-Guardadp-Rapido` dejó de ser privado. Antes de publicarlo se auditó y purgó:
4 archivos de DB con datos reales (notas de Bóveda, movimientos financieros, conversaciones de
Jarvis) que estaban trackeados en git desde hacía semanas se sacaron del historial completo con
`git filter-repo` (backup fuera del repo antes de purgar, verificado que no quedaron rastros en
ningún commit remoto). Se destrackeó `project/frontend/dist/` (bug de `.gitignore`) y un log de
runtime, y se portabilizaron las rutas hardcodeadas (`D:\Boveda`, `D:\Sistema-de-Guardadp-Rapido`)
en 8 archivos con lógica real. Detalle completo en `Cerebro/decisiones-implementacion.md`, entrada
`2026-09-22`.

**Implicancia permanente para cualquier sesión futura**: el repo es público. Ver la sección "Repo
público" en `CLAUDE.md` (convenciones de git) antes de tocar código que se vaya a commitear —
nunca hardcodear rutas absolutas de esta PC, nunca commitear secrets/tokens reales, nunca
commitear archivos de DB/datos reales. La sección VI del bootstrap del orquestador
(`Cerebro/Orquestrador/GENERAL_ORCHESTRATOR_BOOTSTRAP.txt`) también se actualizó con esto.

## IMPLEMENTADO: 4 fixes baratos de la auditoría externa + 3 mejoras de Agenda (2026-09-21)

Dos forks lanzados en paralelo (sin worktree aislado — riesgo real de pisada entre ellos
porque terminaron tocando 3 archivos en común: `main.py`, `HoyTab.jsx`, `TareaModal.jsx`;
verificado a mano después de que ambos terminaran que el resultado final combina los dos
sin corrupción — confirmado diff por diff, no asumido). Próxima vez que haya trabajo paralelo
genuino sobre los mismos módulos, usar `isolation: "worktree"` como ya se hizo otras veces
esta sesión, en vez de dos forks sueltos sobre el mismo working directory.

### 4 fixes de la auditoría externa (ver `Cerebro/PROXIMAMENTE.md`, entrada `2026-09-21`)
1. **Allowlist de Telegram global** — `project/mybot/bot.py`: `_enforce_allowlist()` registrado
   con `group=-1` (corre antes que cualquier otro handler), `ApplicationHandlerStop` si el chat
   no está en `BOT_ALLOWED_CHAT_IDS`. Sin la env var configurada, comportamiento idéntico a
   antes (todos pasan). `finanzas_handlers.py::_is_allowed()` queda como chequeo redundante,
   sin tocar.
2. **Timezone explícita en jobs de Telegram** — `APP_TIMEZONE = ZoneInfo("America/Argentina/
   Buenos_Aires")` hardcodeada, pasada a `ApplicationBuilder().defaults(Defaults(tzinfo=...))`
   — los `datetime.time` naive de `run_daily`/`run_repeating` (check-in nocturno, resumen
   semanal de Finanzas, etc.) dejan de interpretarse en UTC.
3. **`SGR_SYNC_TOKEN` obligatorio** — `project/app/main.py::_check_sync_token()`: sin token
   configurado, `/sync/export` y `/sync/import` ahora rechazan con 503 (antes: fail open,
   cualquiera podía reemplazar la DB canónica completa sin token).
4. **Avisos de "guardado falso"** — 8 mutaciones de `useStore.js` (Finanzas: movimientos;
   Agenda: tareas; Hábitos: registros) ahora llaman `showToast(..., 'error')` cuando el fetch
   real falla, en vez de fallback silencioso. Hallazgo real no anticipado: `TareaModal.jsx` y
   `HoyTab.jsx` mostraban un toast de éxito incondicional que pisaba el de error — `addAgendaTarea`/
   `updateAgendaTarea` ahora devuelven `{ok, data}`/`ok` y esos 2 archivos solo festejan si `ok`.
   Sin cubrir: Bóveda, calendarios/listas/eventos de Agenda, altas de hábitos, horario de
   Facultad — quedan con el fallback silencioso de siempre.

### 3 mejoras de Agenda
1. **HOY, panel izquierdo en 2 bloques** — `HoyTab.jsx`: mismo conjunto de tareas de siempre
   (próximos 15 días + sin fecha), separadas visualmente en bloque "con fecha" (hoy cae primero
   por el sort existente) y bloque "Sin fecha" debajo. `TareaPendienteCard` extraído para
   reusar el JSX sin duplicar.
2. **Editar tarea desde TAREAS→Lista** — antes solo se podía desde Canvas (el aside de la vista
   Lista era de solo lectura). Ahora un botón "Editar" abre `TareaModal` real (mismo componente
   que usa Canvas). De paso, fix de un bug real de datos obsoletos: el aside mostraba el objeto
   del momento del click, no reflejaba ediciones sin cerrar y reabrir (`editTareaLive`).
3. **Recurrencia de tareas** (diario / días de semana / día del mes) — diseño: a diferencia de
   `agenda_eventos` (expansión virtual en `_expand_recurring()`, nunca persiste), las tareas
   **materializan filas reales** porque tienen `completada` por ocurrencia. Columnas nuevas en
   `agenda_tareas`: `se_repite`/`regla_repeticion`/`serie_id` (mismo shape de regla que
   eventos). `agenda_crear_tarea()` genera las ocurrencias al crear la cabeza, dentro de una
   **ventana acotada sin job que la extienda** (limitación conocida, no un bug): diario 60 días,
   semanal 12 semanas, mensual 12 ocurrencias. Solo se puede configurar recurrencia AL CREAR una
   tarea, no después — no se soporta "editar esta ocurrencia vs. toda la serie" (RFC 5545
   completo quedó diferido en `Cerebro/PROXIMAMENTE.md`). UI de recurrencia en `TareaModal.jsx`
   copiada del patrón ya usado en `EventoModal.jsx` (mismas claves i18n, sin duplicar).

**Verificado por el orquestador** (no solo por el reporte de los forks): diff completo de los 9
archivos revisado línea por línea, sin corrupción entre los 2 forks; `py_compile` limpio en los
6 archivos backend; `npm run build` limpio; **sandbox propio** (nunca la DB real) probando las
3 frecuencias de recurrencia de tareas — semanal (25 filas, días de semana correctos), diario
(61 filas), mensual (13 filas, todas día 15) — y confirmando que completar/borrar una ocurrencia
no afecta a sus hermanas ni a la cabeza de la serie.

**Pendiente real, anotado para más adelante**: la ventana de recurrencia de tareas no se
extiende sola con el tiempo — si una tarea semanal sigue activa después de 12 semanas, hay que
recrearla a mano. Sumado a `Cerebro/PROXIMAMENTE.md`.

**Desplegado al homelab el mismo día**: `project/`+`jarvis/` resincronizados, imagen
reconstruida, 3 contenedores recreados. `RestartCount=0` en los 3; logs del `bot` sin errores
(muestra correctamente "BOT_ALLOWED_CHAT_IDS sin configurar -- el bot acepta cualquier chat",
esperado porque el usuario no configuró la env var); logs del `backend` sin errores nuevos
(mismos 2 warnings preexistentes ya documentados); `curl` externo confirma el hash del build
nuevo servido.

## IMPLEMENTADO + DESPLEGADO: panel lateral colapsable "Sin fecha" en canvas de Tareas (2026-09-21)

Pedido explícito del usuario: la tarjeta "Sin fecha" competía visualmente con las listas
reales en la grilla del canvas de Tareas. Implementado por fork (verificación real con
Chrome, no solo lectura de código) — un solo archivo tocado,
`project/frontend/src/components/agenda/TareasTab.jsx`: la tarjeta se reemplazó por
`SinFechaPanel`, una barra de 36px pegada al borde derecho (ícono + contador) que expande un
panel de 280px al clickear. De paso, `TareaRow` ganó una prop opcional `color` — cada tarea en
Canvas (dentro de una `ListaCard` o en el panel de Sin fecha) ahora muestra un punto del color
de su lista (resuelto por `lista_id` para las tareas mezcladas del panel de Sin fecha).

Verificado por el orquestador (diff completo revisado, no solo el reporte del fork): `npm run
build` limpio: confirmado dos veces. Desplegado al homelab el mismo día — 3 contenedores
recreados, `RestartCount=0`, `curl` externo confirma que sirve el hash nuevo
(`index-Ckqj62C4.js`).

## IMPLEMENTADO: botones de Telegram para triage_move (Sí/No/Ver contenido/categoría manual) (2026-09-21)

Pedido explícito del usuario tras la primera propuesta real (ver entrada de arriba, mismo
día): el mensaje de texto plano no decía qué nota se proponía mover. Implementado por fork
(2 intentos — el primero terminó en 5s sin usar ninguna herramienta ni tocar archivos, falla
silenciosa detectada al revisar `git status`; el segundo sí hizo el trabajo real, 65 tool
calls). Diff completo revisado por el orquestador línea por línea antes de commitear —
detalle completo del diseño en `Cerebro/decisiones-implementacion.md`, entrada `2026-09-21 —
Botones de Telegram para triage_move`.

**Resumen**: cada propuesta `triage_move` ahora llega con el título de la nota + 3 botones
(Sí/No/Ver contenido) en vez de texto plano a responder con "sí/no". "No" abre un submenú
para elegir cualquier categoría real del árbol (no solo las 8 fijas del clasificador
automático) o dejar la nota sin archivar. El throttle existente (`push_next_audit_batch()`)
ya garantiza que la siguiente nota no se propone hasta que la actual esté resuelta del todo
— no hizo falta ninguna cola nueva.

Archivos tocados: `jarvis/notify/telegram.py`, `jarvis/audit/service.py`,
`jarvis/ingestion/inbox_triage.py`, `project/app/db/crud.py`, `project/mybot/bot.py`,
`project/mybot/jarvis_handlers.py`.

**Verificado** (sandbox aislado, nunca datos reales): `py_compile`/import limpios; el override
manual de destino mueve el archivo real al lugar elegido, no al recomendado; los otros 7
tipos de propuesta de auditoría no cambiaron de comportamiento. **Sin verificar todavía**: el
flujo de clics real en Telegram — pendiente de probar con el usuario tras el deploy.

**Desplegado al homelab el mismo día** (`jarvis/`+`project/` resincronizados, imagen
reconstruida, 3 contenedores recreados): `RestartCount=0` en los 3, logs del `bot` sin
errores de import (los 2 reintentos de healthcheck al arrancar son la carrera normal entre
`backend`/`bot` ya documentada, se resuelve sola). La propuesta que ya estaba pusheada como
texto plano antes de este deploy sigue como texto plano (no retroactivo); las 2 que quedaban
en cola van a salir con los botones nuevos la próxima vez que `push_next_audit_batch()`
corra. Pendiente real: probar el flujo de clics con el usuario en un chat de Telegram real.

## PRIMERA PROPUESTA REAL del triage de Inbox — umbral bajado a pedido del usuario (2026-09-21)

El usuario preguntó si el triage automático del Inbox (`jarvis/ingestion/inbox_triage.py`,
implementado 15/09) ya le había recomendado algo — nunca lo había hecho: verificado contra
`jarvis.db` real del homelab, 0 propuestas `triage_move` desde que existe, última corrida
17/09. Causa real (no un bug): las únicas notas reales con contenido suficiente (los 6
archivos `idea_*`/`Idea_05_...`/`Ideas para hacer un Portafolio.md`, 13k-50k caracteres)
tenían 6.3 días de antigüedad — muy por debajo del umbral conservador original de 21 días.

**Pedido explícito del usuario**: bajar el umbral y probarlo ya. `JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS`
pasó de `21` a **`6`** en `jarvis/config.py` (nota: 7 no alcanzaba — el código trunca a
entero con `int()`, así que 6.32 días reales truncaban a `6`, por debajo de un umbral de 7;
confirmado con el usuario antes de aplicar el cambio). Desplegado (sync + rebuild + restart,
mismo proceso de siempre).

**Corrida forzada contra datos reales** (bypaseando el gate semanal de
`should_run_inbox_triage()` — última corrida real había sido hace solo 4 días, menos que el
intervalo de 7; se llamó a `_select_candidates()`/`_process_candidate()` directo, sin tocar
código, vía `docker exec` en el contenedor `worker`, mismo patrón que otras corridas
forzadas de esta bitácora): **4 candidatas reales encontradas** (tope de
`JARVIS_INBOX_TRIAGE_LIMIT`, quedaron 2 más sin procesar para la próxima corrida),
clasificadas las 4 a `03 - Recursos/Carrera Profesional` por el LLM de razonamiento — primera
vez que el triage produce una recomendación real, no sintética. **1 de las 4 propuestas ya
se empujó de verdad a Telegram** (`pushed_at` seteado); las otras 3 quedaron en cola
(`pushed_at IS NULL`, throttle `JARVIS_AUDIT_PUSH_BATCH_SIZE=1` de siempre) — van a llegar de
a una a medida que el usuario resuelva la anterior. Ninguna nota se movió todavía en disco
(`triage_move` solo mueve el archivo si el usuario acepta la propuesta por Telegram).

**Pendiente real, anotado explícitamente en el comentario de `config.py`**: el umbral de 6
días es una excepción para esta prueba, no la recomendación de la propuesta original
(21-30 días). Evaluar si conviene volver a subirlo una vez que el usuario haya visto el
triage funcionar de verdad — decisión pendiente, no tomada unilateralmente.

## CAMBIO: la consolidación de memoria pasa de diaria a semanal (2026-09-21)

Pedido explícito del usuario. `run_consolidation()` (`jarvis/worker/consolidation.py`) —
el job completo (pares similares, stale por edad, backfill de tags, auditoría proactiva,
ingestión/síntesis de Agenda, triage de Inbox, pregunta abierta) — corría gateado a 24h
(`_RUN_INTERVAL = timedelta(hours=24)`, hardcodeado). Ahora es configurable:
`JARVIS_CONSOLIDATION_INTERVAL_DAYS` nuevo en `jarvis/config.py` (default `7`, mismo patrón
ya usado por `JARVIS_AGENDA_PATTERN_SYNTH_INTERVAL_DAYS`/`JARVIS_INBOX_TRIAGE_INTERVAL_DAYS`).

De paso se corrigieron las menciones a "diaria" en comentarios/docstrings/logs que quedaban
desactualizadas (`jarvis/worker/main.py`, `jarvis/captures/passive.py`,
`jarvis/ingestion/agenda_patterns.py`, `jarvis/notify/telegram.py`) y, más importante, el
**título del reporte de Telegram** (`_notify_run_report()`, antes "📊 Consolidación diaria —
...", ahora "📊 Consolidación — ...") — ese título es user-facing, dejarlo diciendo "diaria"
hubiera sido confuso con la nueva cadencia semanal.

No se tocó el auto-gating interno ya semanal de `agenda_patterns.py`/`inbox_triage.py` (esos
ya corrían cada 7 días por su cuenta, independiente del job completo) — ahora que el job
completo también es semanal, ambos gates pueden desalinearse en días distintos de la semana
sin que importe, mismo comportamiento que ya toleraban antes.

Verificado: `python -m py_compile` limpio en los 6 archivos tocados; `_RUN_INTERVAL` resuelve
a `7 days, 0:00:00` corrido contra el venv real; `should_run()` probado con timestamps
sintéticos de 3 días (False) y 8 días (True) desde la última corrida.

Archivos tocados: `jarvis/config.py`, `jarvis/worker/consolidation.py`,
`jarvis/worker/main.py`, `jarvis/captures/passive.py`, `jarvis/ingestion/agenda_patterns.py`,
`jarvis/notify/telegram.py`.

**Desplegado al homelab el mismo día**: `jarvis/` re-sincronizado completo (`tar`), imagen
`sgr-app:latest` reconstruida y los 3 contenedores recreados. Verificado: `RestartCount=0`
en los 3, logs del `worker` sin errores ("Loop activo. Poll cada 5s."). El próximo reporte
de consolidación en Telegram debería salir con el título nuevo ("📊 Consolidación — ...", sin
"diaria") y no repetirse hasta pasados 7 días desde la última corrida real.

## DEPLOY completo al homelab: todo lo de esta sesión ya está en vivo (2026-09-21)

Cierra el pendiente que había quedado a mitad de camino: el primer intento de deploy de
esta sesión (sync de `project/`+`jarvis/` vía `tar`) había copiado los archivos al
filesystem del gabinete, pero el `docker build && docker-compose up -d --no-build` final
nunca se confirmó corrido — los 3 contenedores siguieron sirviendo la imagen `sgr-app:latest`
armada el **19/09 a las 19:38**, sin ninguno de los cambios de esta sesión (ni el primer
build de Horario Facultad/canvas, ni mucho menos la auditoría de Bóveda posterior).

Antes de repetir el deploy se detectó y corrigió un problema adicional: el `dist/`
commiteado en `45f87ee` (19/09) nunca se había vuelto a buildear tras los 3 fixes de
`BovedaWorkspace.jsx`/`BrowseScreen.jsx`/`app/main.py` de esta sesión (`95d2008`, `7eff0c8`)
— un deploy directo hubiera llevado el frontend viejo, sin esos fixes. Se corrió
`npm run build` de nuevo y se commiteó (`2bebfa5`) antes de sincronizar.

**Deploy real ejecutado y verificado** (esta vez de punta a punta, sin pasos a medias):
`tar` de `project/` (excluyendo `venv`/`node_modules`/`database`/`uploads`) y de `jarvis/`
sincronizados al gabinete; `docker build --network=host -t sgr-app:latest -f Dockerfile ..`
corrido con éxito (usó cache donde correspondía, reconstruyó las capas de `app`/`mybot`/
`frontend/dist`); `docker-compose up -d --no-build` recreó los 3 contenedores. Verificado
después, no solo asumido: `docker inspect` → `RestartCount=0` en los 3; `curl` externo a
`http://192.168.137.10:8765/` devuelve el HTML con `index-BlFgTcAj.js` — el hash exacto del
build nuevo (722.262 bytes, coincide con el `npm run build` de esta sesión). Logs de
`backend` sin errores nuevos (los 2 warnings ya conocidos de `Error leyendo frontmatter` y
`UNIQUE constraint failed: hojas.ruta` para Robert Kiyosaki siguen apareciendo — mismo
hallazgo sin investigar documentado arriba, no relacionado a este deploy).

**Estado real desde ahora**: el homelab (vía Tailscale, `http://100.117.86.117:8765`, o LAN
`http://192.168.137.10:8765`) sirve el mismo código que `origin/master` HEAD (`2bebfa5`) —
Horario Facultad, canvas de listas de Tareas, rediseño de Bóveda con los 2 fixes, y el fix
del 500 en `POST /hojas`, todo en vivo.

## FIX: `POST /hojas` devolvía 500 genérico con categoría sin ruta sincronizada al vault + hallazgo de procesos duplicados en :8765 local (2026-09-21)

Cierra el bug reportado en la entrada de auditoría de arriba (mismo día). `app/main.py`
(`crear_hoja_endpoint`, ~línea 582) ahora envuelve la llamada a `crear_hoja()` en
`try/except ValueError`, traduciendo el error a `400` con el mensaje real
("categoria_id N sin carpeta sincronizada en el vault") en vez de un 500 plano sin
contexto — mismo patrón ya usado en otros endpoints de `main.py` (`except ValueError as
exc: raise HTTPException(...)`, ver `actualizar_fin_instrumento` como ejemplo).

**Verificado con reproducción real, no solo por lectura de código**: insertada una
categoría de prueba (`ruta=NULL`) directo en `database/app.db` (bypaseando
`crear_categoria()` a propósito para no tocar `D:\Boveda`), `POST /hojas` contra ella dio
`400` con el mensaje esperado (antes daba 500 plano), sin crear ninguna hoja huérfana.
Categoría de prueba borrada después. `python -m py_compile app/main.py` limpio.

**Hallazgo real durante la verificación, no anticipado**: el intento de reproducir el bug
inicialmente dio un resultado inesperado (200 en vez de 400) — investigado, la causa fue
que el puerto **8765 local tenía DOS procesos uvicorn corriendo en paralelo** desde hacía
varias sesiones: uno del venv del proyecto (huérfano, no escuchaba realmente) y otro con el
**Python global de Windows** (no el venv), **sin `--reload`**, que era el que de verdad
atendía las requests — nunca había recargado ningún cambio de código de esta sesión
(incluidos los commits `45f87ee` y `95d2008` de más arriba). Esto también explica, con más
certeza, la discrepancia de `app.db` que la auditoría anterior había marcado como "esperada
sin investigar más": puede que ese proceso stale estuviera sirviendo contra un `app.db`
distinto (sandbox de otra sesión), no necesariamente el real. Se mataron ambos procesos
duplicados y se levantó uno limpio (venv, `--reload`) antes de verificar el fix.
**Recomendación para la próxima sesión que use el entorno local**: antes de asumir "esto no
refleja mi código actual", correr `Get-CimInstance Win32_Process -Filter "name='python.exe'"`
y confirmar que no hay procesos duplicados en el mismo puerto — mismo tipo de problema ya
documentado en `HOMELAB.md` para el bot de Telegram, ahora confirmado también para el
backend local.

Archivo tocado: `project/app/main.py`. Sin desplegar al homelab todavía (bug no reportado
ahí, solo detectado en el entorno local).

## AUDITORÍA + FIX: 3 commits frontend sin documentar (Bóveda/Agenda/Jarvis) + 2 bugs reales encontrados en vivo (2026-09-20/21)

Entre el deploy del 19/09 y esta sesión aparecieron 3 commits en `master` sin pasar por el
proceso de documentación del orquestador (autoría "Mateo-PC", 20/09, de otra sesión no
registrada en este archivo): `0d7e716` (rediseño de Bóveda — `BovedaWorkspace.jsx` nuevo,
`RightPanel.jsx` perdió 676 líneas), `3dcf777` (Agenda: tab por defecto pasa de `hoy` a
`mes`), `5c53ba1` (bienvenida contextual real de Jarvis en `JarvisChat.jsx`).

Auditoría en dos pasadas (fork/worker): (1) revisión de código + `npm run build` — sin
bugs de wiring, solo 2 hallazgos menores sospechados; (2) recorrido real en Chrome contra
`npm run dev` local + backend local, que **confirmó ambos hallazgos como reales**:

1. **`selectedHojaId` sin usar en `BovedaWorkspace.jsx`** — la nota seleccionada no se
   resaltaba visualmente en las vistas Lista/Explorador (sí en `RightPanel`). Fix: `HojaRow`
   acepta `active` y aplica el mismo estilo de borde/fondo que `RightPanel`
   (`BovedaWorkspace.jsx` líneas ~38-58, ~168, ~188).
2. **Menú contextual ausente en la vista central de Bóveda** — clic derecho sobre una nota
   en "Lista"/"Explorador" no abría nada; borrar/editar solo era posible expandiendo el
   árbol correcto en `LeftPanel`. Fix: mismo patrón ya usado en `LeftPanel.jsx`
   (`AgendaContextMenu` + `EditHojaModal` + `DeleteHojaModal`) replicado en
   `BovedaWorkspace.jsx`; `BrowseScreen.jsx` gana `onHojaDeleted` para limpiar la selección
   de `RightPanel` si se borra la hoja abierta desde la vista nueva.

Verificado por el orquestador (no solo por el reporte del worker): diff real de los 3
archivos tocados coincide con lo descrito, los 3 componentes importados
(`EditHojaModal`/`DeleteHojaModal`/`AgendaContextMenu`) existen en el árbol, `npm run build`
post-fix compila limpio (mismo warning preexistente de chunk >500kB, sin cambios
significativos de tamaño). `dist/` restaurado a su estado commiteado tras la verificación
(no se quiso dejar como diff de ruido).

De paso se corrigió `CLAUDE.md` (Agenda: tab por defecto documentado como `mes`, no `hoy`
— quedó desactualizado desde `3dcf777`).

**Cerrado (2026-09-21, mismo día, sesión del orquestador)**: confirmación visual en vivo de
los 2 fixes, contra `npm run dev` local + backend local reiniciado limpio (ver entrada de
abajo sobre los procesos duplicados). Clic en una nota del panel derecho ("Markmap") resaltó
correctamente la misma fila en la vista Lista central (borde/fondo igual al del panel
derecho). Clic derecho sobre otra nota ("Obsidian") en la vista Lista abrió el menú
contextual con "Editar Hoja"/"Eliminar Hoja". Sin errores de consola, 30 requests a la API
revisadas, todas 200. (Nota: la extensión Claude in Chrome tenía 2 navegadores conectados;
"Browser 2" no podía cargar ninguna página incluida example.com — se cambió a "Browser 1",
que sí funcionó. Si esto se repite, revisar qué perfil de Chrome está realmente conectado
antes de asumir que SGR está roto.)

**Hallazgo nuevo, no arreglado, fuera del alcance de los 3 commits auditados (bug
preexistente, no introducido por ellos)**: `POST /hojas` devuelve 500/503 genérico si la
categoría elegida no tiene ruta sincronizada al vault (`app/db/crud.py` ~línea 280-284
lanza `ValueError` sin capturar; FastAPI lo convierte en "Internal Server Error" plano sin
mensaje útil). Reproducido en vivo con la categoría "General" del entorno local. Sin fix
aplicado — queda para decidir si amerita sesión aparte (traducir a un 400 con mensaje claro
en `app/main.py` donde se llama `crear_hoja()`).

**Aclarado, no es un problema**: el backend local (`:8765`, corriendo desde el 19/09) usa un
`app.db` con conteos/categorías distintos al `project/database/app.db` real en disco —
confirmado con el usuario que es esperado (entorno local con datos de prueba inventados; el
dato real vive en el homelab vía Tailscale). No es pérdida de datos.

Sin commitear al momento de escribir esta entrada — queda a cargo del orquestador.

## CONFIRMADO: usuario verificó visualmente Horario Facultad + canvas de listas de Tareas (2026-09-19)

Cierra el pendiente principal del handoff `GENERAL_HANDOFF_2026-09-19.md`: ninguna de las dos
sesiones que implementaron estos features (Horario Facultad, commits `f9d6277`/`e597154`; canvas
de listas de Tareas, commits `97b2a7f`/`e597154`) había podido verificar en navegador real (Chrome
deshabilitado en ambas). El usuario confirmó en esta sesión, tras abrir el frontend local
(`npm run dev`, :5173) él mismo, que "ambos cambios surtieron efecto" — sin reportar bugs
visuales ni de layout. Ya no es un pendiente abierto.

## HALLAZGO sin investigar: `UNIQUE constraint failed: hojas.ruta` para la ficha de Robert Kiyosaki reaparece (2026-09-19)

Al levantar el backend local (`uvicorn`, puerto 8765) para esta sesión, el log de arranque de
`sincronizar_vault()` mostró:

```
D:\Boveda\Jarvis\Entidades\9cb0f129-robert-kiyosaki.md: no se pudo upsertear
(ruta=Jarvis/Entidades/9cb0f129-robert-kiyosaki.md, vault_id=940f431a-f36f-4e7a-b182-7eb1c6af97ec)
-- UNIQUE constraint failed: hojas.ruta -- se ignora esta nota
```

Esto es exactamente el síntoma que el fix de `index_writer.py`/`sincronizar_vault()` del 19/09
(commit `79787a3`) apuntaba a resolver, y que el handoff del mismo día marcó explícitamente como
"probablemente resuelto... pero no se re-verificó explícitamente que el mensaje dejó de aparecer".
**No se investigó la causa en esta sesión** — no está confirmado si es (a) una colisión nueva real
(el fix no cubre este caso), o (b) una fila huérfana que ya quedó mal en el `app.db` LOCAL desde
antes del fix y nunca se limpió (el fix corrige la generación de `id:` hacia adelante, no
necesariamente filas ya duplicadas). No se tocó el `app.db` local ni el del homelab. Pendiente:
diagnosticar antes de dar por cerrado el fix de Bóveda vacía del 19/09.

## FIX: deploy gap real (`jarvis/worker/consolidation.py` 2 días desactualizado en el homelab) + mensaje ambiguo al confirmar propuestas (2026-09-17)

Pedido del usuario tras recibir un reporte diario real de **37 mensajes de Telegram** (pegado a
mano en `Consolidacion.txt`, ver ese archivo si sigue existiendo) y ver que responder "sí" horas
después a una propuesta pendiente ("Robert Kiyosaki (2 menciones) — propuesta creada, esperando
confirmación") mostró `"✅ Guardado — procesando… ID: e8ade661"` como si fuera contenido nuevo.

**Diagnóstico 1 (el real) — no era un bug de código, era un deploy nunca terminado.** El commit
`575179c` (2026-09-16, ver entrada de abajo "Fix: reporte diario...") ya arregla exactamente esto
-- `_section_pairwise()` reduce los pares `different` a un conteo en vez de listarlos uno por
uno. Confirmado con `docker exec project-worker-1 python3 -c "...inspect.getsource(...)"` que el
contenedor real del homelab corría la versión **vieja** (sin el filtro). Hash-diff completo
(sha256) de los ~100 archivos versionados de `jarvis/`+`project/app/`+`project/mybot/` entre el
repo local y el homelab: **solo 5 diferían** -- 4 eran ruido CRLF/LF sin diferencia de contenido
real (confirmado con `diff --strip-trailing-cr`), y el quinto (`jarvis/worker/consolidation.py`)
tenía fecha de archivo **15/09 21:37** en el homelab, dos días antes del fix. Causa: una sesión
anterior desplegó otros fixes de Jarvis del mismo período (`c2d959f`/`c8072cc`, confirmado por
mtime `17/09 10:15` en varios archivos) con `scp` de archivos puntuales en vez del sync completo
de `jarvis/` documentado en `HOMELAB.md` -- y se les pasó este archivo.

**Diagnóstico 2 — el "sí" no era un bug, el mensaje sí.** Rastreado end-to-end: `e8ade661` es
exactamente la entrada sintetizada al aceptar la propuesta `create` de la entidad Robert Kiyosaki
(`status: ACCEPTED`, `authorship: jarvis_synthesis`, `source_id` trazable a la propuesta) --
comportamiento correcto y esperado (aceptar un `create` siempre sintetiza una entrada nueva). El
problema es que `project/mybot/jarvis_handlers.py` usaba el mismo texto genérico
`"✅ Guardado — procesando…"` tanto para capturar contenido nuevo como para confirmar una
propuesta ya existente -- indistinguibles para el usuario.

**Fix aplicado** (sesión de implementación, fork, revisado por el orquestador antes de
commitear -- commit `e8f1e14`): `_resolve_passive_proposal()` (línea ~327) y
`_resolve_individual_audit_proposal()` (línea ~419) ahora dicen `"✅ Propuesta confirmada..."` en
vez de `"✅ Guardado..."`. Las rutas de captura genuina (`_do_capture()` línea ~111,
clarificación-con-razón línea ~223) no se tocaron -- ya decían algo distinto y correcto.
Verificado con `python -m py_compile`; sin suite de tests automatizados para `mybot/` (confirmado,
no asumido).

**Deploy real, no solo commit**: re-sincronizado `jarvis/` completo (71 archivos, `tar | ssh`, no
un parche de un archivo) al homelab, rebuild + restart de los 3 contenedores; hash-diff final
tras el sync: **0 diferencias**. `jarvis_handlers.py` desplegado también (scp puntual +
`docker-compose restart bot`, sin rebuild -- `./mybot` es bind-mount de solo lectura). Los 3
contenedores confirmados sanos post-restart (logs sin errores nuevos, bot con polling de Telegram
activo).

**Decisión de coordinación para el futuro** (no arquitectónica, anotada para no repetir el
error): al desplegar cualquier fix que toque `jarvis/`, usar siempre el sync completo por `tar`
documentado en `HOMELAB.md` ("Actualizar código en el servidor"), nunca `scp` de archivos
sueltos -- así fue exactamente como este archivo quedó 2 días atrás sin que nadie lo notara,
hasta que produjo un reporte real de 37 mensajes.

**Hallazgo nuevo, no investigado, fuera de alcance**: al reiniciar el `backend` para este deploy
apareció en el log `[semantic] backfill omitido: UNIQUE constraint failed: hojas.ruta` -- no
estaba en logs de sesiones anteriores de hoy, no se investigó (fuera del alcance de esta tarea).

## FIX: auditoría + corrección de la conexión frontend↔backend↔DB de `/jarvis` (2026-09-17)

Pedido del usuario tras reportar "la última vez que entré [a /jarvis] estaba todo en cero, no
había entidades, tags, nada". Dos sesiones: una auditoría de solo lectura (fork) seguida de una
de implementación (fork), ambas revisadas por el orquestador antes de commitear.

**Hallazgo central (auditoría)**: las ~15 funciones `fetchJarvis*`/`switchJarvisChat` de
`project/frontend/src/store/useStore.js` tenían `catch { /* noop */ }` sin ningún log -- un error
real de backend (500, columna faltante, CORS, lo que sea) era visualmente indistinguible de
"memoria vacía". Confirmado con datos reales sembrados en sandbox aislado (`:8767`) que el resto
del wiring (endpoints, shape de JSON, mount→fetch→render en `JarvisScreen.jsx`/
`JarvisBrowsePanel.jsx`) está bien conectado -- no era un bug de lógica, era la ausencia de
diagnóstico lo que hacía indistinguibles los dos casos.

**Causa concreta que explica el síntoma reportado**: a la `jarvis.db` LOCAL le faltaba la columna
`pushed_at` que el código de throttle (implementado esta misma sesión, ver entradas de arriba/
abajo del mismo día) ya daba por hecha en varias queries -- rompía `/jarvis/proposals` y
`/jarvis/audit-proposals` con 500, invisibles por el bug de arriba. La migración
(`_add_column_if_missing`, `jarvis/db/database.py`) ya existía y es correcta, solo nunca había
corrido porque ningún proceso de Jarvis se reinició desde que se escribió ese código -- se
autocorrigió al arrancar el backend real una vez.

**Fix aplicado** (revisado diff real por el orquestador antes de commitear, commit `ab0a902`):
mismo patrón `if (DEBUG) console.error('nombreFunción:', e)` que ya usa el resto de
`useStore.js` (Bóveda/Finanzas), aplicado a los 15 catch silenciosos -- sin cambios de lógica ni
UI nueva, solo diagnóstico. Verificado con `npm run build` limpio (1900 módulos, sin errores).

**Limpieza de datos aplicada sobre `jarvis.db` LOCAL real** (backup previo en
`project/database/backups/pre-limpieza-inbox-queue-20260917-121700/`): 18 filas huérfanas de
`inbox_queue` (referenciaban las 22 `memory_entries` de prueba borradas más temprano en esta
misma sesión, ver entrada de abajo) -- confirmado por query que las 18 eran 100% huérfanas antes
de borrar, `PRAGMA integrity_check` → `ok`. `pushed_at` confirmado presente en
`jarvis_audit_proposals`/`jarvis_capture_proposals` post-migración; `curl` real a
`/jarvis/proposals` y `/jarvis/audit-proposals` → `200` con JSON válido (antes hubieran dado 500).

**Hallazgo nuevo, no anticipado, fuera de alcance -- pendiente**: al arrancar el backend real para
la migración, el log mostró un error preexistente al parsear el frontmatter YAML de una nota real
de `D:\Boveda` (título con una URL sin comillas conteniendo `:` -- rompe el parseo YAML). No tumba
el proceso (el parser degrada esa nota puntual), pero vale la pena que alguien la revise/corrija
el archivo a mano en algún momento. No se tocó en esta sesión.

## LIMPIEZA: borradas las entradas sintéticas de prueba de la `jarvis.db` LOCAL (2026-09-17)

Cierra el pendiente que había quedado anotado en `Cerebro/Orquestrador/handoffs/GENERAL_HANDOFF_2026-09-17.md`
tras el fix del `.exe` sin memoria (ver entrada de abajo, 2026-09-16): el contenido de
`project/database/jarvis.db` **local** (no la del homelab) resultó ser, en su totalidad, data
sintética sembrada en agosto 2026 para probar el motor de consolidación (pares diseñados para
disparar `same_fact`/`contradiction`: "vivo en Madrid" / "me mudé a Buenos Aires", "100% remoto" /
"100% presencial", un compañero ficticio "Martín Suárez", un proyecto ficticio "Quetzalcoatl-7",
etc.) — nada de memoria real del usuario. El handoff decía "6 entradas de prueba + 2 proyectos
huérfanos"; releyendo la DB real el conteo correcto era **22 `memory_entries`** (no 6 — el handoff
quedó desactualizado) **+ 2 `memory_projects`** ("Jarvis", "Homelab", ambos `created_by=
'jarvis_proposal_accepted'`, generados automáticamente a partir de las entradas de prueba).

El borrado había quedado bloqueado en la sesión anterior por el clasificador de permisos de Bash
de Claude Code (rechazaba el `DELETE` como "irreversible local destruction" pese a confirmación
explícita del usuario en el chat) — se resolvió con confirmación explícita nueva del usuario en
esta sesión, sin necesidad de tocar la configuración de permisos.

**Verificado antes de borrar** (no se confió en el conteo del handoff): schema completo de las 6
tablas involucradas (`memory_entries`, `memory_projects`, `memory_entry_projects`,
`memory_entry_tags`, `memory_entry_entities`, `memory_entities`, `memory_tags`) leído directamente
de `sqlite_master`; confirmado que `PRAGMA foreign_keys` está OFF por conexión (no cascadea solo,
hay que borrar hijos antes que padres a mano); confirmado que `memory_entries_fts` tiene triggers
(`trg_me_fts_delete`) que la sincronizan sola al borrar de `memory_entries` (no hizo falta tocarla
a mano); confirmado por lectura de `jarvis/retriever/retriever.py` (`_load_entries()`) que dejar
huérfanos los 22 vectores ya embebidos en ChromaDB no rompe ni filtra contenido borrado -- el
retriever los descarta solo si no encuentra la fila en SQLite, así que no hizo falta tocar
`database/chroma/` (queda como peso muerto cosmético, no antojado de limpiar).

**Borrado ejecutado** (Python + `sqlite3`, sin CLI `sqlite3` disponible en el PATH): orden
hijos→padres -- `memory_entry_projects` (9 filas) → `memory_entry_tags` (50) →
`memory_entry_entities` (5) → `memory_entries` (22) → `memory_projects` (2). Con las 22 entradas
ya afuera, las 3 entidades (`Martín Suárez`, `Jarvis`, `SQLite`) y las 19 tags quedaron con 0
referencias -- se borraron también a pedido explícito del usuario, en un segundo paso separado
(`DELETE ... WHERE id NOT IN (SELECT ... FROM tabla_junction)`). `PRAGMA integrity_check` → `ok`
después de cada paso. Estado final: `memory_entries`, `memory_projects`, `memory_entities`,
`memory_tags` en **0 filas** -- `jarvis.db` local queda sin ningún dato sintético ni real (limpia,
lista para acumular memoria real del usuario desde cero).

Backup previo (ya existía de la sesión anterior, confirmado íntegro antes de borrar por tamaño
idéntico al `jarvis.db` real): `project/database/backups/pre-limpieza-test-projects-20260916-150059/`
(`jarvis.db` + `chroma/`). No se tocó el `jarvis.db` del homelab (nunca tuvo esta data de prueba --
la migración de agosto fue directo a local).

**No commiteado a git** -- `jarvis.db` está gitignoreado (mismo criterio que `app.db`, ver
`Cerebro/decisiones-implementacion.md`), el cambio no deja rastro en `git status`. Solo esta
entrada de documentación se commitea.

## FIX: desambiguación de respuesta libre cuando hay 2+ propuestas individuales pendientes a la vez (audit y capture) (2026-09-17)

Cierra un bug latente que dejaron las dos entradas de throttle de abajo (mismo día): con
`JARVIS_AUDIT_PUSH_BATCH_SIZE`/`JARVIS_CAPTURE_PUSH_BATCH_SIZE` en su default (1) nunca importaba,
pero subir cualquiera de los dos a 2+ (documentado ahí como "sin tocar código") podía dejar 2+
propuestas individuales `PENDING`+pushed para el mismo chat a la vez, y el código que interpreta
una respuesta de texto libre no sabía a cuál de las dos se refería -- aplicaba ciegamente a la
más VIEJA en auditoría (`get_pending_individual_proposal_for_channel()`, FIFO) y a la más
RECIENTE en captura (`get_pending_proposal_for_channel()`, asimetría real sin razón documentada,
confirmada leyendo ambas funciones). Se adaptó el patrón que el propio código ya usaba para el
caso agrupado (`flag_contradiction`/`flag_connection`: listar numeradas, pedir que conteste con
el número) al caso individual: `list_pending_individual_proposals_for_channel()` (audit) /
`list_pending_proposals_for_channel()` (capture, ahora ASC -- unifica la asimetría con audit) +
`build_individual_disambiguation_message()` / `build_disambiguation_message()` arman el mensaje
numerado; `project/mybot/jarvis_handlers.py::_parse_leading_number()` (nueva, compartida) exige
que la respuesta ante 2+ pendientes empiece con el número ("2 sí", "1: no") -- si no lo trae, se
manda el mensaje de desambiguación y NO se resuelve nada, nunca se adivina. `push_next_audit_
batch()`/`push_next_capture_batch()` numeran cada mensaje `"N/M: "` cuando el lote empujado trae
más de 1. Con batch size 1 (el default, sin cambios) el comportamiento es exactamente el de
siempre -- el caso simple no gana fricción nueva. Verificado con un script de scratch que fuerza
ambos batch size a 2 y llama a los handlers REALES del bot (no solo la capa de servicio): 35
asserts OK, incluida la confirmación de que una respuesta ambigua ya NO resuelve ninguna de las
2 pendientes (antes se hubiera aplicado a la equivocada) y que el número correcto resuelve la
propuesta correcta. Detalle completo en `Cerebro/decisiones-implementacion.md`, entrada
"2026-09-17 — Desambiguación de respuesta libre cuando hay 2+ propuestas individuales pendientes
(audit y capture)". Archivos tocados: `jarvis/audit/service.py`, `jarvis/captures/passive.py`,
`project/mybot/jarvis_handlers.py`. Sin commitear -- queda a cargo del orquestador de la sesión.

## IMPLEMENTADO: throttle de propuestas de captura (`jarvis_capture_proposals`) -- mismo patrón que auditoría, aplicado a la tabla hermana (2026-09-17)

Mismo día, mismo patrón que la entrada de abajo (auditoría), pero acá está el
bug real ya medido en producción: 21 propuestas de Agenda dieron 20 EXPIRED +
1 REJECTED + 0 ACCEPTED -- ninguna se resolvió a tiempo, porque el push a
Telegram era inmediato y sin límite desde tres call sites (`jarvis/captures/
passive.py::_review_conversation()`, `jarvis/ingestion/agenda.py`, `jarvis/
ingestion/agenda_patterns.py`). Ahora se encola (`jarvis_capture_proposals.
pushed_at` nuevo, `NULL` = en cola) y sale de a `JARVIS_CAPTURE_PUSH_BATCH_SIZE`
(default 1) por vez vía `push_next_capture_batch()` (jarvis/captures/
passive.py), disparado en cada tick ocioso del worker + al final de las tres
corridas que escriben en esta tabla (`scan_and_propose()`, `run_agenda_
ingestion()`, `run_agenda_pattern_synthesis()`). Sin distinción por
`origin_source` -- passive_capture, agenda_ingestion y los patrones de
`agenda_patterns.py` van a la misma cola. Expiración de 30 min ahora cuenta
desde `pushed_at`, no `created_at`. `_already_proposed()` de agenda.py
(dedup sin mirar status) no se tocó a propósito -- las 20 EXPIRED reales
siguen sin re-proponerse solas. Detalle completo, decisiones y verificación
(2 scripts de scratch, 16 casos entre ambos, todos OK) en `Cerebro/
decisiones-implementacion.md`, entrada `2026-09-17` (la de arriba, "Throttle
de propuestas de captura"). Archivos tocados: `jarvis/db/schema.py`,
`jarvis/db/database.py`, `jarvis/config.py`, `jarvis/captures/passive.py`,
`jarvis/ingestion/agenda.py`, `jarvis/ingestion/agenda_patterns.py`,
`jarvis/worker/main.py`. Sin commitear -- queda a cargo del orquestador de la
sesión.

## IMPLEMENTADO: throttle de propuestas de auditoría (evitar ráfagas de Telegram) (2026-09-17)

Propuestas individuales de auditoría (`create`/`clarify`/`merge`/`edit`/`delete`/`retag`/
`archive_superseded`/`triage_move`) ya no se mandan todas de golpe por Telegram -- se
encolan (`jarvis_audit_proposals.pushed_at` nuevo, `NULL` = en cola) y salen de a
`JARVIS_AUDIT_PUSH_BATCH_SIZE` (default 1, env-configurable) por vez, solo cuando no queda
ninguna sin resolver para ese chat (`push_next_audit_batch()`, disparado en cada tick
ocioso del worker + al final de `run_audit()`). La expiración de 24h ahora cuenta desde
`pushed_at`, no `created_at` -- una propuesta nunca entregada no puede vencer. De paso se
sacó el push directo duplicado que tenía `inbox_triage.py::_process_candidate()` para
`triage_move`. Detalle completo, decisiones y verificación (2 scripts de scratch, 5 casos
+ 1 caso de migración/backfill, todos OK) en `Cerebro/decisiones-implementacion.md`,
entrada `2026-09-17`. Archivos tocados: `jarvis/db/schema.py`, `jarvis/db/database.py`,
`jarvis/config.py`, `jarvis/audit/service.py`, `jarvis/worker/main.py`, `jarvis/ingestion/
inbox_triage.py`. Sin commitear -- queda a cargo del orquestador de la sesión.

## FIX: chat de Jarvis en el `.exe` nunca tuvo memoria real — dos bugs de empaquetado (2026-09-16)

Reportado por el usuario como "el chat de SGR no tiene contexto" / "¿qué sabés de mí?" →
"no sé mucho de vos". Dos bugs de packaging superpuestos, ambos exclusivos del `.exe`
(Docker/homelab no los tiene, ahí no hay PyInstaller de por medio):

1. `jarvis/config.py` calculaba `_BASE` con `Path(__file__).parent.parent`, que dentro del
   bundle de PyInstaller (onedir) resuelve a `dist/SGR/_internal/`, no al repo real. El `.exe`
   creaba en silencio `jarvis.db` y `Boveda/` fantasma, vacías, dentro del bundle —
   completamente desconectadas de los datos reales. Mismo problema que `app/paths.py` ya
   resuelve para `app.db`; se replicó ese criterio. Panel "Tipos de memoria" pasó de `{}` a
   los conteos reales. Commit `3ae9882`.
2. Con los datos reales ya accesibles, el chat seguía sin memoria: `retrieve()`
   (`jarvis/retriever/retriever.py`) fallaba en cada llamada con `No module named
   'chromadb.api.rust'` (confirmado con log de debug) y degradaba en silencio al fallback de
   keywords en SQLite — que no matchea nada para preguntas genéricas. Causa: chromadb importa
   submódulos propios de forma dinámica (`chromadb.api.rust`, `chromadb.telemetry.product.
   posthog`) que el análisis estático de PyInstaller no sigue, más `chromadb_rust_bindings`
   (bindings Rust del cliente, un `.pyd` compilado) como paquete aparte no detectado. Se agregó
   `collect_submodules("chromadb")` + `"chromadb_rust_bindings"` a `hiddenimports` en
   `project/sgr.spec`. Commit `44399e9`.

Verificado end-to-end con el `.exe` recompilado: una pregunta genérica ("qué sabés de mí")
pasó de `context_count: 0` / "no tengo memoria" a `context_count: 5` con una respuesta real
basada en las entradas de `jarvis.db`. **Nota**: el contenido real de `project/database/
jarvis.db` local (no el del homelab) resultó ser, en su totalidad, data sintética de pruebas
de cuando se construyó Jarvis (agosto 2026) — no memoria real del usuario. Pendiente:
borrar esas entradas de prueba y los 2 proyectos ("Jarvis", "Homelab") que generaron, con
confirmación explícita del usuario (bloqueado una vez por el clasificador de auto-mode al
tratarse de un borrado irreversible; ya hay backup en `project/database/backups/
pre-limpieza-test-projects-<timestamp>/`).

## FIX: `/categorias` y `/hojas` devolvían 500 en cada request — Bóveda "sin notas" (2026-09-16)

El usuario reportó "¿está bien que en la Bóveda no vea notas?". No era normal: dos bugs
superpuestos en la sincronización en vivo (`project/app/vault/sync.py`,
`sincronizar_vault()`, llamada en cada `GET /categorias`/`GET /hojas`) hacían que el
endpoint crasheara siempre con 500, apenas después de crear el repo git privado de
`D:\Boveda` (ver entrada `2026-09-16` de `decisiones-implementacion.md` si existe, o el commit
`e5698d6`):

1. `.git/` nunca se excluyó del escaneo del vault — sus subcarpetas internas
   (`.git/objects/xx`) se indexaban como categorías reales: 127 de 153 filas de
   `categorias` en la homelab eran basura de git.
2. Causa raíz real: el re-scan generaba `ruta` con `str(rel)` (separador nativo del SO,
   `\` en Windows), pero la columna ya estaba poblada con `/` desde Milestone 1. Ninguna
   categoría anidada volvía a matchear contra las rutas existentes en ningún sync
   posterior → todo el árbol PARA real quedaba marcado "borrado del disco" → el DELETE
   fallaba con `FOREIGN KEY constraint failed` en cuanto una hoja todavía la referenciaba
   (que siempre pasaba con contenido real). Confirmado en vivo con un print de debug
   temporal antes de arreglarlo — no se asumió, se verificó contra la DB real.

Fix: `rel.as_posix()` en vez de `str(rel)` en `sync.py` (categorías y notas), mismo
patrón corregido en `crud.py` (`_bajo_prefijo`, `crear_categoria`, rename de categoría,
que generaban rutas con `os.sep` en vez de `/`); `.git` sumado a `_DIRS_EXCLUIDOS`; borrado
de categorías ahora ordenado por profundidad descendente (hijas antes que padres).

**Desplegado y verificado en el homelab** (no solo local): backup de `app.db` antes de
tocar nada, `scp` de los dos archivos (el tar-pipe falló en silencio para `project/app`
en sesiones anteriores — no confiar en él para esa ruta), `docker build` + `docker-compose
up -d --no-build`, `RestartCount=0` en los 3 contenedores. Confirmado contra el `app.db`
real de producción: `categorias` 153→26 (limpieza de basura de git), `hojas` se mantiene
en **136 — cero pérdida de datos**, `PRAGMA integrity_check` → `ok`. Commit `e5698d6`,
pusheado a `origin/master`.

## IMPLEMENTADO: triage automático del Inbox (`00 - Sin categorizar/`) (2026-09-15)

Implementa la propuesta aprobada el mismo día (ver Cerebro/decisiones-implementacion.md,
entrada "2026-09-15 — PROPUESTA... triage automático del Inbox (00 - Sin categorizar/)")
tal cual quedó especificada, incluidas las 4 recomendaciones que el documento marcaba
"no cerradas" — confirmadas por el usuario al aprobar la implementación completa, no
reabiertas: (1) señal "listo para clasificar" = antigüedad de última EDICIÓN (mtime real
en disco) 21+ días + piso de contenido ~400 caracteres, sin chequeo de duplicados nuevo
(el piso de contenido ya descarta gratis el ruido casi-vacío tipo Si.md/Sí.md/S í.md);
(2) `01 - Proyectos/` queda fuera de esta versión, solo los 8 destinos fijos de
Área/Recurso x dominio (Facultad/Carrera Profesional/Salud/Desarrollo Personal); (3) una
respuesta de texto libre nombrando otro destino NO redirige el movimiento — mismo
criterio conservador que `archive_superseded`, se guarda como entrada nueva aparte; (4)
se implementó ya aunque el inbox real de `D:\Boveda` diera 0 candidatas bajo estos
umbrales (Bóveda con apenas días de vida) — verificado con datos sintéticos, no con el
inbox real, tal como anticipaba la propuesta.

**Archivo nuevo**: `jarvis/ingestion/inbox_triage.py` — selección de candidatas (SQL +
mtime real de archivo, `_select_candidates()`), clasificación por LLM con gate
anti-alucinación (`_classify_destination()`, mismo shape que `_CREATE_PROMPT` de
auditoría: una de las 8 rutas exactas o `NO_SE`, nunca inventa carpeta), y orquestación
con gate semanal propio (`should_run_inbox_triage()`/`run_inbox_triage()`, mismo
mecanismo que `agenda_patterns.py`). **Tocados**: `jarvis/audit/service.py`
(`_apply_triage_move()` paralela a `_apply_archive_superseded()` pero con
`payload["dest_dir_rel"]` variable; `propose_triage_move()`; rama nueva en
`accept_proposal()`; `triage_move` agregado al grupo conservador de
`_resolve_with_new_info()` junto a `archive_superseded`), `jarvis/db/schema.py` +
`jarvis/db/database.py` (`triage_move` — undécimo `action_type` de
`jarvis_audit_proposals`, migración `_migrate_audit_proposals_triage_move()` copiada
literal del patrón de `_migrate_audit_proposals_archive_superseded()`), `jarvis/config.py`
(4 variables nuevas: `JARVIS_INBOX_TRIAGE_INTERVAL_DAYS`=7,
`JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS`=21, `JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS`=400,
`JARVIS_INBOX_TRIAGE_LIMIT`=4), `jarvis/worker/consolidation.py` (octavo paso, sección de
reporte diario `_section_inbox_triage()`, `_nothing_to_report()` actualizado). `jarvis/vault/writer.py::move_entry_file()`
se reusó **sin ningún cambio** — ya era 100% genérico (`dest_dir_rel` es un string libre),
confirmado antes de escribir código.

**Verificado con Ollama real (`gemma3:12b` vía LiteLLM, `JARVIS_REASON_MODEL` apuntado a
Ollama para esta verificación — evita gastar la API real de OpenAI que sí está
configurada en `project/.env`) contra un sandbox aislado** (`jarvis.db`/`D:\Boveda` de
scratch, nunca los reales para la parte funcional):
- 4 notas sintéticas viejas (25-40 días) y sustanciosas (~850-1150 caracteres), una por
  dominio real (Facultad, Carrera Profesional, Salud, Desarrollo Personal) → las 4
  clasificadas correctamente a su ruta exacta (`02 - Areas/<dominio>` en los 4 casos, el
  contenido de cada una describía algo vigente/activo).
- 1 nota de ruido real (`Si.md`, 2 bytes, mismo caso que encontró la sesión de diseño) →
  descartada por el piso de contenido ANTES de llegar al LLM (cero llamadas gastadas).
- 1 nota reciente (2 días) pero larga → descartada por el umbral de antigüedad antes del
  LLM, confirmando que "sustancioso" solo no alcanza si es reciente.
- 1 nota deliberadamente sin dominio (receta de pan casero) → primera iteración del
  prompt la clasificó igual en "Desarrollo Personal" (hallazgo real: `gemma3:12b`, un
  modelo local de 12B, tiende a forzar una clasificación en vez de admitir incertidumbre);
  se reforzó `_TRIAGE_PROMPT` con ejemplos explícitos de qué es "ajeno a los 4 dominios" y
  la instrucción de que `NO_SE` "no es un fallback raro, es la respuesta correcta" — tras
  el ajuste, la misma nota de receta dio `NO_SE` de forma consistente (confirmado en 2
  corridas), y un probe aparte con contenido de clima/auto/números sueltos confirmó 2/3
  `NO_SE` reales (el tercer caso, una lista de números sin contexto, siguió forzándose a
  "Desarrollo Personal" — límite real del modelo local, documentado, no arreglado más allá
  de esto: en producción el modelo de razonamiento por default es GPT-4o-mini vía
  LiteLLM, más capaz, y el local solo es el fallback de presupuesto agotado/sin red).
- **Nunca inventó una carpeta fuera de las 8 permitidas** en ninguna corrida — cada
  respuesta que no fue un match exacto contra el enum se trató como "sin dato" (mismo
  código para `NO_SE` real o cualquier respuesta no reconocida), nunca como error a
  reintentar.
- `accept_proposal()` sobre una propuesta `triage_move` real movió el `.md` de verdad del
  inbox a `02 - Areas/Salud/` (confirmado en disco, `vault_path` actualizado en SQLite, el
  archivo dejó de existir en el inbox).
- Respuesta de texto libre nombrando otro destino ("no, en realidad esto va a Salud")
  sobre una propuesta `triage_move` **no movió nada** — quedó `RESOLVED_WITH_NEW_INFO`,
  el archivo original siguió intacto en el inbox, se creó una entrada nueva aparte con el
  texto tal cual lo escribió el usuario (mismo comportamiento que `archive_superseded`).
- Gate semanal: segunda corrida el mismo día no corrió (`ran=False`); forzando el
  `jarvis_policies` a 8 días atrás, la corrida siguiente sí corrió y NO repropuso las 3
  entradas que ya tenían una propuesta (PENDING o RESOLVED_WITH_NEW_INFO) de la corrida
  anterior — ninguna entrada terminó con más de una propuesta `triage_move` entre las dos
  corridas. La nota de receta (sin propuesta, por ser NO_SE) sí se reevaluó de nuevo en la
  segunda corrida y volvió a dar NO_SE — comportamiento esperado, mismo criterio que
  `_process_entity_gaps()` (SIN_DATOS no se cachea, solo una propuesta ya creada dedupea).
- `python -m py_compile` + `import` directo de los 7 archivos tocados/nuevos, sin errores.

**Verificado que correr el paso nuevo contra el `jarvis.db`/`D:\Boveda` REALES no rompe
nada** (backup previo tomado y confirmado por hash:
`project/database/backup-pre-inbox-triage-verify-20260915-220132/jarvis.db`+`chroma/`):
el inbox real (`D:\Boveda\00 - Sin categorizar\`, 16 notas reales) tiene hoy máximo 5 días
de antigüedad de edición (confirmado por mtime real, ninguna nota real llega a los 21 días
del umbral) — `run_inbox_triage()` corrió limpio contra los datos reales: `ran=True`,
`candidates_scanned=0`, `proposed=0`, sin errores, `PRAGMA integrity_check` OK, cero
archivos tocados en `D:\Boveda` (confirmado por `find -newermt` antes/después), cero
llamadas a LLM (no hizo falta, no había candidatas). Esto es lo esperado, no un bug — es
exactamente el hallazgo ya documentado en la propuesta aprobada (punto 5: "cero notas
calificarían hoy"). La migración de schema (`triage_move` en el `CHECK` de
`jarvis_audit_proposals`) sí quedó aplicada de forma permanente en el `jarvis.db` real
(mismo criterio que toda migración anterior — es idempotente y hubiera corrido igual en
el próximo arranque de cualquier proceso de Jarvis); se borró manualmente la única fila de
`jarvis_policies` (`inbox_triage_last_run`) que esta verificación había dejado, para no
dejar el reloj del gate semanal corriendo en producción antes de que el usuario decida
desplegar esto de verdad.

**Hallazgo fuera de alcance, no tocado**: `AUDIT_ACTION_LABELS` en
`project/frontend/src/components/jarvis/JarvisBrowsePanel.jsx` no tiene entrada para
`archive_superseded` (gap preexistente, de la sesión del 11/09) ni para `triage_move`
(nuevo) — el panel cae al fallback de mostrar el `action_type` crudo en vez de una
etiqueta linda. No se tocó el frontend en esta sesión (fuera del alcance pedido); queda
para quien lo note en uso real, mismo criterio que el gap preexistente de
`archive_superseded`.

**No desplegado al homelab, sin commit/push** — paso aparte, a pedido explícito de la
tarea (el orquestador revisa el resultado y decide cuándo commitear/desplegar).

---

## Fix: reporte diario de auditoría sin listar el contenido de cada entrada revisada (2026-09-15)

Pedido del usuario: el reporte diario (`build_audit_report_text()`, `jarvis/audit/service.py`)
listaba contenido+tags de cada entrada de los bloques por tag y random (`_entry_lines()`, hasta
`JARVIS_AUDIT_BLOCK_SIZE`×2 = hasta 20 entradas) todos los días, haya hallazgos o no — con la
Bóveda real indexada (74+ notas, muchas largas) el mensaje se volvía larguísimo. Se sacó el
listado de contenido; queda solo el conteo ("Bloque por tag X (N entradas)") y la sección de
hallazgos (que sigue con el detalle completo cuando SÍ hay algo que reportar). `_entry_lines()`
se eliminó (quedaba sin uso). El detalle de qué entrada puntual se revisó sigue disponible en
`jarvis_policies.consolidation_run` (el JSON completo no cambió, solo el texto renderizado a
Telegram). Verificado con un caso de prueba: mensaje de ~220 caracteres en vez de varios miles.
Deploy al homelab: pendiente, a la espera de confirmación.

---

## IMPLEMENTADO (verificado en scratch, no corrido contra el homelab): backfill del contenido ya existente de `D:\Boveda` a `memory_entries` (2026-09-15)

Cierra el ítem 1 de `Cerebro/PROXIMAMENTE.md` ("Pendiente real tras el deploy de la fusión
Bóveda-Jarvis"): las 71 notas que ya vivían en `D:\Boveda` (57 del vault viejo de Obsidian + 8
hojas reales de SGR + 6 manuales — recontadas hoy, más que el "65+" original) nunca habían pasado
por el pipeline de captura de Jarvis — confirmado en vivo que `memory_entries` seguía en 0 filas
pese a la fusión ya desplegada.

**Script nuevo**: `jarvis/cli/backfill_vault_content.py`. Distinto de `jarvis/cli/migrate_boveda.py`
(migra filas de `app.db` y CREA archivos nuevos): acá el contenido YA ES un archivo real en
`D:\Boveda` — el script nunca escribe, mueve ni renombra esos archivos, solo crea filas de índice
(`memory_entries` + entidades/tags/proyectos + embeddings) que apuntan al archivo real vía
`vault_path`. Reusa el `id` del frontmatter de cada nota como `memory_entries.id` (trazabilidad
real archivo↔fila) y pasa cada nota por el mismo pipeline de clasificación/extracción que una
captura nueva (`call_classify()`/`extract_entities()`/`link_entities_for_entry()`/
`link_tags_for_entry()`/`link_project_for_entry()`, todo con el modelo LOCAL vía LiteLLM/Ollama —
sin costo de `JARVIS_DAILY_BUDGET_USD`), salvo `write_entry()` (el `.md` ya existe). Alcance:
`00 - Sin categorizar`/`01 - Proyectos`/`02 - Areas`/`03 - Recursos`/`04 - Archivo` — excluye
`05 - Basura` (candidatos a borrar, no memoria) y `Boveda/Jarvis/` (salida propia de Jarvis).
`source='migration'`, `authorship='user'`, `origin_trust='user.authenticated'`. Idempotente por
`id` ya existente en `memory_entries` (no por `content_hash`). Detalle completo de las 7 decisiones
de diseño en `Cerebro/decisiones/2026-09-15-backfill-boveda-a-memoria-jarvis.md`.

**Verificado con datos y modelos reales, nunca contra el homelab ni contra `D:\Boveda` real**:
copia de scratch de las 71 notas reales (`D:\Boveda` original sin tocar, confirmado por mtime al
terminar) + `jarvis.db`/`chroma` de scratch, Ollama real (`gemma3:12b` + `nomic-embed-text`).
`--dry-run` primero (71 candidatas, no creó `jarvis.db`). Corrida real `--limit 5` seguida de la
corrida completa: 66 ingeridas + 5 reconocidas como ya existentes (0 duplicados, confirma
idempotencia real, no solo diseñada) → 71 `memory_entries` totales (48 en `03 - Recursos`, 14 en
`00 - Sin categorizar`, 9 en `04 - Archivo`), 65 entidades y 3 proyectos creados/vinculados desde
cero, 45 tags en el catálogo, 0 `vault_path`/`embedded_at` nulos. Confirmado por mtime que los 71
archivos de la Bóveda de scratch no cambiaron en ningún momento de la corrida (que llevó más de una
hora de wall-clock, ~20-40s/nota sin GPU) — lo único nuevo en disco fue
`Boveda/Jarvis/Entidades/`+`Proyectos/` (síntesis, no el árbol del usuario). **Pregunta real a
Jarvis contra el scratch** (`jarvis.query.service.query()`, RAG completo) — "¿Qué apuntes tengo
sobre el libro El Alquimista?" — recuperó como primera fuente el `id` real del frontmatter de esa
nota y respondió con datos correctos y reales del archivo (autor, fecha de finalización, puntaje,
sin apuntes tomados): confirma que Jarvis ahora sí encuentra contexto de contenido migrado, que
antes de este backfill no podía ver.

**No corrido contra el homelab real** — paso aparte, explícito, a pedido de la tarea. Antes de
correrlo ahí: backup de `jarvis.db`/`chroma` reales (mismo patrón de siempre). `D:\Boveda` en sí no
necesita backup para esto — el script es read-only sobre los archivos, confirmado con mtime.

---

## IMPLEMENTADO: síntesis de patrones de Agenda (2026-09-15)

Implementa la propuesta aprobada el mismo día (ver entrada "Sesión de diseño..."
más abajo y `Cerebro/decisiones-implementacion.md`, entrada
"2026-09-15 — PROPUESTA...") — extiende 0.3 con una capa de síntesis de
patrones (horarios recurrentes, hábitos inferidos), separada del contenido
literal, con autoría Jarvis. Implementada tal cual el documento de diseño
(mismo namespace de `origin_source_key`, mismas dos excepciones de destino en
`write_entry()`, mismo mecanismo de gating vía `jarvis_capture_proposals`,
sin mecanismo de supersesión nuevo).

**Archivo nuevo**: `jarvis/ingestion/agenda_patterns.py` (dos caminos: regla
directa sin LLM para `se_repite=1`, cluster inferido con LLM acotado para
eventos puntuales que comparten título, ver docstring del módulo para el
detalle completo). **Tocados**: `jarvis/ingestion/agenda.py` (filtro
`se_repite` en `_fetch_recent_events()`), `jarvis/captures/passive.py`
(`accept_proposal()` setea `authorship='jarvis_synthesis'` cuando
`origin_source_key` empieza con `"agenda:patron:"`), `jarvis/vault/writer.py`
(`_PARA_DEST_OVERRIDE` y `_SYNTH_DEST_OVERRIDE_PREFIXES`, dos excepciones de
destino sin tocar el resto de `write_entry()`), `jarvis/worker/consolidation.py`
(séptimo paso, gate semanal propio, sección nueva en el reporte diario,
`_nothing_to_report()` actualizado), `jarvis/db/database.py` (`Agenda` agregado
a `_SYNTH_SUBDIRS`), `jarvis/config.py` (4 variables nuevas, todas con default
documentado). Sin cambios de frontend ni de schema SQL (cero tablas/columnas/
`CHECK` nuevos, tal como preveía el diseño — namespacing de campos de texto
libre ya existentes, `origin_source_key`/`source_id`).

**Verificado con Ollama real contra un sandbox aislado** (nunca `jarvis.db`/
`app.db`/`D:\Boveda` reales — backend de SGR real levantado contra un
`app.db`/vault scratch nuevos en `%TEMP%`, puerto 8766, `JARVIS_DB_PATH`/
`JARVIS_BOVEDA_PATH`/`JARVIS_CHROMA_PATH` apuntando al mismo scratch; **sin
backup previo porque ninguna DB real fue tocada en ningún momento de esta
sesión** — mismo criterio que toda verificación anterior contra sandbox, el
backup aplica cuando se opera contra datos reales, no acá):

- **Evento recurrente real** (`se_repite=1`, "MatDis" martes 09:00-11:00,
  `regla_repeticion={"frecuencia":"semanal","dias":[1]}`): la ruta 0.3
  (`run_agenda_ingestion()`) dejó de proponerlo -- `events_scanned=1` (solo el
  evento de control puntual), confirmando que las ocurrencias recurrentes ya
  NO se proponen una por una. `run_agenda_pattern_synthesis()` sí lo detectó y
  sintetizó **sin LLM** el texto correcto: "MatDis: todos los martes
  09:00-11:00hs" (día de la semana correctamente derivado de `dias:[1]`).
- **Cluster de eventos puntuales** (3 eventos "Oficina", `se_repite=0`,
  espaciados 15 días exactos en julio-agosto): detectado como cluster de 3+
  ocurrencias, sintetizado por LLM real (Ollama, `gemma3:12b` vía fallback
  local -- sin `OPENAI_API_KEY` en el sandbox) con el texto **"aproximadamente
  cada 15 días"**, coincidiendo con el espaciado real de los datos sembrados
  (ninguna alucinación: ni el nombre ni la cadencia fueron inventados).
- **Destinos verificados en disco**: la captura literal aceptada
  (`authorship='user'`, `source='agenda'`) escribió en `Agenda/*.md` (no en
  `00 - Sin categorizar/`, que quedó vacía); ambos patrones aceptados
  (`authorship='jarvis_synthesis'`) escribieron en `Jarvis/Agenda/*.md` (no en
  `Jarvis/Sintesis/`, que también quedó vacía) con el frontmatter rico
  completo (`confidence`/`origin_trust`/`valid_from`/`valid_to`/`source_id`).
  `accept_proposal()` resolvió `authorship` correctamente en los 3 casos
  (literal → `user`, ambos patrones → `jarvis_synthesis`) mirando el prefijo
  de `origin_source_key`, exactamente como diseñado.
- **Pipeline completo probado de punta a punta**: `process_entry()` real
  (clasificación + extracción de entidades + embedding, todo contra Ollama
  real) corrido sobre las 3 entradas aceptadas -- sin errores; el patrón
  "Oficina" incluso ganó automáticamente su sección `## Vinculado a`
  (wikilink a la entidad "Oficina" ya extraída), infraestructura reusada sin
  cambios.
- **Dedup/idempotencia**: segunda corrida de `run_agenda_ingestion()` dio
  `proposed=0` (el evento de control ya estaba dedupeado); segunda corrida de
  `run_agenda_pattern_synthesis()` el mismo día dio `ran=False` (gate semanal
  propio, distinto del gate de 24h del resto de `run_consolidation()`,
  funcionando).
- `python -m py_compile` limpio en los 7 archivos tocados/nuevos, más un
  `import` directo de los 6 módulos tocados (además del compile) para
  descartar errores de import-time no detectables por `py_compile` solo.

**No implementado a propósito, tal como especificaba el documento de diseño**:
ningún campo `supersedes_entry_id` ni mecanismo de supersesión nuevo -- la
actualización de un patrón que cambió queda a cargo de la consolidación diaria
existente (`same_fact`, recalibrada a 0.70). Sigue sin probarse contra
contenido real de horarios/hábitos en esta sesión (no se armó el escenario de
"un patrón cambia de una corrida a la siguiente") -- la incertidumbre
documentada en la propuesta sigue abierta, no se cerró acá a propósito (no era
parte del alcance pedido).

**Observación fuera de alcance, no tocada**: `project/app/vault/sync.py`
(`_ROOTS_ESTRUCTURALES`) sincroniza genéricamente CUALQUIER carpeta bajo
`VAULT_ROOT` -- confirmado que `Agenda/` se indexa sola como categoría no
estructural (`estructural=0`) sin necesitar ningún cambio ahí. No verificado
si el frontend (grafo de Bóveda) renderiza bien una categoría de primer nivel
nueva fuera de `00-05` -- no era parte del pedido, queda para quien lo note en
uso real.

**No desplegado al homelab en esta sesión** -- paso aparte, a pedido explícito
(mismo criterio que toda sesión de implementación anterior).

---

## Sesión de diseño: síntesis de patrones de Agenda — propuesta sin implementar (2026-09-15)

Pedido explícito de sesión de diseño (no código), mismo formato que la propuesta
de auditoría proactiva (31/08) y la fusión Bóveda-Jarvis (11/09): extender 0.3
(que hoy solo propone eventos/tareas literal, evento por evento) con una capa de
**síntesis de patrones** (horarios recurrentes, hábitos inferidos de la Agenda,
ej. "cursa MatDis los lunes 9-11hs", "entrena 3 días/semana") con autoría Jarvis.
Documento completo en `Cerebro/decisiones-implementacion.md`, entrada
"2026-09-15 — PROPUESTA (sin implementar...)".

**Hallazgo central que definió el diseño**: `agenda_eventos.regla_repeticion` es
un JSON custom de SGR (`{"frecuencia","dias","hasta"}`, no RRULE) — para un
evento con `se_repite=1` el patrón YA está en el dato estructurado, sintetizarlo
es una transformación directa sin LLM. Solo el caso NO modelado como repetición
real (ej. "voy a la oficina cada 15 días", inferido agrupando eventos sueltos por
título) necesita que un LLM mire el cluster y proponga el patrón, mismo criterio
anti-alucinación que `_CREATE_PROMPT` de auditoría.

**Decisiones de la propuesta** (detalle completo en decisiones-implementacion.md):
0.3 literal deja de proponer ocurrencias de eventos recurrentes una por una
(confirmado con el usuario) — queda exclusivo para eventos puntuales y tareas;
dos excepciones de destino nuevas en `write_entry()` (`D:\Boveda\Agenda\` para
contenido literal, `Boveda/Jarvis/Agenda/` para patrones), ambas sin tocar ningún
`CHECK` de schema; gating reusa `jarvis_capture_proposals` (no
`jarvis_audit_proposals` — su `target_entry_ids` depende de `memory_entries` ya
aceptados, y hoy son casi todos `EXPIRED`/`REJECTED`, fuente de datos insuficiente)
namespaceando `origin_source_key` bajo `agenda:patron:...`; actualización de un
patrón que cambió reusa la consolidación diaria existente (`same_fact`,
recalibrada a umbral 0.70 el 26/08-31/08) en vez de un mecanismo nuevo de
supersesión; cadencia semanal propia (no diaria) dentro de `run_consolidation()`.

**Sin implementar** — pendiente de aprobación explícita antes de tocar código,
mismo criterio que toda propuesta de diseño anterior.

---

## Verificación real de la Ingestión de Agenda (0.3) post-fusión — sigue funcionando, sin cambios de código (2026-09-15)

Tarea de verificación + hardening pedida explícitamente sobre algo ya desplegado (0.3, del
2026-09-03/04), nunca re-probado desde que cambió tanto alrededor (fusión Jarvis+Bóveda,
`authorship`, wipe de `jarvis.db`). **Conclusión: sigue funcionando de punta a punta, no hizo
falta ningún fix de código.** Backup previo tomado en el homelab (`~/project/database/
backup-pre-agenda-verify-20260915-070500/`, `jarvis.db`+`chroma`, contenido confirmado) antes de
tocar nada real.

**1. Wiring del sexto paso (`run_consolidation()`)**: confirmado por lectura de código que
`jarvis.ingestion.agenda.run_agenda_ingestion()` sigue siendo el sexto paso, corre antes del
séptimo (pregunta abierta) y `_nothing_to_report()` sigue mirando `summary["agenda_ingestion"]`
correctamente — nada de esto se rompió con los pasos agregados después (auditoría, pregunta
abierta, reporte diario). Confirmado además que el código real del homelab es **byte a byte
idéntico** (sha256) al de este branch en los 5 archivos relevantes (`agenda.py`, `passive.py`,
`writer.py`, `consolidation.py`, `memory/service.py`) — sin drift entre lo desplegado y el repo.

**2. `authorship` en una entrada aceptada de Agenda — pregunta nueva del pedido, respondida sin
tocar código**: `jarvis/captures/passive.py::accept_proposal()` llama `capture_raw()` **sin pasar
`authorship`** para el caso `origin_source == "agenda_ingestion"` — usa el default `'user'` de
`capture_raw()` (`jarvis/memory/service.py`), igual que cualquier otra captura explícita. Esto es
lo correcto (mismo criterio que ya adelantaba el pedido): el contenido lo sintetiza una plantilla
sin LLM a partir de un dato 100% del usuario (título/fecha de su propio evento), no es prosa
interpretativa de Jarvis combinando fragmentos — `'jarvis_synthesis'` sigue siendo exclusivo de
`audit/service.py::_apply_create()`, tal como quedó documentado en
`Cerebro/decisiones/2026-09-11-jarvis-authorship-columna-nueva.md`. **No fue necesario ningún fix**
— el código de 0.3 en `accept_proposal()` es anterior a que `authorship` existiera, pero al no
pasar el parámetro cae en el default correcto por pura coincidencia de diseño (no por accidente:
`capture_raw()` fue diseñado con `authorship='user'` como default seguro). Verificado también que
`jarvis/vault/writer.py` rutea esa entrada a `00 - Sin categorizar/` con `origen: agenda` en el
frontmatter (mapeo `_ORIGEN_DESDE_SOURCE["agenda"] = "agenda"`).

**3. Prueba real de punta a punta contra el homelab real** (backend real, `jarvis.db` real vacío
post-wipe, chat de Telegram real): forzada una corrida de `run_agenda_ingestion()` con la ventana
ampliada a 90 días **solo para esta invocación** (parámetro de módulo pisado en el proceso, nunca
persistido en `.env`/`docker-compose.yml` — la ventana real de producción sigue en 7 días) porque
los únicos eventos reales que hay (16, exámenes de julio-agosto) caen fuera de la ventana default y
no había actividad reciente. Resultado: **21 propuestas reales creadas sin errores**, las 21
notificaciones de Telegram **llegaron de verdad** al chat real del usuario (confirmado por el
usuario). Antes de esto hubo que pedirle al usuario que le mandara `/j` al bot — el wipe de
`jarvis.db` del 11/09 había dejado `debug_chat_id` vacío (ni `JARVIS_TELEGRAM_CHAT_ID` ni policy
guardada), así que **cualquier propuesta automática desde el wipe habría caído en silencio al
canal `desktop`** en vez de avisar por Telegram — esto ya quedó resuelto en producción al recibir
el `/j` real (queda una policy `debug_chat_id` nueva en `jarvis_policies`).

Responder "No" a una propuesta por Telegram **sí rechazó de verdad** (`jarvis_capture_proposals`
pasó a `REJECTED`, confirmado en DB) — pero la confirmación "Descartado." nunca le llegó al
usuario: el contenedor `bot` tuvo una falla de DNS transitoria (`Temporary failure in name
resolution` resolviendo `api.telegram.org`, ver traceback en `docker-compose logs bot`) justo al
mandar la respuesta, ya resuelta sola minutos después (confirmado resolviendo el hostname de nuevo
desde el contenedor). Las 3 respuestas siguientes del usuario ("Sí"/variantes) nunca se procesaron
— ninguna quedó en `ACCEPTED`, las 20 propuestas restantes vencieron por timeout 30 min después sin
que ninguna reacción quedara registrada; lo más probable es que el polling de Telegram también
haya estado afectado por la misma falla de DNS y esos mensajes nunca llegaron a procesarse (no hay
log de ellos en el contenedor `bot`). **No es un bug de la ingestión de Agenda ni de
`passive.py`** — es una falla de red/DNS del contenedor, transitoria, fuera del alcance explícito
de esta tarea (acotada a `agenda.py`/`passive.py`). Documentado como hallazgo, sin fix aplicado.

**Dedup confirmado con datos reales**: una segunda corrida de `run_agenda_ingestion()` (misma
ventana ampliada) sobre los mismos 21 eventos dio `proposed: 0` — ninguno se repropuso, ni los
`EXPIRED` ni el `REJECTED`, confirmando que `_already_proposed()` dedupea contra
`jarvis_capture_proposals` sin mirar status, tal como quedó documentado el 03/09. **Consecuencia
real no discutida antes, hallazgo de esta sesión**: como el timeout de propuestas (`EXPIRED`)
dedupea igual que un rechazo explícito, una propuesta de Agenda que el usuario simplemente no
llegó a responder a tiempo **nunca se vuelve a proponer** — queda permanentemente descartada en
silencio, igual que si hubiera dicho "no" a propósito. Puede ser el comportamiento correcto (mismo
criterio conservador de "no floodear"), pero no es lo mismo que un rechazo deliberado y no está
documentado como decisión consciente — queda anotado para revisar si el usuario lo considera un
problema real.

**No verificado con datos reales, sigue pendiente (no es un gap nuevo, es el mismo del 03/09)**:
`_fetch_recent_completed_tasks()` contra tareas completadas reales — la Agenda real del usuario
**no tiene ninguna tarea completada** en este momento (0 tareas en total, no solo fuera de
ventana). Sin datos reales que forzar sin fabricarlos, este caso sigue solo probado con datos
sintéticos (mismos 4 casos de borde del 03/09).

**Camino de ACEPTAR con datos 100% reales de producción — no completado en esta sesión, a pedido
explícito del usuario**: tras la falla de DNS, se le ofreció al usuario generar una propuesta
fresca (tarea real marcada completada, o evento de prueba de 1 minuto) para probar
`accept_proposal()` de punta a punta contra producción; eligió no forzarlo hoy. La lógica de
`accept_proposal()`/`write_entry()` para el caso `agenda` quedó igual verificada por lectura de
código (punto 2) y por la verificación en sandbox de Milestone 3 (`origen: agenda` ya probado ahí
contra Ollama real, aunque no contra `jarvis.db` de producción) — pero el archivo `.md` real en
`D:\Boveda\00 - Sin categorizar\` para una aceptación de Agenda de HOY, con el `jarvis.db` de
producción actual, no se confirmó en esta sesión.

**Backup y estado final**: `jarvis.db` real termina con 21 `jarvis_capture_proposals` de Agenda (20
`EXPIRED` + 1 `REJECTED`, 0 `ACCEPTED`) y 1 `memory_entries` (de un `/j` de prueba del usuario, sin
relación con Agenda — necesario para restablecer `debug_chat_id`). `integrity_check` OK. Backup
pre-sesión intacto en `~/project/database/backup-pre-agenda-verify-20260915-070500/`. **No se tocó
el share SMB, `docker-compose.yml`, ni se reinició ningún contenedor** — todo lo de arriba corrió
contra los 3 contenedores ya corriendo (`RestartCount` sin cambios).

Ver `Cerebro/decisiones/2026-09-15-agenda-authorship-ya-correcto.md` para el detalle de por qué no
hizo falta tocar `passive.py`.

---

## Riesgos del share SMB resueltos antes del deploy (2026-09-14)

Sesión acotada a propósito a los 2 riesgos dejados abiertos en
`Cerebro/decisiones/2026-09-11-share-smb-boveda-homelab.md` — **no** se tocó el share real de
Windows, ni el mount CIFS del homelab, ni `docker-compose.yml` real, ni se reiniciaron
contenedores. Eso sigue para el checkpoint de deploy, sesión aparte.

**Riesgo 1 (mount no disponible al arrancar) — implementado y verificado corriendo el código.**
Función compartida `ensure_vault_mounted()` en `project/app/vault/guard.py` (stdlib puro, sin
importar `jarvis` ni FastAPI — ver docstring), enganchada como primer paso en los 3 entrypoints
(`app/main.py::lifespan()`, `jarvis/worker/main.py::main()`, `mybot/bot.py::main()`): si
`VAULT_ROOT`/`JARVIS_BOVEDA_PATH` no tiene las 6 carpetas estructurales del árbol PARA, loguea
`[vault_guard] FATAL: ...` y hace `sys.exit(1)` antes de tocar ninguna DB. Verificado corriendo
`uvicorn app.main:app`, `python -m jarvis.worker.main` y `python mybot/bot.py` de verdad contra una
carpeta de scratch vacía (simulando el mount roto): los 3 se negaron a arrancar (exit 3/1/1).
Corrida aparte contra el `D:\Boveda` real (solo el chequeo, sin arrancar el proceso completo)
confirmó que pasa limpio. Confirmado por mtime que `D:\Boveda`, `app.db` y `jarvis.db` reales no se
tocaron en ningún momento.

**Riesgo 2 (precisión de `mtime` en CIFS) — decisión documentada, sin código.** Se acepta como
riesgo de baja frecuencia para uso personal; no se implementa fallback por hash de contenido
todavía. Criterio de revisión explícito (addendum en el archivo de decisión): solo si se confirma
un caso real de sync perdido por esto.

## Milestone 3 de la fusión: `jarvis/vault/writer.py`/`index_writer.py` conectados a `D:\Boveda` (2026-09-11)

Implementado y verificado en un entorno de scratch completamente aislado (`jarvis.db` + `D:\Boveda`
de prueba propios, nunca los reales — confirmado por mtime al terminar: cero archivos reales
tocados). **No aplicado a `jarvis.db`/`D:\Boveda` reales** — mismo criterio que Milestone 2, queda
a criterio del usuario cuándo disparar el arranque real.

**Qué cambió**: `write_entry()` rutea por `entry["authorship"]` (columna nueva en `memory_entries`,
ver `Cerebro/decisiones/2026-09-11-jarvis-authorship-columna-nueva.md` — corrige la resolución
original que asumía poder derivarlo de `action_type` sin campo nuevo, no viable contra el flujo
real de 2 pasos captura→procesamiento) en vez de por `type`. `'user'` (default) → `D:\Boveda\
00 - Sin categorizar\` con el frontmatter común exacto de Milestone 2 (`id/tipo/creado_en/
actualizado_en/origen/tags[/url]`, `origen` derivado de `source`: telegram→telegram,
desktop→app, agenda→agenda, migration→migracion). `'jarvis_synthesis'` (solo
`audit/service.py::_apply_create()`) → `Boveda\Jarvis\Sintesis\`, con el frontmatter rico completo
(`confidence`/`origin_trust`/`valid_from`/`valid_to`/`source_id`) — primera vez que estos campos se
reflejan en archivo, antes vivían solo en SQLite. `index_writer.py`: `INDEX/ENTITIES`→
`Boveda\Jarvis\Entidades\`, `INDEX/PROJECTS`→`Boveda\Jarvis\Proyectos\`, misma lógica de
reconstrucción desde SQL sin cambios.

Nuevo décimo `action_type` en `jarvis_audit_proposals`: `archive_superseded` — cuando
`consolidation.py` marca `same_fact`/stale-por-edad (el `valid_to` en SQL sigue siendo inmediato,
sin gating, sin cambios de comportamiento ahí), propone (gateado, Telegram/desktop) mover el `.md`
a `04 - Archivo\`. `forget_entry()` no pasa por esta propuesta nueva (la confirmación humana ya
existió al pedir "olvidar") — mueve directo a `05 - Basura\` si es contenido del usuario, o borra
directo si es síntesis de Jarvis. `memory_entries.vault_path` se actualiza al mover; se dejó de
escribir esa misma info como metadata en ChromaDB (confirmado sin lectores, era dead weight).

**Verificado con datos reales de LLM/embeddings** (Ollama local, `gemma3:12b` + `nomic-embed-text`,
nunca simulado) contra el dataset de `jarvis/cli/seed_test.py` en el scratch: corrida completa de
`run_consolidation()` (19 entradas + 1 vacía) → 3 marcadas obsoletas (same_fact) → exactamente 3
propuestas `archive_superseded` PENDING, una por entrada, ninguna aplicada sola. Aceptar una movió
el `.md` real de `00 - Sin categorizar\` a `04 - Archivo\` (confirmado en disco). `forget_entry()`
sobre una entrada de usuario movió su `.md` a `05 - Basura\` (confirmado en disco, sin duplicados
en ningún caso). Hueco de entidad "José" (2 menciones) → propuesta `create` → aceptada → entrada con
`authorship='jarvis_synthesis'` → procesada por el worker → `.md` en `Jarvis\Sintesis\` con
frontmatter rico completo, ficha canónica sincronizada en `Jarvis\Entidades\` con wikilink real.
`origen: agenda` confirmado ya cableado correctamente del lado de `jarvis/captures/passive.py`
(`source='agenda'` para `origin_source='agenda_ingestion'`, preexistente) — el mapeo nuevo en
`writer.py` lo traduce bien sin tocar ese archivo.

**No verificado en esta sesión** (fuera de alcance explícito): share SMB, deploy al homelab —
ver `Cerebro/decisiones/2026-09-11-share-smb-boveda-homelab.md` (preparado en paralelo por otra
sesión). Migración de datos reales de Jarvis: no aplica — `jarvis.db` real ya estaba vacío (wipe de
seed previo a toda esta fusión).

Detalle completo de las decisiones tácticas divergentes en `Cerebro/decisiones/` (3 archivos nuevos,
ver índice en `Cerebro/decisiones/README.md`, sección "Milestone 3").

---

## Milestone 2 de la fusión: `crud.py` de Bóveda conectado a `D:\Boveda` (2026-09-11)

Implementado, verificado en sandbox, **no aplicado todavía a `app.db`/`D:\Boveda` reales**
(decisión pendiente del usuario, ver "Pendiente" al final de esta entrada). Sigue el plan de
`Cerebro/decisiones-implementacion.md` (propuesta del 2026-09-11) y las decisiones tácticas en
`Cerebro/decisiones/` (una por archivo: schema, sandbox, borrado soft, detección de origen,
fotos). Alcance respetado: Jarvis, share SMB, deploy al homelab y el editor TipTap **no** se
tocaron.

**Decisión del usuario sobre categorías** (ya cerrada antes de esta sesión en
`Cerebro/decisiones/2026-09-11-categorias-viejas-boveda.md`): las 7 categorías viejas
(`Desarrollo`, `React`, `Universidad`, `Ideas`, `General`, `IAs Noticias`, `Sin Categorizar`)
se reemplazan por el árbol PARA real — ejecutado como parte de esta sesión, probado en sandbox.

**Qué cambió en `crud.py`/`main.py`** (detalle completo en las 5 decisiones tácticas del
2026-09-11 en `Cerebro/decisiones/`):
- `GET /categorias`/`GET /hojas` (y variantes) sincronizan contra `D:\Boveda` antes de leer
  SQL (`app/vault/sync.py::sincronizar_vault()`, llamada al arrancar FastAPI y al inicio de
  cada lectura Bóveda — barata por skip de `mtime`, sin poller en background).
- `POST/PATCH/DELETE /hojas` y `/categorias` escriben/mueven/borran el archivo real primero,
  la fila SQL se actualiza después (nunca al revés) — `app/vault/writer.py`.
- `categorias.nombre` dejó de ser `UNIQUE` global (ahora `ruta` lo es) — el árbol real repite
  nombres bajo padres distintos (`Facultad` en Áreas y en Recursos).
- `DELETE` es soft-delete a `05 - Basura/`; carpetas estructurales del árbol PARA nunca se
  borran ni renombran/mueven.
- `origen: app | telegram` se infiere del header `Origin` (sin tocar `bot.py`/frontend).
- Conversión HTML↔Markdown bidireccional para `apuntes` (`app/vault/markdown.py`) — escribir
  a MD limpio, releer a HTML para que TipTap siga funcionando igual.
- Fotos: se detectaron y unificaron dos convenciones reales distintas (frontend vs. bot) — ver
  decisión táctica dedicada. Adjuntos van a `D:\Boveda\_adjuntos\`, servidos por un mount
  nuevo `/adjuntos` (mismo patrón que `/uploads`).
- `project/scripts/vault_indexer.py` (Milestone 1) se refactorizó para reusar el parseo de
  `app/vault/parser.py` en vez de duplicarlo; sigue funcionando como CLI de auditoría manual.
  `vault_index.db`/`vault_notas` quedan retirados del flujo en vivo.

**Verificado en sandbox** (`dev-start.ps1` extendido, copia de `app.db` + copia liviana de
`D:\Boveda` sin `_adjuntos/`, backend real en `:8765` + frontend real `npm run dev` en `:5173`
apuntando ahí): categoría duplicada bajo padres distintos (`Facultad` en Áreas y en Recursos,
ambas coexisten sin error); crear/editar/mover/borrar hoja (archivo se mueve/mueve-a-Basura
de verdad en el sandbox); crear/renombrar/mover categoría (carpeta real); borrar categoría con
hojas sin forzar → 409, con forzar → hojas a Basura + carpeta borrada; borrar categoría
estructural → 409 siempre; nombre de categoría duplicado exacto → 400; detección de origen
(`Origin: http://localhost:5173` → `app`, sin header → `telegram`); foto por las dos
convenciones (frontend: `contenido`=URL; bot simulado: `contenido`=título +
`apuntes`=`<img>`) → mismo resultado final coherente en el archivo y en la respuesta; re-sync
completo desde archivo (fila SQL borrada y reconstruida desde el `.md`) reproduce exactamente
lo mismo; `scripts/vault_indexer.py` reejecutado standalone contra la copia sandbox, mismos
resultados que Milestone 1 (65/65 archivos, 0 errores). **No verificado visualmente en
navegador** — el entorno de esta sesión no tenía la extensión Claude en Chrome conectada;
la verificación fue a nivel API real (incluido el header `Origin` que manda el navegador) más
el frontend real corriendo y sirviendo contra el backend sandbox, pero sin captura de pantalla
ni interacción de mouse/teclado real. Confirmado por hash que `app.db` real no cambió un solo
byte durante toda la sesión; en `D:\Boveda` real solo cambiaron los 6 README de subcarpeta
(documentación de los campos opcionales nuevos) — ningún archivo de nota, ninguna carpeta.
Homelab: no se tocó (sin SSH, sin `docker-compose`, sin `sgr-sync-push.ps1`).

**Pendiente**: aplicar esto a `app.db`/`D:\Boveda` reales locales es una decisión aparte del
usuario, no tomada en esta sesión — arrancar el backend real (`uvicorn` sin `VAULT_ROOT`/
`DB_PATH` override) dispara la migración real la primera vez. Después de eso: 1) Share SMB
homelab (infraestructura, no código). 2) `jarvis/vault/writer.py`/`index_writer.py` — sigue
sin tocar. 3) Deploy al homelab — sesión aparte, explícita.

## Milestone 1 de la fusión: indexador/poller de `D:\Boveda` construido y verificado (2026-09-11)

Primera pieza de código real de la fusión aprobada (ver entrada de abajo y
`Cerebro/decisiones-implementacion.md`, 2026-09-11). Alcance acotado a propósito: solo el
indexador — no se tocó `project/app/main.py`/`crud.py` (Bóveda sigue escribiendo a `hojas`/
`categorias` en `app.db` exactamente igual que antes), no se tocó `jarvis/vault/writer.py` ni
`index_writer.py`, no hay share SMB todavía (corre local contra `D:\Boveda` directo), y Agenda
sigue fuera.

**Decisión de schema cerrada con el usuario** (estaba pendiente, ver el "Pendiente" de la entrada
de decisiones-implementacion.md del 09-11): **Opción B** — el índice nuevo vive en una base
SQLite separada (`project/database/vault_index.db`, gitignoreada igual que `app.db`/`jarvis.db`),
con nombres de tabla propios (`vault_notas`, `vault_corridas`), sin tocar ni pretender reemplazar
`hojas`/`categorias` todavía. Quedan dos fuentes de "qué categorías/hojas existen" conviviendo
a propósito hasta que una sesión futura decida unificarlas — el usuario prefirió esto a
"Opción A" (jubilar `categorias`, rediseñar `hojas` con ruta en vez de FK) precisamente porque
esta sesión no toca `crud.py`, y ese schema nuevo solo tiene sentido una vez que `crud.py`/
`main.py`/frontend/bot se adapten a leer por ruta.

**Construido**: `project/scripts/vault_indexer.py` — recorre `D:\Boveda` completo con
`Path.rglob("*.md")` (excluye `README.md`), parsea el frontmatter YAML de cada nota, y upsertea
`vault_notas` (`id, ruta, carpeta, carpeta_raiz, titulo, tipo, creado_en, actualizado_en, origen,
tags, url, mtime, tamano_bytes, indexado_en`) más una fila de auditoría por corrida en
`vault_corridas` (conteos de nuevos/actualizados/sin-cambios/con-error/ids-asignados/eliminados).
Detecta cambios por `mtime` contra lo ya indexado (no re-lee/re-parsea si no cambió); el upsert es
por `id` (no por ruta), así que mover una nota de carpeta PARA (el mecanismo real de "cambiar de
estado" en este diseño) actualiza la fila existente en vez de duplicarla; una nota que desaparece
del árbol se borra del índice al final de la corrida. Si un archivo no tiene `id` en el
frontmatter (o no tiene frontmatter en absoluto — caso de creación a mano), se le asigna
`uuid4()`, se completan los campos que falten con criterio conservador (`tipo`: detecta si el
cuerpo es una URL pelada igual que `detectType.js` del bot, si no `texto`; `origen: manual`;
`creado_en`/`actualizado_en`: mtime del archivo) y se reescribe el `.md` en el formato canónico del
README de cada carpeta — solo se toca el bloque de frontmatter, el cuerpo queda intacto.

**Verificado** contra el contenido real (65 notas migradas, no datos de prueba):
- Corrida limpia: 65 archivos, 0 errores, 0 ids faltantes (las 65 notas migradas ya traían
  frontmatter completo) — `tipo: link` 12 / `tipo: texto` 53, `origen: migracion` 65/65 (coincide
  con un escaneo manual independiente hecho antes de escribir el indexador), 0 links sin `url`,
  conteo por `carpeta_raiz` consistente con lo que hay en disco (`00 - Sin categorizar`: 7,
  `03 - Recursos`: 48, `04 - Archivo`: 9, `05 - Basura`: 1 — `01 - Proyectos` y `02 - Areas` sin
  notas propias todavía, solo `README.md`).
- Segunda corrida sobre el mismo árbol: 65 `archivos_sin_cambios`, 0 reprocesados — confirma que
  la detección por `mtime` funciona.
- Casos de borde probados contra una bóveda de prueba en el scratchpad (nunca contra `D:\Boveda`
  real): archivo sin `id` (frontmatter parcial) → id asignado, campos faltantes completados,
  reescritura correcta; archivo **sin frontmatter en absoluto** (solo un H1 + texto) → mismo
  resultado, `origen: manual`; nota movida de `00 - Sin categorizar/` a `04 - Archivo/` → misma
  fila actualizada (sin duplicar, conteo pasa a `archivos_actualizados` en vez de
  `archivos_nuevos`); archivo borrado del disco → fila borrada del índice, `notas_eliminadas: 1`.
- Se verificó también que el UTF-8 con tildes/eñes en rutas/títulos llega intacto a la base
  (algunos nombres de archivo reales tienen acentos) — el resumen impreso en consola se ve
  mojibake por la codepage de la terminal, pero el contenido real en la base está bien.

**Dependencia nueva**: `PyYAML==6.0.3` agregado a `project/requirements.txt` (ya estaba instalado
transitivamente en el venv, pero el script lo usa directo y no estaba declarado).

**Pendiente para la siguiente sesión** (orden sugerido, a discutir con el usuario):
1. Conectar `crud.py`/`main.py` (o decidir si directamente se migra a leer `vault_notas` en vez de
   `hojas`/`categorias` — esto reabre la pregunta A/B con más información real en mano).
2. `jarvis/vault/writer.py`/`index_writer.py` — reescritura real hacia el árbol PARA +
   `Boveda/Jarvis/` (nada de esto se tocó en esta sesión).
3. Share SMB (paso de infraestructura, no de código).
4. Editor TipTap → Markdown.
5. Decidir si el indexador corre por cron/systemd/tarea programada de Windows, o sigue siendo
   manual hasta que haya algo consumiendo `vault_notas` — no se decidió en esta sesión porque
   todavía no hay ningún consumidor del índice.

## `jarvis.db` wipeado en el homelab — arranca vacío, a propósito (2026-09-11)

Confirmado que todo el contenido de `jarvis.db` era dataset de prueba (`jarvis/cli/seed_test.py`,
19-20 entradas — José, el par contradicción remoto/oficina, Madrid/Buenos Aires, la entrada vacía).
Backup completo tomado antes (`~/project/database/backup-pre-limpieza-seed-20260910-213410/`,
contenido confirmado) → contenedores parados → `jarvis.db`/vault de Jarvis/`chroma` eliminados por
completo → contenedores reiniciados, `RestartCount=0` en los 3, `jarvis.db` recreado limpio y vacío
por `init_db()` al arrancar. Es intencional y esperado: si una sesión futura ve `memory_entries`
vacía, no es un bug, es el estado post-wipe. Ver `Cerebro/decisiones-implementacion.md` (2026-09-11)
para el motivo completo: es el prerequisito de la fusión aprobada de Jarvis con la Bóveda de SGR
sobre `D:\Boveda`.

De paso se limpió `habitos`/`habitos_registros` en `app.db` (mismo criterio, confirmado seed) —
`fin_movimientos`, `agenda_eventos` y `hojas` son datos reales del usuario y no se tocaron.

## Fusión Jarvis + Bóveda de SGR sobre `D:\Boveda` — diseño aprobado, sin implementar (2026-09-11)

Ver entrada completa en `Cerebro/decisiones-implementacion.md` (2026-09-11) — arquitectura entera
del árbol PARA + `Boveda/Jarvis/`, mapeo de autoría, y los 4 huecos de diseño resueltos con el
usuario tras revisar el código real (`write_entry()`, `index_writer.py`, `audit/service.py`,
`consolidation.py`). **Antes de implementar cualquier parte de esto**, leer esa entrada completa —
invierte un principio central de `jarvis-spec.html` (SQLite deja de ser la fuente de verdad de
`memory_entries`). Pendiente: revisión cruzada por una sesión con conocimiento profundo del código
de Jarvis antes de tocar código real.

---

## Deploy al homelab — fix de Telegram en texto plano en producción (2026-09-04)

Hecho por el orquestador directamente (mismo patrón de siempre): backup previo
(`~/backups/pre-telegram-fix-deploy-20260904-204900/`, confirmado con contenido) → sync de
`jarvis/` → rebuild → `docker-compose up -d --no-build`. Código confirmado post-sync (sin
`parse_mode` funcional en el payload, `TELEGRAM_FAIL` presente). Post-restart: `RestartCount=0`
en los 3 contenedores, `GET /jarvis/health` → `worker_alive: true`, sin errores en logs.

La próxima corrida diaria (o cualquier push de auditoría/Agenda) ya usa texto plano — el bug
de "parte 2/3 perdida" queda cerrado en producción.

---

## Fix: mensajes de Telegram en texto plano — bug "parte 2/3 perdida" del reporte diario (2026-09-04)

Investigado y arreglado (ver decisiones-implementacion.md, misma fecha, para el detalle completo
de diagnóstico/decisión/verificación). Resumen: `send_telegram_message()` mandaba
`parse_mode: "Markdown"` (legacy) y varios mensajes — reporte diario, preguntas de propuestas de
auditoría, avisos de captura por Agenda — interpolan texto libre (contenido de memoria, tags,
nombres de entidades) que puede traer un `_`/`*`/`` ` `` sin cerrar por azar. Eso rompe el parseo
de Telegram (400 "can't parse entities") y el mensaje se pierde en silencio — el envío es
best-effort a propósito, así que la excepción solo se logueaba, sin dejar rastro persistente.
Reproducido y confirmado contra la API real de Telegram antes de tocar código.

**Fix**: texto plano (sin `parse_mode`) en las 7 funciones que arman mensajes de Telegram
(`jarvis/notify/telegram.py`, `jarvis/worker/processor.py`, `jarvis/debug/service.py`,
`jarvis/captures/passive.py`, `jarvis/ingestion/agenda.py`, `jarvis/audit/service.py`,
`jarvis/worker/consolidation.py`) — se prefirió a escapar para MarkdownV2 porque un solo punto de
interpolación sin escapar (de los ~15 repartidos en 6 archivos) reintroduce el mismo bug. Además:
un fallo de envío ahora queda registrado de forma persistente en `jarvis_event_log`
(`log_event("TELEGRAM_FAIL", ...)`, reusa la tabla de Fase B5, visible en `JarvisDebugPanel`) en
vez de solo en el log efímero de Docker.

**Verificado** contra el bot real y un chat_id real: el mensaje que antes daba 400 ahora llega
completo (confirmado por el usuario en Telegram); una falla forzada (token inválido) quedó
registrada y consultable en `jarvis_event_log`.

**Deploy al homelab: pendiente** — código listo y verificado en local/contra la API real de
Telegram, pero no desplegado todavía (paso aparte, a pedido del usuario).

---

## Deploy al homelab — Ingestión Automática de Agenda en producción (2026-09-04)

Hecho por el orquestador directamente (sync acotado, mismo patrón que el deploy de la
pregunta abierta del 03/09): la feature de 0.3 (sesión "Ingestión Automática: Agenda de SGR",
ver abajo) estaba completa y verificada en local/scratch pero nunca desplegada. Backup previo
(`~/backups/pre-agenda-deploy-20260904-192600/` en el homelab, jarvis.db+vault+chroma,
confirmado con contenido) → sync de `jarvis/` completo vía `tar`/SSH (incluye
`jarvis/ingestion/agenda.py` nuevo, confirmado presente post-sync) → rebuild de imagen →
`docker-compose up -d --no-build`.

**Verificado post-restart**: `RestartCount=0` en los 3 contenedores — el fix de la condición
de carrera en `_migrate()` (sesión del 01/09) sigue sosteniendo el arranque concurrente sin
crashear, ahora con una migración más (columna `origin_source`/`origin_source_key` +
`'agenda'` en el `CHECK` de `source`). `GET /jarvis/health` → `worker_alive: true`. Ambos
cambios de schema confirmados en el `jarvis.db` real del homelab. Sin errores en logs de
backend/worker.

El 6to paso de `run_consolidation()` (lectura de Agenda vía `GET /agenda/eventos`/
`GET /agenda/tareas` de la API real de SGR, propuestas `PENDING` en `jarvis_capture_proposals`)
va a correr contra datos reales por primera vez en la próxima corrida diaria del homelab.

---

## Sesión "Ingestión Automática: Agenda de SGR" (2026-09-03) — 0.3 implementado

Implementa la propuesta aprobada el mismo día en la sesión anterior ("Jarvis
0.2→0.3", ver abajo) — detalle completo de diseño, decisiones resueltas y
verificación en `Cerebro/decisiones-implementacion.md`, entrada "IMPLEMENTADO:
0.3, Ingestión Automática desde Agenda de SGR".

**Qué hace**: sexto paso de `jarvis/worker/consolidation.py::run_consolidation()`
(mismo gating diario que el resto del job) — lee eventos ya terminados y
tareas ya completadas de la Agenda de SGR de los últimos
`JARVIS_AGENDA_INGESTION_WINDOW_DAYS` días (default 7) vía
`GET /agenda/eventos`/`GET /agenda/tareas` (HTTP localhost, sin credenciales
nuevas) y propone una fila `PENDING` en `jarvis_capture_proposals` por cada
evento/tarea todavía no propuesto — nunca eventos futuros, nunca escribe en
Agenda, nunca escribe en `memory_entries` directo. Se acepta/rechaza por
Telegram o desktop exactamente igual que cualquier otra propuesta de captura
pasiva (mismo `accept_proposal()`/`reject_proposal()`,
`jarvis/captures/passive.py`, ahora con un cuarto valor `source='agenda'` en
`memory_entries` para las aceptadas).

**Archivo nuevo**: `jarvis/ingestion/agenda.py`. Tocados:
`jarvis/db/schema.py`, `jarvis/db/database.py` (migración nueva de
`memory_entries.source`), `jarvis/worker/task_manifest.py` (2 operaciones
nuevas), `jarvis/config.py`, `jarvis/captures/passive.py`,
`jarvis/worker/consolidation.py`, `jarvis/pyproject.toml`. Sin cambios de
frontend (reusa el banner genérico de propuestas ya existente).

**4 decisiones subespecificadas por la propuesta, resueltas con criterio
conservador y documentadas explícitamente** (detalle completo en
`Cerebro/decisiones-implementacion.md`): zona horaria naive-local de Agenda
vs. UTC-aware del resto de Jarvis; `agenda_tareas` no tiene columna de fecha
de completado real (se usa `fecha_opcional` como proxy, tareas completadas
sin fecha quedan fuera de 0.3); eventos recurrentes comparten `id` entre
ocurrencias (clave de dedup incluye `fecha_inicio`); y un gap real del
documento (dedupear solo contra `memory_entries.source_id` no respetaba un
rechazo explícito del usuario — se agregó dedup también contra
`jarvis_capture_proposals` sin mirar status).

**Bug real encontrado y arreglado ANTES de tocar cualquier DB real**:
`jarvis/db/schema.py` nunca tenía `last_audited_at` en el `CREATE TABLE`
estático de `memory_entries` (solo vivía en una migración runtime) — hacía
que cualquier migración de rebuild de esa tabla que corriera después de que
una DB real ya tuviera esa columna fallara. Ver detalle en decisiones.

**Incidente real durante la verificación**: un primer intento de levantar el
backend real de SGR para poder consultar Agenda real corrió, como efecto
colateral de `import app.main`, la migración de Jarvis (con el bug de arriba
todavía sin arreglar) contra `project/database/jarvis.db` de producción.
`memory_entries` nunca se tocó (falló antes del rename, `integrity_check` OK,
22 filas intactas), pero quedó una tabla `memory_entries_new` vacía y
huérfana. Backup completo tomado de inmediato (`project/database/
backup-pre-0.3-agenda-incident-20260903-210637/`, contenido confirmado) →
tabla huérfana dropeada → `integrity_check` OK. Toda la verificación
posterior (incluida la ingestión real) se hizo contra una copia scratch del
backup, con el backend de SGR real pero Jarvis sandboxeado a rutas scratch
(`JARVIS_DB_PATH`/`JARVIS_VAULT_PATH`/`JARVIS_CHROMA_PATH`). Detalle completo
y feedback enviado sobre el patrón de riesgo en decisiones-implementacion.md.

**Verificado con Agenda real del usuario** (backend de SGR real corriendo,
Jarvis sandboxeado a scratch — nunca `jarvis.db` de producción): migración
limpia sobre una copia del backup real (22 filas preservadas, sin tablas
huérfanas, idempotente); ingestión real encontró 16 eventos reales pasados
(parciales de julio-agosto) y creó 16 propuestas; segunda corrida sin
duplicar (dedup); `accept_proposal()`/`reject_proposal()` reales sobre
propuestas de Agenda (la aceptada generó `memory_entries.source='agenda'`
correcto y quedó encolada en `inbox_queue`; ninguna de las dos se
repropuso en una tercera corrida); canal `telegram` probado aparte (chat_id
seteado, best-effort de notificación falló sin tumbar nada, sin token real
en el entorno); filtro "ya pasó" probado con 5 casos sintéticos de borde;
filtro de tareas completadas probado con 4 casos sintéticos (la Agenda real
no tenía ninguna tarea completada en este momento). `python -m py_compile`
limpio en los 6 archivos tocados/nuevos.

**No desplegado al homelab en esta sesión** — paso aparte, a pedido
explícito.

---

## Sesión "Jarvis 0.2→0.3" (2026-09-03) — cierre de 0.2 + propuesta de diseño de 0.3

Dos fases de rigor distinto, pedidas explícitamente separadas.

### Fase A — 0.2 cerrada: Obsidian wikilinks reales + PII detector completo

Las dos piezas que `jarvis-spec.html` §29 listaba para 0.2 ("Obsidian sync",
"PII detector completo") y que habían quedado sin hacer. **Implementadas,
verificadas con Ollama real contra DB/vault de scratch (nunca `jarvis.db`
real), documentadas en `Cerebro/decisiones-implementacion.md`** (dos
entradas completas, mismo día — ahí está el detalle de diseño, los
trade-offs descartados y la verificación caso por caso).

**Wikilinks reales** (`jarvis/vault/index_writer.py` nuevo +
`jarvis/vault/writer.py` extendido): cada entrada vinculada a una entidad/
proyecto conocido ahora escribe una sección `## Vinculado a` con
`[[wikilinks]]` reales al final de su `.md`; cada entidad/proyecto gana una
nota canónica propia en `INDEX/ENTITIES/`/`INDEX/PROJECTS/` (carpetas
nuevas, separadas de `PEOPLE/`/`PROJECTS/` que ya guardaban entradas
individuales) con una sección "Menciones" que enlaza de vuelta a todas sus
entradas vigentes — abrir `vault/` en Obsidian ya no da un grafo vacío.
Sincronizado en los 3 puntos donde el código toca el vault de una entrada
(pipeline normal, editar, olvidar). Backfill nuevo:
`python -m jarvis.cli.backfill_vault_links` (reescribe entradas vigentes ya
existentes que tienen vínculos, recrea las notas canónicas desde cero) —
**no corrido todavía contra la DB/vault reales** (ni local ni homelab), a
propósito, mismo criterio que toda sesión anterior con datos reales; es un
paso aparte si el usuario lo pide.

**Bug real encontrado y arreglado verificando el backfill**:
`write_entry()` sin `title` explícito re-derivaba el nombre de archivo de
`content_raw` en vez de reusar el ya asignado — creaba un `.md` huérfano
nuevo y dejaba el archivo real (el que SQLite sigue referenciando) sin
actualizar. Reproducido con Ollama real antes del fix (huérfano confirmado),
y de nuevo después (0 huérfanos). Efecto colateral: también corrige el
mismo bug latente que ya tenía `_resync_vault_only()` (editar solo tags).

**Gap real encontrado y documentado, NO arreglado** (fuera de alcance
explícito de esta pieza): `memory_entities` y `memory_projects` son dos
catálogos sin reconciliar — un mismo nombre real (ej. "SGR") puede
detectarse como entidad-organización Y como proyecto a la vez, apareciendo
dos veces en `## Vinculado a` con dos notas canónicas distintas. Confirmado
en vivo. Reconciliar los dos conceptos es una decisión de diseño más grande
que no se pidió acá.

**PII detector completo** (`jarvis/privacy/gateway.py` extendido): 3
categorías nuevas de PII sensible — documentos de identidad (CUIT/CUIL
formato fijo; DNI solo con palabra clave cerca, para evitar falsos
positivos de números sueltos), cuentas/tarjetas financieras (CBU/CVU de 22
dígitos; número de tarjeta con checksum de Luhn real, no cualquier
secuencia larga), y contexto de salud (heurística de palabras clave,
confianza menor y documentada como tal). Mismo criterio que los secretos ya
existentes: bloquea el FRAGMENTO que sale como contexto RAG al LLM externo
(`filter_context()`), nunca la captura en sí — deliberadamente NO bloquea
nombres de personas ni contenido personal en general (el tipo `PEOPLE` sigue
siendo el lugar correcto para eso). Verificado con casos reales (CUIT/DNI/
CBU/tarjeta real, y confirmando que contenido personal normal ["José vive en
Rosario..."] NO se bloquea) — no necesita Ollama, es regex puro.

No se tocó frontend en la Fase A — no aplica `npm run build`.

### Fase B — 0.3 (Ingestión Automática): propuesta APROBADA, todavía sin
implementar

**Aprobada por el usuario tal cual, sin cambios, el mismo día** — queda
lista para que una sesión futura la implemente directamente (ver punto 5
de la entrada en `decisiones-implementacion.md`, "qué falta para poder
implementar esto"), sin tener que volver a proponerla ni confirmarla.

**Ningún código nuevo en esta sesión** — pedido explícito de la tarea: 0.3 es el primer
salto a contenido/credenciales que no son 100% del usuario tipeando a mano,
así que esta sesión entrega diseño, no implementación. Propuesta completa
en `Cerebro/decisiones-implementacion.md` (entrada
"PROPUESTA (sin implementar, pendiente de aprobación): 0.3, Ingestión
Automática — arrancando por Agenda de SGR", mismo día, mismo formato que la
propuesta de auditoría proactiva del 31/08).

Resumen de la propuesta:
- **Fuente para arrancar: Agenda de SGR** (no Google Calendar externo, no
  email, no GitHub, no documentos) — vía la API ya existente
  (`GET /agenda/eventos`, `GET /agenda/tareas`), no acceso directo a
  `app.db`. Argumento central: es la única de las 4 lecturas de "calendario"
  sin contenido de terceros (lo escribió el propio usuario en la UI de SGR)
  y sin credenciales nuevas — mejor esfuerzo/valor para este usuario
  puntual, y sienta base directa para 0.4 ("Agenda/Finanzas/Hábitos como
  fuentes de contexto").
- **Credenciales**: ninguna nueva hace falta para Agenda (HTTP localhost sin
  auth). Para cuando se agregue una fuente que sí las necesite: reusar el
  patrón `.env` + `os.getenv()` que ya usa todo Jarvis, nada nuevo — Infisical
  sigue diferido a 0.5 según ya estaba decidido.
- **Blast radius explícito**, mismo principio que
  `jarvis/worker/task_manifest.py`: solo puede leer 2 endpoints de la API de
  SGR, nunca escribe en Agenda, nunca hace otro request externo, y NUNCA
  escribe en `memory_entries` directo — solo puede crear filas `PENDING` en
  `jarvis_capture_proposals` (reusando la tabla de captura pasiva), la misma
  confirmación humana por Telegram/desktop de siempre antes de que algo se
  vuelva memoria real.
- **Descartado a propósito, con motivo**: email (mayor riesgo de contenido
  no confiable + credenciales reales, sin la pieza de admisión que
  `Componentes-Evaluados.md` ya marca como prerequisito), GitHub (mismo
  problema de credenciales, sin señal de que sea relevante para este
  usuario hoy), documentos/archivos locales (alcance de lectura sin acotar
  todavía, necesita su propia sub-propuesta).

**Aprobada.** La próxima sesión que la tome puede implementar directamente
sin volver a confirmar nada de lo de arriba.

---

## Deploy al homelab — pregunta abierta exploratoria en producción (2026-09-03)

Hecho por el orquestador directamente (sync acotado, sin sesión aparte): la feature de
"Sesión 2026-09-03 (2)" (ver abajo) estaba completa y verificada en local pero nunca
desplegada. Backup previo (`~/backups/pre-openq-deploy-20260903-110105/`, jarvis.db+vault+chroma,
confirmado con contenido) → sync de `jarvis/` completo vía `tar`/SSH → rebuild de imagen
(`numpy==1.26.4` confirmado) → `docker-compose up -d --no-build`. **Sin wipe de DB** — a
diferencia del deploy grande del 01/09 y del reseed de prueba, esta vez no se tocó
`jarvis_policies`, así que el `debug_chat_id` recordado sobrevivió intacto y no se repitió el
bug de canal `desktop` documentado en la corrección de más abajo (ese bug fue consecuencia
específica de un wipe, no un riesgo general de deploy).

**Verificado post-restart**: `RestartCount=0` en los 3 contenedores (`backend`/`worker`/`bot`) —
confirma en producción real que el fix de la condición de carrera en `_migrate()` (ver sesión
de abajo) sostiene el arranque concurrente de los 3 procesos sin crashear. `GET /jarvis/health`
→ `worker_alive: true`. `open_question` confirmado dentro del `CHECK` de
`jarvis_audit_proposals` en el `jarvis.db` real. Sin errores en logs de backend/worker; un
único reintento transitorio de healthcheck del bot al arrancar (conexión reseteada mientras el
backend terminaba de levantar), autoresuelto.

---

## Sesión 2026-09-03 (2) — pregunta abierta exploratoria cuando no hay nada más que reportar

Extiende `run_consolidation()` con un quinto paso, hermano y separado de
los huecos A/B/C existentes (que siguen intactos): cuando una corrida no
encuentra NADA de las 4 categorías del reporte diario (pairwise/stale/
backfill de tags/hallazgos de auditoría -- ver
`jarvis/worker/consolidation.py::_nothing_to_report()`), Jarvis aprovecha
para hacer una pregunta genuinamente exploratoria sobre el usuario, sus
entidades o proyectos, en vez de quedar en silencio ese día. Diseño
completo (jerarquía de fallback, por qué `open_question` es un
`action_type` nuevo y no reusa `clarify`, gating de dos variables
independientes) en `Cerebro/decisiones-implementacion.md`, misma fecha.

**Jerarquía de fallback, dos niveles** (`jarvis/audit/service.py::
maybe_ask_open_question()`): 1) entidad `person` mencionada exactamente 1
vez (por debajo del umbral `memory_count>=2` del hueco tipo A) -- hay una
entrada real de la que colgar la pregunta; 2) si no hay ninguna (memoria
vacía, el caso motivador, o toda entidad ya tiene 2+ menciones), pregunta
de arranque genérica de una lista chica fija, elegida al azar.

**Gating**: `JARVIS_OPEN_QUESTION_ENABLED` (bool, default `true`) +
`JARVIS_OPEN_QUESTION_COOLDOWN_DAYS` (int, default `2`) en
`jarvis/config.py` -- dos variables independientes a propósito (apagar el
mecanismo entero vs. ajustar la frecuencia, nunca mezcladas). Cooldown vía
`jarvis_policies` (`policy_type='open_question_last_asked'`), mismo patrón
que `consolidation_last_run`.

**Resolución**: noveno `action_type` en `jarvis_audit_proposals`
(`'open_question'`, migración de schema `_migrate_audit_proposals_
action_type()` en `jarvis/db/database.py`, mismo patrón que
`_migrate_audit_proposals_status()`) -- se resuelve idéntico a `clarify`
(la respuesta de texto libre ES el contenido nuevo, mismo criterio de
negativo/afirmativo) pero vive en su propio tipo para no forzar dos formas
distintas (con/sin entrada concreta) dentro de la semántica de `clarify`,
y para poder saltear el dedup normal en la variante de arranque (que
usaría siempre la misma clave `target_entry_ids=[]` y quedaría bloqueada
para siempre después de la primera vez -- `_create_open_question_
proposal()` sin dedup, solo para ese caso).

**Integración con el reporte diario**: la pregunta (o su ausencia, con
motivo explícito -- no aplica hoy / ENABLED=0 / cooldown / error) aparece
DENTRO del mismo mensaje de Telegram de la corrida (`_section_open_
question()`, una sección más de `_build_report_sections()`), nunca como
un ping de Telegram desconectado aparte -- pedido explícito de la tarea.

**Verificado con Ollama real (`gemma3:12b` local, sin `OPENAI_API_KEY`)
contra DBs de scratch, 8 escenarios** (nunca `jarvis.db` real): base
vacía → nivel 2 + cooldown bloqueando la repetición inmediata; entidad de
1 mención (Lucía, agregada a `jarvis/cli/seed_test.py`) → nivel 1;
`ENABLED=0` y cooldown pre-existente bloqueando con motivo explícito;
responder con texto real → entrada nueva creada Y vinculada a la entidad
(confirmado con `SELECT` directo); responder "no sé" → rechazo limpio,
sin entrada; `run_consolidation()` completo en DB mínima (quiet day) →
pregunta disparada y confirmada dentro del texto del reporte armado;
`run_consolidation()` completo con el dataset entero de 19 entradas (el
mismo que ya dispara pairwise real en sesiones anteriores) → día NO
quieto, sección explica "no aplica hoy" en vez de disparar. `python -m
py_compile` limpio en los 6 Python tocados, `npm run build` del frontend
limpio (label nuevo en `JarvisBrowsePanel.jsx`, cosmético).

**No desplegado en el homelab en esta sesión** -- a propósito: el homelab
real tiene 2 propuestas `PENDING` reales esperando respuesta del usuario
en su Telegram real desde el cierre de la sesión anterior; ejercitar
`run_consolidation()` ahí habría mutado datos reales y mandado mensajes de
Telegram sin que fuera parte de lo pedido. Toda la verificación quedó en
DBs de scratch locales. Deploy al homelab (sync + rebuild + restart) queda
como paso aparte si el usuario lo pide.

---

## Corrección 2026-09-03 (3) — las 2 propuestas de auditoría del homelab NUNCA llegaron a Telegram (quedaron en channel='desktop')

El usuario reportó que en su Telegram real solo tenía los 4 mensajes de la
sesión anterior (3 partes del reporte + el ping de "Verificación tarea 4")
y ninguna de las 2 preguntas individuales de auditoría que esa sesión
documentó como "esperando respuesta en el Telegram real del usuario" (ver
la entrada de abajo, punto 4). Esa afirmación era **incorrecta** —
diagnosticado por SSH directo al homelab (`ssh mtopas@192.168.137.10`,
disponible y funcional en este entorno pese a notas de sesiones anteriores
que decían lo contrario):

**Causa real**: al resembrar la DB, el worker arrancó y `should_run()`
disparó una corrida automática de `run_consolidation()` (sin `consolidation_
last_run` previo) ANTES de que se restaurara `debug_chat_id` -- confirmado
en `docker-compose logs worker`: `"[consolidation] Sin chat_id de Telegram
configurado... reporte solo queda en el log"`. En ese momento
`run_audit()` calculó `channel = "desktop"` (sin chat_id) y creó las 2
propuestas (`delete` de la entrada vacía, `create` de José) con
`channel='desktop', channel_id=NULL` -- confirmado con una query directa a
`jarvis_audit_proposals` en el homelab. La SEGUNDA corrida (forzada
después de restaurar el chat_id, la que sí mandó los 3 mensajes de reporte
reales) no volvió a crear estas 2 propuestas porque `_already_exists()`
deduplica por `action_type + target_entry_ids` **sin mirar el canal** --
así que quedaron atascadas para siempre en `desktop` aunque después sí
hubiera un chat de Telegram real disponible. `desktop` solo se resuelve
por polling del frontend (`GET /jarvis/audit-proposals`) o API directa,
nunca por el bot de Telegram -- de ahí que nunca aparecieran en el chat.

**Fix aplicado (manual, una vez, sobre datos reales)**: `UPDATE
jarvis_audit_proposals SET channel='telegram', channel_id=<chat_id real>
WHERE id IN (...)` sobre las 2 filas + `send_telegram_message()` con el
mismo texto que hubiera mandado `_push_created()` originalmente --
ejecutado vía `docker-compose exec worker python3 -c "..."` en el
homelab, reusando `jarvis.debug.service.get_debug_chat_id()`/`jarvis.
notify.telegram.send_telegram_message()` tal cual, sin código nuevo.
**Confirmado recibido por el usuario en su Telegram real** (los 2 mensajes
nuevos, uno de la entrada vacía y otro de José).

**Gap de diseño real, no arreglado en código todavía** (queda documentado
para que no se repita en silencio si vuelve a pasar): cualquier propuesta
de auditoría creada mientras `debug_chat_id` no está disponible todavía
queda huérfana en `channel='desktop'` para siempre, incluso después de que
un chat de Telegram real exista -- el dedup de `_already_exists()` no
distingue canal, así que nunca se vuelve a intentar por Telegram. Esto
solo puede pasar en la ventana entre "el worker arranca/corre por primera
vez tras un wipe" y "se restaura/establece `debug_chat_id`" -- no debería
repetirse en operación normal (una vez seteado, `debug_chat_id` persiste).
Si se quiere blindar esto en código, la corrección natural sería que
`_push_created()` (o un sweep aparte) reintente re-canalizar propuestas
`PENDING` con `channel='desktop'` hacia `telegram` apenas haya un chat_id
disponible -- no implementado, no pedido explícitamente todavía.

---

## Sesión 2026-09-03 — fix de migración concurrente + reporte diario completo + dataset real en el homelab

Cuatro piezas, cada una dependiente de la anterior. Detalle de diseño completo
de las piezas 1 y 2 en `Cerebro/decisiones-implementacion.md` (mismo día).

**1) Fix del crash real de `_migrate()` (RestartCount=1 en `project-bot-1`,
2026-09-01)** — `_add_column_if_missing()` nueva en `jarvis/db/database.py`:
mismo estándar que `_migrate_people_type()` (chequear `PRAGMA table_info`
después de un fallo, nunca interpretar la excepción). Las 6 migraciones
`ALTER TABLE ... ADD COLUMN` de `_migrate()` pasan ahora por este helper.
Reproducido ANTES del fix contra una DB de scratch con 6 procesos reales
(`multiprocessing`, no threads) × 15 corridas: 54/90 corridas crashearon con
`duplicate column name`. Mismo repro contra el código con el fix: 0/90
errores. Documentado en `HOMELAB.md` y `Cerebro/decisiones-implementacion.md`.

**2) Reporte diario completo de consolidación por Telegram** — antes solo se
empujaba un mensaje si la auditoría generaba una propuesta; ahora
`run_consolidation()` manda SIEMPRE un reporte (varios mensajes si hace
falta, `jarvis/notify/telegram.py::send_report()`, límite ~4096 chars/
mensaje) con detalle completo de los 5 pasos: entradas analizadas + tags,
cada par pairwise evaluado (contenido A/B, similitud, veredicto, acción o
"sin acción"), stale por edad, backfill de tags, y auditoría (bloque por tag
+ bloque random, con sus entradas/tags y cada hallazgo del LLM o "sin
hallazgos" explícito). `jarvis/audit/service.py`, `jarvis/worker/
consolidation.py`, `jarvis/tags/service.py` (`get_tags_for_entry()` nuevo,
compartido, reemplaza el `_current_tag_names()` duplicado de audit).
Verificado con Ollama real (fallback local, sin `OPENAI_API_KEY`) contra una
DB de scratch antes de tocar el homelab.

**3) Dataset de prueba migrado al homelab real (reemplazo total)** — backup
de las 15 entradas reales previas en
`~/project/database/backup-jarvis-20260903-093629/` en el propio homelab
(jarvis.db + vault + chroma, contenido confirmado antes de wipe: 17 filas en
`memory_entries`, 17 archivos en vault). Contenedores parados
(`docker-compose stop backend worker bot`), wipe de `jarvis.db`/`vault/`/
`chroma/`, reseed vía `docker-compose run --rm worker python -m
jarvis.cli.seed_test` (embeddings reales via Ollama en Windows por ICS,
`192.168.137.1:11434` — nunca inventados). `jarvis/cli/seed_test.py` extendido
(no existían antes en el script, solo "a mano" en una sesión de pruebas
anterior): par José (`jose_cafe`/`jose_favor`, dispara hueco tipo A) y
`seed_empty_entry()` (entrada con contenido vacío, insertada directo por SQL
sin pasar por el pipeline de embeddings). Dataset resultante: 19 entradas
(las 14 originales + par de contradicción remoto/oficina + par José + 1
vacía). `jarvis/` (único código tocado en piezas 1/2) sincronizado al
homelab vía `tar` a `~/jarvis` (sibling de `~/project`, ver HOMELAB.md);
imagen `sgr-app:latest` reconstruida con `docker build --network=host`;
stack completo reiniciado sin errores de migración (confirma la pieza 1 en
producción real, no solo en el repro).

**4) Verificación de punta a punta, con entrega real confirmada por el
usuario** — al arrancar el worker con la DB recién sembrada, `should_run()`
disparó una corrida automática de `run_consolidation()` (sin `consolidation_
last_run` previo) ANTES de que hubiera un `chat_id` de Telegram disponible
(se había perdido con el wipe) -- esa primera corrida solo quedó en el log.
Restaurado el `debug_chat_id` previo al wipe (mismo valor, copiado del
backup, con aprobación explícita del usuario tras un bloqueo del
clasificador de permisos) y forzada una segunda corrida directa. Resultado
real, no simulado: **3 mensajes de Telegram** (6307 caracteres totales),
confirmados recibidos por el usuario. La corrida detectó y reportó
**ambos** pares de contradicción vigentes: `contradiccion_remoto`/
`contradiccion_oficina` (sim=0.871) Y **Madrid/Buenos Aires** (sim=0.748) —
este último es el caso de falso positivo ya documentado (el par es
`same_fact` según el criterio del prompt, pero el modelo externo lo marcó
`contradiction` en esta corrida real) -- reportado tal cual en el mensaje,
sin ocultarlo, tal como pedía la tarea. Auditoría real: **2 propuestas
`PENDING` quedaron esperando respuesta en el Telegram real del usuario**
(`delete` para la entrada vacía, `create` para José a partir de sus 2
menciones) -- no resueltas por el agente, quedan para que el usuario
responda cuando quiera. Verificación adicional de entrega: llamada directa
a la Bot API de Telegram (`sendMessage`) con el mismo `chat_id`/token
devolvió `ok: true` con `message_id` real.

**Nota de seguridad de la sesión**: un `cat`/`sed` mal armado para leer
`project/.env` expuso brevemente `TELEGRAM_BOT_TOKEN`/`OPENAI_API_KEY`
reales en la salida de una herramienta (el patrón de redacción no
matcheaba el formato real de las líneas). Reportado al usuario en el
momento; decidió no rotar las credenciales. Feedback del bug de redacción
enviado vía `SendFeedback`.

---

## Respuestas de texto libre con información nueva en jarvis_audit_proposals — implementada (2026-08-31)

Generaliza a las 7 acciones que no son `clarify` (ver sección de abajo,
"Auditoría proactiva de memoria") el criterio que `clarify` ya usaba: una
respuesta de texto libre a una propuesta individual PENDING que no es un
"no" limpio ni un "sí" limpio trae información real, que antes se perdía
(se trataba como "rechazo con motivo", el motivo se logueaba y nada más).
Detalle completo caso por caso, trade-offs y alternativas descartadas en
`Cerebro/decisiones-implementacion.md`, entrada del mismo día
("IMPLEMENTADO: respuestas de texto libre con información nueva en
jarvis_audit_proposals").

**Resumen de la resolución por acción** (no las 8 se resuelven igual):
`clarify` sin cambios; `create`/`edit` incorporan el texto nuevo al
contenido que ya iban a aplicar (`ACCEPTED` con contenido enriquecido);
`flag_contradiction`/`flag_connection`/`merge` crean una entrada
independiente nueva sin tocar las entradas objetivo (`RESOLVED_WITH_NEW_INFO`
— nunca se adivina automáticamente cuál entrada vieja invalidar);
`retag`/`delete` amplían/rellenan la entrada objetivo misma vía
`edit_entry()` en vez de aplicar la mutación propuesta (`retag` no saca el
tag señalado; `delete` no borra).

**Status nuevo**: `RESOLVED_WITH_NEW_INFO` agregado al `CHECK` de
`jarvis_audit_proposals.status` (antes: `PENDING/ACCEPTED/REJECTED/EXPIRED`)
— distingue "se descartó" de "se aplicó lo propuesto" de "se resolvió con
información distinta a la propuesta". Migración de schema vía
`_migrate_audit_proposals_status()` (mismo patrón de reconstrucción de
tabla que ya usaba `_migrate_people_type()` para `memory_entries.type`,
`jarvis/db/database.py`).

**Vinculación determinística**: `_link_new_entry_to_targets()` nueva
(`jarvis/audit/service.py`) vincula la entrada nueva a las entidades ya
conocidas de las entradas OBJETIVO del hallazgo (no del texto de la
respuesta) vía `link_entities_for_entry()` — reemplaza la dependencia
implícita de que el texto repita el nombre. Aplicada también al camino
normal de `create`/`clarify` (mejora chica, documentada, no solo a los
casos nuevos).

**Archivos tocados**: `jarvis/audit/service.py` (`resolve_individual_reply()`
nueva — punto de entrada único que reemplaza la interpretación que antes
vivía repartida en el bot; funciones `_resolve_*` por acción;
`_link_new_entry_to_targets()`/`_target_entities()`), `jarvis/db/schema.py`
(quinto valor de status), `jarvis/db/database.py`
(`_migrate_audit_proposals_status()`), `project/mybot/jarvis_handlers.py`
(`_resolve_individual_audit_proposal()` reescrita para delegar en el
servicio en vez de reimplementar sí/no/motivo), `project/frontend/src/
components/jarvis/JarvisBrowsePanel.jsx` (color nuevo en
`AUDIT_STATUS_COLORS`). No toca `jarvis/captures/passive.py` ni
`jarvis/captures/clarification.py` (fuera de alcance explícito).

**Verificado con Ollama real** (`gemma3:12b` local, mismo dataset de
`jarvis/cli/seed_test.py`, DB de scratch — nunca `jarvis.db` real):
21 checks contra propuestas armadas a mano (mismo patrón que la sesión
anterior para las ramas que el LLM no genera solo), cubriendo las 8
acciones:
- `flag_contradiction` con el caso motivador exacto (par
  `contradiccion_remoto`/`contradiccion_oficina` del dataset — "100%
  remoto" vs. "100% presencial" — respuesta "Ninguna, ahora trabajo
  freelance sin oficina fija"): entrada nueva creada con el texto tal
  cual, `origin_trust=telegram.user`, `created_by=jarvis_proposal_accepted`,
  proposal `RESOLVED_WITH_NEW_INFO` con `entry_id` seteado, **las dos
  entradas viejas no se tocan** (`valid_to` sigue `NULL`).
- `flag_contradiction` con "no" limpio → `REJECTED` normal (regresión).
- `flag_connection` con información nueva sobre el par de Martín Suárez →
  entrada nueva vinculada correctamente a la entidad "Martín Suárez" (vía
  `_link_new_entry_to_targets()`, no por repetición de nombre en el
  texto).
- `merge` con información nueva → entrada nueva creada, entrada vieja
  **no** superseded.
- `create` con información nueva → `ACCEPTED`, contenido = borrador +
  "Aclaración: …", `origin_trust=telegram.user` (no el `system`/mínimo del
  borrador original), entidad vinculada.
- `edit` con información nueva → `ACCEPTED`, `entry_id=None` (igual que
  `edit` normal), contenido de `keep_entry_id` actualizado, `supersede_
  entry_id` con `valid_to` seteado.
- `retag` con el ejemplo real ("no, es sobre el homelab, pasa siempre que
  reiniciamos el servidor de golpe") → `RESOLVED_WITH_NEW_INFO`,
  `entry_id` = la misma entrada, contenido ampliado, **el tag señalado
  sigue** (no se sacó).
- `delete` con texto real → `RESOLVED_WITH_NEW_INFO`, entrada rellenada
  con el texto (no se borró).
- `clarify` sin cambios de comportamiento: "no sé" sigue rechazando
  (criterio legacy preservado), texto real sigue creando la entrada y
  ahora además queda vinculada a la entidad de la entrada objetivo.
- Dedup y reintento sobre propuesta ya resuelta (`not_found`) verificados.

`run_audit()` completo corrido una vez de punta a punta contra el mismo
scratch DB (6 propuestas nuevas generadas, 0 errores) — confirma que la
detección existente no se rompió con los cambios de este día.

**Sugerencia abierta, no implementada** (pedido explícito del usuario: alcance
acotado a `jarvis_audit_proposals`, esto queda como nota, no como cambio):
el mismo patrón ("una respuesta que no es sí/no limpio trae información
real") aplica en espíritu a `jarvis_capture_proposals` (captura pasiva,
`jarvis/captures/passive.py`) y al flujo de aclaración de `DECISION`
(`jarvis/captures/clarification.py`) — ambos hoy ya capturan CUALQUIER
texto libre como aclaración/contenido (no tienen el bug de "rechazo con
motivo" que sí tenía audit), así que no están rotos, pero tampoco
distinguen "sí" limpio de "trae información nueva que debería ir aparte"
como ahora sí hace audit para `flag_contradiction`/`flag_connection`/
`merge`. Si en el futuro se quiere ese mismo nivel de distinción ahí
también, es una decisión aparte que hay que pedir explícitamente.

## Auditoría proactiva de memoria — implementada (2026-08-31)

Implementación de la propuesta aprobada ese mismo día en
`Cerebro/decisiones-implementacion.md` ("PROPUESTA (sin implementar,
pendiente de aprobación): auditoría proactiva de memoria en
consolidation.py", con las decisiones abiertas resueltas post-aprobación).
Extiende `consolidation.py` con un cuarto paso: en vez de solo comparar
PARES de alta similitud de embedding, corre auditorías sobre bloques de
memoria (uno por tag, uno genuinamente random sobre toda la memoria vigente)
buscando huecos, contradicciones, duplicados, conexiones entre temas
distintos y tags mal puestos — con 8 acciones posibles
(crear/aclarar/marcar contradicción/marcar conexión/fusionar/editar/
eliminar/retagear), todas gateadas por confirmación vía Telegram o desktop
(nunca se aplica nada solo), reusando el patrón de propuestas
(`jarvis_proposal_accepted`) ya establecido por captura pasiva.

**Archivos nuevos**: `jarvis/audit/service.py` (módulo completo — selección
de bloques, detección de huecos, revisión por LLM, dedup, aplicación de las
8 acciones, flujo de mensaje agrupado por Telegram).

**Archivos tocados**: `jarvis/db/schema.py` (tabla `jarvis_audit_proposals`),
`jarvis/db/database.py` (migración `memory_entries.last_audited_at`),
`jarvis/config.py` (`JARVIS_AUDIT_BLOCK_SIZE`,
`JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS`, `JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES`),
`jarvis/worker/task_manifest.py` (`audit_memory`, `propose_audit_action`),
`jarvis/worker/consolidation.py` (cuarto paso, mismo gating de 24h),
`jarvis/worker/main.py` (sweep de vencimiento de propuestas de auditoría,
mismo patrón que captura pasiva), `jarvis/api/router.py`
(`GET /jarvis/audit-proposals[?status=all|<status>]`,
`GET /jarvis/audit-proposals/isolated`,
`POST /jarvis/audit-proposals/{id}/accept|reject`),
`project/mybot/jarvis_handlers.py` (`handle_pending_audit_proposal()`,
resuelve tanto propuestas individuales como el mensaje agrupado numerado),
`project/mybot/bot.py` (wireado en `handle_message`, después de captura
pasiva). Frontend: `useStore.js` (+6 acciones nuevas), `JarvisProposalBanner.jsx`
(unificado — captura pasiva y auditoría comparten el mismo banner, decisión
ya resuelta), `JarvisScreen.jsx` (polling), `JarvisBrowsePanel.jsx` (tab
"Auditoría" dentro de Explorar: historial de propuestas + hueco tipo B).

**5 decisiones que el documento dejó abiertas o inconsistentes, resueltas
acá con criterio propio (reportadas explícitamente, no en silencio — ver el
docstring completo de `jarvis/audit/service.py` para el detalle de cada
una)**:
1. El prompt de bloque ya no ofrece `gap_needs_entry` como tipo de hallazgo
   -- se solapaba con la detección SQL del hueco tipo A (punto 3 del doc),
   habría generado propuestas "create" duplicadas por dos caminos distintos.
2. La acción `delete` (una de las 8 aprobadas) no tenía disparador propio en
   el documento -- se implementó exclusivamente para el único caso
   objetivamente determinable sin LLM: contenido vacío/en blanco.
3. El costo de los llamados de síntesis de `create` (uno por hueco de
   entidad) no estaba presupuestado en el punto 5 del doc -- capado a
   `_ENTITY_CREATE_LIMIT=3`/corrida.
4. El "mínimo" `origin_trust` para una entrada `create` requiere un orden
   total entre los 5 valores del CHECK que el schema nunca definió -- se
   construyó uno (`_TRUST_RANK`) con `web.untrusted` estrictamente el más
   bajo.
5. Cuando hay varias propuestas individuales (no agrupadas) PENDING para el
   mismo chat a la vez (el documento asumía como máximo una, igual que
   captura pasiva), una respuesta de texto libre en Telegram resuelve la más
   VIEJA primero (FIFO) — `get_pending_individual_proposal_for_channel()`.
   La tabla `jarvis_audit_findings` de la primera versión del documento
   también se eliminó del diseño final (ver la entrada de PROPUESTA, ya
   actualizada) — `jarvis_audit_proposals` sola cubre el registro completo.

**Verificado con Ollama real (`gemma3:12b` vía `JARVIS_REASON_MODEL` externo
con fallback ya incorporado, `nomic-embed-text` para embeddings) contra una
DB de scratch** (nunca `jarvis.db` real durante las pruebas): dataset de
`jarvis/cli/seed_test.py` + 2 entradas nuevas de una persona ("José")
mencionada 2 veces sin entrada PEOPLE propia + una entrada vacía a mano.
Una corrida real de `run_audit()` generó correctamente: `create` (José, con
contenido sintetizado solo de lo ya escrito), `flag_contradiction` (el par
madrid/baires — el mismo par que la sesión anterior determinó que es
`same_fact`, no contradicción; el audit lo marcó como contradicción de
todos modos, confirmando en vivo el riesgo de falso positivo ya documentado
y la razón por la que el audit nunca aplica nada solo), `flag_connection` y
`edit` (duplicado con combinación) entre un par de Martín Suárez, y
`delete` para la entrada vacía. Segunda corrida confirmó dedup (no
duplicó ningún hallazgo ya resuelto). Los 8 `accept_proposal()` (incluidas
las 3 ramas que el LLM no generó naturalmente esa corrida — `merge`,
`retag`, `clarify` con y sin respuesta — probadas con propuestas armadas a
mano) mutaron la DB correctamente: `create`/`clarify` con
`created_by='jarvis_proposal_accepted'`, `merge`/`edit` marcando `valid_to`
en la entrada vieja, `delete` soft-deleting, `retag` removiendo solo el tag
señalado, `flag_contradiction`/`flag_connection` sin tocar `confidence` ni
ninguna otra columna. Mensaje agrupado de Telegram (`build_grouped_message`/
`resolve_grouped_reply`) probado con "sí 1,3", "no 2", "no" (todo), "todas"
(bare) y el caso sin nada pendiente. `expire_stale_proposals()` confirmado:
nunca aplica nada al vencer. `run_consolidation()` completo (los 4 pasos
juntos) corrido una vez sin errores. Los 4 endpoints nuevos probados con
`TestClient` de FastAPI, incluyendo los 404 esperados y el dedup vía API.
`npm run build` del frontend limpio.

**Desplegado en vivo**: migración aplicada a `project/database/jarvis.db`
real (aditiva, sin tocar datos — la migración solo agrega la columna y la
tabla nuevas); backend, worker y bot reiniciados con el código nuevo. El
audit no corrió todavía contra la memoria real (el gating de 24h de
`should_run()` ya tiene la corrida de hoy registrada de la sesión anterior)
— la próxima corrida diaria lo va a ejercer por primera vez contra datos
reales, no simulados.

**No probado en este entorno**: la UI en navegador real (`claude-in-chrome`
no conecta, mismo motivo de siempre — SSH remoto) ni el flujo de Telegram de
punta a punta con un chat real (el bot está corriendo y el handler está
wireado, pero no se disparó ninguna propuesta real todavía por el gating de
24h mencionado arriba).

---

## Referencias (no específicas de Jarvis)

- **Acceso al homelab** (SSH, IPs, deploy, troubleshooting de red) → `HOMELAB.md` (raíz del
  repo). No duplicado acá a propósito, para no tener dos fuentes de verdad — ese archivo es la
  única fuente real.

## Contradicción real calibrada con datos + channel_id hardcodeado sacado de raíz (2026-08-31)

Cierre de las dos sugerencias que quedaron abiertas de la sesión del 28/08. Detalle
completo de diagnóstico en `Cerebro/decisiones-implementacion.md` (misma fecha).

- **Camino `contradiction` de consolidación, probado por primera vez con datos
  reales**: agregado al dataset de prueba (`jarvis/cli/seed_test.py`) un par de
  afirmaciones simultáneas e incompatibles, sin ningún lenguaje de cambio en el
  tiempo y con el mismo `recorded_at` a propósito ("Soy 100% remoto..." / "Soy
  100% presencial..."). Coseno real: **0.871** (dato de calibración nuevo, mismo
  formato que el 0.898/0.748/0.54–0.59 de la sesión anterior). Confirmado con
  Ollama real: ambas entradas bajan `confidence` a la mitad (1.0→0.5) y el
  conflicto queda logueado en `jarvis_policies` (`policy_type=
  'consolidation_conflict'`).
- **Bug real encontrado y arreglado**: a diferencia de `same_fact` (que marca
  `valid_to` — estado terminal), `contradiction` no cambia nada en ninguna de las
  dos entradas, así que el MISMO par sin resolver se re-detectaba en cada corrida
  siguiente y se re-penalizaba cada vez — confirmado en vivo: 2 corridas seguidas
  bajaron confidence de 1.0 a 0.5 y de 0.5 a 0.25, con el log de conflictos
  acumulando un duplicado idéntico por corrida. Fix: `_pair_already_conflicted()`
  nuevo en `consolidation.py` — si el par ya fue logueado antes, se omite (no
  re-penaliza, no re-loguea). Verificado: tercera corrida sobre el mismo par
  dio `conflicts: 0`, confidence se mantuvo en 0.25, sin fila nueva en el log.
- **`channel_id="web"` hardcodeado en `query_endpoint`** (mismo patrón del bug
  de "borrar historial" ya cerrado) sacado de raíz: ahora genera un
  `channel_id` único por llamada (`web-implicit:{uuid}`) cuando no llega
  `conversation_id` — nunca más un string compartido que pueda reenganchar con
  la conversación de otro caller. El frontend real nunca lo ejercita (siempre
  crea el chat primero), así que es cambio de robustez de la API, no un fix
  visible en la UI. Verificado contra el backend real: `channel_id` guardado en
  la DB confirma el formato nuevo.
- **Bug adicional no planeado, encontrado reiniciando el worker al final de la
  sesión**: `/jarvis/health` volvió a dar `worker_alive: false` con el worker
  realmente corriendo (confirmado con `py-spy dump` sobre el proceso real —
  estaba dormido en el `time.sleep()` normal del loop, nunca colgado). Causa:
  el `write_heartbeat()` arreglado el 28/08 (poda de heartbeats viejos)
  insertaba sin pasar `created_at` explícito — la única escritura a
  `jarvis_policies` en todo el código que no lo hace — así que quedaba en
  manos del `DEFAULT (datetime('now','utc'))` del schema, que genera un
  formato de texto distinto ("2026-08-31 20:22:33", con espacio) al que usa
  el resto del sistema ("...T17:22:33+00:00", con "T"), y encima un valor de
  reloj distinto (~3h de diferencia en este entorno). El `DELETE` de poda que
  agregué el 28/08 compara ese `created_at` contra un cutoff en formato
  Python — con la misma fecha calendario, la comparación de strings da
  "menor" siempre (el espacio ordena antes que "T"), sin importar la hora
  real, así que cada heartbeat se borraba a sí mismo en la misma transacción,
  todos los días. Fix: `created_at` explícito en el mismo formato que el
  resto del sistema. Verificado: heartbeat sobrevive la escritura,
  `worker_alive` vuelve a `true`, y una fila genuinamente vieja (insertada a
  mano con 2h de antigüedad) sigue podándose correctamente.
  la DB confirma el formato nuevo, único por llamada.

Backup del dataset de prueba (previo a estos cambios) en
`project/database/backup-testseed-20260831-140324/` — **no restaurado**, Telegram
y web siguen sirviendo el dataset de prueba a propósito. Backend, worker y bot
quedaron corriendo de nuevo con el código nuevo.

---

## Fix del bug de ranking del retriever + 4 mejoras chicas (2026-08-28)

Sesión de testing con dataset sembrado (embeddings reales, `jarvis/cli/seed_test.py`)
encontró un bug real de ranking en la búsqueda híbrida y varios puntos de mejora
menores. Detalle completo de diagnóstico y decisiones en
`Cerebro/decisiones-implementacion.md` (misma fecha). Resumen de qué cambió:

- **`jarvis/retriever/retriever.py`** — el filtro coarse de tipo (`where={"type":...}`
  en la query de ChromaDB) podía excluir de raíz una entrada del tipo correcto de la
  respuesta; el rescate léxico (`_merge_lexical_only`, pieza E) que debía compensar
  eso siempre la agregaba al final de la lista sin importar cuán fuerte fuera su
  score léxico. Fix: el rescate ahora calcula una similitud real (`_fetch_similarities`)
  y compite por `_rank_score` real contra el resto, mezclado y reordenado, no
  apendiceado ciegamente. De paso se encontró y arregló un segundo bug menor:
  `_fts_query_terms()` no filtraba conectores comunes ("qué", "actualmente", "con"...),
  así que una palabra funcional podía "ganar" el ranking léxico por casualidad —
  ahora hay una lista de stopwords en español.
- **`jarvis/config.py`** — ahora llama `load_dotenv()` al importarse. El worker
  standalone (`python -m jarvis.worker.main`) nunca cargaba `project/.env` (a
  diferencia de `app/config.py`/`mybot/api_config.py`, que sí lo hacían) — esto
  hacía que `OPENAI_API_KEY`/`JARVIS_REASON_MODEL` no llegaran nunca al proceso del
  worker, y en silencio degradaban siempre a modo local tres cosas: el razonamiento
  de consolidación (`call_reason` en `consolidation.py`), el aviso "✅ Listo" de
  Telegram tras procesar una captura, y el push de `/jdebugon` cuando lo dispara el
  worker.
- **`JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD`** bajado de 0.92 a 0.70 (config.py),
  con datos reales que lo justifican — ver decisiones-implementacion.md.
- **`jarvis/browse/service.py`** — `date_to` pelado ("2026-08-28", sin hora) excluía
  todas las entradas de ese mismo día por comparación de strings; ahora se normaliza
  a fin de día si no trae hora. (El frontend ya lo esquivaba enviando la hora, pero
  la API en sí estaba rota para cualquier otro consumidor.)
- **`jarvis/worker/heartbeat.py`** — poda heartbeats de más de 1h en cada escritura;
  `jarvis_policies` había acumulado >11.000 filas de heartbeat sin ningún consumidor
  que necesitara el historial (`get_worker_alive()` solo lee la última fila).
- **`jarvis/captures/passive.py`** — prompt de evaluación (`_EVAL_PROMPT`) ahora
  aclara que solo ve los mensajes del USUARIO (no la respuesta de Jarvis) y agrega
  regla + ejemplo explícito para que un bloque de puras preguntas del usuario no
  dispare una propuesta de captura (antes generaba una "memoria" resumiendo qué se
  preguntó, que no tiene valor real).

Todos los fixes verificados con Ollama real (`gemma3:12b`/`nomic-embed-text`) contra
el dataset de prueba sembrado en la sesión anterior (no `jarvis.db` de producción —
sigue en estado de prueba, ver el backup de esa sesión). `python -m py_compile`
limpio en los 6 archivos tocados.

## Paquete de mejoras — Fases D (mantenimiento de memoria), E (búsqueda híbrida) y F (pantalla Explorar) — CIERRE del paquete de 6 piezas (2026-08-27)

Cuarta, quinta y sexta piezas del paquete (ver entradas de las Fases A/B/C, abajo)
— con esto las 6 quedan **completas e implementadas**. Resumen de las 3 últimas y
cierre general al final de esta entrada.

### Fase D — mantenimiento de memoria (extensión de `consolidation.py`)

Sin job nuevo en paralelo — se extendió el job diario existente con dos pasos más.

**Duplicados cross-type**: `_find_similar_pairs()` agrupaba pares candidatos por
`(type, user_id)` antes de comparar similitud — dos entradas casi idénticas pero
clasificadas con tipos distintos (el clasificador no es determinista entre
capturas) nunca llegaban a compararse. Se refactorizó a un helper compartido
`_find_pairs_by_group(entries, group_key)` (evita duplicar la lógica de leer
embeddings + comparar coseno) y se agregó `_find_cross_type_similar_pairs()`
(agrupa solo por `user_id`, excluye explícitamente los pares de mismo tipo — esos
ya los cubre la función original, para no procesarlos dos veces). Mismo umbral
0.92, mismo `_resolve_pair()` — conecta directamente con el hallazgo ya
documentado (2026-08-26, "el umbral 0.92 probablemente nunca agrupa un
same_fact/contradiction real, solo casi-duplicados textuales") — terminar con
tipos distintos es una causa concreta de que un casi-duplicado real quedara
fuera del agrupamiento original.

**Backfill de tags del catálogo**: `_backfill_catalog_tags()`, capado a 20
entradas por corrida (mismo criterio de costo acotado que el resto del job,
volumen real ~20 capturas/día). Usa `jarvis.tags.service.entry_ids_without_
catalog_tags()` (pieza A) para encontrar entradas vigentes sin ninguna fila en
`memory_entry_tags`, y reusa `call_classify()` con el catálogo (mismo prompt que
la captura normal) — solo lee el campo `"tags"` del resultado, no re-clasifica
`type`/`project` de la entrada vieja.

`run_consolidation()` ahora corre: similares mismo-tipo → similares cross-type →
stale por edad → backfill de tags, todo en la misma corrida diaria. `summary`
gana el campo `"tagged"`.

### Fase E — búsqueda híbrida (léxica + densa) en el retriever

**Índice**: `memory_entries_fts` (FTS5, `tokenize='unicode61'`) + triggers
`AFTER INSERT/UPDATE OF content_raw,content_processed/DELETE` que lo mantienen
sincronizado, más un backfill idempotente de entradas preexistentes —
`jarvis/db/database.py::_init_fts()`, deliberadamente **fuera** de `SCHEMA`
(`executescript()` aborta todo el batch si una sentencia falla, y `CREATE
VIRTUAL TABLE...USING fts5` puede fallar en un SQLite sin el módulo compilado).
Confirmado que el SQLite de este entorno (3.39.4) sí trae FTS5; si no lo
tuviera, `_init_fts()` lo loguea y la señal léxica cae sola a un fallback LIKE
puro (`_lexical_candidates_like()`) — nunca bloquea nada más.

**Integración en `jarvis/retriever/retriever.py`**: `_lexical_candidates()`
(bm25 de FTS5, normalizado a 0..1) se suma como término **adicional** en
`_rank_score()` (`_LEXICAL_WEIGHT=0.15`, sobre la fórmula ya existente de
similitud+tipo+recencia — no se renormalizan los pesos existentes, tal como
pedía la tarea: "no reemplazar el ranking actual, sumar como señal adicional").
`_merge_lexical_only()` cierra el caso donde la búsqueda densa no trajo un match
léxico fuerte: si la lista quedó incompleta, rellena huecos; si ya está llena
de matches débiles, un match léxico fuerte (por encima de
`_LEXICAL_MERGE_THRESHOLD=0.4`) reemplaza la cola (peor-rankeada) de la lista.

**Bug real encontrado probando esta pieza y corregido en el momento**: con
exactamente UN resultado léxico, la normalización `(worst-rank)/(worst-best)`
colapsaba a `span=0 → score=0.0` (el peor score posible) para el ÚNICO match —
exactamente al revés de lo que debería pasar (ser el único resultado es la
señal más fuerte posible, no la más débil). Es el caso más común que esta
pieza está pensada para resolver (una palabra rara que solo matchea una
entrada), así que el bug habría vuelto la señal léxica inútil en la práctica
para su caso de uso principal. Fix: si `len(rows) == 1`, se le asigna score
`1.0` directo, sin pasar por la normalización de rango.

### Fase F — pantalla "Explorar" en /jarvis

Nuevo tab "Explorar" (dot violeta, mismo color que `PROJECT` — el único de los 5
colores de tipo que ningún tab usaba todavía) junto a Cerebro/Inbox/Entidades/Debug.

**Backend** — `jarvis/browse/service.py::browse_entries()`: filtra
`memory_entries` vigentes por `type`/`tag`/`project_id`/rango de fecha/texto
libre (`q`, reusa `_fts_query_terms()` del retriever en vez de duplicar la
lógica de armar la expresión MATCH), paginado (`limit`/`offset`). Devuelve
`{"total", "items"}` — el total sin paginar, para que el frontend pueda armar
"mostrando X de Y" y paginación real. `GET /jarvis/browse`.

**Frontend** — `JarvisBrowsePanel.jsx`: barra de filtros (texto, tipo, tag,
proyecto, rango de fechas) + lista paginada (25 por página) + click en una
entrada abre `JarvisSourceModal.jsx` (reuso directo — ya tenía el detalle
completo + las acciones de editar/olvidar de la pieza B, así que "Explorar"
hereda esas acciones gratis sin duplicar nada). `useStore.js` gana
`jarvisTags`/`fetchJarvisTags` (el catálogo de la pieza A nunca había tenido
consumidor en el frontend hasta ahora) y `jarvisBrowseResults`/
`fetchJarvisBrowse`.

---

## Cierre del paquete de 6 piezas (búsqueda/captura/organización/recuperación)

Las 6 piezas del paquete (A: catálogo de tags, B: editar/olvidar, C: captura
pasiva por inactividad, D: mantenimiento de memoria, E: búsqueda híbrida, F:
pantalla Explorar) quedan **completas** — código + verificación funcional con
Ollama real contra DBs de scratch para cada una (detalle en las entradas de
arriba y en `Cerebro/decisiones-implementacion.md`).

**Qué NO se hizo, a propósito** (explícitamente fuera de alcance, instrucción
de la tarea): Graphiti y ActivityWatch — ninguno de los dos se tocó ni se
evaluó de nuevo; sus criterios de entrada documentados en
`jarvis/Componentes-Evaluados.md` siguen sin cumplirse, no se encontró
evidencia real en el camino de que hicieran falta.

**Verificado en este entorno** (sin `claude-in-chrome`, mismo motivo ya
documentado repetidamente — SSH remoto): cada pieza probada individualmente
contra una DB de scratch aislada (nunca `jarvis.db` real) con **Ollama real**
(`gemma3:12b` para clasificación/evaluación, `nomic-embed-text` para
embeddings) — sin mocks del LLM en ningún test. Un ciclo completo del worker
(`_reset_stuck` → `_fetch_pending` → `process_entry` → `_maybe_run_
consolidation` → `_maybe_run_passive_capture`, los 4 jobs de fondo juntos en
una sola corrida) confirmado sin excepciones. Los ~20 endpoints nuevos/
modificados probados con `TestClient` de FastAPI, incluyendo los 400/404/409
esperados. `npm run build` del frontend limpio en cada pieza que tocó UI.
`python -m py_compile` sobre todos los archivos Python tocados.

**No probado en este entorno** (mismo patrón que toda sesión anterior sin
acceso a Chrome): la UI real en navegador (los 2 tabs nuevos — Explorar y el
banner de propuestas — y las acciones de editar/olvidar en `JarvisSourceModal`)
y el flujo de Telegram de punta a punta (propuesta pasiva empujada al chat +
respuesta del usuario interpretada). Backend y worker no se dejaron corriendo
en background al cierre de esta sesión (a diferencia de sesiones anteriores) —
el usuario debe levantarlos (`uvicorn`, `python -m jarvis.worker.main`) para
confirmar visualmente.

**Decisiones de diseño registradas en `Cerebro/decisiones-implementacion.md`**:
schema del catálogo de tags (pieza A), mecanismo de soft-delete vía `valid_to`
(pieza B), y la marca de origen `created_by` para captura pasiva vs. explícita
(pieza C) — con el razonamiento completo de por qué cada una se resolvió así.

---

## Paquete de mejoras — Fases B (editar/olvidar) y C (captura pasiva por inactividad) (2026-08-27)

Segunda y tercera piezas del mismo paquete de 6 (ver entrada de la Fase A, abajo).

### Fase B — corregir/olvidar una memoria mal guardada

**Problema**: el router tenía `GET /entries/{id}` pero ningún PATCH/DELETE — no había
forma de arreglar o eliminar algo mal guardado sin tocar la DB a mano.

**`jarvis/memory/service.py::edit_entry()`**: corrige contenido/tipo/tags de una
entrada ya guardada. Solo toca `content_processed`, nunca `content_raw` — el
original capturado queda inmutable como provenance; `content_processed` es lo que
ya usan vault/embeddings/RAG/UI para mostrar y recuperar. No permite tocar
`origin_trust`/`created_by`/`source_id` (describen CÓMO llegó la entrada, no algo
corregible a mano). Si cambia contenido o tipo, reescribe el `.md` del vault (el
tipo determina la subcarpeta — se borra el archivo viejo si el path cambió, vía
`vault/writer.py::delete_entry_file()` nuevo) y regenera+reupsertea el embedding —
llamada síncrona bloqueante a propósito (acción de administración poco frecuente,
no hot path del worker). El filename del `.md` sigue derivándose de
`content_raw` (título original) aunque el contenido mostrado ya sea el corregido —
quirk cosmético menor, aceptado (ver decisiones-implementacion.md).

**"Olvidar" — decisión de diseño**: soft-delete vía `valid_to` (mismo mecanismo
que `consolidation.py` ya usa para marcar `superseded`), nunca `DELETE` físico.
Con esto desaparece de retrieval/entidades/proyectos/tags **sin tocar una sola
línea de esos módulos** — todos ya filtran `valid_to IS NULL`. El embedding en
Chroma y el `.md` del vault quedan intactos a propósito (mismo criterio que
superseded): el vector puede seguir en el índice pero `_load_entries()` lo
descarta antes de rankear, así que nunca puede reaparecer. `jarvis/memory/
service.py::forget_entry()`.

**API**: `PATCH /jarvis/entries/{id}` (400 si el tipo es inválido o el contenido
queda vacío, 404 si no existe), `DELETE /jarvis/entries/{id}` (409 si ya estaba
olvidada/superseded, 404 si no existe).

**Frontend**: `JarvisSourceModal.jsx` (ya mostraba el detalle de una entrada — el
lugar natural) gana botones Corregir (lápiz) y Olvidar (tacho, con confirmación
inline antes de ejecutar) en el header, más un chip de tags en la vista de
lectura. `useStore.js`: `editJarvisEntry()`/`forgetJarvisEntry()`.

### Fase C — captura pasiva por inactividad

**Diseño**: job de fondo en el worker (`jarvis/captures/passive.py` +
`_maybe_run_passive_capture()` en `jarvis/worker/main.py`) que revisa
conversaciones inactivas (sin mensajes nuevos, de ningún rol, hace
`JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES` — default 20 min) con mensajes de
usuario sin revisar todavía, y le pide al modelo local (nunca el externo — misma
regla que `extract_entities()`/`needs_clarification()`, es clasificación barata)
evaluar si algo amerita guardarse. Si sí, crea una **propuesta** (`jarvis_capture_
proposals`, tabla nueva) en vez de guardar directo — el usuario la acepta (con o
sin aclaración) o la rechaza. La conversación se marca revisada siempre (haya o no
propuesta) para no re-evaluar el mismo texto en cada vuelta del scan.

**Decisión de diseño — marca de origen (`created_by`)**: columna nueva
`memory_entries.created_by` (`'explicit'` default | `'jarvis_proposal_accepted'`),
mismo vocabulario que `memory_projects.created_by` a propósito — generaliza un
patrón que ya existía en el código a una segunda tabla en vez de inventar uno
nuevo. **No se tocó `origin_trust`** para esto: esa columna describe la
confiabilidad de la FUENTE del texto (un mensaje de Telegram del usuario es
`telegram.user` se haya capturado con `/j` o vía propuesta aceptada); `created_by`
describe CÓMO se decidió guardarlo (un hecho que el usuario confirmó a propósito
vs. uno que Jarvis infirió de una charla casual). Son ejes ortogonales — mezclarlos
en una sola columna hubiera perdido la distinción real que pedía la tarea.

**Canal de "pregunta"**: reusa el mismo patrón de aclaración pre-enqueue
(`jarvis/captures/clarification.py`) pero generalizado — la pregunta de una
propuesta va desde un simple "¿Guardo esto en tu memoria?" (confirmación) hasta
una pregunta real cuando el contenido detectado es ambiguo (ej. "¿guardo esto?
¿sobre qué exactamente tiene que confirmar Martín?"). Telegram recibe un push
activo (mensaje del worker); desktop/web es pull, mismo patrón que el inbox
(`GET /jarvis/proposals`, polling).

**Decisión de diseño — vencimiento sin `job_queue`**: a diferencia de la
aclaración de DECISION (que usa `context.job_queue.run_once()` de
python-telegram-bot para su timeout de 3 min), acá el vencimiento se resuelve con
un **sweep periódico del propio worker** (`expire_stale_proposals()`, default 30
min) en vez de un timer de PTB. Motivo: el worker y el bot de Telegram son
procesos separados — un `job_queue` vive en el proceso del bot, y la propuesta la
crea el worker, así que no hay forma de programar ese timer desde donde nace la
propuesta sin coordinación entre procesos. Un sweep reusa el mismo patrón que ya
usa todo el resto del sistema (retry de `inbox_queue`, consolidación diaria) sin
necesitar esa coordinación. Default al vencer: **se descarta**, no se guarda — al
revés de la aclaración de DECISION (que sí guarda sin razón al vencer) porque acá
lo opcional es el guardado en sí, no solo el razonamiento.

**Telegram** (`project/mybot/jarvis_handlers.py::handle_pending_passive_proposal()`,
wireado en `bot.py::handle_message` justo después de `handle_pending_clarification`):
"no"/variantes → rechaza; "sí"/variantes cortas → acepta tal cual; cualquier otro
texto → se toma como aclaración y se concatena antes de guardar (mismo criterio
que la aclaración de DECISION: una respuesta de texto libre a una pregunta
pendiente ES la respuesta). Consulta la propuesta pendiente por `chat_id` en la
DB (no en `context.user_data` — la creó el worker, otro proceso).

**API**: `GET /jarvis/proposals` (pendientes de `channel='desktop'`, para
polling), `POST /jarvis/proposals/{id}/accept` (body opcional `clarification`),
`POST /jarvis/proposals/{id}/reject`.

**Frontend**: `JarvisProposalBanner.jsx` nuevo — banner visible en cualquier tab
de `/jarvis` (no solo el chat, porque la propuesta puede venir de una conversación
vieja), con Guardar / Aclarar (abre un input) / Descartar. Polling cada
`JARVIS_POLL_MS` junto con el resto de los fetchers de `JarvisScreen.jsx`.

**`TaskManifest`** gana `read_conversations` y `propose_capture` — operaciones
que el diseño original ya autorizaba conceptualmente ("el worker puede leer
conversaciones y escribir en memory store") pero que hasta esta pieza nunca se
ejercían en código.

**Verificado con Ollama real (`gemma3:12b`) contra DBs de scratch** (no
`jarvis.db` real): Fase B — edición de contenido+tipo+tags con reescritura de
vault (viejo archivo borrado, nuevo con frontmatter correcto) y embedding
regenerado (`retrieve()` devuelve el contenido corregido), tipo inválido rechazado,
`forget_entry()` excluye la entrada de `retrieve()`/tags y rechaza un segundo
"olvidar" sobre la misma entrada. Fase C — conversación con contenido sustancioso
("decidimos migrar a Postgres...") generó una propuesta real, aceptada con
`created_by='jarvis_proposal_accepted'`; conversación de chit-chat puro ("dale,
gracias") correctamente **no** generó ninguna propuesta (el modelo la descartó);
conversación reciente (no inactiva) excluida del scan; segunda vuelta del scan no
re-propone lo ya revisado; reject y expire probados aparte. Los 8 endpoints nuevos
(`PATCH`/`DELETE /entries/{id}`, `GET /tags`, `GET /tags/{name}`, `GET /proposals`,
`POST /proposals/{id}/accept|reject`) probados con `TestClient` de FastAPI contra
una DB de scratch, incluyendo los 400/404/409 esperados. `npm run build` del
frontend limpio. **No probado en este entorno**: flujo real por Telegram de
punta a punta (push de la propuesta + respuesta del usuario) ni la UI en
navegador real (`claude-in-chrome` no conecta, mismo motivo ya documentado) — el
usuario puede confirmarlos contra `:5173`/el bot real.

---

## Paquete de mejoras búsqueda/captura/organización/recuperación — Fase A: catálogo de tags (2026-08-27)

Primera de 6 piezas de un paquete grande (A–F, en orden de dependencia) surgido de una
sesión de brainstorming: A) catálogo de tags, B) editar/olvidar una memoria, C) captura
pasiva por inactividad, D) mantenimiento de memoria (extensión de consolidation.py),
E) búsqueda híbrida (léxica + densa) en el retriever, F) pantalla "browse" en /jarvis.
Detalle de diseño completo de las 6 en `Cerebro/decisiones-implementacion.md`.

**Problema que resuelve**: `memory_entries.tags` se llenaba en cada captura desde S1
(prompt del clasificador, `jarvis/llm/client.py`) pero nunca se leía de vuelta —
cada entrada inventaba sus propios tags sueltos sin canonizar, así que "tags" nunca
sirvió como eje de navegación ni de filtro.

**Schema** (`jarvis/db/schema.py`): `memory_tags` (tabla canónica) +
`memory_entry_tags` (tabla puente) — mismo patrón que `memory_entities`/
`memory_entry_entities` de Slice 3, sin `UNIQUE(name)` a propósito (dedup
case-insensitive en código, igual que `_find_or_create_entity()`). Migran solo por
`CREATE TABLE IF NOT EXISTS` (tablas nuevas, sin necesidad de rebuild).

**Servicio nuevo `jarvis/tags/service.py`**: `list_tag_catalog(user_id, limit=60)` —
catálogo ordenado por uso (más usados primero) para interpolar en el prompt del
clasificador; `link_tags_for_entry()` — dedup exacto case-insensitive, crea el tag
si no existe (sin la fusión difusa por prefijo de tokens que usa el merge de
entidades — un tag es una keyword suelta, no un nombre propio con variantes; la
elección semántica del catálogo ya la hace el propio clasificador viendo el prompt,
no hace falta adivinar sinónimos a nivel DB); `list_tags_with_counts()` y
`get_entries_for_tag()` para la API; `entry_ids_without_catalog_tags()` para el
backfill de la Fase D.

**Clasificador catálogo-aware** (`jarvis/llm/client.py::call_classify()`): gana un
parámetro opcional `tag_catalog: list[str]`; si se pasa, el prompt agrega un bloque
"Catálogo de tags ya existentes (preferí elegir de acá...)" — mismo criterio
conservador que `_find_or_create_entity()`: solo inventa un tag nuevo si ninguno del
catálogo encaja razonablemente. Sin catálogo (`None`/`[]`), comportamiento idéntico
al de antes.

**Worker** (`jarvis/worker/processor.py`): antes de clasificar, trae
`list_tag_catalog(user_id)` y se lo pasa a `call_classify()`; después de
`update_entry(tags=...)`, llama `link_tags_for_entry()` en su propio try/except
(mismo patrón best-effort que entidades/proyecto — no puede fallar el procesamiento
normal). `TaskManifest` gana la operación `link_tags` (+ `read_conversations` y
`propose_capture`, preparadas para la Fase C).

**API**: `GET /jarvis/tags` (catálogo con conteo), `GET /jarvis/tags/{name}`
(entradas vinculadas, 404 si no existe) — mismo patrón que `/jarvis/entities`.

**Columnas nuevas preparadas para la Fase C** (agregadas en esta misma pasada de
schema porque tocaban los mismos archivos): `memory_entries.created_by` (`'explicit'`
| `'jarvis_proposal_accepted'`, mismo vocabulario que `memory_projects.created_by` a
propósito) y `conversations.last_passive_review_at`. Migración vía
`ALTER TABLE ... ADD COLUMN ... CHECK (...)` — confirmado que la versión de SQLite de
este entorno sí soporta `CHECK` en `ADD COLUMN` (con fallback sin `CHECK` si
`OperationalError`, para SQLite viejo). Aún sin usar por ningún flujo — la lógica de
captura pasiva es la Fase C.

**Verificado con Ollama real (`gemma3:12b`, `nomic-embed-text`) contra una DB de
scratch** (no `jarvis.db` real): dos capturas relacionadas ("SQLite vs Postgres para
Jarvis" y "seguimos con SQLite para Jarvis") — la segunda reusó exactamente
`jarvis`/`sqlite`/`homelab` del catálogo creado por la primera, sin inventar
sinónimos nuevos para el mismo concepto. Migración probada por separado contra una
DB con el shape viejo (sin `created_by`/`last_passive_review_at`/tablas de tags)
construida a mano: `init_db()` no lanza, las columnas y tablas nuevas aparecen, la
fila preexistente conserva `created_by='explicit'` por default, y el `CHECK` nuevo
rechaza un valor inválido (confirma que el `ALTER ... CHECK` realmente tomó efecto,
no que se ignoró en silencio).

---

## Mejoras_Jarvis.md — multi-chat web + causa raíz del "recuerdo fantasma" + markdown/lenguaje natural/fuentes/debug (2026-08-26)

Los 9 puntos de `Mejoras_Jarvis.md` (raíz del repo), investigados uno por uno
antes de tocar código (nunca se asumió la causa que proponía el usuario) e
implementados. Detalle completo de la investigación y las decisiones de
schema en `Cerebro/decisiones-implementacion.md` ("Mejoras_Jarvis.md:
multi-chat web + causa raíz del 'recuerdo fantasma' + ..."). Resumen de cómo
quedó clasificado cada punto:

**Resueltos como features de UI/UX:**
- **Multi-chat web** (crear/renombrar/eliminar, contexto propio por chat,
  Telegram sin tocar) — la pieza más grande, con schema nuevo: columna
  `title` en `conversations` (ya existía la tabla, se le agregó en vez de
  crear una `chats` en paralelo) + `jarvis/chats/service.py` +7 endpoints en
  `jarvis/api/router.py`. `JarvisChatTabs.jsx` nuevo (tira de chats arriba de
  los mensajes, con crear/renombrar inline/eliminar).
- **Fecha/hora por mensaje** — `conversation_messages.created_at` ya existía
  pero no se exponía; ahora viaja al frontend y se hornea como marca relativa
  ("[hace 2 días]") dentro del historial que recibe el modelo, para que pueda
  referirse a cuándo dijo algo el usuario.
- **Markdown renderizado** — `react-markdown` nuevo (dependencia agregada a
  propósito, se evaluó y descartó parsear a mano), con componentes
  restyleados al tema oscuro de Jarvis. Antes se veía `**texto**` literal.
- **Fuentes clickeables** — `GET /jarvis/entries/{id}` nuevo +
  `JarvisSourceModal.jsx` (mismo patrón visual que `JarvisCaptureModal.jsx`):
  clickear un chip de fuente en el chat abre el contenido completo de esa
  entrada de memoria.
- **Lenguaje natural, no citas textuales** — prompt del sistema en
  `jarvis/query/service.py` tocado para pedir síntesis conversacional en vez
  de listar/citar en negrita. Mejora de prompting, no un bug — el modelo
  puede seguir variando en cuánto la respeta (ver limitación abajo).

**Bug real confirmado y arreglado:**
- **Debug se cortaba en mensajes viejos** — el frontend pedía
  `GET /jarvis/events?limit=20` fijo sin forma de pedir más (el backend ya
  soportaba hasta 200). Fix: botón "cargar más" + límite como estado,
  centralizado en `jarvisPalette.js`.

**Bug real confirmado y arreglado — causa raíz, no un parche puntual:**
- **"El chat ignora instrucciones recientes / arrastra contexto viejo tras
  borrar historial" + "Jarvis recordó a Carolina sin que quedara guardada
  como PEOPLE" + "el Inbox parece no actualizarse"** — investigados como tres
  reportes separados, resultaron ser **la misma causa**: todo el chat de
  escritorio compartía un único `channel_id` constante (`"web"`) en el
  backend, así que "borrar historial" (que solo limpiaba `localStorage` del
  lado del cliente) nunca desconectaba de verdad de la conversación real —
  el próximo mensaje volvía a reengancharse a la misma fila de siempre, con
  todo su historial. El texto de Carolina nunca se guardó como memoria (se
  escribió en el chat de **consulta**, no en captura — nunca pasó por
  `extract_entities()`); que Jarvis lo "recordara" venía de ese historial de
  conversación filtrado, no de una entidad fantasma. El Inbox nunca tuvo bug
  real (probado end-to-end): parecía estático porque no hubo ninguna captura
  real que procesar en ese momento. El multi-chat cierra esto en el schema —
  cada chat nuevo tiene un `channel_id` propio y único, nunca el string
  compartido — verificado con una prueba directa (un chat nuevo nunca trae
  historial de otro).

**Limitación de comportamiento del modelo, documentada para no prometer un
"arreglo" que no existe:** incluso con el contexto ya aislado
correctamente, un LLM (sobre todo el de fallback local) puede seguir sin
respetar con precisión una instrucción reciente dentro de una misma
conversación activa — es una limitación inherente de cómo pesan las
instrucciones en un prompt largo, no algo que un fix de código elimine del
todo.

**Verificado en este entorno** (sin `claude-in-chrome` — mismo motivo ya
documentado, SSH remoto): `npm run build` limpio; smoke tests contra DB de
scratch (aislamiento entre chats, los 7 endpoints nuevos vía `TestClient`,
`query()` completo con `call_reason` mockeado confirmando mensajes limpios
`{role,content}` sin fugas de key); **contra la DB real**
(`project/database/jarvis.db`, backend+worker reiniciados a propósito porque
`jarvis/` vive fuera de `project/` y `--reload` no lo vigila) — migración de
`title` corrida limpia sobre 24 mensajes reales preexistentes, creación/
rename/delete de un chat de prueba con limpieza al final, `GET
/jarvis/entries/{id}` contra una entrada `DECISION` real. **No probado en
este entorno**: una consulta real de punta a punta con el modelo
externo/local respondiendo, para confirmar en la práctica el tono
conversacional y el render de markdown — backend y worker quedaron
corriendo con el código nuevo para que el usuario lo confirme en su
navegador.

---

## Rediseño visual de /jarvis — confirmado visualmente, COMPLETO (2026-08-26)

Cierra el único punto pendiente de la re-implementación (entrada siguiente, más abajo): el
punto 2 de la "Regla de cada fase" (`PLAN-IMPLEMENTACION.md` línea 60, verificación visual en
navegador) nunca se pudo cumplir vía `claude-in-chrome` — la extensión no conectó en ninguna
sesión. Investigado el motivo con el usuario: no es un bug de la extensión, es una limitación de
arquitectura — *native messaging* de Chrome es estrictamente local (mismo SO/proceso), y el
usuario trabaja desde una laptop conectada por VS Code Remote-SSH a esta PC, con Chrome corriendo
en la laptop, no en la PC donde corre Claude Code. No hay forma soportada de sortear esto sin
abrir Chrome directamente en la PC (remoto/VNC) o correr Claude Code local en la laptop.

En su lugar, el usuario abrió `http://127.0.0.1:5173/jarvis` directamente en su navegador y
confirmó el resultado ("está lindo, dejémoslo así") sin señalar ningún defecto puntual — no se
hizo la pasada exhaustiva fase por fase con capturas que pedía el plan (cambio de tema x6, memory
leak del canvas al salir/entrar de `/jarvis`, responsive en viewports angostos), pero sí una
confirmación visual real y explícita del usuario, que es el criterio que importa.

**Rediseño visual de Jarvis: COMPLETO.** Queda pendiente, sin bloquear nada (ya documentado antes,
sin cambios): `jarvis_policies` acumulando heartbeats de B6 sin rotación; composer de captura y
consulta sin unificar (decisión de producto diferida a propósito). No se repite acá el detalle de
QA fina de Fase 7 (contraste por tema, memory leak) — si en el futuro se nota algo raro
navegando `/jarvis` largo rato, revisar eso primero.

---

## Re-implementación completa contra PLAN-IMPLEMENTACION.md + PLAN-IMPLEMENTACION-BACKEND.md (2026-08-26)

La sesión del rediseño visual (entrada siguiente, más abajo) se hizo **sin conocer** los dos
planes formales que ya existían en `ClaudeDesign - Jarvis/` (`PLAN-IMPLEMENTACION.md`, frontend
fases 0–7; `PLAN-IMPLEMENTACION-BACKEND.md`, backend fases B0–B7) — nunca se buscaron porque solo
se hizo `Glob` de `.html`, no de `.md`. Auditado fase por fase a pedido del usuario, se encontraron
divergencias reales de arquitectura y de decisiones ya cerradas (no solo cosméticas). Esta entrada
documenta la re-implementación completa hecha para cerrar ambos planes tal cual están escritos,
con dos decisiones tomadas con el usuario antes de empezar: **Fase B5 con tabla nueva
`jarvis_event_log`** (no tail de archivo), y **Fase B6 incluida** (heartbeat real del worker).

### Backend

- **B0 — Centralización de config** (sin cambiar ningún default, verificado): umbrales de
  consolidación (`_SIMILARITY_THRESHOLD`/`_STALE_DAYS`/`_STALE_CONFIDENCE`), delays de reintento
  del worker, ratio LOW del budget, y los pesos de la fórmula de ranking del retriever
  (`_SIMILARITY_WEIGHT`/`_TYPE_WEIGHT_FACTOR` para el caso normal, `_TIEBREAK_*` aparte para el
  desempate de `recency_first` — no se fusionaron pese a compartir valores 0.5, distinta
  intención) pasan a vivir en `jarvis/config.py` vía env vars, documentadas en `.env.example`.
- **B1 — `GET /jarvis/stats/types`** (nuevo `jarvis/stats/service.py`): reemplaza al `/jarvis/stats`
  agregado en la sesión anterior (que mezclaba counts+cola+errores+último-procesado, forma que
  ningún plan pedía) — ahora es solo `{tipo: count}`, tal como pide B1, para el panel izquierdo.
- **B2 — `GET /jarvis/projects`** (`jarvis/projects/service.py::list_projects_with_activity()`):
  devuelve `memory_count`/`last_activity` crudos — **ya no calcula `heat`** en el backend (antes sí,
  divergencia real encontrada en la auditoría); el heat se normaliza del lado del frontend.
- **B3 — Entidades enriquecidas** (`jarvis/entities/service.py::list_entities()`): ahora incluye
  `notes`, `memory_count` y `types` (lista de tipos distintos vinculados) — cierra el gap que la
  sesión anterior había documentado como "limitación aceptada".
- **B4 — Budget por modelo** (`jarvis/budget/tracker.py::spent_today_by_model()`): desglose real
  por modelo con un campo `role` (`reason`/`local`/`other`) resuelto comparando contra
  `JARVIS_REASON_MODEL`/`JARVIS_LOCAL_MODEL`/`JARVIS_LOCAL_FALLBACK_MODEL` — única comparación de
  ese tipo en todo el sistema, el frontend solo mapea `role` a la etiqueta visible.
- **B5 — Log real del worker** (retomada, decisión: tabla nueva): `jarvis_event_log` (schema +
  índice por `created_at`), `jarvis/events/service.py` (`log_event()` best-effort — nunca lanza,
  probado con un `entry_id` inexistente para confirmar que el `FOREIGN KEY` fallido se traga sin
  romper nada — y `list_recent_events()`), y 5 puntos de instrumentación reales en
  `jarvis/worker/processor.py::process_entry()` (`CLASSIFY`, `ENTITY` si hubo extracción, `LINK`
  si hubo proyecto, `EMBED`, `ERROR` en el except general). `GET /jarvis/events` nuevo.
- **B6 — Heartbeat real** (`jarvis/worker/heartbeat.py`, módulo separado de `worker/main.py` a
  propósito porque ese archivo configura logging global al importarse): `write_heartbeat()` llamada
  al tope de cada vuelta del loop del worker; `GET /jarvis/health` → `{"worker_alive": bool}`. El
  health indicator del sub-header ya no deriva de `jarvisBudget.status` (simplificación de la
  sesión anterior, nunca documentada como tal pese a que el plan lo pedía) — ahora es señal real.
- **B7 — QA + `.env.example`**: `.env.example` documenta las 6 variables nuevas (B0+B6). QA de
  regresión: los endpoints existentes (`/jarvis/query`, `/jarvis/capture`, `/jarvis/inbox`,
  `/jarvis/entities/{name}`) no cambiaron de forma ni comportamiento — confirmado por curl.

**Verificado con datos reales** (worker + backend corriendo, sin mocks): captura real de prueba
procesada de punta a punta → `jarvis_event_log` recibió las 3 filas esperadas (`CLASSIFY`,
`ENTITY`, `EMBED` — `LINK` no aplicó porque esta captura no tenía proyecto asociado, comportamiento
correcto) con timestamps y mensajes reales; `GET /jarvis/health` pasó de `false` (worker apagado) a
`true` en cuanto se arrancó `python -m jarvis.worker.main`, confirmando el heartbeat real.
`GET /jarvis/query` sobre "¿Qué sé sobre React?" siguió citando correctamente
`useCallback - React` (mismo resultado que el QA de Slice 2 documentado más abajo) — confirma que
el refactor de pesos de ranking (B0) no cambió el comportamiento del retriever. La entrada de
prueba se borró al final (DB — `memory_entries`/`inbox_queue`/`jarvis_event_log`/
`memory_entry_entities` — + vault + embedding de Chroma), sin dejar rastro en la memoria real.

### Frontend

- **Fase 0**: `utils/jarvisPalette.js` nuevo — única fuente de los 5 colores de tipo, 4 de estado
  de inbox, 3 de nivel de budget, anchos de layout, cantidad de barras de budget, duraciones de
  animación, defaults del canvas, y el intervalo de polling. `styles/jarvis.css` nuevo — los 5
  `@keyframes` y `.jv-root` movidos fuera de `index.css` (confirmado con `grep` que ningún
  componente fuera de `jarvis/` los usaba). `NeuralCanvas.jsx` renombrado a
  `JarvisNeuralBackground.jsx`, ahora con props `density`/`pulseSpeed` configurables (antes
  constante fija).
- **Fase 1**: `JarvisSubBar.jsx` nuevo, extraído del sub-header que antes vivía inline en
  `JarvisScreen.jsx` — tabs, budget widget (12 barras, no 14 — se siguió el número literal del
  plan), health indicator ahora leyendo `jarvisHealth.worker_alive` real (B6). Store:
  `jarvisStats`→`jarvisTypeCounts`, nuevo `jarvisHealth`/`jarvisEvents` + sus fetchers.
- **Fase 2**: `JarvisChat.jsx` — el pill del composer es **fijo** ("PREGUNTA · va a retrieval"),
  sin la heurística `guessType()` que tenía la sesión anterior (esa heurística venía del prompt
  original de esa sesión, no de este plan, y el plan cierra explícitamente que el composer es
  solo-consulta sin heurística). Se **restauró el toggle colapsable de fuentes** (`SourcesToggle`
  con `open`/chevron) que la sesión anterior había reemplazado por fuentes siempre expandidas —
  el plan pedía mantener esa estructura intacta, solo restylearla.
- **Fase 3** (0% en la sesión anterior): `JarvisCaptureModal.jsx` restyleado por primera vez —
  paleta oscura de Jarvis en vez del tema SGR activo, burbuja de aclaración con el estilo "ask"
  (amber, dot parpadeante, "FALTA RAZONAMIENTO"). Lógica de captura/aclaración sin tocar.
  Fue posible confirmar que el modal nunca se abre fuera de `/jarvis` (la CTA que lo dispara solo
  está wireada en ese módulo), así que hardcodear la paleta oscura ahí es seguro.
- **Fase 4**: `utils/formatAge.js` nuevo — reemplaza 3 implementaciones distintas e inconsistentes
  de "edad relativa" que había antes (una mostraba HH:MM crudo sin relativizar). `JarvisRightPanel`
  renombrado a `JarvisContextPanel.jsx`, agrega la sub-sección de costo por modelo (B4) con
  mini-cards "GRANDE"/"CHICO" mapeadas desde `role`.
- **Fase 5**: `JarvisEntitiesTab` renombrado a `JarvisEntitiesPanel.jsx` — las cards ahora muestran
  nota, conteo real de memorias y dots por tipo (B3), cerrando el gap documentado antes como
  limitación aceptada.
- **Fase 6**: `JarvisDebugTab` renombrado a `JarvisDebugPanel.jsx` — "cola"/"errores"/"último
  procesado" se calculan del lado del cliente desde `jarvisInbox` (tal como pide la fase, sin
  backend nuevo para eso); el log ya no es el sustituto de `jarvisInbox` de la sesión anterior —
  ahora es el log real de B5 vía `GET /jarvis/events`.
- **Fase 7** (0% en la sesión anterior): responsive agregado a `JarvisScreen.jsx` con el mismo
  patrón ya usado en `FinanzasScreen.jsx` (`hidden md:block`/`hidden xl:block`, confirmado
  leyendo ese archivo) — grid de 1 columna en mobile, 2 desde `md` (agrega panel izquierdo), 3
  desde `xl` (agrega panel derecho). Anchos de columna vía CSS custom properties inline
  (`--jv-left-w`/`--jv-right-w`) leídas de `jarvisPalette.js`, con clases Tailwind de grid
  arbitrarias — confirmado que Tailwind las generó de verdad inspeccionando el CSS compilado.

**Verificado en este entorno**: `npm run build` sin errores; `grep` completo confirmando cero
referencias colgantes a los nombres viejos (`jarvisStats`, `JarvisRightPanel`, `JarvisEntitiesTab`,
`JarvisDebugTab`, `NeuralCanvas`) en todo `frontend/src`. **No verificado visualmente en
navegador**: la extensión `claude-in-chrome` no se conectó en ningún intento de esta sesión
(se reintentó varias veces a pedido del usuario) — backend y frontend quedaron corriendo en
background para que el usuario confirme visualmente el resultado.

**Auditoría posterior a pedido del usuario** (fase por fase contra ambos planes, ver
`decisiones-implementacion.md` para el detalle completo): encontradas y corregidas en el momento
3 inconsistencias de centralización que quedaron colgando de la re-implementación (un color
duplicado en vez de importado de `jarvisPalette.js`, y dos límites numéricos sin nombrar). También
quedó documentado que B0-B4 se probaron con `curl` contra la DB real en vez de una copia de
scratch (son `SELECT`, sin riesgo, pero diverge del método que pide el plan de backend), y que la
confirmación end-to-end de B6 dejó heartbeats reales acumulándose en `jarvis_policies` (esperado,
mismo patrón append-only que `consolidation_last_run`, sin rotación — no es un bug).

---

## Rediseño visual completo de /jarvis — tema oscuro, tabs, stats reales (2026-08-26)

El prompt de la sesión ("ClaudeDesign Implementacion") asumía que ya existían varios componentes
del rediseño visual de `/jarvis` (canvas neuronal, paneles izq/der, tabs Inbox/Entidades/Debug,
animaciones `jv-*`, campos nuevos del store) — al arrancar la sesión, ninguno de esos archivos
existía en el repo real (solo `JarvisChat.jsx`, `JarvisInboxPanel.jsx` y `JarvisCaptureModal.jsx`
con el estilo claro compartido de SGR). Se construyó todo desde cero siguiendo el mockup de
referencia `ClaudeDesign - Jarvis/Jarvis.dc.html` (encontrado en el repo, no en la ruta de
Downloads que mencionaba el prompt).

**Pantalla nueva** (`JarvisScreen.jsx`, reescrita): `<TopBar/>` compartido de SGR (sin cambios,
mismo tema activo del usuario) + un sub-header nuevo oscuro (tabs Cerebro/Inbox/Entidades/Debug
con dot de color y badge de pendientes, indicador de presupuesto con 14 barras, dot de salud con
`jv-breathe`) + layout de 3 columnas (246px / flex / 322px) siempre visible. Fondo: `<NeuralCanvas
/>` (red de nodos en canvas 2D, reactiva al mouse, colores por tipo de memoria) + overlay de
gradiente oscuro. Todo el tema (`--jv-*`, `jv-breathe/jv-rise/jv-sweep/jv-spin/jv-blink`) vive
scoped bajo `.jv-root` en `index.css`, sin tocar los 6 temas de SGR.

**Componentes nuevos**: `NeuralCanvas.jsx`, `JarvisLeftPanel.jsx` (tipos de memoria con conteos
reales + proyectos activos con barra de "heat"), `JarvisRightPanel.jsx` (en-proceso + presupuesto
+ entidades recientes), `JarvisInboxTab.jsx` (tabla completa del inbox), `JarvisEntitiesTab.jsx`
(grid de entidades, click dispara una consulta RAG real "¿Qué sé sobre X?"), `JarvisDebugTab.jsx`
(stats reales, sin log fabricado — ver limitación abajo). `JarvisChat.jsx` reescrito con el
mismo diseño (burbujas con gradiente, fuentes con dots de color, composer con borde rainbow
animado y badge de tipo detectado por heurística `guessType()`), lógica sin cambios.

**Backend** (`jarvis/api/router.py`): dos endpoints de solo lectura nuevos, `GET /jarvis/stats`
(conteos por tipo, cola, errores 24h, última entrada procesada) y `GET /jarvis/projects`
(proyectos con cantidad de entradas vigentes vinculadas) — ninguno existía antes, necesarios para
alimentar los paneles nuevos. `useStore.js` gana `jarvisTab`+`setJarvisTab` y
`jarvisStats`/`jarvisEntities`/`jarvisProjects` + sus `fetchJarvis*`.

**Limitaciones conocidas, aceptadas a propósito** (documentadas en detalle en
`Cerebro/decisiones-implementacion.md`): el tab Debug muestra actividad real del inbox en vez del
log de eventos inventado del mockup (no hay audit log expuesto por API); las tarjetas de
entidades no muestran cantidad de memorias (`GET /jarvis/entities` no expone ese dato); el
widget de presupuesto no desglosa costo por modelo grande/chico (el endpoint solo da el total).

**Verificado en este entorno**: `npm run build` del frontend sin errores; los cuatro endpoints
(`/jarvis/stats`, `/jarvis/projects`, `/jarvis/entities`, `/jarvis/budget`) probados con `curl`
contra `project/database/jarvis.db` real (no scratch) — devuelven datos coherentes con las
entradas reales ya guardadas (conteos por tipo, presupuesto `$0.010112/$1.00`, 5 entidades
reales). La extensión `claude-in-chrome` no se conectó en ningún momento de la sesión, así que
la verificación visual quedó en manos del usuario contra el `npm run dev` (`:5173`) dejado
corriendo en background.

**Bug real encontrado por el usuario y corregido en el momento**: a medida que el chat de
Jarvis acumulaba respuestas, la página entera se estiraba verticalmente sin ninguna barra de
scroll disponible para volver arriba — el layout completo quedaba inutilizable después de unos
pocos mensajes. Causa: en `JarvisScreen.jsx`, el div central que envuelve el contenido de la tab
activa (chat/inbox/entidades/debug) era el único de los tres hijos de la grilla de 3 columnas sin
`overflow` seteado. Sin eso, su "automatic minimum size" (la regla CSS por la que un item de
grid/flex con `overflow:visible` no puede encogerse por debajo del tamaño de su contenido) queda
atada al contenido — y como el contenido del chat crece sin límite, ese item fuerza a crecer a la
fila entera de la grilla, y con ella a la página. Los otros hijos de esa misma grilla
(`JarvisLeftPanel`, `JarvisRightPanel`) y las tabs internas (`JarvisInboxTab`, `JarvisEntitiesTab`,
`JarvisDebugTab`) ya tenían `overflowY:'auto'` propio, por eso solo se manifestaba con el chat.
Fix: agregado `overflow:'hidden'` + `minHeight:0` a ese div central — mismo patrón ya usado en el
resto de los paneles, ahora aplicado de forma consistente en los tres hijos de la grilla.
Verificado con `npm run build` sin errores; pendiente de confirmación visual del usuario tras el
hot-reload de Vite.

---

## Deploy al homelab — worker corriendo en Docker, primera vez (2026-08-26)

Jarvis corría hasta ahora solo en la PC Windows (venv local, tres procesos: uvicorn, bot,
worker). El usuario pidió matar todo lo local y mover todo al homelab (gabinete Ubuntu,
`docker-compose.yml`, ver `HOMELAB.md`). Antes de este deploy, `jarvis/` **nunca** había
sido copiado al homelab ni al build de Docker — la imagen (`project/Dockerfile`) solo
copiaba `project/app` y `project/mybot`; el backend del gabinete corría hacía 4 semanas
sin ninguna integración de Jarvis, y el `bot` estaba parado (Exited hacía 19h).

**Procesos locales matados**: los tres PIDs reales (uvicorn, `jarvis.worker.main`,
`bot.py`), cada uno con su par de PIDs documentado en la sesión anterior (stub del venv +
intérprete real hijo).

**Cambios de infraestructura (no de lógica de Jarvis):**
- `project/Dockerfile` + `project/docker-compose.yml`: build context cambiado de
  `project/` al **root del repo** (`context: ..`, `dockerfile: project/Dockerfile`) —
  necesario porque `jarvis/` vive como hermano de `project/` (ver CLAUDE.md), y Docker no
  puede `COPY` desde fuera del build context. `Dockerfile` ahora copia `jarvis/` e
  instala editable (`pip install -e ./jarvis`, resuelve sus deps desde
  `jarvis/pyproject.toml`: litellm, chromadb, langfuse, opentelemetry) **antes** de
  `COPY project/app`/`COPY project/mybot` a propósito (esas cambian mucho más seguido;
  ponerlas después evita reinstalar las deps pesadas de Jarvis en cada rebuild de solo
  código SGR).
- `docker-compose.yml`: servicio **`worker`** nuevo (`python -m jarvis.worker.main`,
  `network_mode: host` como `bot`, mismas env vars de Ollama). `JARVIS_DB_PATH` /
  `JARVIS_VAULT_PATH` / `JARVIS_CHROMA_PATH` fijados explícitamente en los tres servicios
  (`backend`, `bot`, `worker`) a rutas bajo `/app/database` y `/app/vault` — evita
  depender del cálculo de path por defecto de `jarvis/config.py`
  (`Path(__file__).parent.parent / "project"`), que asume el layout del repo real y no
  tiene sentido dentro del contenedor. `backend` y `bot` ganan volume `./vault:/app/vault`
  nuevo; los tres comparten `jarvis.db` (SQLite + WAL, ya soporta esto) igual que ya
  comparten `app.db`.
- `.dockerignore` movido de `project/.dockerignore` a la raíz del repo (mismo motivo:
  `.dockerignore` tiene que vivir en la raíz del build context).

**Bug real encontrado y arreglado — CPU del gabinete no soporta numpy/onnxruntime
modernos**: tras el primer build, `backend` y `worker` quedaban en crash-loop
(`docker logs` sin ningún traceback — consistente con una señal, no una excepción
Python). `docker inspect` mostró `ExitCode=132` (`SIGILL`). Aislado importando cada
paquete uno por uno dentro de la imagen ya construida: `numpy` (2.4.6, pulled
transitivamente por `chromadb`/`onnxruntime`) crashea solo con importarlo — el gabinete es
un **AMD Athlon II X2 245 (2009)**, sin SSSE3/SSE4.1/SSE4.2/AVX (`/proc/cpuinfo` sin
ninguno de esos flags), y los wheels de PyPI de `numpy>=2` asumen un baseline de CPU que
esta máquina no tiene. `numpy==1.26.4` probado en el mismo host: importa y el flujo real
de ChromaDB (`PersistentClient` + `upsert`/`get`/`query`) funciona sin problema.
**Fix:** `numpy<2` agregado como dependencia explícita en `jarvis/pyproject.toml`
(comentario ahí con el detalle) — sin esto, Jarvis es literalmente imposible de correr en
este hardware, sea en Docker o en un venv nativo del gabinete. Detalle operativo completo
(incluyendo cómo diagnosticar si vuelve a pasar) en `HOMELAB.md`.

**Segundo bug del deploy (de proceso, no de código)**: el primer build usó el `app/` que
ya estaba en el homelab desde hacía 4 semanas (nunca se había sincronizado `project/app/`
en esta sesión, solo `project/mybot/`) — sin la integración de Jarvis en `app/main.py` en
absoluto (`_JARVIS_AVAILABLE` no existía como atributo, `/jarvis/*` daba 404). Corregido
sincronizando `project/app/` completo y reconstruyendo.

**Migrado al homelab** (antes no existía nada ahí): `project/database/jarvis.db`,
`project/vault/`, `project/database/chroma/` — las 6 entradas reales (incluyendo las
DECISION de gemma3, la mudanza a Buenos Aires, etc.) documentadas en las secciones de
abajo. `.env` del homelab actualizado con `OPENAI_API_KEY` / `JARVIS_REASON_MODEL` /
`JARVIS_LOCAL_MODEL` (backup del `.env` viejo del homelab guardado antes de pisarlo,
`.env.bak-<timestamp>`) — confirmado que el `.env` local es superset del que ya tenía el
homelab (mismas claves + las nuevas de Jarvis), sin ninguna variable exclusiva del
homelab que se fuera a perder.

**Verificado en producción real (no mocks, no scratch DB) tras el fix**:
- Los tres contenedores (`backend`, `bot`, `worker`) estables, sin reinicios, varios
  minutos corriendo.
- `GET /jarvis/*` registradas (`/jarvis/budget`, `/jarvis/capture`, `/jarvis/query`,
  `/jarvis/entities`, `/jarvis/inbox`).
- `POST /jarvis/query` real: respuesta **sin** prefijo `[modo local]` (usó
  `gpt-5.4-mini` externo de verdad), citó las fuentes correctas (las DECISION de
  gemma3), y `GET /jarvis/budget` subió de `$0.010112` a `$0.011106` — confirma que la
  `OPENAI_API_KEY` conecta y se factura de verdad.
- `POST /jarvis/capture` real → el worker la levantó (`Procesando entry_id=...`),
  clasificó con `gemma3:12b` vía Ollama en Windows (`192.168.137.1:11434`, alcanzable
  desde el gabinete con `network_mode: host`), escribió el `.md` en `vault/PROJECTS/` y
  generó+guardó el embedding en ChromaDB (`embedded=1`) — confirma que el fix de numpy
  sostiene el pipeline completo, no solo el import. Entrada de prueba borrada al final
  (DB + vault + embedding), sin dejar rastro en la memoria real.

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-26, "Deploy de
Jarvis al homelab").

---

## /help actualizado + debug por Telegram (/jdebug, /jdebugon, /jdebugoff) (2026-08-26)

Dos cambios chicos sobre el bot de Telegram, pedidos aparte de las features de arriba.

**`/help`** (`project/mybot/agenda_handlers.py::HELP_TEXT`): agrega una sección "🧠 Jarvis"
con los cinco comandos (`/j`, `/jq`, `/jdebug`, `/jdebugon`, `/jdebugoff`) — antes el texto
de ayuda no mencionaba Jarvis para nada. No se tocó ningún registro de comandos en BotFather
porque el bot no llama `set_my_commands()` en ningún lado (se verificó con grep antes de
implementar) — no había nada que actualizar ahí.

**Debug por Telegram** — módulo nuevo `jarvis/debug/service.py` (mismo patrón ya documentado:
lógica compartida vive en `jarvis/`, nunca duplicada en el handler):
- `/jdebug` — snapshot de estado, funciona aunque `debug_mode` esté OFF: última entrada
  procesada (id/tipo/fecha/status, join `memory_entries`+`inbox_queue`), pendientes en
  `inbox_queue`, últimas 3 entradas `ERROR` con su `last_error`, presupuesto de hoy
  (`jarvis.budget.tracker.spent_today()` vs `JARVIS_DAILY_BUDGET_USD`), si `OPENAI_API_KEY`
  está seteada, y el valor de `JARVIS_LOCAL_MODEL`.
- `/jdebugon` / `/jdebugoff` — togglean `debug_mode`, persistido en `jarvis_policies`
  (`policy_type='debug_mode'`) con el mismo patrón de `jarvis/worker/consolidation.py`
  (INSERT de una fila nueva por cambio, se lee la más reciente por `created_at` — nunca
  UPDATE in place). Sobrevive reinicios del bot y del worker (proceso separado, misma DB).
- Con `debug_mode` ON, `jarvis/worker/processor.py::process_entry()` manda un mensaje de
  Telegram por cada entrada procesada (tipo detectado, confianza, entidades extraídas, si
  pidió aclaración, modelo usado) al chat_id de `JARVIS_TELEGRAM_CHAT_ID` (nuevo en
  `jarvis/config.py`) o, si no está seteada, al chat_id derivado del primer `/j` recibido
  (`remember_chat_id()`, guardado también en `jarvis_policies`
  `policy_type='debug_chat_id'`, no pisa un valor ya guardado). Si no hay ningún chat_id
  disponible, solo loguea en consola — no falla. El call site en `processor.py` está
  envuelto en `try/except` (además de que `notify_debug_processed()` ya atrapa sus propias
  excepciones) para cumplir literal "los mensajes de debug no interrumpen el flujo normal
  del worker" sin depender solo de la disciplina interna del módulo nuevo — mismo patrón
  "belt and suspenders" que ya usa la extracción de entidades ahí mismo.
- **Heurística conocida, documentada a propósito**: "¿pidió aclaración?" se infiere
  buscando `"\nRazón:"` en `content_raw` (así es como `jarvis_handlers.py` concatena la
  respuesta del usuario). Esto distingue bien "se preguntó y el usuario respondió" de "nunca
  se preguntó", pero **no** distingue "nunca se preguntó" de "se preguntó pero el usuario no
  respondió a tiempo (timeout de 3 min)" — en ambos casos el contenido queda igual al
  original, sin ninguna marca. No se agregó una columna nueva a `memory_entries` solo para
  esta distinción cosmética de un campo de debug; si en el futuro hace falta separar los tres
  casos, hay que persistir el flag explícitamente en el momento de la aclaración (en
  `jarvis_handlers.py` o en el propio `capture_raw()`).
- **"Modelo usado" siempre es el local** (`JARVIS_LOCAL_MODEL`): la clasificación en
  `process_entry()` llama `call_classify()`, que fuerza el modelo local sin fallback a
  externo (ver `jarvis/llm/client.py`) — no hay ninguna rama donde la clasificación use el
  modelo externo hoy. El campo queda igual por honestidad con lo que el pipeline realmente
  hace, no porque esté hardcodeado sin sentido.
- Se agregó `send_telegram_message(chat_id, text)` genérico a `jarvis/notify/telegram.py`
  (antes solo tenía `notify_telegram_done`, ahora un wrapper delgado sobre la función nueva)
  — reusado por el aviso de "listo" y por el modo debug, mismo boundary best-effort
  (nunca lanza, solo loguea si falla).

**Verificado en este entorno** (sin Telegram real, DB de scratch aislada — `python -m
py_compile` sobre todos los archivos tocados + smoke test directo de
`jarvis/debug/service.py`): toggle de `debug_mode` (ON→OFF→estado correcto en cada lectura),
`remember_chat_id()` no pisa un valor ya guardado, `get_snapshot()`/`format_snapshot_text()`
devuelven el texto esperado sobre una DB vacía, y `notify_debug_processed()` no lanza ni con
`debug_mode` OFF ni con ON sin token de Telegram configurado (falla soft, como debe). **No
probado en este entorno**: flujo real por Telegram (`/jdebug`, `/jdebugon` con el worker
procesando una entrada real y mandando el mensaje) — queda pendiente de que el usuario lo
confirme, mismo patrón que el resto de las features de Telegram en este documento.

---

## Aclaración pre-enqueue + aviso de listo — confirmado de punta a punta por Telegram real (2026-08-26)

La feature de aclaración pre-enqueue (sección siguiente) quedó verificada con datos reales, no
solo con mocks/scratch DB: `/j Decidí usar gemma3.` por Telegram → Jarvis preguntó
`🤔 ¿Por qué tomaste esta decisión?` → el usuario respondió → `handle_pending_clarification()`
canceló el timeout y encoló `"Decidí usar gemma3.\nRazón: Respondió todos los test bien. Le ganó
al mistral de 24B."` → el worker clasificó `DECISION`, generó embedding y escribió
`DECISIONS/f95748a2-elección-de-gemma3.md` → notificación `✅ Listo — guardado como *DECISION*.`
recibida en Telegram. Las tres piezas nuevas de esta sesión (gate de aclaración, timeout de 3
min, aviso de "listo") funcionan juntas en producción.

**Aviso de "listo" — feature nueva agregada durante el mismo ciclo de pruebas**: el usuario notó
que el ACK de `/j` ("procesando…") nunca se actualiza — es un mensaje de una sola vez, el worker
no tiene ningún canal de vuelta hacia ese mensaje puntual. Se agregó `jarvis/notify/telegram.py`
(`notify_telegram_done()`) — pega directo a la HTTP API de Telegram con `urllib.request` de la
librería estándar (sin agregar `requests` como dependencia nueva a `jarvis/`, y sin que el worker
necesite la instancia `Application` de python-telegram-bot, que vive en un proceso separado).
`jarvis/worker/processor.py` la llama al final de `process_entry()`, solo si
`entry["source"] == "telegram"` y hay `channel` (chat_id) — capturas de API/frontend (`source`
`desktop`) no reciben este aviso, no tienen a dónde mandarlo. Gateado por una operación nueva en
`TaskManifest` (`"notify_telegram"`). Best-effort: si falla (sin `TELEGRAM_BOT_TOKEN`, sin red),
solo loguea, nunca tumba el procesamiento ya terminado de la entrada.

**Bloqueante operativo encontrado en el camino**: el timeout de 3 minutos depende de
`context.job_queue` de python-telegram-bot, que requiere el extra `[job-queue]`
(`pip install "python-telegram-bot[job-queue]"`) — sin él, PTB loguea un
`PTBUserWarning` y `context.job_queue` es `None` en tiempo de ejecución (el código ya lo
detecta y solo loguea un warning, no rompe, pero el timeout queda inactivo). `requirements.txt`
ya tenía el extra pineado (`python-telegram-bot[job-queue]==22.7`) pero el venv real estaba
desincronizado (instalado antes sin el extra). Se instaló en el venv del usuario.

**Bug real de infraestructura encontrado y corregido en el camino — corrupción de foreign keys
en producción**: al reiniciar bot/API/worker para levantar el código nuevo, la migración
`_migrate_people_type()` (que agrega el tipo `PEOPLE`, ya documentada como "resuelta" en 0.2
Slice 3) corrió por primera vez contra la DB real (`project/database/jarvis.db`) — hasta ahora
solo se había probado contra DBs de scratch. Esa migración hacía
`ALTER TABLE memory_entries RENAME TO memory_entries_old` con `PRAGMA foreign_keys = OFF`. Por
la semántica documentada de SQLite (`ALTER TABLE RENAME` solo reescribe las cláusulas
`FOREIGN KEY` de *otras* tablas que apuntan a la tabla renombrada cuando `foreign_keys` está ON
en ese momento), `inbox_queue`, `memory_entry_entities` y `memory_entry_projects` quedaron con
`REFERENCES "memory_entries_old"(id)` grabado **permanentemente** en su SQL de creación — no es
un problema transitorio ni una carrera entre procesos (esa fue la hipótesis inicial, descartada
al confirmar que el error persistía tras reiniciar todo limpio). Cualquier `INSERT` posterior en
esas tres tablas (que sí corre con `foreign_keys=ON`, como usa `get_connection()`) fallaba con
`no such table: main.memory_entries_old` en cuanto esa tabla dejaba de existir — exactamente el
error que vio el usuario al responder la aclaración.

Corregido en `jarvis/db/database.py::_migrate_people_type()`: ya no renombra `memory_entries` en
ningún momento — construye la tabla nueva bajo un nombre temporal
(`memory_entries_new`, extraído del `CREATE TABLE` real de `jarvis/db/schema.py` vía regex para
no duplicar la definición), copia los datos, borra la vieja, y recién ahí renombra la nueva a
`memory_entries`. Como ninguna otra tabla referencia `memory_entries_new` por nombre, no hay nada
que SQLite necesite reescribir — el bug queda estructuralmente imposible, no solo mitigado.
Verificado simulando una DB pre-migración real (con las 3 tablas hijas ya creadas con su FK
correcta, como estaba `jarvis.db` de antes de hoy): tras migrar, las tres siguen apuntando a
`memory_entries` (no a `_old` ni a `_new`), los datos viejos se preservan, y la FK realmente
funciona (`INSERT` con `entry_id` inexistente rechazado). La DB real ya corrompida se reparó
aparte (backup automático a `database/jarvis.bak-repair-{timestamp}.db`, después reconstruyendo
las 3 tablas rotas con la misma técnica) sin perder ninguna fila (mismos conteos antes/después:
12 `memory_entries`, 2 `inbox_queue`, 1 `memory_entities`, 1 `memory_projects`).

**Lección operativa para sesiones futuras**: Python no hace hot-reload — reiniciar bot.py/uvicorn
después de cambiar código Jarvis es obligatorio para que el código nuevo se cargue (esto costó
tiempo de diagnóstico en esta sesión: un `/j` de prueba pasó de largo sin preguntar porque el bot
corriendo era de antes del cambio). El venv de este proyecto usa un `python.exe` stub que
spawnea el intérprete real como proceso hijo — cada proceso lanzado aparece como **dos** PIDs en
`Get-CimInstance Win32_Process` (mismo `CommandLine`, mismo `CreationDate`); no es una instancia
duplicada real, hay que matar ambos PIDs del par al reiniciar.

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-26, "Aviso de listo +
corrección de corrupción de foreign keys en `_migrate_people_type`").

---

## Aclaración pre-enqueue para capturas DECISION (2026-08-26)

Nueva feature: una captura clasificada como `DECISION` sin razonamiento explícito ("decidí usar
gemma3", sin ningún "porque...") antes se guardaba igual y el porqué se perdía para siempre —
el worker es fire-and-forget (polling a `inbox_queue`, sin canal de vuelta al usuario), así que
cualquier pregunta de aclaración tiene que resolverse **antes** de encolar, como responsabilidad
del cliente, no del worker.

**Divergencia con el pedido original, encontrada leyendo el código (no bloqueante, documentada
al momento)**: la tarea pedía tocar `JarvisChat.jsx` como cliente frontend de captura, pero ese
componente es el chat de **consulta RAG** (`jarvisQuery` → `POST /jarvis/query`), sin ningún
vínculo con captura. La captura real desde el frontend pasa por `JarvisCaptureModal.jsx` (botón
"Capturar" del TopBar) → `jarvisCapture()` → `POST /jarvis/capture`. Se implementó ahí en su
lugar — es la única lectura consistente con lo que el código hace hoy.

**Módulo nuevo compartido `jarvis/captures/clarification.py`** (mismo patrón ya documentado:
lógica multi-cliente vive en `jarvis/`, nunca duplicada por handler):
- `infer_type_hint(content) -> str` — heurística sin LLM (RAW|DECISION|PROJECT), migrada desde
  el `_infer_type_hint` que antes vivía solo en `jarvis_handlers.py` (ahora también la usa la
  API para el modo `check_clarification`).
- `needs_clarification(text, detected_type) -> (bool, str|None)` — pura salvo la llamada
  best-effort al modelo local (`JARVIS_LOCAL_MODEL`, sin especificar, nunca el externo) cuando
  las keywords de razonamiento ("porque", "ya que", "debido a", "razón", ...) no alcanzan.
  Cualquier excepción del modelo → `(False, None)`, nunca bloquea la captura.
- **Hallazgo real probando el caso de ejemplo de la propia tarea**: con un prompt simple
  ("¿este texto incluye el razonamiento?") `gemma3:12b` respondió "sí" para
  `"decidí usar gemma3"` (sin ninguna razón) — falso positivo que habría hecho fallar
  exactamente el caso de verificación pedido. Con un prompt de few-shot (4 ejemplos: 2 con
  razón, 2 sin razón) acierta los 4 casos de control probados. Ver decisión completa en
  `Cerebro/decisiones-implementacion.md`.

**Telegram** (`project/mybot/jarvis_handlers.py` + `bot.py`): `/j` calcula
`needs_clarification` antes de `capture_raw()`. Si hace falta, guarda el pendiente en
`context.user_data["jarvis_clarification"]` y programa un timeout de 3 min vía
`context.job_queue.run_once()` — el job de timeout no depende de `context.user_data` (un job
solo lo tiene poblado si se le pasó `user_id=` al programarlo; acá viaja todo en `job.data` para
evitar ese problema de scoping de PTB). Si el usuario responde a tiempo, `bot.py::handle_message`
llama `jh.handle_pending_clarification()` **antes** de cualquier otro routing de texto libre
(si no, la respuesta a "¿Por qué...?" se interpretaría como una hoja nueva de la Bóveda) —
cancela el job de timeout y encola con `"\nRazón: {respuesta}"` concatenado. Si no responde,
el job de timeout captura el texto original tal cual, sin razón: la captura nunca se pierde.

**API** (`jarvis/api/router.py`): `POST /jarvis/capture` gana dos campos opcionales del body
(no query param — el endpoint ya es JSON-body-only): `check_clarification: bool` (si hace
falta, responde `{"clarification_needed": true, "question": ...}` sin encolar) y
`clarification: str` (concatena la razón y encola, sin volver a chequear). Sin ninguno de los
dos, comportamiento idéntico al de antes — opt-in real, verificado con tests contra una DB de
scratch.

**Frontend** (`JarvisCaptureModal.jsx` + `useStore.js::jarvisCapture`): el submit ahora manda
`check_clarification: true`; si la API responde con la pregunta, la modal pasa a un segundo
paso (pregunta + textarea de razón) con tres acciones explícitas: "Guardar con esta razón",
"Guardar sin razón", "Descartar" (este último SÍ pierde la captura a propósito — es una
decisión explícita del usuario en un modal, no un timeout no supervisado como en Telegram, así
que no viola la garantía de "nunca se pierde una captura" de ese canal).

Verificado en este entorno (Ollama real, `gemma3:12b`, DB de scratch, sin tocar `jarvis.db`
real): `needs_clarification` con los 4 casos de control (2 DECISION sin razón, 1 con razón vía
keyword, 1 no-DECISION) + el flujo completo de `POST /jarvis/capture` (check → pregunta sin
encolar → reintento con `clarification` → entrada en DB con ambas partes concatenadas) + build
de producción del frontend (`vite build`) sin errores. **No probado en este entorno**: flujo
real por Telegram de punta a punta (sin token de Telegram disponible acá) ni el timeout de 3
min en vivo — queda pendiente de que el usuario lo confirme (ver
`Cerebro/decisiones-implementacion.md` para el detalle completo).

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-26, "Aclaración
pre-enqueue para capturas DECISION").

---

## Fix: auto-linking de proyectos + merge conservador de alias de entidades (2026-08-26)

Dos gaps encontrados escribiendo `Cerebro/como-explotar-jarvis.md` (leyendo el código, no la
spec) y resueltos en la misma sesión:

- **`memory_projects`/`memory_entry_projects` quedaban siempre vacías** — el campo `"project"`
  que el clasificador ya devolvía desde S1 nunca se usaba. Módulo nuevo
  `jarvis/projects/service.py::link_project_for_entry()`, llamado desde `processor.py` después
  de clasificar (best-effort, no bloquea el procesamiento si falla). El boost de retrieval por
  proyecto de 0.2-S2 (`_match_project_entry_ids`) ahora sí se activa en uso normal.
- **Entidades con nombres distintos para la misma persona quedaban siempre separadas** —
  `_find_or_create_entity()` (`jarvis/entities/service.py`) solo matcheaba nombre exacto contra
  `name`, nunca contra `aliases` (que además nunca se poblaba). Ahora hace match exacto contra
  nombre o alias, y si no hay match exacto intenta fusión conservadora por prefijo de tokens
  ("Martín" + "Martín López" → misma entidad) **solo cuando hay un único candidato posible** —
  con dos "Martín *" ya existentes, o con menciones descriptivas tipo "el Martín del trabajo",
  no fusiona (evita adivinar entre personas distintas).

Verificado con mocks (sin Ollama disponible en este entorno) contra los tres casos de la guía:
merge inequívoco, no-merge por ambigüedad, no-merge por calificador descriptivo. Detalle completo
en `Cerebro/decisiones-implementacion.md` (2026-08-26, "Fix: auto-linking de proyectos + merge
conservador de alias de entidades"). **Pendiente**: confirmar en una sesión con Ollama real
corriendo el worker de punta a punta — no se pudo correr el pipeline completo en este entorno.

---

## Jarvis 0.2 — Slice 3: memoria de tipo PEOPLE (COMPLETO 2026-08-26)

Tercer slice de 0.2. Hasta ahora Jarvis no distinguía *sobre quién* trata una entrada —
"hablé con Martín sobre X" y "hablé con Ana sobre X" son dos `SEMANTIC`/`PROJECT` sueltas sin
ningún vínculo entre sí ni forma de preguntar "¿qué sé sobre Martín?" salvo que su nombre
apareciera literal en la búsqueda semántica de esa consulta puntual. Slice 3 agrega un tipo de
entrada `PEOPLE` y una capa liviana de extracción/vinculación de entidades (personas y
organizaciones) sobre las entradas existentes.

**Schema** (`jarvis/db/schema.py`):
- `CHECK (type IN (...))` de `memory_entries` ahora incluye `'PEOPLE'`.
- Tablas nuevas: `memory_entities` (`entity_id`, `name`, `aliases` JSON, `entity_type`
  `person`|`organization`, `user_id`, `first_seen`, `last_seen`, `notes`) y
  `memory_entry_entities` (`entry_id`, `entity_id`, `relation` `mentioned`|`author`|`subject`,
  PK compuesta). Índices `idx_men_user`, `idx_men_name`, `idx_mee_entity`.
- **Migración del CHECK constraint** (`jarvis/db/database.py::_migrate_people_type()`): SQLite
  no soporta `ALTER TABLE` sobre un `CHECK` existente — se resolvió con rebuild completo de la
  tabla (`RENAME` → recrear `memory_entries` desde `SCHEMA` → `INSERT...SELECT` de las columnas
  → `DROP` de la vieja), gateado por si `'PEOPLE'` ya aparece en `sqlite_master.sql` para no
  correr dos veces. Mismo patrón de idempotencia que las migraciones livianas anteriores
  (`ADD COLUMN`), pero con el rebuild completo que exige un cambio de `CHECK`.
- `_VAULT_SUBDIRS` (`database.py`) y `_TYPE_TO_SUBDIR` (`jarvis/vault/writer.py`) con entrada
  `PEOPLE` — mismo patrón que los otros tres tipos, vault en `vault/PEOPLE/`.

**Extracción de entidades — módulo nuevo `jarvis/entities/service.py`:**
- `extract_entities(content)` — llama al modelo **local** (`JARVIS_LOCAL_MODEL`, nunca el
  externo — es extracción barata) pidiendo JSON `[{"name", "type": "person"|"organization"}]`.
  Nunca lanza: JSON inválido, lista vacía, o cualquier excepción → `[]` y logueo de warning.
- `link_entities_for_entry(entry_id, entities, entry_type, user_id)` — por cada entidad,
  `_find_or_create_entity()` busca por `name` case-insensitive; si existe actualiza
  `last_seen`, si no crea la fila. Luego `_link_entry_entity()` hace upsert en
  `memory_entry_entities` (`ON CONFLICT (entry_id, entity_id) DO UPDATE`). Si la entrada es
  `PEOPLE` y la primera persona detectada coincide con el sujeto de la nota, la relación es
  `subject`; el resto (y todas las de entradas no-`PEOPLE`) quedan `mentioned`. Nunca lanza.
- `match_entities_in_text()` / `get_entity_entry_ids()` / `list_entities()` /
  `get_entries_for_entity()` — lectura para retriever/query/API, todas con `valid_to IS NULL`
  donde corresponde (una entrada superseded por consolidación no debe reaparecer tampoco vía
  entidades).

**Integración en el worker** (`jarvis/worker/processor.py`): después de clasificar y actualizar
la entrada (`update_entry`), un bloque `try/except` propio llama `extract_entities()` →
`link_entities_for_entry()`, gateado por `MANIFEST.assert_allowed("extract_entities"/
"link_entities")` (nuevas operaciones agregadas a `jarvis/worker/task_manifest.py`). El
`try/except` está **duplicado a propósito**: además de que `extract_entities`/
`link_entities_for_entry` nunca lanzan internamente, el call site en `processor.py` los envuelve
de nuevo — cumple literal el requisito de la tarea ("la extracción no puede fallar el
procesamiento normal") sin depender únicamente de la disciplina interna del módulo nuevo.

**Retrieval con boost de entidades** (`jarvis/retriever/retriever.py`): `_TYPE_WEIGHT` ahora
tiene `PEOPLE: 0.75` (entre `PROJECT` 0.7 y `SEMANTIC` 0.8 — juicio de valor: una nota "sobre
alguien" es más específica que una nota semántica genérica pero no tan explícitamente accionable
como una `DECISION`). `_coarse_filter()` suma una tercera señal, `entity_entry_ids`, vía
`_match_entity_entry_ids()` (substring case-insensitive contra `name`/`aliases` de
`memory_entities`). `retrieve()` carga esas entradas por separado y las antepone al resultado
normal con `_merge_entity_first()` (dedup, resto de los `n_results` slots relleno con la
búsqueda semántica de siempre). **Interfaz de `retrieve()` sin cambios** — mismo enfoque que
Slice 2: la señal nueva se computa aparte y se mezcla al final, en vez de threadearla por toda
la cadena de llamadas internas.

**Prompt del modelo externo** (`jarvis/query/service.py`): `_build_entity_sections(question,
user_id)` detecta entidades conocidas mencionadas en la pregunta (`match_entities_in_text`),
busca sus entradas vinculadas (`get_entries_for_entity`), las pasa por el Privacy Gateway
(`filter_context` — mismo boundary que el contexto RAG normal, ninguna entidad se salta el
filtro de privacidad) y arma bloques `"Lo que sé sobre [nombre]:\n- hecho1\n- hecho2"` que se
agregan al **system prompt** (no al contexto RAG del mensaje de usuario, para diferenciar
claramente "memoria general recuperada" de "lo que ya sé de esta persona puntual"). Nunca lanza
— `""` si falla cualquier paso. **Interfaz de `query()` sin cambios.**

**API** (`jarvis/api/router.py`): `GET /jarvis/entities` (lista `name`/`entity_type`/`last_seen`,
`user_id` por query param) y `GET /jarvis/entities/{name}` (entradas vinculadas; `404` si el
nombre no matchea ninguna entidad — nota: también devuelve `404` si la entidad existe pero sin
ninguna entrada vigente vinculada, ej. todas superseded por consolidación; no se distinguen los
dos casos porque para el uso real de la API esa distinción no aporta, y separar ambos requeriría
una query extra solo para el mensaje de error).

**Verificado con datos reales** (Ollama real, `gemma3:12b` + `nomic-embed-text`, sin mocks,
contra una DB/vault/chroma de scratch aislada de `project/database/jarvis.db`, borrada al
terminar):
- Captura `"Tuve una reunión con Martín Rodríguez sobre el roadmap de Jarvis..."` →
  `process_entry()` clasificó `PROJECT` (razonable, la nota es sobre el roadmap más que "sobre"
  la persona en sí — no se forzó un caso `PEOPLE` puro para no manipular el test) y extrajo dos
  entidades reales: `Martín Rodríguez` (person) y `Jarvis` (organization).
- `memory_entities` tiene ambas filas; `list_entities()` (backing de `GET /jarvis/entities`) las
  devuelve.
- `get_entries_for_entity("Martín Rodríguez")` (backing de `GET /jarvis/entities/{name}`)
  devuelve la entrada capturada.
- `query("¿Qué sé sobre Martín Rodríguez?")` respondió correctamente citando la reunión y el
  roadmap (modo local, sin `OPENAI_API_KEY` real configurada en este entorno — mismo fallback ya
  validado en slices anteriores).
- Tildes verificadas en UTF-8 real leyendo la DB directamente (el mojibake visto en la consola
  de Windows/cp1252 al imprimir es solo de terminal, mismo hallazgo ya documentado en S1/S3).

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-26, "Jarvis 0.2, Slice
3: memoria de tipo PEOPLE").

---

## Bake-off de modelo local + fix `valid_to` en retrieval (2026-08-26)

**Modelo local ganador: `gemma3:12b`** (reemplaza a `llama3.2:3b`). Bake-off contra 4
candidatos ya instalados en Ollama (`llama3.2:3b`, `deepseek-r1:7b`, `gemma3:12b`,
`mistral-small:22b`), corridos vía LiteLLM (`ollama_chat/<modelo>`, igual que en producción)
con 3 prompts representativos de las 3 tareas reales del modelo local:

| Modelo | A: consolidación (`same_fact`) | B: clasificación captura (`DECISION`) | C: filtro coarse (`DECISION`) | Score | Tiempo total |
|---|---|---|---|---|---|
| llama3.2:3b (baseline) | ✗ `different` | ✓ | ✗ `SEMANTIC` | 1/3 | 29.6s |
| deepseek-r1:7b | ✗ `different` | ✓ | ✗ `SEMANTIC` | 1/3 | 183.9s |
| **gemma3:12b** | **✓** | **✓** | **✓** | **3/3** | 131.9s |
| mistral-small:22b | ✗ `contradiction` | ✓ | ✓ | 2/3 | 205.7s |

`gemma3:12b` es el único candidato con 3/3 y, de paso, más chico y más rápido que
`mistral-small:22b` (el otro candidato "grande"). Confirma en datos reales lo que S1 ya había
detectado empíricamente sobre `llama3.2:3b` en la tarea de consolidación.

**Configuración ahora vía env var** — `JARVIS_CLASSIFY_MODEL` (nombre viejo, describía solo
uno de sus usos) se renombró a **`JARVIS_LOCAL_MODEL`** en `jarvis/config.py`, mismo patrón
que `JARVIS_REASON_MODEL`. Default: `ollama_chat/gemma3:12b`. Seteado explícito en
`project/.env`; documentado (comentado, con default en código) en `project/.env.example`.

División de tareas por modelo (sin cambios de diseño, ahora documentada en `.env.example`):
- **Local** (`JARVIS_LOCAL_MODEL`): clasificación de capturas (`jarvis/worker/processor.py`),
  filtro coarse del retriever (`jarvis/retriever/retriever.py`).
- **Externo** (`JARVIS_REASON_MODEL`, con fallback automático a local si falla o el
  presupuesto está agotado): respuesta conversacional (`jarvis/query/service.py`),
  consolidación (`jarvis/worker/consolidation.py`).

**Fix — gap de S2 cerrado**: `retrieve()` ahora filtra `valid_to IS NULL` en
`_load_entries()`, `_fallback_rows()` y `_match_project_entry_ids()`
(`jarvis/retriever/retriever.py`) — una entrada marcada `superseded` por el job de
consolidación ya no puede volver a aparecer en el contexto RAG. Filtro aplicado en SQLite
(fuente de verdad), no vía metadata de ChromaDB (los embeddings ya existentes no tienen ese
campo; agregar el filtro ahí exigiría backfillear metadata). El multiplicador de `fetch` en
`_retrieve_chromadb()` subió de `n_results * 2` a `n_results * 3` para compensar candidatos
del top-K descartados por obsoletos.

Verificado con datos reales (`project/database/jarvis.db`, 10 entradas migradas de la
Bóveda, ninguna con `valid_to` seteado todavía): `retrieve()` sobre "¿Qué tengo guardado
sobre React?" siguió devolviendo 5 resultados correctos (mismo comportamiento que antes,
sin regresión) usando el nuevo `JARVIS_LOCAL_MODEL` para el filtro coarse.

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-26, "Bake-off de
modelo local" y "Fix: retrieve() ahora filtra valid_to IS NULL").

---

## Jarvis 0.2 — Slice 2: Retrieval coarse-to-fine (COMPLETO 2026-08-25)

Segundo slice de 0.2. `retrieve()` (`jarvis/retriever/retriever.py`) hacía búsqueda plana
(embedding de la pregunta → ChromaDB → top-K → rankeo por tipo+similitud+recencia); con las
10 entradas reales actuales funciona bien, pero mezclaba tipos y proyectos sin distinción —
con cientos de entradas eso se traduce en ruido. Ahora reduce el espacio de búsqueda en dos
pasos antes de rankear.

**Interfaz sin cambios**: `retrieve(question, n_results=5, user_id="default")` sigue
devolviendo la misma lista de dicts que antes — `jarvis/query/service.py` y la API `/jarvis/*`
no se tocaron, verificado con un smoke test de punta a punta (ver detalle abajo).

**Paso 0 — filtro coarse en SQLite, sin embeddings** (`_coarse_filter()`): calcula tres
señales independientes a partir de la pregunta:
- `type` — `DECISION` si hay keywords de decisión ("decidimos", "elegí", ...), `SEMANTIC` si
  hay keywords de pregunta factual general ("qué es", "cómo funciona", ...). Si ninguna
  keyword matchea y tampoco hay señal de proyecto ni de recencia, se consulta una vez al
  modelo local (`JARVIS_CLASSIFY_MODEL`, nunca el externo) para intentar clasificar; si el
  modelo no puede o falla, no se filtra por tipo (mismo comportamiento que antes).
- `project_entry_ids` — si la pregunta menciona el nombre de un proyecto existente en
  `memory_projects` (substring case-insensitive), el set de `entry_id`s asociados vía
  `memory_entry_projects`.
- `recency_first` — si hay keywords de recencia ("último", "reciente", "hoy", ...).

**Paso 1-2 — búsqueda semántica dentro del subconjunto filtrado**:
- Si se identificó un proyecto: similitud coseno calculada en Python contra solo los
  embeddings de ese proyecto (`collection.get(ids=...)`, mismo patrón que
  `consolidation.py::_find_similar_pairs()`), en vez de una ANN sobre toda la colección.
- Si no (o el proyecto no tuvo resultados útiles): ANN de ChromaDB con
  `where={"type": ...}` cuando hay un `type` del filtro coarse. Si ese tipo no tiene ningún
  candidato en Chroma, se reintenta sin `where=` — el filtro coarse nunca puede devolver
  vacío por elegir mal un tipo.
- El fallback de LIKE en SQLite (`_retrieve_sqlite_fallback()`, cuando ChromaDB falla o está
  vacío) recibe el mismo filtro coarse, con el mismo degrade a sin filtro.

**Ranking**: igual que antes (tipo 40% + similitud 50% + recencia 10%, bonus binario de 7
días) salvo cuando `recency_first=True`: ahí el orden pasa a ser literalmente por
`recorded_at` DESC (epoch como término dominante del score, similitud+tipo solo desempatan
entradas con el mismo `recorded_at` exacto) — se probó primero una decadencia continua
mezclada con similitud y no discriminaba lo suficiente entre entradas de pocos días de
diferencia.

**No se filtra por `user_id` vía `where=` de ChromaDB** (aunque la tarea lo sugería): los
metadatos que `processor.py` guarda por embedding no incluyen `user_id` (mismo hallazgo que
Slice 1 de 0.2 sobre por qué agrupa por SQLite y no por metadata de Chroma) — filtrar por una
clave que las 10 entradas reales no tienen las habría excluido a todas. El filtrado por
`user_id` se mantiene donde ya estaba, post-ChromaDB, sobre SQLite (`_load_entries()`).

**Limitación conocida y aceptada** (mismo patrón que la de consolidación en Slice 1): el
modelo local (`llama3.2:3b`) puede clasificar mal preguntas muy cortas o ambiguas — probado
con la pregunta de una sola palabra "mouse", clasificada como `SEMANTIC` en vez de ambigua,
lo que dejó afuera una entrada `RAW` relevante. Con preguntas completas en lenguaje natural
(el uso real esperado) el modelo devolvió correctamente "ambiguo" en los casos probados. El
filtro coarse está diseñado para degradar a "sin filtro" solo cuando el tipo elegido no tiene
ningún candidato — no cuando tiene candidatos pero son los equivocados; eso es una limitación
de calidad del modelo 3B, no un bug de la lógica de filtrado (misma distinción que ya se hizo
para consolidation.py).

**Brecha preexistente notada en esta sesión, arreglada en sesión posterior (2026-08-26)**:
`retrieve()` nunca filtró por `valid_to IS NULL` — una entrada marcada `superseded` por el job
de consolidación (Slice 1) todavía podía aparecer en el contexto RAG. Ver sección "Bake-off de
modelo local + fix `valid_to` en retrieval" al principio de este documento.

**Verificado con datos reales** (`project/database/jarvis.db`): 4 entradas de prueba
(`DECISION`/`SEMANTIC`/`RAW`/`PROJECT`, `user_id` dedicado, embeddings reales vía Ollama) +
un proyecto de prueba, insertados temporalmente y borrados al final junto con sus embeddings
de Chroma:
- Pregunta de decisión → devolvió solo la entrada `DECISION`.
- Pregunta factual general ("¿Qué es ChromaDB?") → devolvió solo la `SEMANTIC`.
- Pregunta mencionando el proyecto de prueba → devolvió solo la entrada vinculada a ese
  proyecto (búsqueda scoped, sin ANN sobre toda la colección).
- Pregunta de recencia ("¿Qué fue lo último que guardé?") → devolvió las 4 entradas en orden
  cronológico exacto (la de hoy primero, la de hace 40 días última).
- Pregunta ambigua en lenguaje natural → sin filtro de tipo, comportamiento normal.

Además, smoke test de punta a punta contra `jarvis/query/service.py` real (sin tocarlo, sin
mocks) con una pregunta sobre las 10 entradas reales migradas de la Bóveda ("¿Qué tengo
guardado sobre React?", `user_id=default`): `context_count=8`, citó correctamente la entrada
`useCallback - React`, respuesta coherente — confirma que el resto del pipeline (Privacy
Gateway, historial, `call_reason()`, API) sigue funcionando igual con la nueva implementación
de `retrieve()`.

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-25, "Jarvis 0.2,
Slice 2: Retrieval coarse-to-fine").

---

## Fix — Consolidación usa el modelo de razonamiento externo, no solo el local (2026-08-25)

La limitación de `llama3.2:3b` documentada en Slice 1 (clasificó mal el caso de ejemplo
"vivo en Madrid" → "me mudé a Buenos Aires") se resolvió: `_resolve_pair()`
(`jarvis/worker/consolidation.py`) ahora llama `call_reason()` (modelo externo
`gpt-5.4-mini`, con el fallback a local ya incorporado en esa función si el externo falla o
el budget está agotado) en vez de forzar `JARVIS_CLASSIFY_MODEL`. El volumen del job es bajo
(~20 entradas/día) así que el costo es despreciable frente a la mejora de calidad. Verificado
con los tres casos de la comparación de control (mudanza, contradicción, temas distintos) a
través de `call_reason()` real: los tres clasificaron correctamente esta vez.

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-25, "Fix:
consolidación usa el modelo de razonamiento externo").

---

## Jarvis 0.2 — Slice 1: Job de consolidación diaria de memoria (COMPLETO 2026-08-25)

Primer slice de 0.2 (Memory Maintenance, spec §25). Resuelve que hechos viejos y hechos
nuevos sobre lo mismo (ej. "vivo en Madrid" en enero, "me mudé a Buenos Aires" en agosto)
coexistían en `memory_entries` sin que nada le dijera al sistema cuál es vigente,
contaminando el RAG con conocimiento obsoleto.

**Archivo nuevo:** `jarvis/worker/consolidation.py` — `run_consolidation()`, `should_run()`.

**Qué hace, en orden, sobre entradas "vigentes" (`valid_to IS NULL`):**
1. Agrupa `memory_entries` activas por `(type, user_id)` y, si hay 2+ en un grupo, lee sus
   embeddings de ChromaDB (`collection.get(ids=..., include=["embeddings"])`) y calcula
   similitud coseno en Python puro (sin numpy) para todos los pares del grupo. Pares con
   coseno > 0.92 son candidatos.
2. Para cada candidato, llama al modelo local (`JARVIS_CLASSIFY_MODEL`, nunca al externo)
   con un prompt que pide `{"relation": "same_fact"|"contradiction"|"different", "newer_id": ...}`.
   - `same_fact` → el más viejo recibe `valid_to = recorded_at` del más nuevo (nunca se borra).
     Si el modelo no identifica cuál es más nuevo, desempata por `recorded_at`.
   - `contradiction` → ambos bajan `confidence` a la mitad y se loguea el conflicto en
     `jarvis_policies` (`policy_type='consolidation_conflict'`) para revisión manual.
   - `different` (o JSON no parseable) → se ignora, ninguna mutación.
3. Marca stale por edad: `valid_from` > 90 días y `confidence` < 0.4 → `valid_to = now`
   (UPDATE directo en SQL, sin pasar por el modelo).
4. Registra la corrida en `jarvis_policies` (`policy_type='consolidation_last_run'` con el
   timestamp, y `'consolidation_run'` con el resumen JSON `{analyzed, obsolete, conflicts, errors}`)
   y lo loguea.

**Gating de "una vez por día"**: sin tabla nueva — se reutiliza `jarvis_policies` (ya pensada
como "policy store separado, el LLM no puede escribir ahí directamente" — acá escribe código
confiable, no el LLM). `should_run()` lee el `consolidation_last_run` más reciente; si no hay
ninguno o pasaron ≥24h, corre. Se llama desde `jarvis/worker/main.py`: una vez al arrancar el
worker (después del crash recovery) y en cada tick ocioso del loop (cuando no hay `PENDING`).

**No bloquea el loop de polling**: `_maybe_run_consolidation()` en `main.py` lanza el job en un
`threading.Thread(daemon=True)` aparte; el loop principal sigue procesando `inbox_queue` sin
esperarlo. Se guarda la referencia al thread para no lanzar dos corridas en paralelo mientras
una sigue viva.

**Si ChromaDB no está disponible**: `_find_similar_pairs()` atrapa la excepción, loguea un
warning y devuelve `[]` — el job sigue con el paso 3 (stale por edad) sin abortar.

**Schema**: se agregó columna `valid_to DATETIME` a `memory_entries` (`jarvis/db/schema.py` +
migración `ALTER TABLE` en `jarvis/db/database.py::_migrate()`, mismo patrón que `embedded_at`
en S2). `update_entry()` (`jarvis/memory/service.py`) ahora acepta `valid_to` y `confidence`.

**Verificado con datos reales** (`project/database/jarvis.db`, las 10 entradas SEMANTIC
migradas de la Bóveda, Ollama real con `llama3.2:3b`/`nomic-embed-text`, ChromaDB real):
- Corrida completa sin mocks: 10 analizadas, 0 obsoletas, 0 conflictos, sin errores. Se
  verificó aparte que el cálculo de similitud efectivamente corrió sobre embeddings reales
  (similitud máxima real entre las 10 entradas: 0.76, por debajo del umbral 0.92 — cero falsos
  positivos, coherente con que son 10 links/notas de temas distintos).
- La lógica de mutación (`_resolve_pair`, `_mark_stale_by_age`) se probó por separado con datos
  sintéticos y el LLM real mockeado por verdicts controlados (`same_fact`, `contradiction`,
  `different`) para aislar la corrección del código de la calidad de juicio del modelo 3B:
  las tres rutas mutan la DB exactamente como se espera (`valid_to` en el viejo, `confidence`
  a la mitad en ambos + fila en `jarvis_policies`, sin mutación).
- El fallback sin ChromaDB se probó mockeando `get_collection()` para que lance excepción:
  el job igual corre sin errores y solo ejecuta el paso de stale por edad.
- El gating de thread en `worker/main.py` se probó con `run_consolidation` mockeado (sleep
  simulado): una segunda llamada a `_maybe_run_consolidation()` mientras el thread sigue vivo
  no lanza un segundo thread; con `should_run()` en `False` tampoco lanza ninguno.

**Resuelto en sesión posterior (2026-08-25)**: la limitación de abajo se corrigió cambiando
`_resolve_pair()` para usar `call_reason()` (modelo externo con fallback local ya
incorporado) en vez de forzar el modelo local — ver sección "Fix — Consolidación usa el
modelo de razonamiento externo" más arriba. El párrafo original queda como registro histórico
de por qué se tomó esa decisión.

**Limitación real encontrada (no es bug, es la calidad del modelo 3B)**: probando el caso de
ejemplo de la propia tarea ("vivo en Madrid" → "me mudé a Buenos Aires") con `llama3.2:3b` real
(sin mock), el modelo respondió `"different"` en vez de `"same_fact"`, incluso con un prompt de
few-shot que incluía ese mismo ejemplo resuelto textualmente. No es una falla del código — la
lógica de aplicación de veredictos es correcta y se verificó por separado con el LLM mockeado
(ver arriba). Es una limitación de razonamiento esperable en un modelo de 3B para esta tarea,
coherente con el propio riesgo que la spec señala en §25 ("detectar duplicados, contradicciones
y conocimiento obsoleto de forma automática y confiable es uno de los problemas más difíciles de
resolver incluso con modelos avanzados... el MVP solo requiere memoria que funcione bien, no
perfecta"). No se cambió de modelo — la tarea pide explícitamente usar solo el local para este
job. Con volumen real de datos y casos más obvios (mismo wording, mismo tema exacto) es probable
que acierte más; vale la pena revisar la calidad de clasificación una vez que haya más entradas
reales para observar en producción, y considerar ajustar el prompt o el umbral de similitud si
se ve que sistemáticamente subclasifica `same_fact` como `different`.

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-25, Slice 1 de 0.2).

---

## Jarvis 0.1 — COMPLETO (S1 a S5), QA de punta a punta hecho

Todos los slices planificados para 0.1 están implementados y verificados. Ver checklist de
completitud al final de este documento.

## QA end-to-end (2026-08-25) — bugs encontrados y corregidos

Primera corrida real de punta a punta (backend + worker + frontend) contra `project/database/jarvis.db`
real (hasta ahora todo lo verificado en S1-S5 usaba paths de scratch aislados). Entorno de prueba: sin
Ollama instalado, sin `OPENAI_API_KEY`, sin `project/.env` — condiciones "peor caso" que resultaron
útiles para encontrar fallos de robustez.

**Bloqueantes corregidos:**
- **El backend SGR no arrancaba en Windows** (`app/db/database.py:300`): un `print()` de una migración
  de Finanzas usaba el signo menos Unicode `−` (U+2212), que no existe en cp1252 (codepage por defecto
  de la consola de Windows) y tiraba `UnicodeEncodeError`, tumbando el `lifespan` de FastAPI antes de
  levantar cualquier ruta — incluida `/jarvis/*`. No es un bug de Jarvis, pero bloqueaba probar todo lo
  demás. Corregido: reemplazado por un guion ASCII normal. Se barrió el resto del repo buscando el mismo
  patrón (`print()` con caracteres fuera de cp1252) y no apareció ningún otro caso real.
- **Frontend no arrancaba limpio**: `@tanstack/react-virtual` estaba en `package.json` pero no instalado
  en `node_modules` (afecta `DatosTab.jsx` de Finanzas, no Jarvis). Corregido con `npm install`.

**Bugs reales corregidos:**
- **`call_reason()` no caía a modo local si el modelo externo fallaba por cualquier motivo que no fuera
  presupuesto agotado** (`jarvis/llm/client.py`) — sin `OPENAI_API_KEY` configurada (un estado muy
  probable en un proyecto personal), *toda* consulta a `/jarvis/query` tiraba un 500 con el mensaje
  interno de LiteLLM, aunque hubiera un modelo local (Ollama) perfectamente capaz de responder. Corregido:
  `call_reason()` ahora envuelve la llamada externa en `try/except` y cae a `JARVIS_LOCAL_FALLBACK_MODEL`
  con prefijo `[modo local]` ante *cualquier* excepción, no solo `EXHAUSTED`. Verificado con LLM mockeado
  (ver decisión completa en `decisiones-implementacion.md`).
- **Botón "Capturar" del TopBar no hacía nada en `/jarvis`** (`TopBar.jsx`): el mapa `ctaActions` que
  conecta cada módulo con su acción de store nunca incluyó `openJarvisCapture` — el único wiring
  documentado como completo en S4. El click en la CTA llamaba `undefined?.()` silenciosamente, sin error
  visible. Corregido: se agregó `openJarvisCapture` al mapa. (El modal también se puede abrir por API
  directa, por eso no se había notado antes.)
- **Las fuentes citadas en el chat siempre mostraban "—"** (`JarvisChat.jsx`, componente
  `SourcesToggle`): leía `src.content_raw` / `src.title`, pero el backend (`query/service.py`) devuelve
  `{id, type, title_hint}` — nunca esos campos. Corregido: usa `src.title_hint` primero.

**Validado con LLM mockeado (sin Ollama/OpenAI disponibles en este entorno) — pipeline completo:**
`capture_raw()` → `process_entry()` (clasificación → vault .md correcto por tipo → embedding en
ChromaDB → `DONE`) → `retrieve()` (ChromaDB + ranking) → Privacy Gateway → `query()` con historial
conversacional multi-turno persistido → respuesta con `sources` correctos. Los cinco pasos funcionan
tal como describe la arquitectura documentada más abajo.

**Validado en vivo (sin mocks) contra el entorno real:**
- Worker sin Ollama: falla gracefully — `litellm.APIConnectionError`, entrada vuelve a `PENDING` con
  `attempts=1` y retry programado a 1 min, sin crashear el loop del worker. Correcto.
- Privacy Gateway: `"Mi password: hunter2..."` bloqueado (`secret_pattern:password_inline`); texto
  normal permitido. Nota: el bloqueo aplica al armar contexto RAG para el modelo externo
  (`filter_context`), *no* a la captura — el texto con secretos se captura y clasifica igual (por
  diseño: el Privacy Gateway protege el boundary externo, no la escritura local).
- Budget tracker: forzado a `EXHAUSTED` insertando un `budget_usage` manual → `GET /jarvis/budget`
  reflejó el estado correctamente; `call_reason()` saltó directo a modo local sin intentar el externo.
- Migración Bóveda: dry-run corrido dos veces contra el backup real del usuario
  (`project/database/app.db.bak`, 10 hojas) — mismo resultado ambas veces (10 migrarían, idempotente),
  sin tocar el archivo.
- `python -m jarvis.db.schema` (sugerido como posible comando de init) **no inicializa nada** — el
  módulo solo define la constante `SCHEMA`, no tiene `if __name__ == "__main__"`. La forma real de
  inicializar es `jarvis.db.database.init_db()`, que se dispara sola al arrancar worker/bot/API. No es
  un bug (ya documentado en "Notas de estado" más abajo) pero puede confundir — considerar agregar un
  `__main__` a `jarvis/db/schema.py` o `jarvis/cli/` que llame `init_db()` explícitamente si se quiere
  un comando standalone real.

**Limpieza post-QA:** todas las entradas de prueba, la conversación de prueba, y el registro de budget
sintético se borraron de `project/database/jarvis.db` (se vaciaron las tablas, se mantuvo el schema) y
se vació `project/vault/` y `project/database/chroma/` — el usuario arranca con una base limpia real
(no la de scratch que se usaba en S1-S5) la próxima vez que levante worker/bot/API.

**No pude probar en este entorno** (sin navegador interactivo, sin Ollama, sin token de Telegram) — ver
`Jarvis_0.1_Pruebas.md` para el detalle de qué le queda al usuario.

## Validación real contra Ollama (2026-08-25, sesión posterior — ver `Jarvis_0.1_Pruebas.md` §1)

Corrida en la máquina del usuario, con Ollama instalado (`llama3.2:3b` y `nomic-embed-text` ya
descargados). Antes de poder probar nada hubo que resolver dos bloqueantes de entorno — ver decisión
completa en `decisiones-implementacion.md` (2026-08-25, "Fijar litellm==1.60.2 e instalar jarvis
editable"): `litellm` no estaba instalado (y su última versión rompe en Python 3.10 — se fijó
`litellm==1.60.2`), y el paquete `jarvis` nunca quedó instalado en `project/venv`, así que arrancar el
backend tal como documenta `CLAUDE.md` (`cd project && uvicorn app.main:app`) montaba el backend sin
ninguna ruta `/jarvis/*` (fallaba en silencio, sin log ni error HTTP distinto de un 404 genérico).

Con ambos fixes, flujo real de punta a punta (backend + worker, sin mocks):
- `POST /jarvis/capture` con texto real → worker (`python -m jarvis.worker.main`) clasificó con
  `llama3.2:3b` vía LiteLLM (`ollama/llama3.2:3b`, ~27s la primera llamada con el modelo en frío):
  JSON válido, `type="RAW"` razonable, `title` y `tags` coherentes con el contenido, tildes correctas
  (el mojibake que se ve en la consola de Windows/cp1252 es solo de terminal — el JSON y el archivo en
  disco tienen UTF-8 correcto, verificado escribiendo a archivo).
- Embedding generado vía `nomic-embed-text` (768 dims, ~3s) — entrada quedó `DONE` en el inbox, archivo
  `.md` escrito en `vault/RAW/` con nombre y contenido correctos.
- `POST /jarvis/query` sobre esa misma captura: `context_count=1`, `sources` con el `title_hint`
  correcto — la recuperación (ChromaDB) encontró y citó el contenido correcto. Sin `OPENAI_API_KEY`
  configurada en este entorno tampoco, cayó correctamente a `[modo local]` con `llama3.2:3b` (confirma
  en vivo el fallback que el QA anterior sólo había probado con mocks) y `GET /jarvis/budget` se
  mantuvo en `spent_usd=0.0` (correcto: no hay registro de costo para modelos Ollama).
- Limpieza: se borró la entrada de prueba y el archivo del vault. **Pendiente para el usuario**: la fila
  en `memory_entries`/`inbox_queue` de esta entrada de prueba (`entry_id=23cddf94-…`) no se pudo borrar
  desde esta sesión (el DELETE SQL directo fue bloqueado por el permission classifier del harness) —
  borrarla a mano o simplemente ignorarla, no afecta el uso real.

Sigue sin probarse acá (no cambió): `OPENAI_API_KEY` real (§2), frontend en navegador (§3) — ver
`Jarvis_0.1_Pruebas.md`.

## Validación real por Telegram (2026-08-25, misma sesión)

`/j` y `/jq` probados de punta a punta contra un chat real, con el usuario mandando los mensajes.
Encontrados y corregidos tres bugs reales (detalle completo en `Cerebro/decisiones-implementacion.md`,
tres entradas del 2026-08-25):

1. **Retrieval se degradaba en silencio a partir de la 2ª consulta de embeddings en el mismo
   proceso** — `litellm==1.60.2` reusa un `httpx.AsyncClient` global atado al primer event loop que
   lo usa; `asyncio.run()` lo cierra al terminar, y la llamada siguiente revienta con
   `RuntimeError: Event loop is closed`. Jarvis caía bien al fallback de `LIKE` en SQLite (no se
   caía el proceso) pero sin avisar del degradado. Corregido forzando un `AsyncHTTPHandler` nuevo
   antes de cada embedding (`jarvis/embeddings/client.py`).
2. **El modelo local alucinaba turnos `### Assistant:` fantasma en conversaciones multi-turno**, y
   esa respuesta rota se retroalimentaba al guardarse como historial. Causa: el provider
   `ollama/<modelo>` arma el prompt a mano sin turno final ni stop sequence para modelos sin
   `"instruct"` en el nombre. Corregido cambiando a `ollama_chat/<modelo>` (usa `/api/chat`, que
   Ollama maneja nativamente) en `jarvis/config.py`.
3. **`parse_mode="Markdown"` roto en `/jq` — confirmado en vivo** (la sospecha original de
   `Jarvis_0.1_Pruebas.md` §4 sí se reprodujo, con contenido real, después de descartarla en un primer
   intento con un caso armado a mano). Una fuente citada con un username terminado en `_`
   (`@ryxai_`) sumado a los dos guiones bajos que el footer de `cmd_jq` usa a propósito para cursiva
   dio un total impar → Telegram no pudo cerrar el último y tiró `Can't parse entities`. Corregido en
   `project/mybot/jarvis_handlers.py::cmd_jq`: si el `edit_text` con Markdown falla, reintenta en
   texto plano — nunca se vuelve a perder la respuesta real por un error de formato. De paso se
   corrigió un bug menor visto en la misma tanda: el modelo a veces imitaba el prefijo
   `"[modo local]"` de un turno anterior del historial y lo repetía al arrancar su propia respuesta
   (`"modo local modo local ..."`) — `jarvis/llm/client.py` ahora lo saca antes de anteponer el
   prefijo real.

Los tres fixes verificados en aislado y confirmados en vivo por Telegram.

**Bloqueante operativo encontrado (no es bug de código)**: el bot del homelab (Docker, siempre
encendido) usa el mismo `TELEGRAM_BOT_TOKEN` que este Windows — dos instancias no pueden convivir
(409 Conflict). Hay que pausar el bot del homelab para probar acá. Jarvis tampoco está desplegado en
el homelab todavía, solo en este Windows.

## Modelo externo (OpenAI) — configurado y validado (2026-08-25, sesión posterior)

`OPENAI_API_KEY` real cargada en `project/.env` (plan de API propio del usuario, separado de
ChatGPT Plus) y `JARVIS_REASON_MODEL=openai/gpt-5.4-mini` explícito en `project/.env` (antes
quedaba en el default `openai/gpt-4o-mini` de `jarvis/config.py`, nunca seteado). Verificado en
vivo, backend + bot corriendo juntos (sin conflicto con el homelab en esta corrida):

- `/jq` real por Telegram → respuesta coherente **sin** prefijo `[modo local]`, categorizó 8
  notas de la Bóveda correctamente. `GET /jarvis/budget` pasó de `spent_usd=0.0` a
  `spent_usd=0.005014` tras esa única consulta — confirma que `gpt-5.4-mini` cuesta bien por
  debajo de 1 centavo por consulta típica, dejando margen amplio dentro de
  `JARVIS_DAILY_BUDGET_USD=1.0`.
- Fallback a modo local re-verificado en este entorno (antes solo probado con mocks/budget
  sintético en la corrida de QA end-to-end): con una `OPENAI_API_KEY` inválida,
  `call_reason()` cae a `[modo local]` (`litellm.AuthenticationError` capturado por el
  `except Exception` genérico). Con el budget forzado a `EXHAUSTED` (`record_usage` manual en
  una DB de scratch aislada), `call_reason()` ni intenta el modelo externo y va directo a
  `[modo local]`. Ambos casos probados contra `jarvis/llm/client.py` real, no mockeado.

No hicieron falta cambios de código — `jarvis/config.py` y `jarvis/llm/client.py` ya leían y
manejaban todo correctamente; solo faltaba la key y el modelo en `project/.env`.

## Migración real de la Bóveda — HECHA (2026-08-25, misma sesión)

Se borraron los datos de prueba (`jarvis.db`, vault, y solo la colección `jarvis_memory` de ChromaDB —
esa carpeta la comparte con el buscador semántico propio de la Bóveda de SGR, colección `hojas`, que
se dejó intacta) y se corrió `python -m jarvis.cli.migrate_boveda` sin `--dry-run`: backup automático
de `jarvis.db` antes de escribir, **10/10 hojas migradas, 0 omitidas** (mismo resultado que los dos
dry-run previos). `jarvis.db` ahora tiene tus 10 hojas reales, cada una con su embedding en ChromaDB y
su `.md` en `vault/SEMANTIC/`.

**Alcance de Jarvis 0.1, confirmado leyendo el código**: solo se conecta con la Bóveda (captura manual
vía `/j`/API/frontend, más esta migración one-time de `hojas`/`categorias`). No hay ninguna
integración con Finanzas, Agenda ni Hábitos — no aparece ninguna referencia a esas tablas en todo el
paquete `jarvis/`.

## Qué está construido

### S5 — Migración Bóveda (script one-time) (completado 2026-08-25)

**Archivo nuevo:** `jarvis/cli/migrate_boveda.py` (+ `jarvis/cli/__init__.py`)

Script one-time que lee las hojas de la Bóveda SGR (`project/database/app.db`) y las migra al
Memory Core de Jarvis (`project/database/jarvis.db`) como `memory_entries` tipo **SEMANTIC**, con
`origin_trust='user.authenticated'`, `source='migration'` y `source_id='boveda:hoja:{id}'`.

```bash
cd project
.\venv\Scripts\activate
python -m jarvis.cli.migrate_boveda --dry-run          # ver qué migraría, sin tocar nada
python -m jarvis.cli.migrate_boveda                     # migración real (backup automático)
python -m jarvis.cli.migrate_boveda --db-path RUTA       # override de la DB origen (Bóveda)
```

**Comportamiento:**
- `--dry-run`: no crea `jarvis.db` si no existe, no escribe vault, no genera embeddings — solo
  lee la Bóveda (y, si `jarvis.db` ya existe, lo abre en modo solo-lectura para detectar cuáles
  hojas ya fueron migradas) y loguea qué haría.
- Backup automático de `jarvis.db` (copia `jarvis.bak-{timestamp}.db`) antes de escribir, solo en
  modo real y solo si el archivo ya existe.
- Idempotente vía `content_hash` (SHA-256 del texto migrado, mismo esquema que `capture_raw()` de
  S1) — correr el script dos veces no duplica entradas.
- Combina `hojas.contenido` + `hojas.apuntes` (strip de HTML de TipTap) + título/descripción de
  `link_preview` si existe. No falla ante hojas sin `apuntes` (foto/link "pelados") — solo se
  omiten (contadas aparte) si el texto resultante queda vacío.
- Respeta `local_only` de categorías si la columna existe en la Bóveda (`PRAGMA table_info`); como
  hoy no existe, todas las hojas migran con `local_only=0`.
- Genera embeddings best-effort (mismo flujo que S2): si Ollama no está disponible, la entrada
  migra igual con `embedded_at=NULL` y queda lista para reprocesarse más adelante — no aborta el
  script.
- Logging de progreso: "N hojas encontradas" → por hoja migrada/omitida → resumen final
  "N encontradas → M migradas, K ya existían, S omitidas".

**Verificado en este entorno** (sin Ollama disponible) corriendo el script dos veces contra una
copia aislada de los datos reales del usuario (`project/database/app.db.bak`, 10 hojas, con rutas
`JARVIS_DB_PATH`/`JARVIS_VAULT_PATH`/`JARVIS_CHROMA_PATH` apuntadas a un directorio de scratch, sin
tocar la DB real del proyecto): dry-run no creó ningún archivo; la corrida real migró 10/10 con
vault escrito y `embedded_at=NULL` (Ollama no disponible, resiliente como se esperaba); la segunda
corrida detectó 10/10 "ya existían" y no duplicó nada.

**No se corrió la migración real** sobre `project/database/jarvis.db` — queda pendiente de que el
usuario la ejecute cuando decida (instrucción explícita de la tarea).

Ver decisión completa en `Cerebro/decisiones-implementacion.md` (2026-08-25, Slice 5).

---

### S3 — Consultas RAG + API /jarvis/* + /jq Telegram (completado 2026-08-25)

**Módulos nuevos (todos en `jarvis/` minúscula):**

- `jarvis/retriever/retriever.py` — `retrieve(question, n_results, user_id)`: embedding de la
  pregunta → ChromaDB query → carga metadata completa desde SQLite → ranking por tipo + similitud +
  recencia. Fallback: búsqueda LIKE en SQLite si ChromaDB falla o está vacío. Ranking:
  DECISION=1.0, SEMANTIC=0.8, PROJECT=0.7, RAW=0.5 (40%); similitud coseno (50%); bonus recencia
  últimos 7 días (10%).
- `jarvis/conversation/service.py` — `get_or_create_conversation()`, `add_message()`,
  `get_recent_messages()`: gestión de conversaciones en SQLite. Reutiliza la última conversación por
  canal/channel_id (Telegram usa chat_id). Historial cronológico para contexto al modelo.
- `jarvis/query/service.py` — `query(question, conversation_id, channel, channel_id, user_id)`:
  orquesta el flujo completo. Guarda pregunta → recupera (retriever) → filtra (Privacy Gateway) →
  construye prompt (sistema + historial + contexto RAG) → `call_reason()` → guarda respuesta.
  Devuelve `{answer, sources, conversation_id, context_count, context_sent}`.
- `jarvis/api/router.py` — FastAPI `APIRouter` con 4 endpoints:
  - `POST /jarvis/query` — consulta RAG con historial conversacional
  - `POST /jarvis/capture` — captura al Memory Core (alternativa a /j en Telegram)
  - `GET  /jarvis/inbox` — lista inbox con estado (filtrable por status)
  - `GET  /jarvis/budget` — estado ACTIVE/LOW/EXHAUSTED + gasto del día

**Módulos modificados:**
- `project/mybot/jarvis_handlers.py` — `cmd_jq` reemplaza el placeholder de S1/S2 con la
  consulta RAG real: feedback inmediato "Buscando…" → `asyncio.run_in_executor(query)` →
  respuesta + nota de fuentes y fragmentos bloqueados por privacidad.
- `project/app/main.py` — import graceful de `jarvis.api.router` + `jarvis.db.database.init_db`;
  `lifespan` inicializa `jarvis.db` al arrancar; `app.include_router(_jarvis_router, prefix="/jarvis")`
  si jarvis está disponible. SGR sigue funcionando si el paquete no está instalado.

**Qué NO se implementó (fuera de alcance de S3, con justificación):**
- Frontend /jarvis (S4): la ruta existe en FastAPI pero no hay UI React todavía.
- Clasificación automática de texto libre en Telegram (CU-01 §6): `/j` sigue siendo explícito;
  la integración de texto libre requiere UI para corregir clasificaciones (S4).
- Reintentar entradas ERROR desde la API: requiere endpoint adicional (S4/S5).

---

### S2 — Embeddings + ChromaDB, Privacy Gateway, Budget Tracker (completado 2026-08-25)

**Nota de infraestructura importante:** la carpeta del paquete se renombró de `Jarvis/` a `jarvis/`
(minúscula) — ver `Cerebro/decisiones-implementacion.md` 2026-08-25. Windows es case-insensitive a
nivel de filesystem pero el import de CPython no lo es; la carpeta `Jarvis/` (mayúscula) rompía
`import jarvis` en todo el código, incluido S1, que nunca se había corrido de punta a punta hasta
ahora. También se corrigió `build-backend` inválido en `jarvis/pyproject.toml` que rompía
`pip install -e ../jarvis`. Ambos bugs están corregidos y **validados**: se instaló el paquete,
se corrió `init_db()`, y se probó el flujo `capture_raw → process_entry → DONE` con clasificación
y embedding mockeados (sin Ollama disponible en este entorno), incluido el caso de falla de
embedding con retry. Ver detalle en decisiones-implementacion.md.

**Módulos nuevos:**
- `jarvis/embeddings/client.py` — `generate_embedding()` vía LiteLLM (nunca `ollama.*` directo)
- `jarvis/embeddings/store.py` — ChromaDB `PersistentClient`, colección `jarvis_memory`, `upsert_embedding()`
- `jarvis/privacy/gateway.py` — Privacy Gateway: `is_entry_allowed()`, `filter_context()`, `SECRET_PATTERNS` (6 patrones spec §17)
- `jarvis/privacy/trust.py` — `propagate_trust()` (origin_trust nunca aumenta en derivados; listo para consolidación multi-fuente en 0.2+)
- `jarvis/budget/tracker.py` — `record_usage()`, `spent_today()`, `get_status()` (ACTIVE/LOW/EXHAUSTED)

**Módulos modificados:**
- `jarvis/llm/client.py` — `call_llm()` registra costo real (no-Ollama) en el budget tracker; `call_reason()` cae a modo local + prefijo `[modo local]` si el presupuesto está EXHAUSTED; nueva `call_reason_with_context()` que filtra por Privacy Gateway antes de armar el prompt externo (S3 usa `call_reason()` directamente para mayor control del prompt)
- `jarvis/worker/processor.py` — genera y guarda el embedding de cada entrada tras escribir el vault; `vault_path` se persiste apenas se escribe (no depende de que el embedding tenga éxito)
- `jarvis/worker/task_manifest.py` — nueva operación permitida `store_embedding`
- `jarvis/memory/service.py` — `update_entry()` acepta `embedded_at`
- `jarvis/db/schema.py` — columna `embedded_at DATETIME` en `memory_entries`
- `jarvis/db/database.py` — migración liviana (`ALTER TABLE ADD COLUMN` si falta) para DBs creadas en S1
- `jarvis/config.py` — `JARVIS_CHROMA_PATH`, `JARVIS_LOCAL_FALLBACK_MODEL`, helper `is_ollama_model()`
- `jarvis/pyproject.toml` — dependencia `chromadb`; `build-backend` corregido

---

### S1 — Data model + Inbox worker + Captura Telegram (completado 2026-08-24)

**Paquete jarvis/** (sibling de project/)
- `jarvis/pyproject.toml` — paquete editable, instalar con `pip install -e ../jarvis` desde project/
- `jarvis/config.py` — todas las env vars centralizadas
- `jarvis/observability.py` — Langfuse + OTel (graceful si no están configurados)
- `jarvis/db/schema.py` — CREATE TABLE completos (memory_entries, inbox_queue, memory_projects, conversations, budget_usage, jarvis_policies)
- `jarvis/db/database.py` — `get_connection()` + `init_db()` + crea vault/subdirectorios
- `jarvis/llm/client.py` — `call_llm()` + `call_classify()` + `call_reason()` vía LiteLLM (nunca openai.* ni ollama.* directamente)
- `jarvis/memory/service.py` — `capture_raw()`, `get_entry()`, `update_entry()` — deduplicación por content_hash
- `jarvis/vault/writer.py` — `write_entry()` → .md en vault/RAW|SEMANTIC|DECISIONS|PROJECTS/
- `jarvis/worker/task_manifest.py` — blast radius explícito (5 operaciones permitidas)
- `jarvis/worker/processor.py` — `process_entry()` con reintentos (1min/5min/30min), clasificación Ollama
- `jarvis/worker/main.py` — loop de polling, crash recovery al arrancar
- `project/mybot/jarvis_handlers.py` — `/j <texto>` captura, `/jq <pregunta>` consulta RAG (S3)
- `project/mybot/bot.py` — extendido con `jh.jarvis_init()` al arrancar y handlers /j /jq

---

### S4 — Frontend /jarvis (chat + inbox + budget) (completado 2026-08-25)

**Archivos nuevos:**
- `project/frontend/src/screens/JarvisScreen.jsx` — pantalla principal de Jarvis: TopBar + panel izq (inbox/budget) + chat
- `project/frontend/src/components/jarvis/JarvisInboxPanel.jsx` — panel lateral: lista de inbox con status badges (DONE/PENDING/PROCESSING/ERROR), barra de budget, auto-refresh cada 15s
- `project/frontend/src/components/jarvis/JarvisChat.jsx` — área de chat: burbujas usuario/Jarvis, indicador de typing animado, fuentes colapsables por mensaje, historial sin scroll-jump, input Textarea (Enter = enviar, Shift+Enter = nueva línea), botón borrar historial
- `project/frontend/src/components/jarvis/JarvisCaptureModal.jsx` — modal de captura (abierto desde TopBar CTA o `openJarvisCapture()`): texto libre + flag local_only, llama a `POST /jarvis/capture`

**Archivos modificados:**
- `project/frontend/src/utils/themes.js` — Jarvis en ARCOIRIS_ACCENTS (cian `#06b6d4`), SECTION_NAMES, SECTION_ORDER, APP_MODULES (id: 'jarvis', path: '/jarvis', ctaStore: 'openJarvisCapture')
- `project/frontend/src/utils/i18n.js` — claves `jarvis*` en 'es' y 'en'
- `project/frontend/src/store/useStore.js` — estado Jarvis: `jarvisMessages` (localStorage), `jarvisConversationId` (localStorage), `jarvisLoading`, `jarvisInbox`, `jarvisBudget`, `jarvisCaptureOpen`; acciones: `jarvisQuery`, `jarvisCapture`, `fetchJarvisInbox`, `fetchJarvisBudget`, `jarvisClearHistory`, `openJarvisCapture`, `closeJarvisCapture`
- `project/frontend/src/App.jsx` — import + ruta `/jarvis` + `<JarvisCaptureModal />`
- `project/frontend/src/components/Layout.jsx` — `isJarvis` en `hideSidebar` y `managesOwnLayout`

**Comportamiento de persistencia:**
- `jarvisMessages` se guarda en `localStorage['jarvis-messages']` al recibir cada mensaje
- `jarvisConversationId` se guarda en `localStorage['jarvis-conversation-id']` al recibir la primera respuesta
- Ambas claves se restauran al inicializar el store — el historial persiste entre recargas
- `jarvisClearHistory()` limpia ambas claves de localStorage y resetea el store

**Integración TopBar:**
- En /jarvis, el título muestra "JARVIS" (italic serif, gradient)
- La CTA llama `openJarvisCapture()` → abre JarvisCaptureModal
- Ciclo de módulos: Hábitos → Jarvis → Bóveda (clic en el título)
- El tema de /jarvis tiene su propio slot en sectionThemes/Tones/FontPairs (accent cian en modo arcoíris)

---

## Slices completados

| Slice | Estado | Fecha |
|-------|--------|-------|
| S1 — Data model + Inbox worker + Captura Telegram | ✅ Completo | 2026-08-24 |
| S2 — Embeddings + ChromaDB + Privacy Gateway + Budget Tracker | ✅ Completo | 2026-08-25 |
| S3 — Consultas RAG + API /jarvis/* + /jq Telegram | ✅ Completo | 2026-08-25 |
| S4 — Frontend /jarvis (chat + inbox + budget) | ✅ Completo | 2026-08-25 |
| S5 — Migración Bóveda (script one-time) | ✅ Completo (script listo; migración real pendiente de que el usuario la corra) | 2026-08-25 |

---

## Cómo correr

### Worker
```bash
cd project
.\venv\Scripts\activate
pip install -e ../jarvis   # solo la primera vez
python -m jarvis.worker.main
```

### API (con FastAPI SGR)
```bash
cd project
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 8765
# → /jarvis/query, /jarvis/capture, /jarvis/inbox, /jarvis/budget disponibles
```

### Bot Telegram
```bash
cd project
python mybot/bot.py
# /j <texto> → captura
# /jq <pregunta> → consulta RAG (S3)
```

---

## Flujo completo S1 + S2 + S3

```
# Captura
/j <texto> → jarvis_handlers.capture_raw() → memory_entries (RAW, PENDING)
                                            → inbox_queue (PENDING)
Worker poll → process_entry() → call_classify() (llama3.2:3b via LiteLLM)
           → update memory_entries (type, tags, content_processed)
           → write_entry() → project/vault/{TYPE}/{id[:8]}-{slug}.md
           → update memory_entries (vault_path, processed_at)
           → generate_embedding() (nomic-embed-text via LiteLLM)
           → upsert_embedding() → ChromaDB jarvis_memory
           → update memory_entries (embedded_at)
           → inbox_queue DONE

# Consulta (S3)
/jq <pregunta>  o  POST /jarvis/query
  → get_or_create_conversation(channel, channel_id)
  → add_message(conv_id, 'user', question)
  → retrieve(question, n_results=8)
       → generate_embedding(question) via LiteLLM
       → ChromaDB.query() → IDs + distancias
       → _load_entries(ids) desde SQLite
       → ranking (tipo 40% + similitud 50% + recencia 10%)
       [fallback: LIKE search en SQLite si ChromaDB falla]
  → filter_context(entries) via Privacy Gateway
       → local_only? → bloquear
       → confidential? → bloquear
       → proyecto local_only? → bloquear
       → regex secretos? → bloquear
  → get_recent_messages(conv_id, limit=10) → historial
  → _build_messages(question, safe_entries, history)
  → call_reason(messages)
       → get_status() == EXHAUSTED? → call_llm(fallback) + "[modo local]"
       → call_llm(JARVIS_REASON_MODEL) → budget_usage
  → add_message(conv_id, 'assistant', answer)
  → return {answer, sources, conversation_id, context_count, context_sent}
```

---

## Env vars de Jarvis

```bash
# Jarvis — Memory Core
JARVIS_DB_PATH=         # default: project/database/jarvis.db
JARVIS_VAULT_PATH=      # default: project/vault/
JARVIS_CHROMA_PATH=     # default: project/database/chroma/
JARVIS_LOCAL_MODEL=ollama_chat/gemma3:12b   # default actualizado 2026-08-26, ver bake-off arriba
JARVIS_REASON_MODEL=openai/gpt-4o-mini
JARVIS_EMBED_MODEL=ollama/nomic-embed-text
JARVIS_LOCAL_FALLBACK_MODEL=  # default: mismo que JARVIS_LOCAL_MODEL
JARVIS_OLLAMA_API_BASE= # default: OLLAMA_BASE_URL
JARVIS_DAILY_BUDGET_USD=1.0
JARVIS_WORKER_POLL_INTERVAL=5
# Opcional — Langfuse (self-hosted)
LANGFUSE_HOST=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
# Opcional — OTel
OTEL_EXPORTER_OTLP_ENDPOINT=
```

---

## Próximos slices

Jarvis 0.1 completo. De 0.2, el Slice 1 (consolidación diaria de memoria), el Slice 2
(retrieval coarse-to-fine) y el Slice 3 (memoria de tipo PEOPLE) ya están hechos — ver secciones
al principio de este documento. Sin más slices de 0.2 planificados explícitamente todavía
(duplicados/contradicciones cubiertos por S1, ranking coarse-to-fine cubierto por S2, entidades
person/organization cubiertas por S3; falta Obsidian sync y PII detector completo, ver checklist
de completitud para el alcance original de 0.1).

## Qué NO está todavía

- **Migración Bóveda ejecutada**: **YA SE CORRIÓ** (ver "Migración real de la Bóveda — HECHA"
  más abajo) — las 10 hojas de la Bóveda están en `project/database/jarvis.db`. Este punto queda
  como referencia histórica, no como pendiente.
- Estado `OVERRIDE` del budget tracker (requiere UI adicional; no bloqueante para 0.1)
- Detector completo de PII (0.2, explícito en la spec)
- Clasificación automática de texto libre en Telegram (requiere UI de corrección; diferido)
- Reintentar entradas ERROR desde la API (requiere endpoint adicional; diferido)
- Sincronización Obsidian del vault (diferida a 0.2, D-13 de la spec)
- Migración de ChromaDB a pgvector (diferida a 0.2, D del §15 de la spec)
- Consolidación multi-fuente de `origin_trust` vía `propagate_trust()` (listo pero sin uso en
  producción — 0.2+/Graphiti, según decisión de S2)

---

## Checklist de completitud — Jarvis 0.1

Referencia permanente de lo que se construyó en 0.1 (patrón strangler: SGR sigue funcionando
durante toda la construcción, sin interrupciones).

- [x] **Data model** — `memory_entries`, `inbox_queue`, `memory_projects`,
      `memory_entry_projects`, `conversations`, `conversation_messages`, `budget_usage`,
      `jarvis_policies` en `jarvis.db` (SQLite separada de `app.db` de SGR) — S1
- [x] **Captura** — `/j <texto>` en Telegram y `POST /jarvis/capture` en la API, con
      deduplicación por `content_hash` — S1, S3
- [x] **Worker de background** — polling a `inbox_queue`, clasificación (Ollama vía LiteLLM),
      escritura al vault Markdown, reintentos con backoff (1min/5min/30min), crash recovery al
      arrancar — S1
- [x] **Blast radius explícito** — `TaskManifest` con 6 operaciones permitidas, `assert_allowed()`
      antes de cada efecto secundario del worker — S1
- [x] **Embeddings + ChromaDB** — `generate_embedding()` vía LiteLLM (nunca `ollama.*` directo),
      índice `jarvis_memory` reconstruible — S2
- [x] **Privacy Gateway** — orden exacto de spec §17 (local_only → confidential → proyecto
      local_only → regex de secretos), nunca lanza, bloquea por fragmento — S2
- [x] **Trust propagation** — `propagate_trust()` nunca aumenta `origin_trust` en derivados
      (listo, sin consolidación multi-fuente activa todavía) — S2
- [x] **Budget Tracker** — `record_usage()`, `get_status()` ACTIVE/LOW/EXHAUSTED, fallback a
      modelo local con prefijo `[modo local]` cuando se agota el presupuesto — S2
- [x] **Consultas RAG** — `retrieve()` con ranking por tipo + similitud + recencia, fallback LIKE
      en SQLite si ChromaDB falla o está vacío — S3
- [x] **Historial conversacional** — `conversations` + `conversation_messages`, reutilización de
      conversación por canal — S3
- [x] **API `/jarvis/*`** — `query`, `capture`, `inbox`, `budget`, montada en FastAPI de SGR con
      graceful degradation si Jarvis no está instalado — S3
- [x] **`/jq` en Telegram** — consulta RAG real con feedback inmediato y fuentes — S3
- [x] **Frontend `/jarvis`** — chat con historial persistente, panel de inbox + budget, modal de
      captura, integración completa con theming/i18n/routing de SGR — S4
- [x] **Migración Bóveda** — script `jarvis/cli/migrate_boveda.py` con `--dry-run`, backup
      automático, idempotencia por `content_hash`, manejo de hojas sin texto — S5 (script
      verificado; ejecución real pendiente del usuario)
- [x] **Invariantes respetados en todo 0.1**: LiteLLM como único boundary LLM (nunca
      `openai.*`/`ollama.*` directo); `origin_trust` sin degradación en derivados; worker sin
      requests externos salvo LLM/embeddings ya cubiertos por el manifest; `source_id` obligatorio
      en toda escritura al memory store; políticas en store separado no editable por el LLM.
- [x] **Corrección de infraestructura bloqueante** — carpeta `Jarvis/` → `jarvis/` (Windows
      case-sensitivity en imports) y `build-backend` de `pyproject.toml`, sin la cual S1 nunca
      había corrido de punta a punta — detectado y resuelto en S2.

**Criterio de éxito subjetivo de 0.1** (spec: "la pregunta de RAFAM" — que Jarvis responda mejor
que buscar directamente en la Bóveda) queda para que el usuario lo evalúe en uso real, ahora que
todos los slices están construidos y la migración de datos históricos está lista para correr.

## Notas de estado

- jarvis.db se crea en project/database/ al primer arranque del worker, del bot o del backend SGR
- vault/ se crea en project/ con subdirectorios RAW/ SEMANTIC/ DECISIONS/ PROJECTS/
- chroma/ se crea en project/database/ al primer embedding generado por el worker
- El bot y la API SGR funcionan normalmente si jarvis no está instalado (import con try/except)
- **La carpeta del paquete es `jarvis/` en minúscula, siempre.** Cualquier archivo nuevo dentro
  del paquete debe ir en `jarvis/` (minúscula). No renombrar a `Jarvis/` — rompe `import jarvis`
  en Windows (ver decisiones-implementacion.md 2026-08-25)
- Langfuse y OTel son opcionales — el sistema funciona sin ellos
- ChromaDB es un índice reconstruible; si la colección se pierde, se puede regenerar
  re-embebiendo todas las memory_entries desde el vault Markdown + SQLite
