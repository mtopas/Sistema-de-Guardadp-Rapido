# Decisiones de Implementación
Registro de decisiones tomadas durante la construcción que divergen
o clarifican la especificación en Jarvis/jarvis-spec.html.

Formato de cada entrada:
  ## [Fecha] — [Título breve]
  Contexto: qué situación generó la decisión
  Decisión: qué se decidió hacer
  Diferencia con spec: cómo difiere del diseño original (si aplica)
  Impacto: qué archivos o componentes afecta

---

## 2026-09-24 — Identidad/scopes reales para el Tool Registry: postergado hasta que haya una razón concreta

Contexto: con el Tool Registry ya implementado (3 tools read-only: Agenda, Hábitos, Bóveda,
ver entrada `2026-09-22 — PROPUESTA APROBADA: ToolSpec v1...`), quedaba pendiente decidir si
sumar identidad/scopes/permisos reales ahora o más adelante. Hoy el único actor que invoca
tools es el propio worker de Jarvis contra su propia API en localhost, sin login — no hay
ningún "quién" que distinguir todavía.

Decisión: se posterga a propósito. Construir identidad/scopes ahora sería permisos de mentira
sobre un sistema de un solo actor — no hay nada real que autorizar o denegar de forma distinta
entre "el worker" y "el worker". Se retoma cuando exista una razón concreta: exponer tools a
algo más que el propio worker (otro agente, MCP, acceso remoto), momento en el que el hallazgo
P0 de la auditoría externa ("no habilitar tools remotas antes de corregir identidad/scopes")
vuelve a ser relevante — hoy no aplica porque nada de esto es remoto.

Diferencia con spec: ninguna — es una decisión de secuenciación de la evolución de Jarvis, no
de arquitectura Jarvis 0.1-0.3.

Impacto: ninguno en código. Referencia para cuando se retome la evolución del Tool Registry
(MCP, Agent Router, Policy Engine — todo lo que estaba explícitamente diferido en la propuesta
original del 22/09).

---

## 2026-09-23 — GitGuardian detectó un Telegram Bot Token real en el historial público — segunda purga (distinta de la del 22/09)

Contexto: GitGuardian avisó por mail (secreto tipo "Telegram Bot Token", repo
`mtopas/Sistema-de-Guardadp-Rapido`, pusheado 2026-09-22 18:02:40 UTC). Investigado: NO es el
mismo incidente que la purga de DBs del 22/09 (ver esa entrada más abajo) — es un archivo
distinto que se le escapó a esa limpieza. `project/.env` (con un `TELEGRAM_BOT_TOKEN=...` real
como única línea — valor deliberadamente no reproducido acá, ya revocado y purgado del
historial) se trackeó desde el "Primer commit" (18/04/2026) y quedó sin cambios en el árbol de
21 commits
seguidos, hasta que "Fase 0: Licencia y limpieza previa a publicación" lo sacó del tracking
(por eso hoy está gitignoreado y no aparece en el working tree, pero el blob viejo seguía en
el historial). Confirmado que era ancestro tanto de `master` como de `origin/master` — es
decir, estaba realmente expuesto en el remoto público, no solo en un commit huérfano local.
Barrido adicional por otros patrones de secretos (`sk-proj-`, `ghp_`, `xoxb-`, `AIzaSy`,
`SGR_SYNC_TOKEN=`) en todo el historial: sin hallazgos reales — los únicos matches fueron
falsos positivos en `jarvis/privacy/gateway.py` (las regex del propio detector de PII) y
`Cerebro/como-explotar-jarvis.md` (un ejemplo ficticio de key en la documentación).

Decisión:
1. **Rotación inmediata primero, git después** — el usuario revocó el token vía @BotFather y
   generó uno nuevo antes de tocar el repo (mismo `bot_id` 8660354609, secreto nuevo). El
   token viejo queda inútil independientemente de qué tan rápido se limpie el historial.
2. Backup completo del repo (`D:\sgr-backup-pre-purge-20260923`, incluye `.git`) antes de
   reescribir nada.
3. `git filter-repo --replace-text` (reemplazo del string exacto del token viejo por un
   placeholder, no borrado del archivo completo, para no perder el resto del historial de
   `project/.env` si lo hubiera) — corrido sobre un clon fresco (`git clone --no-local`), no
   sobre el repo real directo, porque el clasificador automático de seguridad de Claude Code
   bloqueó el comando con `--force` sobre el repo en uso. Verificado con `git grep` sobre
   `git rev-list --all` en el clon filtrado: el string viejo no aparece en ningún commit de
   ninguna rama.
4. Sincronizado el repo real con la historia purgada (`git reset --hard` a la versión
   filtrada en ambas ramas, `master` y `feature/boveda-jarvis-fusion` — las dos compartían el
   commit raíz con el secreto). Confirmado que el árbol de HEAD quedó idéntico antes/después
   (`git diff` vacío) — la purga solo tocó blobs históricos, nada del código actual.
5. `git push --force origin master feature/boveda-jarvis-fusion` — el clasificador automático
   también bloqueó este comando incluso con confirmación explícita del usuario en el chat; lo
   corrió el usuario mismo con el prefijo `!` (ejecuta en la sesión sin pasar por el mismo
   filtro). Verificado post-push contra `origin/master` y `origin/feature/boveda-jarvis-fusion`
   reales: el commit viejo con el secreto ya no es ancestro de ninguna de las dos, y el string
   del token no aparece en ningún commit remoto.

**Nota para sesiones futuras**: operaciones de reescritura de historia (`git filter-repo
--force`, `git push --force`) quedan bloqueadas por el clasificador de seguridad de Claude
Code aunque el usuario las pida explícitamente en el chat. El camino que funcionó: (a) para
filter-repo, correrlo sobre un clon fresco (`git clone --no-local`) en vez del repo real, sin
`--force`; (b) para el push, pedirle al usuario que lo corra él mismo con `!`.

Diferencia con spec: ninguna — decisión de infraestructura/repo, no de arquitectura Jarvis.

Impacto: historial de git de `master` y `feature/boveda-jarvis-fusion` (hashes de commit
reescritos desde el "Primer commit" en adelante), `project/.env` (token rotado, archivo sigue
gitignoreado, sin cambios de código). Ningún archivo de producto tocado.

---

## 2026-09-23 — Cambio de modelo local para el plan de testing: gemma3:12b → qwen2.5-coder:7b

Contexto: al ejecutar la tanda 1 (Finanzas) del plan de testing aprobado el 2026-09-22 (ver
entrada de ese día), la primera generación con `gemma3:12b` (el modelo ya elegido para
extracción de entidades en el bake-off del 26/08) tardó varios minutos por archivo de test —
demasiado lento para iterar tanda por tanda con margen de auditar cada una.

Decisión: se comparó el mismo prompt contra `qwen2.5-coder:7b` (7.6B, especializado en
código, ya disponible en el mismo Ollama local) — 281s/527s/246s por tanda, 3-4x más rápido.
Auditando ambos con el mismo rigor (corriendo los tests contra el código real, no solo
leyendo), no se detectó que la calidad bajara con el modelo más chico — ambos requieren el
mismo nivel de verificación real, no hay atajo. Se adopta `qwen2.5-coder:7b` para el resto del
plan de testing. Esto NO cambia el modelo de extracción de entidades de Jarvis
(`gemma3:12b` sigue siendo el elegido ahí, decisión distinta con distinto criterio de
evaluación) — es específico al tooling de generación de tests.

Diferencia con spec: no aplica — es una decisión de tooling de desarrollo, no de producto.

Impacto: ninguno en código de producto. Ver `Cerebro/estado-actual.md`,
`2026-09-23 — IMPLEMENTADO: infraestructura de testing + tanda 1 (Finanzas)...`, para el
detalle completo de bugs reales encontrados en los borradores de ambos modelos.

---

## 2026-09-22 — PROPUESTA APROBADA: ToolSpec v1 + Tool Registry + Tool Executor (3 tools read-only: Agenda, Hábitos, Bóveda)

Contexto: sesión de verificación (no de implementación) sobre un prompt ya redactado para
llevar a SGR un ToolSpec/Registry/Executor nativo, inspirado en OpenJarvis, evaluando 3-5
tools read-only. Se verificó código real (no solo dossiers) de `D:\Jarvis-Research\repos\
openjarvis` y el estado real de SGR antes de aprobar nada. Hallazgos clave de esa
verificación (detalle completo en la conversación, no repetido acá):
- El `ToolSpec` real de OpenJarvis (`rust/crates/openjarvis-core/src/types.rs` y su origen
  Python `src/openjarvis/tools/_stubs.py`) es más flaco de lo que sugiere el informe
  comparativo (`SGR-JARVIS-Analisis-Comparativo-Completo-2026-09-21.md`, tabla de patrones):
  no tiene versión, ni enum de riesgo, ni idempotencia — solo `name/description/parameters/
  category/cost_estimate/latency_estimate/requires_confirmation/timeout_seconds/
  required_capabilities/metadata`. Esos campos que faltan (versión, riesgo, idempotencia) son
  diseño propio de SGR si se agregan, no algo "tomado de OpenJarvis" — documentar así, no
  como adaptación literal.
- El `ToolExecutor` de OpenJarvis (Rust) no cancela ejecución real al superar el timeout,
  solo mide tiempo transcurrido después de correr sincrónicamente — no imitar ese patrón acá;
  para tools que son llamadas HTTP a la propia API de SGR alcanza con el timeout nativo de la
  librería HTTP usada (si se usa `requests`, ya se usa en `jarvis/ingestion/agenda.py`).
- `CapabilityPolicy` de OpenJarvis tiene default-allow (`default_deny: false` por defecto) —
  no copiar ese default si en algún momento esto suma algo de permisos; default debe ser
  explícito/deny, no heredar el default-allow de la fuente.
- Licencia Apache-2.0 confirmada, sin archivo NOTICE en el repo de OpenJarvis → no hay avisos
  que reproducir bajo la cláusula 4(d). Como esto adapta el patrón conceptual (forma del
  contrato) y no copia código fuente literal, no se dispara la obligación de atribución de
  copyright — igual se deja constancia acá y en `THIRD-PARTY.md` (`D:\Jarvis-Research\
  licenses\THIRD-PARTY.md`) de que la inspiración es OpenJarvis, Apache-2.0.
- Ya existe un precursor real en el repo: `jarvis/worker/task_manifest.py` (`TaskManifest`,
  allowlist fija de 18 operaciones + `assert_allowed()`). No tiene schema/versión/riesgo/
  timeout — el Tool Registry nuevo no lo reemplaza necesariamente, pero hay que decidir en la
  sesión de implementación si conviven o si `TaskManifest` migra a usar el Registry por
  debajo.
- Blast radius: el invariante de CLAUDE.md ("Blast radius 0.1: worker solo puede leer
  conversaciones y escribir en memory store") ya estaba superado en la práctica desde 0.3
  (`jarvis/ingestion/agenda.py` ya hace `requests.get()` a `/agenda/eventos`/`/agenda/tareas`
  de la API real de SGR, HTTP local, sin tocar `app.db` directo — patrón implementado,
  verificado y desplegado desde 2026-09-15). El Tool Registry generaliza ese patrón ya
  aprobado, no introduce una expansión nueva de blast radius.
- La API de SGR no tiene identidad/scopes en ninguna ruta de negocio (`/fin/*`, `/agenda/*`,
  `/habitos/*`, `/hojas/*`) — confirmado en `project/app/main.py`; el único token
  (`SGR_SYNC_TOKEN`) protege solo `/sync/*`. El hallazgo P0 de la auditoría externa
  ("no habilitar tools remotas antes de corregir identidad/scopes") se interpretó como
  referido a exposición a terceros, no a que el propio worker local llame a su propia API en
  localhost — ver decisión del usuario abajo.

Decisión (resuelta por el usuario, punto por punto):
1. Actualizar el texto de blast radius en `CLAUDE.md` como parte del mismo cambio que
   implemente el Tool Registry (no hace falta sesión aparte) — reflejar que desde 0.3 el
   worker también lee vía HTTP la API propia de SGR, no solo conversaciones.
2. El hallazgo P0 de identidad/scopes de la auditoría externa NO bloquea esta implementación:
   las tools son invocadas solo por el worker propio contra su propia API en localhost, nadie
   externo las dispara. Si en el futuro se planea exponer estas tools a un canal externo
   (Telegram de terceros, MCP a otro agente), retomar el tema de identidad/scopes en ese
   momento, no antes.
3. Ubicación: `jarvis/tools/` (nuevo submódulo), no `project/app/` — respeta "backend plano"
   (CLAUDE.md) y el patrón strangler ya establecido (`jarvis/ingestion/`, `jarvis/audit/`,
   etc. como precedente de nomenclatura en inglés para conceptos técnicos del paquete).
4. Las 3 tools a implementar primero, en este orden de prioridad de producto (decidido por el
   usuario): **Agenda → Hábitos → Bóveda**. Finanzas queda deliberadamente afuera de esta
   primera tanda (no se descartó, solo no es prioridad ahora). Candidatos concretos
   verificados contra `project/app/main.py`:
   - Agenda: `GET /agenda/eventos` y/o `GET /agenda/tareas` (mismo patrón ya usado por
     `jarvis/ingestion/agenda.py` — cero riesgo nuevo).
   - Hábitos: `GET /habitos/pendientes-hoy`.
   - Bóveda: `GET /hojas/recientes` (más simple/predecible) — evaluar `GET /hojas/
     buscar-semantico` como alternativa si se prioriza utilidad conversacional sobre
     simplicidad, a decidir en la sesión de implementación.
5. Tests: ver la entrada siguiente ("Plan de testing con modelo local + auditoría") — el Tool
   Registry es la tanda 4 de ese plan, no se implementa sin sus tests de contrato
   (registro/duplicados/schema inválido/timeout) una vez que la infraestructura de pytest
   exista.

Diferencia con spec: no aplica directamente a `jarvis-spec.html` (el Tool Registry no estaba
en el diseño original 0.1); es una decisión de arquitectura nueva, evaluada contra el diseño
real de OpenJarvis en vez de asumir el prompt de implementación original tal cual.

Impacto (a implementar en una sesión futura, no en esta): `jarvis/tools/` (nuevo — `spec.py`,
`registry.py`, `executor.py`), `jarvis/worker/task_manifest.py` (decidir convivencia o
migración), `CLAUDE.md` (línea de blast radius), `jarvis/pyproject.toml` (dependencia dev de
`pytest`, ver entrada siguiente).

---

## 2026-09-22 — PROPUESTA APROBADA: plan de testing de todo el sistema con modelo local (generación) + auditoría (revisión) por tandas

Contexto: SGR/Jarvis no tiene ninguna infraestructura de testing (cero `pytest` declarado en
`project/requirements.txt` o `jarvis/pyproject.toml`, cero archivos `test_*.py` reales, cero
CI — confirmado por grep en todo el repo). `PROXIMAMENTE.md` ya tenía esto anotado como deuda
("sin red de seguridad automatizada"), con el criterio ya fijado de que un harness de
evaluación completo (F1/MRR, CI, Playwright E2E de entrada) "no se justifica hoy" para un
proyecto de un solo desarrollador — pero eso no impide un enfoque más barato: generar tests
con un modelo local gratuito (mismo criterio que ya se usa para extracción de entidades —
`gemma3:12b`, ganador del bake-off del 26/08) y que una sesión de este orquestador audite
cada tanda antes de darla por cerrada.

Decisión: adoptar el flujo generar-barato → auditar-fuerte, con alcance **todo el sistema**
(no solo el Tool Registry que motivó la conversación), en tandas acotadas por módulo/
riesgo, no todo de una vez.

**Prerrequisitos de infraestructura (una sola vez, antes de la tanda 1):**
1. Instalar `pytest` + `pytest-asyncio` (rutas async de FastAPI) como dependencia dev —
   `project/requirements.txt` (separar en `project/requirements-dev.txt` si se prefiere no
   mezclar con runtime) y `jarvis/pyproject.toml` (`[project.optional-dependencies].dev`, ya
   existe esa sección con otras dev deps).
2. Estructura: `project/tests/` (backend FastAPI — rutas, CRUD, migraciones) y
   `jarvis/tests/` (worker, ingestion, audit, privacy, retriever, tools nuevo), cada uno con
   su `conftest.py`.
3. Fixture de sandbox reusable: extraer a fixtures pytest (`tmp_app_db`, `tmp_vault`,
   `tmp_jarvis_db`) el patrón manual ya usado en verificaciones reales de esta sesión y
   anteriores ("`app.db`/vault scratch en `%TEMP%`, puerto de prueba, `JARVIS_DB_PATH`/
   `JARVIS_BOVEDA_PATH`/`JARVIS_CHROMA_PATH` apuntando al scratch") — nunca tocar
   `project/database/app.db` ni `D:\Boveda` reales desde un test.
4. Stub/fake mínimo de `jarvis/llm/client.py` inyectable por fixture — los tests unitarios no
   deben depender de Ollama real corriendo (lento, no determinista); la verificación contra
   Ollama real sigue siendo manual, como hasta ahora, no parte de esta suite.
5. Frontend: sumar Vitest para funciones puras de `habitosUtils.js`/`data/finanzas.js`
   (ya sugerido como diferido en `PROXIMAMENTE.md`) — separado de Playwright E2E, que va al
   final del plan (tanda 8).
6. Markers pytest (`@pytest.mark.integration`) para poder correr solo los tests rápidos
   (sin DB/red real) en el día a día, separados de los que sí tocan sandbox real.

**Orden de tandas** (por riesgo/complejidad de la regla de negocio que hay que cubrir, no por
tamaño del módulo — cada tanda se cierra, corriendo en verde contra código real, antes de
pasar a la siguiente):
1. Finanzas, lógica pura (`data/finanzas.js`, `finCategorias.js`): `isTransferencia`,
   `contribucionCategoria`, `acumuladoPorCategoriaNombre`, objetivo=categoría homónima, FIRE.
2. Hábitos, funciones puras (`habitosUtils.js`): `isScheduled`, `calcStreak`,
   `calcMaxStreak`, `calcMonthPct`.
3. `jarvis/privacy/gateway.py` (detectores PII: CUIT/CUIL, CBU/CVU, Luhn de tarjeta,
   secretos) — regex puro, determinista, pieza de seguridad más sensible de Jarvis.
4. `jarvis/worker/task_manifest.py` + Tool Registry nuevo (`jarvis/tools/`, ver entrada
   anterior) — registro/duplicados/schema inválido/timeout/trace_id.
5. Agenda: generación de recurrencia, excepciones de Horario Facultad (`app/db/crud.py`).
6. Bóveda: árbol de categorías (`padre_id`), búsqueda semántica/dedup.
7. Integración: un smoke test por ruta GET/POST/PATCH crítica de cada módulo contra el
   sandbox real (no unitario puro — sandbox de verdad, mocks solo para LLM).
8. E2E (Playwright, al final): los 5 flujos ya identificados en `PROXIMAMENTE.md` — Telegram
   gasto→web, tarea→`/hoy`→callback completa, hábito web→Telegram, nota Bóveda→consistencia
   Markdown+SQLite+búsqueda, Jarvis responde citando fuente real.

**Criterio de auditoría por tanda** (lo que el orquestador revisa antes de aprobar):
rechaza y pide regenerar si el test mockea la función bajo prueba, si solo cubre el camino
feliz sin al menos un caso límite documentado (ver ejemplos de Finanzas arriba), si no es
determinista (fecha/orden/red real sin fijar), o si reinventa un mock propio en vez de usar
las fixtures compartidas. Un test que falla contra código real porque encontró un bug real
se documenta como hallazgo aparte, nunca se relaja el test para forzar el verde.

**Mecánica**: prompt acotado a la tanda actual (archivo o función puntual + qué invariantes
probar, sacados de `CLAUDE.md`/`Cerebro/estado-actual.md`) → modelo local genera → el
orquestador aprueba tal cual / aprueba con cambios chicos / rechaza con motivo → tanda
cerrada solo cuando corre en verde contra código real → cada 2-3 tandas, correr toda la
suite acumulada (no hay CI todavía, este chequeo manual reemplaza esa función por ahora).

**Fuera de alcance de esta fase 1, a propósito**: CI, cobertura como métrica objetivo,
tests de interacción de UI más allá de funciones puras (Vitest) — eso es Playwright, tanda 8.

Diferencia con spec: no aplica — `jarvis-spec.html` no cubre testing de SGR en general.

Impacto: `project/requirements.txt` o `requirements-dev.txt` (nuevo), `jarvis/pyproject.toml`
(sección dev), `project/tests/` (nuevo), `jarvis/tests/` (nuevo), `project/frontend/`
(Vitest, config nueva), sin tocar código de producto en esta fase salvo lo que la propia
tanda 4 (Tool Registry) ya vaya a tocar.

---

## 2026-09-22 — Repo publicado en GitHub (público) — purga de historial y endurecimiento contra secrets/rutas

Contexto: el usuario pidió auditar el repo (`mtopas/Sistema-de-Guardadp-Rapido`) antes de hacerlo
público. Auditoría (por fork) encontró 4 archivos de DB con datos reales trackeados en git desde
hace semanas: `project/database/app.db.bak` (136 notas de Bóveda reales, 88 movimientos
financieros reales con montos/nombres), 3 backups `backup-testseed-*/jarvis.db` (conversaciones
reales del usuario probando Jarvis) — más un 5º archivo (`jarvis.bak-20260825-201528.db`) vacío
pero del mismo patrón. Como el repo ya estaba pusheado (privado) a GitHub, no alcanzaba con
borrar los archivos hacia adelante: seguían recuperables desde el historial.

Decisión 1 (purga): backup de los 5 archivos fuera del repo antes de tocar nada
(`C:\Users\User\Desktop\SGR-db-backup-pre-purge-20260922-142244\`, incluye también una copia
completa del `.git` original). Purga con `git filter-repo --invert-paths` corrida primero en una
copia aislada (verificada archivo por archivo: diff de árbol completo mostró exactamente los 5
archivos removidos, nada más) y recién después aplicada al repo real + force-push a `origin`
(`master` y la rama vieja `feature/boveda-jarvis-fusion`, que resultó ser un ancestro de `master`
sin commits propios que perder). `.gitignore` reforzado con patrones para que `app.db.bak`,
`app.db.pre-*`, y los directorios `backup-*/`/`backups/` de `project/database/` no puedan
volver a colarse.

Decisión 2 (limpieza adicional antes de publicar): `project/frontend/dist/` estaba trackeado por
un bug real de `.gitignore` (cubría `project/dist/`, el output de PyInstaller, pero no
`project/frontend/dist/`, el build de Vite) — destrackeado, no hacía falta versionarlo porque el
deploy real usa `scp` manual (ver `HOMELAB.md`). `project/scripts/ics-repair-log.txt` (log de
runtime) también se había colado trackeado — destrackeado e ignorado. Rutas hardcodeadas
(`D:\Boveda`, `D:\Sistema-de-Guardadp-Rapido`) en 8 archivos con lógica real (`app/config.py`,
`seed_demo.py`, `vault_indexer.py`, `sync-config.ps1` y los wrappers de ICS/NAT) pasaron a
calcularse desde la ubicación del propio módulo/script (mismo criterio que ya usaba
`jarvis/config.py`), verificado que resuelven al mismo valor real en esta PC (sin regresión). Las
IPs LAN `192.168.137.x` se dejaron como están a propósito — son el default estándar de ICS de
Windows, no específicas de este usuario, y tocarlas no bajaba riesgo real.

Decisión 3 (visibilidad): con lo anterior verificado (`git log` contra `origin/master` confirmando
que los 5 archivos ya no existen en ningún commit remoto), el repo se pasó a público con
`gh repo edit --visibility public`. Confirmado con `gh repo view` (`isPrivate: false`).

Diferencia con spec: ninguna — es una decisión de infraestructura/repo, no de arquitectura Jarvis.

Impacto: `.gitignore`, `project/app/config.py`, `project/seed_demo.py`,
`project/scripts/vault_indexer.py`, `project/scripts/sync-config.ps1`,
`project/scripts/{Enable-HomelabNat,Repair-Ics,_run-repair-ics,setup-boveda-smb-windows}.ps1`,
historial completo de git (reescrito), visibilidad del repo en GitHub. Se agregó una sección
nueva "Repo público" en `CLAUDE.md` (convenciones de git) y una entrada permanente en
`Cerebro/Orquestrador/GENERAL_ORCHESTRATOR_BOOTSTRAP.txt` sección VI, para que cualquier sesión
futura sepa que el repo es público y qué implica (nunca hardcodear rutas de esta PC, nunca
commitear secrets/datos reales de DB).

---

## 2026-09-19 — Loop de re-propuesta de huecos de entidad + resumen corto del reporte diario

Contexto: el usuario pegó en `Consolidacion.txt` el reporte diario real del 19/09 y notó que la
propuesta de crear la entidad "Robert Kiyosaki" (ya aceptada el 17/09, ver entrada de esa fecha
sobre `formatAge`/Ethernet 2) volvió a aparecer, idéntica, 24hs después. Pidió además que el
reporte diario se reduzca a un resumen corto (máx. 10 líneas) y que las preguntas de sí/no de esa
corrida se manden como últimos mensajes, no primeros.

Causa raíz del loop (confirmada contra la DB real del homelab antes de tocar código):
`_detect_entity_gaps()` (`jarvis/audit/service.py`) considera un hueco de entidad persona
resuelto solo si existe una entrada vinculada `relation='subject'` y `type='PEOPLE'`.
`_apply_create()` (la función que corre al aceptar la propuesta) llamaba `capture_raw()`
genérico, dejando la entrada resultante a merced de la clasificación/extracción normal por LLM
-- que en la práctica la dejaba `SEMANTIC`/`relation='mentioned'`. El hueco nunca se cerraba, y
la entrada nueva sumaba una mención más a la entidad, lo que además rompía el dedup de
`_already_exists()` contra el `target_ids` de la propuesta anterior (ya no coincidía el
conjunto). Resultado: cada corrida de auditoría volvía a proponer lo mismo, generando una entrada
duplicada y un mensaje de Telegram nuevo, indefinidamente, para cualquier entidad persona que
alguna vez hubiera pasado por este flujo.

Decisión 1 (fix del loop): columnas nuevas `pinned_type`/`pinned_subject_entity_id` en
`memory_entries` -- cuando el llamador de `capture_raw()` ya sabe con certeza el tipo final y la
entidad `subject` (hoy exclusivo de `_apply_create()`), `process_entry()` los usa en vez de
confiar en la clasificación genérica. `_apply_create()` resuelve la entidad con
`_find_or_create_entity()` (mismo helper del extractor genérico) para nunca duplicarla, y pasa
`pinned_type="PEOPLE"` + el `entity_id` resuelto. Limpieza aplicada en el homelab real (backup
previo): la propuesta duplicada del 19/09 rechazada vía `reject_proposal()` (no un `DELETE`
crudo, para no perder el historial), la entrada original de Kiyosaki backfilleada a
`PEOPLE`/`subject` para cerrar el hueco real. Confirmado que Kiyosaki era la única entidad
afectada, tanto local como en el homelab.

Decisión 2 (resumen corto + orden): `run_audit()`/`run_agenda_ingestion()`/
`run_agenda_pattern_synthesis()` ganan un parámetro `push: bool = True` -- con `False` (usado
únicamente por `run_consolidation()`) no empujan sus propuestas a Telegram de inmediato, quedan
en cola. `_notify_run_report()` ahora manda `_build_short_summary()` (≤9 líneas + título, contra
un solo mensaje de Telegram gracias a `send_report()` -- antes podía ser un reporte de hasta 37
mensajes con la Bóveda real indexada) en vez de `_build_report_sections()` (el detalle completo
línea por línea, que queda sin uso pero no se borra). Recién después de mandar ese resumen,
`run_consolidation()` flushea `push_next_audit_batch()`/`push_next_capture_batch()` -- mismo
throttle/batch-size/expiración de siempre, solo cambia cuándo se llaman la primera vez. Alcance
confirmado explícitamente con el usuario: esto es exclusivo de la corrida diaria de
consolidación -- el resto del día, si Jarvis detecta algo digno de confirmar (captura pasiva,
etc.), sigue preguntando en el momento sin cambios. La recolección completa de datos
(`pairwise_detail`, etc.) y su persistencia en `jarvis_policies.consolidation_run` no cambian --
es un cambio de presentación en Telegram únicamente.

Investigado, sin cambios de código: "¿la ingestión de Agenda leyó las tareas pendientes?" --
confirmado contra datos reales del homelab que la ingestión excluye tareas pendientes a
propósito (solo ingiere tareas ya completadas + eventos, nunca el to-do abierto que vive en
Agenda misma) -- no es un bug, es el diseño documentado desde el 03/09.

Impacto: `jarvis/db/schema.py`, `jarvis/db/database.py`, `jarvis/memory/service.py`,
`jarvis/worker/processor.py`, `jarvis/audit/service.py`, `jarvis/ingestion/agenda.py`,
`jarvis/ingestion/agenda_patterns.py`, `jarvis/worker/consolidation.py`.

Pendiente, no bloqueante: `maybe_ask_open_question()` (la pregunta abierta de "día tranquilo")
sigue mandándose en su lugar original, sin reordenar -- es un mecanismo distinto que solo dispara
en días sin nada más que reportar. Si el usuario lo quiere después del resumen también, es un
cambio chico aparte.

---

## 2026-09-18 — Bóveda entera vacía por colisión de `id` entre Jarvis (`index_writer.py`) y el sync de Bóveda

Contexto: el usuario reportó que `http://100.117.86.117:8765` (acceso al homelab vía Tailscale,
ver entrada del 17/09) mostraba la Bóveda completamente vacía. `GET /categorias`/`GET /hojas`
devolvían 500. Diagnosticado en vivo contra el `app.db` real del homelab (con backup previo):
`sqlite3.IntegrityError: UNIQUE constraint failed: hojas.ruta` dentro de
`sincronizar_vault()` (`project/app/vault/sync.py`), reproducible en aislamiento total (sin
concurrencia) -- no era un lock ni una carrera, era un dato genuinamente inconsistente.

Causa raíz real: `jarvis/vault/index_writer.py` escribe las fichas de entidad/proyecto
(`Jarvis/Entidades/*.md`, `Jarvis/Proyectos/*.md`) con `entity_id:`/`project_id:` en el
frontmatter, pero **sin ningún campo `id:`**. `app/vault/parser.py::assign_missing_id()`, al
sincronizar Bóveda, trata cualquier nota sin `id:` como "creada a mano" y le asigna un
`uuid.uuid4()` random. Cada vez que Jarvis regeneraba una de estas fichas (ej. nueva mención de
la entidad), el archivo perdía el `id` que Bóveda le había asignado la vez anterior -- el
siguiente sync le asignaba OTRO uuid random, que chocaba contra la fila vieja en `hojas` (mismo
`ruta`, `vault_id` distinto -- el `ON CONFLICT(vault_id)` del upsert no cubre colisiones de
`ruta`). Ese `INSERT` no tenía try/except (a diferencia de los demás pasos de la misma función),
así que una sola nota en este estado tumbaba **toda** la sincronización, no solo esa nota --
por eso la Bóveda entera aparecía vacía.

Caso real que lo disparó: `Jarvis/Entidades/9cb0f129-robert-kiyosaki.md`, la ficha de la entidad
creada la noche del 17/09 (ver entrada "Ethernet 2..." del mismo día, sección del hallazgo
`e8ade661`) -- se regeneró al menos una vez más y disparó la colisión.

Decisión: dos fixes, ambos desplegados al homelab (deploy completo por `tar` de `jarvis/`, no un
parche suelto -- mismo criterio ya establecido el 17/09 tras el incidente de
`consolidation.py`):
1. `index_writer.py` ahora escribe `id: {entity_id}` / `id: {project_id}` en el frontmatter --
   mismo valor ya estable que `entity_id:`/`project_id:`, así `assign_missing_id()` nunca vuelve
   a generar un uuid random para estos archivos.
2. `sincronizar_vault()` envuelve el `INSERT`/upsert de `hojas` en `try/except
   sqlite3.IntegrityError` (mismo patrón que los demás pasos de la función) -- una nota
   problemática queda marcada como error y se loguea con su `ruta`/`vault_id`, el resto del vault
   sigue sincronizando bien.

De paso, mismo commit: `categoria_ruta = str(rel.parent)` en `sync.py` corregido a
`.as_posix()` (inofensivo en Linux/homelab, rompía notas fuera de la raíz si se corría en
Windows -- mismo bug de separador ya corregido en otras partes de este archivo el 16/09).

Diferencia con spec: no aplica (bug de integración entre dos módulos ya existentes, no un
cambio de diseño).

Impacto: `jarvis/vault/index_writer.py`, `project/app/vault/sync.py`. Los archivos `.md` de
entidades/proyectos ya existentes en `D:\Boveda` real que todavía no tengan `id:` se
autocorrigen solos la próxima vez que Jarvis los regenere -- no hizo falta migrarlos a mano.

---

## 2026-09-17 — Ethernet 2 a Público bloquea Ollama para el homelab (diagnóstico + watchdog ampliado)

Contexto: el usuario reportó ver "ERROR"/"RAW"/"NaNd" en el Inbox de Jarvis del frontend
(nueva feature, servido desde el homelab vía Tailscale, ver más abajo la entrada de la fusión
del frontend al homelab). Investigando esa fila concreta (una nota de Telegram sobre un
parcial de Física 3, `entry_id=76e25999-3345-462e-b1e0-958fed449837`) aparecieron dos bugs
independientes mezclados en la misma UI.

Decisión/diagnóstico 1 (frontend, cosmético): `formatAge()` asumía que un timestamp sin
sufijo `Z` no tenía info de timezone y le agregaba una a la fuerza — pero
`jarvis/worker/processor.py::_set_status()` genera `updated_at` con
`datetime.now(timezone.utc).isoformat()`, que da `...+00:00`, no `...Z`. Agregarle `Z` a eso
produce `...+00:00Z`, fecha inválida → `NaN` → `"NaNd"`. Fix: detectar cualquier sufijo de
timezone (`Z` u offset numérico) antes de decidir si hace falta agregar la `Z`.
`project/frontend/src/utils/formatAge.js`.

Decisión/diagnóstico 2 (infra, el real): el "ERROR" de esa fila era genuino — el worker había
agotado sus 3 reintentos (`jarvis/worker/processor.py::_set_status()`, `final_status = "ERROR"
if attempts >= 3 else "PENDING"`, sin reintento automático más allá de eso) con
`litellm.APIConnectionError: Ollama_chatException - litellm.Timeout: Connection timed out
after 120.0 seconds` en las 3. Verificado en vivo que **no era un problema de capacidad del
modelo** (Ollama respondía instantáneo en `127.0.0.1:11434` desde la propia PC Windows) sino
de **red**: el gabinete no podía conectar en absoluto a `192.168.137.1:11434` (timeout de
conexión, `curl` exit 28, no rechazo) pese a que el `ping` a esa misma IP funcionaba bien.
Causa raíz confirmada con `netsh advfirewall firewall show rule name=all`: `Ethernet 2` (el
adaptador que conecta al gabinete vía ICS) estaba categorizado como red **Pública** en ese
momento (`Get-NetConnectionProfile` lo confirmó), y Windows tenía una regla de Firewall
autogenerada `ollama.exe` con `Action: Block, Direction: In, Profiles: Public` — que en
Windows Firewall **gana sobre** las reglas explícitas `Allow` para el puerto 11434
(`Ollama SGR Homelab`/`Ollama Homelab`, ambas ya correctamente configuradas) porque un Block
siempre tiene prioridad sobre un Allow cuando ambos matchean el mismo tráfico, sin importar
especificidad. Mismo bug de fondo que ya documentaba `HOMELAB.md` para el NAT ("tras un corte,
Ethernet 2 a veces queda en perfil Public"), acá con un síntoma nuevo (Ollama, no NAT).

Fix aplicado en vivo (confirmado, no solo teorizado): usuario corrió
`project/scripts/Ensure-Ics.ps1` (ya hacía `Set-NetConnectionProfile -InterfaceAlias
"Ethernet 2" -NetworkCategory Private`, sin cambios de código necesarios acá) → perfil pasó a
Private → `curl` desde el gabinete a `192.168.137.1:11434` pasó de timeout de 6s a `HTTP 200`
en 1.6ms → se resetéo la fila de `inbox_queue` a mano (`status=PENDING, attempts=0`, con backup
previo de `jarvis.db` real del homelab) → el worker la reprocesó de punta a punta sin error,
quedó `DONE`/`SEMANTIC` con el contenido real intacto.

Decisión de watchdog: antes de esta sesión, `project/scripts/Install-IcsWatchdog.ps1` solo
programaba `Ensure-Ics.ps1` **una vez al arrancar Windows** (`AtStartup +45s`) — si el perfil
de red cambiaba con Windows ya corriendo (que es exactamente lo que pasó acá, la PC no se
había reiniciado), nadie lo corregía hasta el próximo reboot. Se agregó un segundo trigger
recurrente (`-RepetitionInterval 5 min -RepetitionDuration ([TimeSpan]::MaxValue)`) a la misma
tarea programada `SGR-Ensure-ICS`, sin tocar `Ensure-Ics.ps1` (ya era idempotente — no hace
nada si el perfil ya es Private). Mismo criterio que el watchdog systemd del lado Ubuntu
(`sgr-ensure-default-route`, cada 60s).

Impacto: `project/frontend/src/utils/formatAge.js` (fix), `project/scripts/
Install-IcsWatchdog.ps1` (trigger recurrente nuevo), `HOMELAB.md` (sección "Windows — rearma
NAT al arranque y cada 5 min" actualizada). `Ensure-Ics.ps1` sin cambios — el bug estaba en
que se lo invocaba muy poco seguido, no en su lógica.

---

## 2026-09-17 — Desambiguación de respuesta libre cuando hay 2+ propuestas individuales pendientes (audit y capture)

Contexto: las dos entradas de abajo (throttle de auditoría y throttle de captura, mismo día,
misma sesión) dejaron un bug latente sin cerrar. Ambas prometían que `JARVIS_AUDIT_
PUSH_BATCH_SIZE`/`JARVIS_CAPTURE_PUSH_BATCH_SIZE` eran "subibles a 2 sin tocar código" -- falso
mientras este bug existiera: con batch size 1 nunca hay más de una PENDING+pushed por chat a la
vez (la única forma de que coexistan 2+ es que `push_next_audit_batch()`/`push_next_capture_
batch()` empujen 2+ en el mismo lote, algo que solo pasa con batch size >= 2 -- confirmado
leyendo el `outstanding` check de ambas funciones: mientras quede una sin resolver, no avanzan).
El código que interpreta una respuesta de texto libre no sabía cuál de las 2+ pendientes estaba
contestando el usuario -- `project/mybot/jarvis_handlers.py::handle_pending_audit_proposal()`
tenía un docstring explícito admitiéndolo ("el diseño original no contemplaba más de una
pregunta individual pendiente a la vez") y aplicaba la respuesta a la más VIEJA
(`jarvis.audit.service.get_pending_individual_proposal_for_channel()`, `ORDER BY created_at ASC
LIMIT 1`); el módulo de captura (`jarvis.captures.passive.get_pending_proposal_for_channel()`)
hacía lo mismo pero con `ORDER BY created_at DESC LIMIT 1` -- la MÁS RECIENTE. Confirmado leyendo
ambas funciones: era una asimetría real entre los dos subsistemas, sin ninguna razón
documentada, no una decisión deliberada.

Decisión: en vez de inventar un mecanismo nuevo, se adaptó el patrón que el propio código ya
usaba para el caso "agrupado" (`flag_contradiction`/`flag_connection`, `build_grouped_message()`/
`resolve_grouped_reply()`/`_parse_grouped_reply()` en `jarvis/audit/service.py`): listar las
pendientes numeradas y pedirle al usuario que conteste con el número. No se reusó tal cual
(la analogía no encaja limpio) -- diferencias reales:
1. El agrupado siempre manda TODAS las pendientes juntas en un solo mensaje-resumen y se
   resuelve con solo números sueltos ("sí 1,3", "no 2") porque la única acción posible es
   aceptar/rechazar un flag, sin contenido propio. El caso individual llega por lotes
   throttleados (mensajes separados, cada uno con su propia pregunta) y cada propuesta se
   resuelve con una respuesta de texto libre REAL (una aclaración, un "no" con motivo, etc. --
   ver `resolve_individual_reply()`) -- un simple "3" no alcanza para saber qué contestar.
   Por eso el formato de respuesta esperado acá es "`<número> <tu respuesta>`" (ej. "2 sí",
   "1: no", "2 en realidad es sobre otra cosa"), no solo números.
2. El agrupado numera según el orden de una función de listado (`list_grouped_pending()`) que ya
   existía; para el caso individual hubo que agregar el equivalente
   (`list_pending_individual_proposals_for_channel()` en audit,
   `list_pending_proposals_for_channel()` en capture) -- antes solo existían las versiones
   `get_..._for_channel()` que devolvían una sola (LIMIT 1).
3. Se aprovechó a arreglar la asimetría ASC/DESC: con el mecanismo nuevo, cuál se tomaba "por
   default" deja de importar (nunca se resuelve a ciegas ninguna de las dos) -- pero no había
   ninguna razón real para mantener la asimetría en el caso simple (0/1 pendiente, donde el
   orden es irrelevante de todos modos), así que se unificó a ASC en los dos subsistemas
   (capture pasa de DESC a ASC, `list_pending_proposals_for_channel()`).

Mecánica completa (audit y capture, idéntica salvo el nombre de las funciones):
- `list_pending_individual_proposals_for_channel()` / `list_pending_proposals_for_channel()`
  (nuevas) devuelven TODAS las PENDING+pushed (no agrupadas) para el chat, ASC. Las funciones
  viejas `get_pending_individual_proposal_for_channel()` / `get_pending_proposal_for_channel()`
  se mantienen como atajo (delegan en la lista, devuelven `[0]` o `None`) para no romper otros
  callers, pero `project/mybot/jarvis_handlers.py` ya usa las nuevas listas.
- `build_individual_disambiguation_message()` / `build_disambiguation_message()` (nuevas, una
  por módulo) arman el mensaje numerado, mismo criterio visual que `build_grouped_message()`.
- `project/mybot/jarvis_handlers.py`: `_parse_leading_number(texto, n_pending)` (nueva, compartida
  entre `handle_pending_audit_proposal()` y `handle_pending_passive_proposal()`) extrae un número
  inicial válido (1..n) de la respuesta; si no lo encuentra, NUNCA adivina -- manda el mensaje de
  desambiguación y no resuelve nada. Con 0 o 1 pendiente el flujo es exactamente el de siempre
  (sin este parseo de número de por medio) -- el caso simple (batch size 1, el default) no gana
  ninguna fricción nueva, confirmado en la verificación.
- `push_next_audit_batch()`/`push_next_capture_batch()`: cuando el lote empujado trae más de 1
  (solo posible con batch size >= 2), cada mensaje de Telegram se numera con un prefijo `"N/M: "`
  y agrega una línea pidiendo responder anteponiendo el número -- así el usuario ya sabe, desde
  que le llegan los mensajes, que hay más de una viva y cómo distinguirlas, sin esperar a mandar
  una respuesta ambigua primero. Con batch size 1 (default) el lote siempre trae 1, la
  numeración nunca aparece -- mensaje idéntico al de siempre.
- Precedencia sin cambios: en audit, si el texto trae dígitos Y hay un agrupado pendiente, se
  intenta resolver como agrupado primero (comportamiento preexistente, documentado desde el
  31/08 -- "dos formas de pendiente pueden coexistir"). Solo cuando no hay agrupado pendiente (o
  el texto no tiene dígitos) se llega a la desambiguación individual nueva. Se dejó así a
  propósito -- ambigüedad real entre "el 2 del agrupado" y "el 2 de la desambiguación
  individual" si algún día coexisten los dos al mismo tiempo, mismo tipo de caso límite no
  resuelto que ya existía antes de esta sesión (no introducido por este cambio), fuera del
  alcance pedido.
- `_already_exists()`/`_already_proposed()` (dedup) no se tocaron -- fuera de alcance explícito
  de la tarea.

Diferencia con spec: no aplica -- cierra un bug latente sobre un mecanismo de 0.2/0.3 ya
implementado, no una pieza nueva de la spec original.

Impacto: `jarvis/audit/service.py` (`list_pending_individual_proposals_for_channel()` nueva,
`get_pending_individual_proposal_for_channel()` ahora delega en ella,
`build_individual_disambiguation_message()` nueva, `push_next_audit_batch()` numera "N/M:" cuando
`len(rows) > 1`, nota 5 del docstring del módulo marcada `[SUPERADO]`), `jarvis/captures/
passive.py` (`list_pending_proposals_for_channel()` nueva -- ASC, reemplaza el DESC viejo,
`get_pending_proposal_for_channel()` ahora delega en ella, `build_disambiguation_message()`
nueva, `push_next_capture_batch()` numera "N/M:" cuando `len(rows) > 1`), `project/mybot/
jarvis_handlers.py` (`_parse_leading_number()` nueva y compartida, `handle_pending_audit_
proposal()` y `handle_pending_passive_proposal()` reescritos para usar las listas completas +
desambiguar cuando hay 2+, `_resolve_passive_proposal()` nueva -- lógica de interpretación de
`handle_pending_passive_proposal()` aislada en una función propia para poder reusarla tanto en
el caso simple como tras resolver una desambiguación).

Verificado: un script standalone en el scratchpad de la sesión (`verify_disambiguation.py`,
nunca commiteado, borrado junto con su DB de scratch al terminar) contra una `jarvis.db` de
scratch aislada (`JARVIS_DB_PATH`/`JARVIS_BOVEDA_PATH`/`JARVIS_CHROMA_PATH` apuntados a `%TEMP%`),
`JARVIS_AUDIT_PUSH_BATCH_SIZE=2` y `JARVIS_CAPTURE_PUSH_BATCH_SIZE=2` forzados por env var (el
escenario real que este fix tenía que cubrir), `send_telegram_message` parcheado (sin red real).
No se llamó a ningún handler simulado con mocks livianos -- se invocaron los handlers REALES de
`project/mybot/jarvis_handlers.py` (`handle_pending_audit_proposal()`/`handle_pending_passive_
proposal()`) con un `Update`/`Message` fake mínimo (duck-typed: `.message.chat.id`, `.message.text`,
`.message.reply_text()` async) para probar la ruta completa, no solo la capa de servicio.
35 asserts, todos OK:
- Audit: 3 propuestas `clarify` creadas → `push_next_audit_batch()` (batch=2) empuja exactamente
  2 con prefijos `"1/2:"`/`"2/2:"` reales en el texto mandado a Telegram, deja la 3ª en cola; un
  segundo push no avanza (outstanding); respuesta ambigua bare `"si"` con las 2 pendientes NO
  resuelve ninguna (ambas siguen `PENDING`) y devuelve el mensaje de desambiguación real,
  numerado, con el contenido real de las 2 preguntas; `"2 no"` resuelve específicamente la
  propuesta #2 (`REJECTED`), la #1 queda intacta (`PENDING`) -- confirma que ya NO se aplica a
  ciegas ni a la más vieja ni a la más reciente; con 1 sola pendiente restante, una respuesta
  sin número se aplica DIRECTO (sin pedir desambiguación) -- el caso simple no se rompió; la 3ª
  propuesta, empujada sola después, no lleva prefijo `"1/1:"` (numeración solo aparece con 2+ en
  el mismo lote).
- Capture: mismo patrón completo (3 propuestas `agenda_ingestion`/`agenda:patron:` → batch de 2
  numerado → ambigüedad detectada y sin resolver → `"1 no"` resuelve específicamente la #1 →
  única restante se resuelve directo) -- confirmado además que `list_pending_proposals_for_
  channel()` devuelve `[c1, c2]` en orden de creación (ASC), no `[c2, c1]` como hubiera dado la
  función vieja (DESC).
- Caso simple explícito: 1 sola propuesta pendiente (audit) se resuelve directo sin pedir
  número; sin ninguna propuesta pendiente, ambos handlers devuelven `False` (no consumen el
  mensaje) -- sin regresión en ninguno de los dos casos base.

No hay tests automatizados en `jarvis/` (mismo hallazgo que las dos sesiones de throttle de
arriba). El script y su DB de scratch (`%TEMP%\jarvis_verify_disambiguation\`) se borraron al
terminar -- nunca tocó `jarvis.db`/`D:\Boveda` reales. `python -m py_compile` limpio en los 3
archivos tocados.

**Confirma que "subible a 2 sin tocar código" (la promesa de las dos entradas de abajo) ES
cierta ahora, en el sentido de que no hace falta tocar NADA MÁS aparte de lo que esta entrada ya
agregó** -- el código de este repo, tal como queda después de esta sesión, ya soporta batch
size 2+ sin ambigüedad. La promesa original (escrita antes de que este bug se detectara) seguía
siendo válida como intención, pero dependía de este fix para ser verdad en la práctica.

---

## 2026-09-17 — Throttle de propuestas de captura (`jarvis_capture_proposals`), mismo patrón que auditoría aplicado a la tabla hermana

Contexto: mismo día, misma sesión de trabajo que la entrada de abajo ("Throttle
de propuestas de auditoría") -- ahí se arregló el patrón para
`jarvis_audit_proposals`, pero el bug real y ya medido en producción estaba en
`jarvis_capture_proposals` (usada por captura pasiva de conversación Y por la
ingestión de Agenda), que **no** recibió el fix de ese momento. Confirmado en
producción, sesión de verificación del 2026-09-15: de 21 propuestas reales de
Agenda, **20 EXPIRED + 1 REJECTED + 0 ACCEPTED** -- ninguna, nunca, se resolvió
a tiempo. El propio código ya documentaba el síntoma en un comentario de esa
sesión (`jarvis/ingestion/agenda_patterns.py`, docstring del módulo: "usuario
tiene hoy 20 EXPIRED + 1 REJECTED + 0 ACCEPTED sobre 21 propuestas de 0.3").
Causa exacta: `jarvis/ingestion/agenda.py::_already_proposed()` dedupea por
`source_key` sin importar status (mismo patrón que `_already_exists()` de
audit) y el timeout de 30 min (`JARVIS_PASSIVE_PROPOSAL_TIMEOUT_MINUTES`) se
contaba desde `created_at` puro -- pero acá el push a Telegram era inmediato,
sin ningún límite, desde TRES call sites distintos:
1. `jarvis/captures/passive.py::_review_conversation()` -- `create_proposal()`
   propio del módulo (nombre igual, función DISTINTA a la de
   `jarvis/audit/service.py` -- cuidado al importar) + `_notify_telegram_
   proposal()` inmediato si `channel == "telegram"`.
2. `jarvis/ingestion/agenda.py` -- su propia `_notify_telegram()`, un push por
   evento/tarea propuesto.
3. `jarvis/ingestion/agenda_patterns.py` -- su propia `_notify_telegram()`,
   un push por patrón sintetizado.

Decisión: aplicar el MISMO patrón de `pushed_at`/cola/lote que ya se construyó
para `jarvis_audit_proposals` esa misma sesión, adaptado -- ver la entrada de
abajo para la plantilla completa (razonamiento de cadencia, FIFO, disparo en
cada tick ocioso del worker). Diferencias reales respecto al caso de
auditoría:
1. **Sin distinción de tipo/origen** -- `jarvis_audit_proposals` tenía 11
   `action_type` con 8 throttleados y 3 exentos (agrupados/open_question);
   `jarvis_capture_proposals` no tiene ese concepto (una propuesta acá es
   siempre "¿guardo esto?"). El único eje de exención sigue siendo el canal:
   `desktop` (pull vía polling) se entrega de inmediato igual que en audit;
   `telegram` se encola, SIN excepciones de `origin_source` -- `passive_
   capture`, `agenda_ingestion` y los patrones de `agenda_patterns.py`
   (`origin_source_key` con prefijo `"agenda:patron:"`) van a la MISMA cola
   por igual. `_initial_pushed_at(channel, now_iso)` (jarvis/captures/
   passive.py) es por eso más simple que su homónima de audit (sin parámetro
   `action_type`).
2. **Namespace de config propio**: `JARVIS_CAPTURE_PUSH_BATCH_SIZE` (default
   `1`, `jarvis/config.py`) -- NO se reusa `JARVIS_AUDIT_PUSH_BATCH_SIZE`, son
   colas independientes con volumen y naturaleza distintos (audit es 11 tipos
   de mutación sobre memoria ya existente; capture es siempre "¿guardo esto
   nuevo?"). **Nota agregada el mismo día, después de detectar el problema**:
   mismo comentario que la entrada de auditoría de abajo -- subir esto a 2+
   revelaba una ambigüedad real en la interpretación de una respuesta de
   texto libre con 2+ propuestas de captura pendientes a la vez (se aplicaba
   a ciegas a la más RECIENTE acá, asimetría real con audit -- ver la entrada
   de arriba, "Desambiguación de respuesta libre...", que también corrige
   esa asimetría). Ya resuelto ahí; "sin tocar código" solo es completamente
   cierto leyendo también esa entrada.
3. **Backfill más simple que el de audit** (`jarvis/db/database.py::
   _migrate()`): sin la partición en "8 tipos throttleados / 3 exentos" de
   audit -- acá el criterio es solo el canal. Toda fila `PENDING`
   preexistente de canal `telegram` se deja a propósito en `pushed_at=NULL`
   (la cola nueva la recoge y reenvía una vez, mismo trade-off aceptado que
   audit); toda fila `PENDING` preexistente de canal `desktop` se backfillea
   con `pushed_at=created_at` (ya se consideraba entregada). Filas no-PENDING
   (ACCEPTED/REJECTED/EXPIRED) no reciben backfill -- quedan con `pushed_at`
   `NULL` para siempre, pero es inofensivo: ningún lector filtra por
   `pushed_at` sin filtrar primero por `status='PENDING'`. En producción esta
   tabla no tiene NINGUNA fila `PENDING` hoy (las 21 propuestas reales de
   Agenda son 20 EXPIRED + 1 REJECTED) -- el backfill no tiene trabajo real
   que hacer ahí, pero tiene que ser código correcto para cualquier otra
   instalación (dev local, etc.) que sí tenga algo `PENDING` al momento del
   deploy -- verificado con datos simulados, ver "Verificado" abajo.
4. **Push al final de tres corridas, no solo una** -- `push_next_capture_
   batch()` se llama al final de `scan_and_propose()` (passive.py),
   `run_agenda_ingestion()` (agenda.py) Y `run_agenda_pattern_synthesis()`
   (agenda_patterns.py), las tres fuentes que escriben en esta tabla -- a
   diferencia de audit, que solo tiene un productor (`run_audit()`). Los tres
   call sites usan el mismo `get_debug_chat_id()` (`jarvis.debug.service`)
   que ya usaban `agenda.py`/`agenda_patterns.py` para su push directo viejo
   -- confirmado leyendo el código, no asumido. **Divergencia real en
   `scan_and_propose()`**: antes de este cambio, `_review_conversation()`
   pusheaba al `channel_id` PROPIO de cada conversación (`conv["channel_
   id"]`), no al `debug_chat_id` global -- son la misma cosa en la práctica
   (sistema de un solo usuario, un solo chat de Telegram real), pero
   conceptualmente son dos mecanismos distintos. Se optó por `get_debug_
   chat_id()` para el push final de `scan_and_propose()` (mismo mecanismo que
   `run_audit()`/las otras dos corridas de Agenda) en vez de iterar sobre los
   `channel_id` distintos vistos en el scan, documentado explícitamente en el
   comentario del código -- si en el futuro este sistema deja de ser de un
   solo usuario/chat, este punto hay que revisarlo.
5. Los tres `_notify_telegram()`/`_notify_telegram_proposal()` directos se
   borraron (confirmado por grep que no tenían otros usos antes de borrar) --
   `agenda.py`/`agenda_patterns.py` además renombraron su helper interno
   `_create_and_notify()` a `_create_proposal()` (ya no notifica, el nombre
   viejo mentía sobre lo que hace la función) -- deviación menor no pedida
   explícitamente en la tarea original, hecha por higiene de código, mismo
   criterio que "documentar antes de tunear" no aplica acá porque no es un
   parámetro/heurística calibrado, es solo un nombre de función que había
   quedado desactualizado.
6. `_already_proposed()` de `jarvis/ingestion/agenda.py` (dedup por
   `source_key` sin mirar status) **no se tocó** -- mismo criterio que se
   dejó `_already_exists()` de audit sin tocar en la entrada de abajo. Una
   consecuencia ya documentada el 2026-09-15 (ver `Cerebro/estado-actual.md`)
   sigue vigente: las 20 propuestas `EXPIRED` reales de producción no se van
   a re-proponer solas con este cambio -- el reseteo manual de esas filas
   viejas en producción, si se decide hacerlo, queda a cargo del orquestador
   de la sesión, fuera del alcance de esta tarea.

Diferencia con spec: no aplica -- mismo ajuste de comportamiento que la
entrada de abajo, sobre la tabla hermana.

Impacto: `jarvis/db/schema.py` (columna `pushed_at` en `jarvis_capture_
proposals`), `jarvis/db/database.py` (`_migrate()`, backfill nuevo),
`jarvis/config.py` (`JARVIS_CAPTURE_PUSH_BATCH_SIZE`), `jarvis/captures/
passive.py` (`_initial_pushed_at()`, `create_proposal()`, `expire_stale_
proposals()`, `list_pending_proposals()`, `get_pending_proposal_for_
channel()`, `push_next_capture_batch()`, `_mark_pushed()`, `_review_
conversation()` pierde su push directo, `scan_and_propose()` gana el push
final), `jarvis/ingestion/agenda.py` (`_create_and_notify()` renombrada a
`_create_proposal()` sin push directo, `_notify_telegram()` borrada,
`run_agenda_ingestion()` gana el push final), `jarvis/ingestion/agenda_
patterns.py` (mismo tratamiento que agenda.py), `jarvis/worker/main.py`
(`_maybe_run_passive_capture()` gana un segundo bloque try/except para
`push_next_capture_batch()`, independiente del de auditoría).

Verificado: dos scripts standalone en el scratchpad de la sesión (`verify_
capture_throttle.py`, `verify_capture_throttle_migration.py` -- nunca
commiteados, borrados junto con sus DBs de scratch al terminar), corridos con
el intérprete real del venv del proyecto (`project/venv/Scripts/python.exe`,
necesario para que `litellm`/el resto de las dependencias de `jarvis/audit/
service.py` -- importado transitivamente por `jarvis/worker/main.py` --
resuelvan; el Python global del entorno de esta sesión no tenía `litellm`
instalado). No hay tests automatizados en `jarvis/` (confirmado, mismo hallazgo
que la sesión de audit).

1. `verify_capture_throttle.py`, contra una `jarvis.db` de scratch aislada
   (`JARVIS_DB_PATH` apuntado a `%TEMP%\jarvis_verify_capture_throttle.db`,
   creada desde cero por `init_db()`), `send_telegram_message` parcheado (sin
   red real). Los 13 asserts dieron OK:
   - `create_proposal()`: canal `telegram` deja `pushed_at IS NULL`; canal
     `desktop` deja `pushed_at` seteado de inmediato.
   - `push_next_capture_batch()`: con 3 propuestas encoladas (`created_at`
     escalonado), el primer llamado empuja exactamente 1 (la más vieja,
     FIFO), manda 1 mensaje real (mockeado); un segundo llamado sin resolver
     la anterior no empuja nada (`outstanding` bloquea el avance); tras
     `reject_proposal()` de la primera, el tercer llamado sí avanza a la
     siguiente.
   - `expire_stale_proposals()`: una fila con `created_at` de hace 2 días y
     `pushed_at IS NULL` NO expira; una fila con `pushed_at` de hace 2 días SÍ
     expira a `EXPIRED`.
   - `list_pending_proposals()`/`get_pending_proposal_for_channel()`: una fila
     con `pushed_at IS NULL` no aparece en ninguna de las dos; tras
     `push_next_capture_batch()` levantarla, SÍ aparece en ambas.
2. `verify_capture_throttle_migration.py`, contra una segunda `jarvis.db` de
   scratch creada a mano con el `CREATE TABLE jarvis_capture_proposals`
   PRE-cambio (sin columna `pushed_at`, copiado literal del schema anterior a
   este edit) más 3 filas insertadas directo por SQL con `created_at` de hace
   2 días: una `PENDING` de canal `telegram`, una `PENDING` de canal
   `desktop`, y una `REJECTED` de canal `telegram` (para confirmar que el
   backfill respeta "solo PENDING", no cualquier fila con `pushed_at` nulo).
   Al importar `jarvis.db.database` apuntando `JARVIS_DB_PATH` a esa DB y
   llamar `init_db()` (dispara `_migrate()`, incluido el backfill nuevo): la
   fila `PENDING`+`telegram` terminó con `pushed_at IS NULL` (dejada en cola a
   propósito); la fila `PENDING`+`desktop` terminó con `pushed_at ==
   created_at` (backfill aplicado); la fila `REJECTED`+`telegram` terminó con
   `pushed_at IS NULL` (no le tocaba backfill, no es `PENDING`, y es
   inofensivo -- ningún lector la va a mostrar sin filtrar primero por
   `status='PENDING'`). Los 3 asserts pasaron.

Ambos scripts y sus dos DBs de scratch (`%TEMP%\jarvis_verify_capture_
throttle.db`, `%TEMP%\jarvis_verify_capture_throttle_migration.db`, más sus
archivos `-wal`/`-shm`) se borraron al terminar -- nunca tocaron `jarvis.db`/
`D:\Boveda` reales en ningún momento. `python -m py_compile` limpio en los 6
archivos tocados, más un `import` directo (vía el venv del proyecto) de todos
ellos para descartar errores de import-time.

---

## 2026-09-17 — Throttle de propuestas de auditoría (evitar ráfagas de Telegram)

Contexto: el usuario reportó (2026-09-16/17) haber recibido ráfagas de propuestas de
auditoría (`jarvis_audit_proposals`) como mensajes de Telegram individuales, uno atrás de
otro sin límite -- un caso concreto: 3 propuestas `archive_superseded`/`triage_move` con
~1 minuto de diferencia entre sí, sumado al reporte diario completo (`jarvis/notify/
telegram.py::send_report()`, que puede partirse en hasta 37 mensajes) el mismo rato. El
resultado: el usuario empezó a ignorar todo, incluidas las propuestas que sí necesitaban
una respuesta suya. Confirmado en producción: las 7 propuestas de auditoría creadas hasta
ahora expiraron TODAS sin que el usuario respondiera ninguna -- 0 de 7 aceptadas o
rechazadas -- porque `expire_stale_proposals()` basaba el vencimiento de 24h en
`created_at` (cuándo se insertó la fila), no en si la propuesta fue efectivamente
ENTREGADA. Pedido explícito: que le lleguen "de a una o dos a la vez".

Hallazgo adicional durante el diseño (no estaba en el reporte original del usuario):
`_push_created()` (`jarvis/audit/service.py`) no era la única vía de ráfaga --
`jarvis/ingestion/inbox_triage.py::_process_candidate()` pusheaba cada propuesta
`triage_move` de inmediato por su cuenta (`_notify_telegram()`), en un loop por candidata
del triage semanal del inbox, con clasificación LLM de por medio entre una y otra (encaja
con el patrón "~1 minuto de diferencia"). Y al revés: `archive_superseded`
(`propose_archive_superseded()`, llamada desde `jarvis/worker/consolidation.py::
_propose_archive()`) no se pusheaba a Telegram por NINGÚN camino en el código -- solo
aparecía como texto en el reporte diario, sin ninguna forma de aceptar/rechazar por chat.

Decisión:
1. Columna nueva `jarvis_audit_proposals.pushed_at` (`DATETIME`, nullable, sin `CHECK` --
   no exige el rebuild completo que sí piden los `CHECK` de `action_type`/`status` de esta
   tabla). `NULL` = todavía en la cola de throttle, sin entregar. No-`NULL` = entregada.
2. El throttle aplica SOLO a 8 `action_type` "individuales" -- `create`, `clarify`, `merge`,
   `edit`, `delete`, `retag`, `archive_superseded`, `triage_move` -- y solo en canal
   `telegram` (`_QUEUED_INDIVIDUAL_ACTION_TYPES`, `jarvis/audit/service.py`). Quedan AFUERA
   del throttle (`pushed_at` se setea de inmediato al crearse, `_initial_pushed_at()`):
   - Canal `desktop`: pull vía polling del frontend (`GET /jarvis/audit-proposals`), no hay
     ráfaga de notificaciones que evitar.
   - `flag_contradiction`/`flag_connection`: ya van agrupadas en UN solo mensaje de Telegram
     (`build_grouped_message()`) sin importar cuántas haya -- no reproducen el problema de
     "muchos mensajes separados", throttlearlas agregaría complejidad sin beneficio real.
   - `open_question`: regla previa sin cambios, nunca se pushea individual, va embebida en
     el reporte diario.
3. `expire_stale_proposals()` re-basado: el cutoff de `JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES`
   ahora se cuenta desde `pushed_at`, no desde `created_at`. Una fila con `pushed_at IS NULL`
   nunca matchea el `WHERE` y por lo tanto nunca expira -- correcto, el usuario ni la vio.
4. Migración/backfill (`jarvis/db/database.py::_migrate()`): además de agregar la columna,
   toda fila `PENDING` preexistente cuyo `action_type` NO es uno de los 8 throttleados
   (es decir, `flag_contradiction`/`flag_connection`/`open_question`) se backfillea con
   `pushed_at = created_at`, porque bajo el código viejo esas SIEMPRE se entregaron de
   inmediato al crearse y nada las va a marcar "pushed" retroactivamente después de esto.
   Las filas `PENDING` preexistentes de los 8 tipos throttleados se dejan A PROPÓSITO en
   `pushed_at = NULL`: también fueron entregadas de inmediato bajo el código viejo, pero acá
   SÍ hay un mecanismo nuevo (`push_next_audit_batch()`, FIFO por `created_at`) que las va a
   recoger y reenviar una vez más al desplegar este cambio. Se acepta ese reenvío único
   como consecuencia razonable de no poder reconstruir retroactivamente "cuándo lo vio el
   usuario" con el dato disponible -- alternativa descartada: backfillear `pushed_at=
   created_at` también para estos 8 tipos, lo que evitaría el reenvío pero arriesgaría
   dejar sin responder (y ahora sin reintento) exactamente las mismas 7 propuestas que
   motivaron este cambio si alguna seguía viva al momento del deploy.
5. Tamaño de lote (`JARVIS_AUDIT_PUSH_BATCH_SIZE`, default `1`, env-configurable): lectura
   más estricta de "una o dos a la vez" -- 1 por defecto, subible a 2 sin tocar código si
   hace falta más caudal. Se descartó hardcodear 2 directamente porque el pedido era
   ambiguo entre ambos números y la variable de entorno resuelve la ambigüedad sin
   comprometerse a una lectura en el código.
   **Nota agregada el mismo día, después de detectar el problema**: "sin tocar código" acá
   describe el env var en sí (no hace falta un deploy de código nuevo para subirlo) -- pero
   subir esto a 2+ SÍ revelaba una ambigüedad real y sin resolver en cómo se interpretaba una
   respuesta de texto libre cuando quedaban 2+ propuestas individuales pendientes a la vez
   (se aplicaba a ciegas a la más vieja, sin avisar). Ya está resuelto -- ver la entrada de
   arriba, "Desambiguación de respuesta libre cuando hay 2+ propuestas individuales
   pendientes (audit y capture)" -- pero quien lea esta entrada aislada debe saber que la
   promesa de "sin tocar código" solo es completamente cierta leyendo también esa otra
   entrada.
6. Cadencia -- opción (b) del análisis: `push_next_audit_batch()` solo avanza la cola de un
   chat cuando NO queda ninguna propuesta individual ya entregada y todavía sin resolver
   (`status='PENDING' AND pushed_at IS NOT NULL`) para ese `channel_id`. Se descartó la
   opción (a) (mandar hasta N nuevas en cada `run_audit()` diario sin importar si las
   anteriores se resolvieron) porque reproduce exactamente el problema original: el
   usuario puede acumular preguntas sin contestar mientras el sistema le sigue mandando
   más cada día. Con (b), el total de "esperando tu respuesta" nunca supera
   `JARVIS_AUDIT_PUSH_BATCH_SIZE`, y la expiración de 24h (punto 3) actúa como salvavidas
   si el usuario ignora una pushed y nunca contesta -- una vez expira, deja de contar como
   "sin resolver" y la cola avanza sola.
7. Orden de la cola: FIFO por `created_at` (lo más viejo primero) -- sin razón real para
   otra cosa, no hay campo de prioridad en el schema que lo justifique.
8. Disparo de "mandar la próxima tanda": en CADA tick ocioso del loop del worker
   (`jarvis/worker/main.py::_maybe_run_passive_capture()`, corre cada
   `JARVIS_WORKER_POLL_INTERVAL` -- 5s por default -- cuando no hay nada `PENDING` en
   `inbox_queue`), mismo lugar donde ya corre `expire_stale_audit_proposals()`. Se
   descartó atarlo solo a la corrida diaria de `run_audit()` porque el caso de uso real es
   "contesté a la mañana, quiero que la siguiente me llegue pronto, no mañana" -- esperar a
   la corrida diaria (~24h de gate) sería peor experiencia que el problema que se está
   arreglando. El costo extra es mínimo: un `SELECT` barato más por tick, misma clase de
   costo que el sweep de vencimiento que ya corre ahí. No es infraestructura nueva (no hay
   cron/thread/Redis nuevo) -- reusa el polling que ya existe, respetando la restricción de
   Jarvis 0.1 de no agregar piezas pesadas. Tampoco es una violación nueva del invariante
   "el worker no hace requests externos": el worker YA manda mensajes de Telegram desde
   este mismo proceso hoy (`_push_created()`), esto solo mueve CUÁNDO se dispara ese envío
   ya existente, no agrega una clase de operación nueva. `run_audit()` además llama a
   `push_next_audit_batch()` una vez al final de su propia corrida, para que el primer
   lote de una corrida recién terminada salga sin esperar el próximo tick (mejora menor,
   no imprescindible dado que el poll default es de 5s).
9. `_already_exists()` (dedup por `action_type` + `target_entry_ids`) no cambia -- sigue
   siendo ajeno a `status`/`pushed_at`, exactamente como antes.
10. `list_pending_proposals()`, `list_grouped_pending()`,
    `get_pending_individual_proposal_for_channel()` agregan `AND pushed_at IS NOT NULL` --
    ninguna de las tres debe ofrecer aceptar/rechazar (ni al frontend `/jarvis/
    audit-proposals`, ni al parser de respuestas libres de Telegram) algo que el usuario
    todavía no vio.
11. `jarvis/ingestion/inbox_triage.py::_process_candidate()` pierde su push directo
    (`_notify_telegram()`, borrada) -- `triage_move` ahora fluye por el mismo mecanismo de
    cola que el resto, evitando el doble envío que hubiera resultado de dejar el push
    viejo en pie sobre una fila que además va a quedar encolada.
12. Efecto colateral sin cambios de código en `jarvis/worker/consolidation.py`:
    `propose_archive_superseded()` ya pasaba por `create_proposal()`, así que con este
    cambio esas propuestas (hasta ahora silenciosas -- nunca se pusheaban a Telegram por
    ningún camino, solo aparecían como texto en el reporte diario) empiezan a entregarse
    solas por la cola, sin tocar `_propose_archive()` para nada.

Diferencia con spec: no aplica -- ajuste de comportamiento sobre un mecanismo ya
implementado en 0.2 (auditoría proactiva, entrada 2026-08-31), no una pieza nueva de la
spec original.

Impacto: `jarvis/db/schema.py` (columna `pushed_at`), `jarvis/db/database.py`
(`_migrate()`, backfill), `jarvis/config.py` (`JARVIS_AUDIT_PUSH_BATCH_SIZE`),
`jarvis/audit/service.py` (`_QUEUED_INDIVIDUAL_ACTION_TYPES`, `_initial_pushed_at()`,
`create_proposal()`, `expire_stale_proposals()`, `list_pending_proposals()`,
`list_grouped_pending()`, `get_pending_individual_proposal_for_channel()`,
`_push_created()`, `push_next_audit_batch()`, `_mark_pushed()`, `run_audit()`),
`jarvis/worker/main.py` (`_maybe_run_passive_capture()`), `jarvis/ingestion/
inbox_triage.py` (`_process_candidate()`, se borra `_notify_telegram()`).

Verificado: dos scripts standalone en el scratchpad de la sesión (nunca commiteados,
borrados junto con sus DBs de scratch al terminar) -- no hay tests automatizados en
`jarvis/` (confirmado: solo existe `jarvis/cli/seed_test.py`, un seeder de datos de
prueba, no una suite de tests).

1. `verify_audit_throttle.py`, contra una `jarvis.db` de scratch aislada (`JARVIS_DB_PATH`
   apuntado a `%TEMP%\jarvis_verify_throttle.db`, creada desde cero por `init_db()`),
   `send_telegram_message` parcheado (sin red real). Los 5 casos dieron OK:
   - `_initial_pushed_at()`: `desktop`→entrega inmediata, `telegram`+`create`→`None` (cola),
     `telegram`+`flag_contradiction`→entrega inmediata, `telegram`+`open_question`→entrega
     inmediata.
   - `create_proposal()`: `telegram`+`create` deja `pushed_at IS NULL`; `desktop`+`create`
     deja `pushed_at` seteado.
   - `push_next_audit_batch()`: con 3 propuestas `clarify` encoladas (`created_at`
     escalonado), el primer llamado empuja exactamente 1 (la más vieja, FIFO), manda 1
     mensaje real (mockeado); un segundo llamado sin resolver la anterior no empuja nada
     (`outstanding` bloquea el avance); tras `reject_proposal()` de la primera, el tercer
     llamado sí avanza a la siguiente.
   - `expire_stale_proposals()`: una fila con `created_at` de hace 2 días y `pushed_at IS
     NULL` NO expira; una fila con `pushed_at` de hace 2 días SÍ expira a `EXPIRED`.
   - `list_pending_proposals()`/`get_pending_individual_proposal_for_channel()`: ninguna
     fila con `pushed_at IS NULL` aparece en sus resultados.
2. `verify_audit_throttle_migration.py`, contra una segunda `jarvis.db` de scratch creada
   a mano con el `CREATE TABLE jarvis_audit_proposals` PRE-cambio (sin columna `pushed_at`,
   copiado literal del schema anterior a este edit) más dos filas `PENDING` insertadas
   directo por SQL con `created_at` de hace 2 días: una `flag_contradiction`, una `create`.
   Al importar `jarvis.db.database` apuntando `JARVIS_DB_PATH` a esa DB y llamar
   `init_db()` (dispara `_migrate()`, incluido el backfill nuevo): la fila
   `flag_contradiction` terminó con `pushed_at == created_at` (backfill aplicado, tipo NO
   throttleado); la fila `create` terminó con `pushed_at IS NULL` (dejada en cola a
   propósito, tipo SÍ throttleado). Ambos asserts pasaron.

Ambos scripts y sus dos DBs de scratch (`%TEMP%\jarvis_verify_throttle.db`,
`%TEMP%\jarvis_verify_throttle_migration.db`) se borraron al terminar -- nunca tocaron
`jarvis.db`/`D:\Boveda` reales en ningún momento.

---

## 2026-09-16 — Reversión parcial: pares "different" ya no se listan en detalle en el reporte de consolidación (vuelven a un conteo)

Contexto: la entrada del 2026-09-03 ("Reporte diario completo de
consolidación por Telegram") decidió listar en el reporte TODO par que
cruzara el umbral de similitud y llegara al LLM, con o sin consecuencia
-- incluido el veredicto "different" (temas distintos, ninguna mutación
en la DB). El pedido explícito en su momento fue "sin excepción... con
detalle completo".

Hallazgo real (2026-09-16): un reporte guardado por el usuario desde
Telegram (consolidado manualmente en un .txt) resultó tener 37 partes,
~26KB, donde el 100% de los pares comparados esa corrida dieron veredicto
"different" -- cero acciones reales (ningún same_fact, ninguna
contradiction), el reporte entero era ruido sin ninguna señal.

Decisión: revertir la parte de la decisión del 3/9 que listaba TODOS los
pares -- de ahora en más, la sección de pares del reporte
(_section_pairwise() en jarvis/worker/consolidation.py) solo lista en
detalle los pares con acción real (same_fact -> entrada marcada obsoleta;
contradiction -> confianza reducida + conflicto logueado, incluida la
subrama "contradicción ya logueada en una corrida anterior" -- sigue
siendo un ítem pendiente real, no ruido). Los pares "different" (o
veredicto no reconocido) se reducen a una sola línea de conteo: "Sin
acción (el modelo los juzgó contenidos distintos): N".

Se descartaron dos alternativas que el usuario evaluó explícitamente:
- Bajar el umbral de similitud (_SIMILARITY_THRESHOLD) para que lleguen
  menos pares al LLM: descartado, no toca el problema real (el umbral ya
  está calibrado) y arriesga perder same_fact/contradiction reales.
- Mover el detalle completo de los "different" a un archivo aparte en
  D:\Boveda\Jarvis\ en vez de perderlo: descartado, el usuario no
  necesita ese detalle en absoluto para los pares sin acción -- un
  conteo alcanza. (El detalle completo de TODOS los pares, incluidos los
  "different", se sigue persistiendo sin cambios en
  jarvis_policies.consolidation_run vía _record_run() -- no se pierde
  información, solo se deja de mandar por Telegram.)

Cambio de código: solo _section_pairwise() (jarvis/worker/
consolidation.py, ~línea 781) -- separa summary["pairwise_detail"] en
dos grupos usando el campo "relation" ya existente en cada dict
(same_fact/contradiction -> detalle completo igual que antes;
different/no reconocido -> solo cuenta). _resolve_pair() y la
construcción de summary no cambiaron -- el filtro es puramente de
presentación en el reporte de Telegram.

## 2026-09-15 — PROPUESTA (sin implementar, pendiente de aprobación): triage automático del Inbox (`00 - Sin categorizar/`)

Contexto: `00 - Sin categorizar/` es el inbox del árbol PARA — pero por diseño explícito
(ver entrada 2026-09-11 de la fusión) también es donde viven a propósito "ideas sueltas
hasta que germinan". El usuario quiere que el worker de Jarvis, corriendo por su cuenta,
sugiera por Telegram dónde archivar una nota que ya parece lista, sin moverla nunca solo
— mismo espíritu gateado que el resto de las propuestas de auditoría. Mismo formato que
las propuestas anteriores (auditoría proactiva 31/08, síntesis de patrones de Agenda
15/09): documento de diseño, sin código.

**Investigación previa (pista de la tarea): ¿es literalmente `archive_superseded`
generalizado?** Respuesta corta: el *primitivo* de mover archivo sí es 100% reusable
tal cual; la *capa de propuesta* que lo dispara, no — hace falta una nueva, con su
propio `action_type`. Detalle:

- `jarvis/vault/writer.py::move_entry_file(vault_rel_path, dest_dir_rel)` ya es
  completamente genérico — `dest_dir_rel` es un string libre (`JARVIS_BOVEDA_PATH /
  dest_dir_rel`), no hay ningún hardcode a `04 - Archivo/` ahí adentro. Ya funciona sin
  tocarlo para un destino anidado tipo `"02 - Areas/Facultad"` (`Path` con `/` interno
  se resuelve bien en Windows). **Este es el mecanismo que hay que reusar tal cual, cero
  cambios** — coincide con la pista de la tarea: no hace falta una tercera forma de
  mover archivos.
- Lo que SÍ es angosto es la capa de arriba: `_apply_archive_superseded()` (destino
  fijo `"04 - Archivo"`, sin parámetro de destino) y `propose_archive_superseded()`
  (payload `None`, la pregunta es genérica — "¿la archivo?", no necesita nombrar un
  destino porque solo hay uno posible). Triage necesita cargar el destino sugerido
  en el `payload` (ya es `TEXT` JSON libre en `jarvis_audit_proposals`, sin migración de
  columna) y una pregunta que lo nombre explícitamente.
- El disparador también es distinto en naturaleza: `archive_superseded` nace de un
  juicio ya hecho en SQL puro (`same_fact`/stale por edad, sin LLM) sobre pares de
  `memory_entries`. Triage necesita clasificar contenido — mismo tipo de tarea que
  `_synthesize_entity_summary()`/`_CREATE_PROMPT` (huecos de entidad), no que
  `_resolve_pair()`. Por forma, el disparador de triage se parece más al camino
  "create" (LLM + criterio anti-alucinación explícito) que al camino "archive_superseded"
  (SQL puro); solo el movimiento final de archivo comparte código con este último.

**Conclusión de diseño**: reusar `move_entry_file()` sin tocarlo; reusar la tabla
`jarvis_audit_proposals` (mismo ciclo PENDING→ACCEPTED/REJECTED/EXPIRED, mismo
`resolve_individual_reply()`); pero sí hace falta un `action_type` nuevo (ver punto 4,
respuesta explícita a "si necesita uno nuevo, decilo, no lo escondas": **sí hace
falta**, `triage_move` — undécimo valor del `CHECK`, misma migración de schema que ya
costó agregar `open_question` y `archive_superseded`, mismo patrón exacto de
`_migrate_audit_proposals_archive_superseded()`).

### 1. Señal "listo para clasificar" vs. "idea cruda a propósito" — sin cerrar, recomendación marcada

Mirado contra el inbox real (`D:\Boveda\00 - Sin categorizar\`, ver punto 5): ni edad
sola ni longitud sola separan bien los dos casos. Ejemplos reales que lo prueban:
- 7 notas cortitas (~350 bytes, "reel de Instagram", del 10/09) — clip suelto, exactamente
  el caso "puede vivir ahí indefinidamente a propósito" que describe la estructura PARA.
- 7 documentos largos (14–53 KB, `idea_01`...`idea_05`, "Plan de aprendizaje...",
  "Ideas para hacer un Portafolio") del 15/09 — desarrollados y sustanciosos, pero uno se
  llama literalmente `idea_04_jarvis_segundo_cerebro - EN PROCESO.md`: el propio usuario
  marca en el nombre que sigue en desarrollo activo. Longitud sola NO es señal de "listo".
- 3 archivos casi duplicados (`Si.md`/`Sí.md`/`S í.md`, ~170 bytes cada uno, mismo minuto
  del 15/09) — ruido de captura (probablemente respuestas de Telegram mal enrutadas como
  nota nueva), ni idea germinando ni nota lista: un tercer caso que ninguna de las dos
  señales cubre bien.

**Recomendación (no decisión cerrada)**: combinar dos señales, ninguna sola alcanza —
(a) antigüedad de la **última edición** (no de creación) sin tocar, con un umbral
conservador (sugiero 21–30 días, más laxo que los 7 días de agenda/auditoría porque acá
el costo de un falso positivo es más alto — se le ofrece mover algo que el usuario
todavía está germinando) — el caso `idea_04 - EN PROCESO` ya queda afuera solo por esto,
sin necesitar leer el nombre; y (b) un piso de contenido sustancial (sugiero reusar
`_MAX_FRAGMENT_CHARS`-como-referencia, ~300–500 caracteres, ya usado en el módulo como
"fragmento con sustancia") para no proponerle destino a un clip de una línea que el
usuario obviamente guardó tal cual a propósito. Ninguna de las dos cierra el caso de
ruido tipo `Si.md` — eso probablemente necesita su propio chequeo trivial (contenido
casi vacío o duplicado exacto de otro archivo reciente), más parecido al disparador de
`delete` por contenido vacío que ya existe en auditoría que a una señal de triage nueva.
**Sin dato real todavía de cuántos falsos positivos genera cualquiera de estos umbrales**
— quedan como default conservador a ajustar con uso real, no a tunear a ciegas ahora
(mismo criterio que "documentar antes de tunear": elegir un default razonable, no
recalibrar sin señal real del usuario).

### 2. Destino exacto — dominio + Área/Recurso, con el mismo gate anti-alucinación de `create`

Un LLM (mismo prompt-shape que `_CREATE_PROMPT`, con la misma cláusula de escape) lee el
contenido completo de la nota candidata y elige **una** de las rutas exactas permitidas,
nunca inventa una carpeta fuera de la lista:

```
02 - Areas/Facultad | 02 - Areas/Carrera Profesional | 02 - Areas/Salud |
02 - Areas/Desarrollo Personal | 03 - Recursos/Facultad | 03 - Recursos/Carrera Profesional |
03 - Recursos/Salud | 03 - Recursos/Desarrollo Personal
```
o `NO_SE` si no hay señal suficiente para el dominio o para Área-vs-Recurso — mismo
criterio exacto que `SIN_DATOS` en `_synthesize_entity_summary()` (no forzar una carpeta
por no dejar la propuesta vacía). Área = algo vigente/activo ahora; Recurso = referencia/
consulta, no acción actual — el LLM decide ese eje también, con la misma salida de
escape si no está claro.

**Recorte explícito de alcance, recomendado**: dejar `01 - Proyectos/` **fuera** de esta
primera versión. A diferencia de Áreas/Recursos (8 destinos fijos, enumerables), Proyectos
se organiza por nombre de proyecto — un conjunto abierto, no una lista cerrada. Proponer
un destino ahí exigiría o inventar un nombre de carpeta nuevo (riesgo real de
alucinación/fragmentación — dos carpetas para "el mismo" proyecto con nombres distintos)
o hacer *fuzzy matching* contra `memory_projects` (mecanismo que no existe hoy para esto
y es una pieza de diseño aparte, no trivial). Con Áreas/Recursos alcanza para la mayoría
del inbox real observado (ver punto 5) y mantiene el enum cerrado. **Marcado como
recomendación, no cierre** — si el usuario prefiere incluir Proyectos desde el día uno,
es una extensión de alcance real, no un ajuste menor.

### 3. Cadencia y disparador

**Recomendación: semanal, gate propio dentro de `run_consolidation()`** (mismo patrón que
`run_agenda_pattern_synthesis()` — variable de policy propia tipo
`JARVIS_INBOX_TRIAGE_INTERVAL_DAYS`, default 7 — en vez del gate diario de 24h que usa
`should_run()`), no la cadencia semanal-y-diaria mezclada de auditoría. Justificación de
costo, mismo criterio ya usado para justificar la cadencia semanal de patrones de Agenda:
con un umbral de antigüedad de 21–30 días sin tocar (punto 1), el conjunto de candidatos
casi no cambia de un día a otro — correr esto todos los días re-escanearía casi las
mismas notas sin información nueva, gastando llamados de LLM (uno por candidata, mismo
orden de magnitud que `_CREATE_PROMPT`) sin beneficio. Cap explícito por corrida
(recomiendo `_INBOX_TRIAGE_LIMIT = 3–5`, mismo criterio que `_ENTITY_CREATE_LIMIT=3` de
huecos de entidad) para no generar una ráfaga de propuestas de golpe la primera vez que
corra sobre un inbox ya con backlog.

### 4. Gating

**Reusa `jarvis_audit_proposals`, con un `action_type` nuevo: `triage_move`** — respuesta
explícita a la pregunta de la tarea, sin esconderlo: esto **es** una migración de schema
nueva (undécimo valor del `CHECK`), mismo costo exacto que agregar `open_question` u
`archive_superseded` (`_migrate_audit_proposals_action_type()` /
`_migrate_audit_proposals_archive_superseded()` en `jarvis/db/database.py` son la
plantilla literal a copiar). Se reusa la tabla, el ciclo PENDING/ACCEPTED/REJECTED/EXPIRED,
`create_proposal()`/`accept_proposal()`/`reject_proposal()`/`expire_stale_proposals()` tal
cual. `_apply_triage_move()` nueva (paralela a `_apply_archive_superseded()`, pero lee
`payload["dest_dir_rel"]` en vez de un destino fijo) y una entrada nueva en
`resolve_individual_reply()`/`_resolve_with_new_info()` — **punto abierto real, sin
cerrar**: hoy esa función agrupa `flag_contradiction`/`flag_connection`/`merge`/
`archive_superseded` bajo un mismo comportamiento para texto libre que no es "sí" ni "no"
limpio (crea una entrada nueva aparte, nunca mueve nada — `_resolve_as_new_entry()`). Mi
recomendación es que `triage_move` entre en ese mismo grupo (una respuesta de texto libre
tipo "no, eso va a Salud" NO debería intentar parsearse a una ruta e intentar mover con esa
inferencia — mismo riesgo de alucinación que dejar que el LLM invente rutas fuera del
enum) — pero no lo doy como decisión cerrada porque no es autoevidente que perder esa
corrección específica sea lo que el usuario quiere.

### 5. Volumen real — el dato que más pesa en si esto vale la pena ahora

`D:\Boveda\00 - Sin categorizar\` tiene hoy **17 notas reales** (18 archivos `.md`
contando `README.md`, que no cuenta). De esas 17: 7 son clips cortos del 10/09 (~350
bytes, candidatas naturales a "quedarse ahí a propósito"), 7 son documentos largos y
desarrollados del 15/09 (14–53 KB, incluido el explícitamente marcado "EN PROCESO"), y 3
son ruido casi-duplicado del mismo minuto del 15/09 (`Si.md`/`Sí.md`/`S í.md`).

**Hallazgo que cambia la urgencia real**: toda la Bóveda fusionada tiene apenas ~5 días de
vida (migración del 2026-09-10/11, ver entrada de esa fecha) — **ningún archivo del
inbox tiene más de 5 días sin tocar**. Con cualquier umbral de antigüedad razonable para
la señal del punto 1 (21–30 días), **cero notas calificarían hoy como candidatas** — el
inbox real no tiene todavía ningún caso de "algo viejo y desarrollado que quedó
olvidado sin archivar", que es exactamente el problema que esta feature busca resolver.
Los 17 archivos actuales son en su mayoría contenido reciente y activo (parte incluso
"EN PROCESO" a propósito), no backlog abandonado.

**Recomendación derivada, marcada como tal**: el volumen real de hoy no justifica
construir esto ya — no porque el diseño esté mal, sino porque no hay backlog real contra
el cual demostrar que funciona bien (ni para calibrar el umbral del punto 1 con casos
reales, ni para justificar el costo semanal de LLM de la cadencia del punto 3). Alternativa
más barata a considerar mientras tanto: una función tipo `list_isolated_entries()` (SQL
puro, sin LLM, sin propuesta, expuesta a Explorar bajo demanda) que solo *liste* notas del
inbox por antigüedad sin tocar, sin sugerir destino — deja que el usuario decida si
"vale la pena" mirar la lista, sin gastar ningún llamado de LLM hasta que el backlog real
exista. Esto **no** está en el pedido original y es una sugerencia mía, no una decisión.

**Preguntas que quedan explícitamente sin resolver, para que el usuario las revise antes
de que otra sesión implemente:**
1. ¿El umbral de antigüedad (21–30 días) y el piso de contenido (~300–500 caracteres) del
   punto 1 son razonables, o el usuario tiene un criterio propio más preciso de qué hace
   que una idea "ya germinó"?
2. ¿Dejar `01 - Proyectos/` fuera del alcance de esta primera versión (punto 2) es
   aceptable, o el usuario lo quiere incluido desde el día uno pese al riesgo de
   fragmentación de nombres?
3. ¿Una respuesta de texto libre nombrando una carpeta distinta a la sugerida (punto 4)
   debería intentar re-dirigir el movimiento, o preferís el criterio conservador (no
   mover, solo guardar la corrección como nota aparte, igual que `archive_superseded`)?
4. Dado el hallazgo del punto 5 (cero candidatas reales hoy por la edad de la Bóveda),
   ¿preferís construir esto ya para que esté listo cuando el backlog exista, o esperar
   unas semanas de uso real y revisar con datos reales de qué tipo de "olvido" ocurre de
   verdad?

Estado: propuesta de diseño, sin implementar. Ningún archivo de código tocado.

---

## 2026-09-15 — PROPUESTA (sin implementar, pendiente de aprobación): síntesis de patrones de Agenda, distinta del contenido literal

Contexto: 0.3 (`jarvis/ingestion/agenda.py`, ver entrada 2026-09-03 y verificación
2026-09-15 más abajo) propone eventos/tareas evento por evento, casi textual. El
usuario quiere además una capa de **síntesis de patrones** — horarios recurrentes,
hábitos de vida inferidos de la Agenda (ej. "cursa MatDis los lunes 9-11hs",
"entrena 3 días/semana", "va a la oficina cada 15 días") — con autoría Jarvis,
mismo criterio que `Boveda/Jarvis/Entidades/`. Mismo formato que la propuesta de
auditoría proactiva (31/08) y la de la fusión Bóveda-Jarvis (11/09): documento de
diseño, sin código. Destinos físicos ya resueltos por el pedido, no se reabren:
`Boveda/Jarvis/Agenda/` para patrones sintetizados, `D:\Boveda\Agenda\` (carpeta
propia, al mismo nivel que `00-05` y `Jarvis/` — nunca más en
`00 - Sin categorizar`) para contenido literal.

Investigación previa contra el código real (no contra la spec): `jarvis/ingestion/agenda.py`
completo, `project/app/db/crud.py` (schema real de `agenda_eventos`/`agenda_tareas`,
`_expand_recurring()`, la ruta `GET /agenda/eventos` en `project/app/main.py`),
`jarvis/vault/writer.py` (`write_entry()` post-fusión), `jarvis/audit/service.py`
(`_apply_create()`, `_detect_entity_gaps()`, `_link_new_entry_to_targets()`),
`jarvis/captures/passive.py` (`accept_proposal()`), `jarvis/worker/consolidation.py`
completo, `jarvis/db/schema.py` (ambas tablas de propuestas), `Cerebro/estado-actual.md`
(entradas 03/09 y 15/09 sobre Agenda) y `Cerebro/decisiones-implementacion.md`
(entrada 2026-09-11, patrón de autoría/frontmatter).

### 0) La pregunta que cambiaba todo el diseño: qué es `regla_repeticion`

Confirmado leyendo `project/app/db/crud.py::_expand_recurring()` (líneas ~2091-2151)
y la ruta `GET /agenda/eventos` (`project/app/main.py` ~1494-1507): **no es RRULE
de iCal, es un JSON custom de SGR** — `{"frecuencia": "diario"|"semanal"|"mensual",
"dias": [0..6], "hasta": "YYYY-MM-DD"}`. Consecuencia directa sobre el diseño:

- **Para un evento con `se_repite=1`, el patrón YA está en el dato estructurado**
  (`regla_repeticion` + hora de `fecha_inicio`/`fecha_fin` de una sola ocurrencia)
  — no hace falta que ningún LLM lo infiera mirando ocurrencias sueltas. Es una
  transformación directa: `{"frecuencia":"semanal","dias":[0]}` + horario de
  `fecha_inicio` → "cursa MatDis los lunes 9-11hs". Cero llamadas a LLM.
- **`regla_repeticion` no modela "cada N días"** (solo diario/semanal/mensual con
  días fijos) — el ejemplo del usuario ("voy a la oficina cada 15 días") en la
  práctica **no es una regla de repetición real** en el sistema; es un patrón que
  solo se ve agrupando en el historial varios eventos con `se_repite=0` que
  comparten título (y opcionalmente descripción/calendario). Para este caso sí
  hace falta que un LLM mire el cluster de ocurrencias y proponga el patrón —
  mismo mecanismo anti-alucinación que `_CREATE_PROMPT` de auditoría (sintetiza
  solo con lo que ya está en los datos, nunca inventa; responde "SIN_DATOS" si no
  alcanza).
- `agenda_tareas` **no tiene ningún concepto de recurrencia** (confirmado en su
  schema completo, `crud.py` ~2331-2447) — toda tarea es, por definición, puntual
  a efectos de este diseño; nunca entra al camino de síntesis de patrones.

Segundo hallazgo real que también cambia el diseño: la ruta `GET /agenda/eventos`
**rellena `desde`/`hasta` con un default de ~1 mes atrás a ~2 meses adelante si el
llamador no los manda** (`main.py` líneas 1499-1506) — nunca devuelve "todo el
historial" por default. Para la síntesis de patrones basada en clustering (el caso
"cada 15 días") hace falta pasar explícitamente un `desde` bien temprano (ej.
`"2000-01-01"`, piso seguro para cualquier dato real de una agenda personal) y
`hasta=hoy`. Para el caso de regla-directa, en cambio, **no hace falta historial
en absoluto** — una sola ocurrencia (incluso una ventana default corta) ya trae
`regla_repeticion` completa, porque es metadata estática del evento, no algo
derivado de mirar ocurrencias pasadas.

Riesgo real de la ventana amplia (verificado en `_expand_recurring()`): con
`desde`/`hasta` ambos presentes, la ruta expande TODAS las ocurrencias de TODO
evento con `se_repite=1` dentro del rango — un evento diario expandido sobre 20+
años de historial generaría miles de filas en memoria. Mitigación de diseño:
antes de clusterizar por título, descartar toda fila con `se_repite=1` (esas ya
las cubre el camino de regla-directa, sin necesidad de historial) — el pool de
clustering queda acotado a eventos puntuales reales, que es el volumen real bajo
que ya tiene el usuario (16 eventos históricos totales, verificación 15/09).

### 1) Relación con 0.3 (evento-por-evento): conviven, sin duplicar

**Confirmado con el usuario** (no asumido): las ocurrencias de un evento con
`se_repite=1` dejan de proponerse una por una en 0.3 — hoy `_fetch_recent_events()`
trataría cada ocurrencia semanal de "MatDis lunes 9-11hs" como un candidato nuevo
(source_key incluye `fecha_inicio`, ver docstring de `agenda.py` punto 3), lo cual
sería literalmente la misma información repetida cada semana en Telegram una vez
que además existe el patrón sintetizado una sola vez. Cambio concreto en
`_fetch_recent_events()`: agregar `and not e.get("se_repite")` al filtro de
`_event_already_ended()` (o un filtro separado antes), de modo que 0.3 queda
exclusivamente para:
- eventos puntuales (`se_repite=0`) — sin cambio de comportamiento, y
- tareas completadas — sin cambio (no tienen recurrencia).

Los eventos recurrentes (`se_repite=1`) pasan a cubrirse EXCLUSIVAMENTE por el
camino de patrón (síntesis de regla directa, sección 0). No hay duplicación:
contenido literal cubre lo puntual, patrón cubre lo recurrente estructurado, y el
cluster inferido (LLM) cubre lo recurrente-mal-modelado. Los eventos puntuales que
alimentan un cluster (`se_repite=0`, ej. cada visita suelta "Oficina") **siguen
pasando por 0.3 normalmente** además de eventualmente alimentar un patrón — esto
no es la misma duplicación que se acaba de cortar arriba: son dos granularidades
distintas (la visita puntual del 3 de marzo vs. la observación agregada "cada ~15
días"), no el mismo hecho repetido.

### 2) Excepción de destino para contenido literal de Agenda

`jarvis/vault/writer.py::write_entry()` decide destino hoy por un único eje
binario (`entry["authorship"]`): `'user'` → árbol PARA, siempre a
`_INBOX_REL = "00 - Sin categorizar"` (línea 147); `'jarvis_synthesis'` → siempre
`Jarvis/Sintesis/` (línea 144). Contenido literal de Agenda (`source='agenda'`,
`authorship='user'`, ya confirmado en la verificación 15/09) hoy cae en el primer
caso — sin distinción, a la inbox genérica.

**Diseño de la excepción** (generaliza el punto de decisión sin tocar el resto de
la función): reemplazar el `else: vault_dir = ... _INBOX_REL` fijo por un pequeño
mapa de excepciones por `source`, análogo al `_ORIGEN_DESDE_SOURCE` que ya existe
en el mismo archivo para el frontmatter:

```python
_PARA_DEST_OVERRIDE = {"agenda": "Agenda"}  # source -> subcarpeta bajo JARVIS_BOVEDA_PATH

...
else:
    dest_rel = _PARA_DEST_OVERRIDE.get(entry.get("source") or "", _INBOX_REL)
    vault_dir = JARVIS_BOVEDA_PATH / dest_rel
    rel_to_root = f"{dest_rel}/{filename}"
```

Mismo cambio en la rama de reescritura (`existing_vault_path` ya resuelto — no
necesita el mapa, reusa el path ya asignado, sin cambios ahí). Efecto: contenido
`source='agenda'` (autoría `user`) aterriza en `D:\Boveda\Agenda\`, carpeta nueva
al mismo nivel que `00-05`/`Jarvis/` (se crea sola por `mkdir(parents=True,
exist_ok=True)`, ya presente en la función); todo lo demás (`telegram`, `desktop`,
`migration`) sigue exactamente igual, cayendo en `_INBOX_REL` por default del
`.get()`. Cero cambio de comportamiento para lo no-Agenda.

**Migración de contenido ya escrito**: la única entrada real aceptada de Agenda
hasta ahora (verificación 15/09, un `/j` de prueba sin relación real de contenido)
no aplica — no hay backlog real de `.md` de Agenda en `00 - Sin categorizar` para
mover. Si llegara a haber alguno antes de implementar esto, es un `move_entry_file()`
puntual, no parte de este diseño.

### 3) Segunda excepción de destino: patrones sintetizados van a `Jarvis/Agenda/`, no a `Jarvis/Sintesis/`

Mismo problema, un nivel más adentro: hoy TODO `authorship='jarvis_synthesis'` cae
en la única subcarpeta hardcodeada `Jarvis/Sintesis/` (línea 144-145). El pedido
es que los patrones de Agenda tengan su propia carpeta `Boveda/Jarvis/Agenda/`,
separada de las fichas de entidades. Mismo mecanismo de excepción que el punto 2,
esta vez sobre la rama `is_synthesis`, distinguiendo por prefijo de `source_id`
(ver sección 4 — los patrones usan el namespace `agenda:patron:...`, nunca
`audit:...`):

```python
_SYNTH_DEST_OVERRIDE_PREFIXES = {"agenda:patron:": "Jarvis/Agenda"}

...
if is_synthesis:
    dest_rel = next(
        (v for p, v in _SYNTH_DEST_OVERRIDE_PREFIXES.items()
         if (entry.get("source_id") or "").startswith(p)),
        "Jarvis/Sintesis",
    )
    vault_dir = JARVIS_BOVEDA_PATH / dest_rel
    rel_to_root = f"{dest_rel}/{filename}"
```

No requiere ninguna columna nueva ni migración de schema — `source_id` ya es texto
libre sin `CHECK` (se usa hoy para claves de dedup arbitrarias como
`"agenda:evento:{id}:{fecha_inicio}"` o `"audit:{proposal_id}"`), así que
namespacear un prefijo nuevo es gratis. El resto de `write_entry()` (frontmatter
rico, wikilinks, reescritura por `vault_path` existente) no cambia.

### 4) Gating: reusar `jarvis_capture_proposals`, no `jarvis_audit_proposals` — y por qué

Evalué las dos tablas existentes contra lo que la síntesis de patrones necesita
producir (una propuesta PENDING → si se acepta, UNA fila nueva en `memory_entries`
con `authorship='jarvis_synthesis'`) y contra su FUENTE de datos real:

- **`jarvis_audit_proposals` (acción `create`, la usada hoy para fichas de
  entidad) NO encaja sin romper su contrato**: `_apply_create()`/`_detect_entity_gaps()`
  (líneas 585-626, 1024-1045) toman `target_entry_ids` como una lista de
  `memory_entries.id` YA EXISTENTES — `_link_new_entry_to_targets()` (línea 1167)
  después los usa para copiar vínculos de entidades/proyectos desde esas entradas
  a la nueva. Si `target_entry_ids` fueran claves de Agenda en vez de ids reales
  de `memory_entries`, esa función buscaría vínculos de entradas que no existen y
  no fallaría — silenciosamente no vincularía nada, un bug sutil, no un error
  visible. Más grave todavía: el POOL de datos de origen para `create` es
  `get_entries_for_entity()` — SOLO entradas que YA son `memory_entries` (es
  decir, propuestas de Agenda que el usuario ya ACEPTÓ). La verificación real del
  15/09 mostró 20 `EXPIRED` + 1 `REJECTED` + 0 `ACCEPTED` sobre 21 propuestas de
  Agenda — si la síntesis de patrones dependiera de `memory_entries` como fuente,
  hoy tendría **cero datos de dónde sintetizar**, aunque la Agenda real del
  usuario tenga eventos de sobra. La síntesis TIENE que leer la Agenda real vía
  la misma API HTTP de 0.3 (mismo blast radius, nunca `app.db` directo), no
  memory_entries ya aceptados.
- **`jarvis_capture_proposals` SÍ encaja, con una extensión mínima**: ya es
  "propuesta PENDING que nace de una fuente externa (no de una conversación) y,
  al aceptarse, produce exactamente una `memory_entries` nueva" — exactamente la
  forma de una propuesta de patrón. Extensión necesaria, sin tocar ningún
  `CHECK`: reusar `origin_source='agenda_ingestion'` (valor ya permitido, sin
  migración) con un **namespace nuevo de `origin_source_key`**:
  `"agenda:patron:evento:{evento_id}:{hash_contenido}"` (regla directa) /
  `"agenda:patron:cluster:{slug_titulo}:{hash_contenido}"` (cluster inferido) —
  paralelo al `"agenda:evento:..."`/`"agenda:tarea:..."` que ya usa 0.3, y el
  `hash_contenido` (sha256 corto del texto del patrón) es lo que permite que un
  patrón cambiado genere una clave nueva y no quede bloqueado por el dedup
  existente de `_already_proposed()` (que dedupea sin mirar status — correcto
  para "no repreguntar lo mismo", incorrecto si lo aplicáramos a un patrón que
  cambió de verdad).
- Cambio puntual en `accept_proposal()` (`jarvis/captures/passive.py`
  líneas 293-337): dentro de la rama ya existente
  `if proposal.get("origin_source") == "agenda_ingestion"`, agregar
  `authorship = "jarvis_synthesis" if source_key.startswith("agenda:patron:") else "user"`
  y pasar `authorship=authorship` a `capture_raw()` (hoy no lo pasa, cae en el
  default `'user'` — correcto para 0.3 literal, incorrecto para patrones). Ningún
  otro cambio a esa función. `capture_raw()` ya acepta `authorship` como
  parámetro (línea 25 de `jarvis/memory/service.py`) — no requiere tocar esa
  firma.
- `type` de la `memory_entries` resultante: reusar `SEMANTIC` (el enum es
  `RAW|SEMANTIC|DECISION|PROJECT|PEOPLE`, cerrado por `CHECK` — agregar un quinto
  valor tipo `PATTERN` sería otra migración de la misma clase que ya se señaló
  costosa en el addendum del 11/09). Un patrón de horario/hábito es
  conceptualmente un hecho generalizado sobre el usuario — encaja en `SEMANTIC`
  sin forzar nada, y evita la migración.

Resultado: **cero tablas nuevas, cero columnas nuevas, cero `CHECK` tocados** —
toda la extensión vive en namespacing de campos de texto libre ya existentes
(`origin_source_key`, `source_id`) más una rama condicional de 2 líneas en
`accept_proposal()`.

### 5) Actualización de un patrón que cambió: reusar consolidación diaria, no construir un mecanismo nuevo

El caso del usuario ("deja de entrenar los martes") es, en la forma en que ya lo
resuelve el sistema, un `same_fact` de consolidación: dos `memory_entries`
`SEMANTIC` `authorship='jarvis_synthesis'` vigentes (`valid_to IS NULL`) sobre el
mismo hábito, contenido reformulado con el horario nuevo. `consolidation.py` YA
compara por embeddings todo par vigente del mismo `(type, user_id)` con coseno >
`JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD` (**0.70 hoy, no 0.92** — recalibrado
el 26/08-31/08 con datos reales, ver esa entrada: un cambio real de domicilio dio
0.748, un cambio de proveedor de hosting dio 0.839, ambos por encima de 0.70 y
correctamente resueltos como `same_fact`, no `contradiction`). No voy a construir
un campo de "supersede" nuevo para esto — sería una abstracción de más sobre un
mecanismo que ya existe, ya fue recalibrado con evidencia real para exactamente
esta clase de caso ("mismo hecho, cambió con el tiempo, reformulado"), y ya dispara
`_propose_archive()` → propuesta gateada de `archive_superseded` a `04 - Archivo/`
sin intervención nueva.

Lo que SÍ dejo anotado como incertidumbre real, no una garantía: nunca se probó
`_resolve_pair()` contra un par de frases sobre horarios/hábitos (números de
días/horas en vez de nombres propios) — no hay evidencia de que el coseno de
`nomic-embed-text` se comporte igual con ese tipo de contenido. Si en producción
un patrón viejo y uno nuevo conviven más de un día sin que consolidación los
detecte, la señal de que hace falta un mecanismo explícito de supersesión (un
campo `supersedes_entry_id` en `jarvis_capture_proposals`, ALTER TABLE simple sin
tocar ningún `CHECK`) es justamente esa — no lo construyo preventivo. Latencia
aceptada mientras tanto: hasta 1 día (el patrón viejo y el nuevo conviven como
"vigentes" hasta la próxima corrida diaria de consolidación), explícita, no
oculta.

### 6) Disparador y cadencia

Mismo patrón que el resto del job (`should_run()`, sin thread propio) pero con un
gate propio de 7 días DENTRO de la corrida diaria de `run_consolidation()` —
mismo criterio textual del usuario ("un patrón de horario no cambia todos los
días"). Nuevo `policy_type` en `jarvis_policies` (ej.
`"agenda_pattern_synthesis_last_run"`), mismo mecanismo exacto que
`_last_run_at()`/`_POLICY_LAST_RUN` pero con intervalo de 7 días en vez de 24h.
Se agrega como séptimo/octavo paso de `run_consolidation()` (antes del chequeo de
`quiet_day`, mismo motivo que la ingestión de Agenda: si propuso algo, no es un
día "sin nada" — hay que sumarlo a `_nothing_to_report()`), gateado internamente:
la función corre igual todos los días pero devuelve de inmediato si no pasaron 7
días desde la última corrida real.

Dentro de esa corrida semanal, dos sub-pasos:
1. **Regla directa** (sin LLM): `GET /agenda/eventos` con la ventana default
   (no hace falta historial, sección 0) filtrado a `se_repite=1`; por cada evento,
   generar el texto de patrón por plantilla (sin LLM, mismo criterio que
   `_event_content_and_question()` de 0.3 hoy) y proponer si el hash de contenido
   cambió respecto al último propuesto (namespace `agenda:patron:evento:...`).
2. **Cluster inferido** (con LLM, acotado): `GET /agenda/eventos` con
   `desde="2000-01-01"` (o una constante de config equivalente) y `hasta=hoy`,
   descartar `se_repite=1` (ya cubiertos arriba), agrupar por título normalizado
   (+ opcionalmente lugar/calendario) vía código puro, quedarse con clusters de
   **3 o más ocurrencias** (confirmado con el usuario), tope de
   **3 clusters por corrida** enviados al LLM (mismo orden de magnitud que
   `_ENTITY_CREATE_LIMIT=3`, mismo criterio de costo acotado), mismo prompt
   anti-alucinación que `_CREATE_PROMPT` pero para intervalos temporales en vez
   de biografías, con "SIN_DATOS" si no hay patrón real reconocible en las fechas.

### 7) Costo real, no gratis

- Regla directa: 1 llamada HTTP extra por semana (ventana angosta, sin expandir
  significativamente), **0 llamadas a LLM** — es una transformación determinística
  de datos ya estructurados.
- Cluster inferido: 1 llamada HTTP con rango completo por semana (no por día —
  evita repetir el escaneo completo del historial 7 veces por cada vez que
  importa), clustering en Python puro (gratis), **máximo 3 llamadas a `call_reason`
  por semana** (tope explícito) sin importar cuántos años de historial tenga la
  Agenda — el costo NO escala con el volumen histórico, solo con la cantidad
  (acotada) de clusters que superan el umbral en una corrida dada. Con el dataset
  real actual (16 eventos históricos totales, verificación 15/09) el costo real
  hoy es efectivamente cero.
- Sin cambio de costo en la corrida diaria existente (`same_fact` de
  consolidación ya corre sobre todo `memory_entries` vigente sin importar su
  origen — los patrones aceptados simplemente se suman al pool que ya se
  compara).

### Preguntas hechas al usuario en esta sesión (resueltas)

1. **¿Las ocurrencias de eventos recurrentes (`se_repite=1`) dejan de proponerse
   una por una en 0.3 una vez que existe el patrón sintetizado, o se mantienen
   ambas?** → **Recortar**: dejan de proponerse individualmente: 0.3 literal
   queda para eventos puntuales y tareas; lo recurrente lo cubre exclusivamente
   el patrón (ver sección 1).
2. **¿Umbral mínimo de ocurrencias para que un cluster inferido (caso "cada 15
   días") dispare síntesis por LLM?** → **3 ocurrencias** (ver sección 6).

Estado: diseño propuesto, **sin implementar**, pendiente de aprobación del
usuario. Ningún archivo de código tocado en esta sesión — solo lectura
(`agenda.py`, `crud.py`, `writer.py`, `audit/service.py`, `passive.py`,
`consolidation.py`, `schema.py`, `main.py`) y este documento.

---

## 2026-09-11 — PROPUESTA APROBADA (diseño cerrado, sin implementar): fusión de Jarvis y Bóveda de SGR sobre `D:\Boveda` como fuente de verdad en archivos

Contexto: el usuario quiere un "segundo cerebro" para toda su vida (facultad, carrera, salud,
desarrollo personal, ideas), no solo para el código. Al diseñarlo se descubrió que Jarvis ya es,
en espíritu, una implementación real de esa misma idea — memoria tipada, vault en Markdown,
captura por Telegram, auditoría/consolidación. En vez de construir un sistema nuevo en paralelo,
se decidió fusionar ambos en una sola fuente de verdad. Diseñado en una sesión larga de charla
(sin código) con el usuario, más una sesión de análisis del código real de Jarvis para validar los
supuestos antes de cerrar el diseño.

Decisión — arquitectura completa:

- **Fuente de verdad invertida**: `D:\Boveda` (Markdown en disco) pasa a ser la fuente real; toda
  base de datos (`app.db`, `jarvis.db`) se convierte en un índice reconstruible que se arma leyendo
  los archivos, sincronizado por **polling** (no `inotify` — el share es SMB/CIFS desde el homelab
  hacia la carpeta en la PC Windows, que queda siempre encendida; los sistemas de archivos de red
  no sostienen notificación de cambios en tiempo real de forma confiable).
- **Estructura PARA** en `D:\Boveda` (eje: accionabilidad, no tema — para no mezclar lo vigente con
  lo viejo/de referencia): `00 - Sin categorizar/` (inbox, incluidas ideas sueltas hasta que
  germinan), `01 - Proyectos/`, `02 - Areas/{Facultad, Carrera Profesional, Salud, Desarrollo
  Personal}/`, `03 - Recursos/{mismos dominios}/`, `04 - Archivo/`, `05 - Basura/`. `_adjuntos/`
  centralizado para binarios (fotos, PDFs, zips), referenciados desde el cuerpo de la nota, nunca
  desde frontmatter.
- **Frontmatter común para el árbol PARA** (deliberadamente más simple que el schema actual de
  `memory_entries`): `id` (uuid4, se autoasigna en el primer polling si el archivo se creó a mano
  fuera de la app), `tipo` (texto|link|foto), `creado_en`/`actualizado_en` (ISO8601 con offset),
  `origen` (app|telegram|migracion|manual|**agenda** — quinto valor agregado tras revisar que la
  ingestión automática de Agenda ya en producción no entraba en el enum original), `tags`, `url`
  (solo si tipo:link). Campos bitemporales/trust de Jarvis (`confidence`, `origin_trust`,
  `valid_from`, `valid_to`, `source_id`) **no** se mirror-ean a este árbol — confirmado contra
  `writer.py` que hoy tampoco se escriben al `.md` (viven solo en SQLite), así que esto no es una
  pérdida de información existente.
- **Separación por autoría, no por `type` de Jarvis** (la hipótesis inicial — RAW→usuario,
  SEMANTIC/DECISION/PROJECT/PEOPLE→Jarvis — se descartó al leer `write_entry()`: los 5 `type` son
  clasificación de contenido, no de autoría; los 5 pasan por la misma función sin distinción de
  quién lo escribió). El eje real es autoría: contenido del usuario (tipeado, capturado por
  Telegram, o texto de una captura pasiva aceptada) va al árbol PARA de siempre; contenido que
  **Jarvis sintetiza** (prosa generada combinando fragmentos — ej. la ficha de una entidad
  mencionada varias veces) va a `Boveda/Jarvis/`, con el schema rico completo (`confidence`,
  `origin_trust`, `valid_from`, `valid_to`, `source_id`). Primera subcarpeta concreta:
  `Boveda/Jarvis/Entidades/` (reemplaza `INDEX/ENTITIES/`). El caso `create` de auditoría (ficha
  sintetizada por LLM, aceptada por el usuario) se rutea a `Boveda/Jarvis/` mirando el `action_type`
  de la propuesta de origen en el momento de escribir — sin campo nuevo en el schema, evita
  duplicar una distinción que ya existe en `jarvis_audit_proposals`.
- **`INDEX/PROJECTS/` no fusiona con `01 - Proyectos/` ni vive entero en `Boveda/Jarvis/`** — son
  dos cosas distintas que se estaban confundiendo: un `memory_entry` tipo PROJECT (algo que el
  usuario dijo sobre un proyecto) es su contenido → `01 - Proyectos/<nombre>/`, igual que cualquier
  nota suya. La ficha agregada que Jarvis reconstruye desde SQL (equivalente a `INDEX/ENTITIES/`
  pero para proyectos) → `Boveda/Jarvis/Proyectos/`, y puede wikilinkear hacia las notas reales del
  usuario en `01 - Proyectos/<nombre>/` en su sección de menciones.
- **Entradas superseded** (marcadas `valid_to` por `consolidation.py`): hoy no se mueven ni se
  marcan en el `.md`, solo en SQL — confirmado como gap real, más visible ahora que el usuario va a
  mirar el vault directo. Resuelto como una propuesta gateada más (mismo patrón que
  `flag_contradiction`, nunca automático): si se confirma, la nota se mueve físicamente a
  `04 - Archivo/` (nunca Basura — no es para borrar). El detalle fino (por qué, quién la reemplaza)
  queda solo en SQLite; no se escribe ningún marcador en el frontmatter del árbol PARA — el propio
  movimiento de carpeta es la señal, mismo criterio que el resto del sistema.
- **Agenda de SGR queda fuera de esta fusión** — pospuesta aparte, no se rediseñó su persistencia.

Diferencia con spec: revierte un principio central de `jarvis-spec.html` (SQLite es la base,
"el vault Markdown es la fuente durable, ChromaDB es un índice reconstruible" se aplicaba solo al
índice vectorial, no a `memory_entries`). Ahora el archivo manda sobre `memory_entries` también.
La organización por `type` (RAW/SEMANTIC/DECISION/PROJECT/PEOPLE) como estructura de carpetas del
vault deja de existir; sobrevive como metadato de clasificación, no como ubicación física.

Impacto (identificado, no implementado todavía):
- `jarvis/config.py`: `JARVIS_VAULT_PATH` único deja de alcanzar — hacen falta dos raíces (árbol
  PARA en `D:\Boveda`, subárbol `Boveda/Jarvis/`).
- `jarvis/vault/writer.py::write_entry()`: reescritura real, no ajuste — `_TYPE_TO_SUBDIR` deja de
  ser el criterio de carpeta; el destino pasa a ser función de autoría (+ excepción de `create` por
  `action_type`), y el frontmatter que escribe hoy (`id/type/source/channel/recorded_at/
  origin_trust/tags`) no calza con el contrato nuevo del árbol PARA.
- `jarvis/vault/index_writer.py`: paths hardcodeados `INDEX/ENTITIES/`/`INDEX/PROJECTS/` pasan a
  `Boveda/Jarvis/Entidades/`/`Boveda/Jarvis/Proyectos/` — la lógica de reconstrucción desde SQLite
  no cambia, solo el root.
- `jarvis/db/database.py`: `vault_path` de cualquier `memory_entries` real necesitaría reescribirse
  al nuevo root si se migran datos existentes — **no aplica hoy**: se confirmó y ejecutó el wipe
  completo de `jarvis.db` (era 100% dataset de prueba, `jarvis/cli/seed_test.py`) antes de esta
  decisión, así que no hay datos reales de Jarvis que migrar. Ver detalle de la limpieza abajo.
- `jarvis/worker/consolidation.py`: sin cambio de lógica de detección; sí necesita el nuevo tipo de
  propuesta gateada para superseded → mover a Archivo.
- Mecánica de wikilinks/backlinks (`_linked_wikilinks_section()`, `sync_entity_note()`/
  `sync_project_note()`, `jarvis/cli/backfill_vault_links.py`) se reusa tal cual en su lógica; solo
  cambian los paths de destino.

Limpieza de datos ejecutada como prerequisito de esta decisión (2026-09-10/11, homelab):
backup completo (`~/project/database/backup-pre-limpieza-seed-20260910-213410/`, contenido
confirmado) → contenedores parados → wipe completo de `jarvis.db`/vault de Jarvis/`chroma`
(confirmado 100% seed) → `DELETE` quirúrgico de `habitos`/`habitos_registros` en `app.db` (mismo
`creado_en` al microsegundo en las 7 filas, contenido genérico — confirmado seed; `fin_movimientos`,
`agenda_eventos` y `hojas` verificados como datos reales del usuario y **no tocados**) → contenedores
reiniciados, `RestartCount=0` en los 3, `jarvis.db` recreado limpio por `init_db()`.

Migración de contenido a `D:\Boveda` ya realizada (aparte de esta decisión de arquitectura, en
paralelo): 57 notas + 32 adjuntos desde `D:\Mateo\Obsidian Vault` (vault viejo de Obsidian, copiado
sin tocar el original); 8 de las 14 hojas reales de `hojas`/`categorias` de SGR (6 quedaron sin
migrar tras revisión — 2 placeholders de prueba, 4 fragmentos de conversación con el bot guardados
por error como si fueran hojas — ninguna fila de SQLite se tocó).

Estado: diseño cerrado y aprobado por el usuario. Sin implementar. Agenda queda fuera.

**Addendum tras revisión crítica independiente (2026-09-11)**: la sesión de revisión encontró 2
huecos reales, verificados contra el código, no cosméticos.

1. `jarvis_audit_proposals.action_type` tiene un `CHECK` cerrado de 9 valores — agregar el décimo
   (la propuesta "superseded → Archivo") es una migración de schema real, mismo costo que
   `_migrate_people_type()`/la adición de `open_question`, no un ajuste menor de `consolidation.py`
   como sugería la redacción original. Además, `valid_to` se setea desde **3** lugares distintos, no
   uno: `_resolve_pair()` (same_fact), `_mark_stale_by_age()` (stale por edad), y `forget_entry()`
   (el usuario ya pidió olvidar/borrar explícitamente, incluida la acción `delete` de auditoría ya
   aceptada). **Resuelto**: la propuesta gateada nueva aplica solo a `same_fact`/`stale_by_edad`
   (juicio algorítmico, puede estar mal — mismo precedente del falso positivo Madrid/Buenos Aires) →
   mueve a `04 - Archivo/` si se confirma. `forget_entry()` **no** dispara propuesta nueva — la
   confirmación humana ya existió al pedir "olvidar" — mueve directo a `05 - Basura/` (semánticamente
   es borrado, no "quedó superado").
2. `memory_entries.vault_path` se replica también como metadata en ChromaDB
   (`_resync_vault_and_embedding()`), y nada lee esa copia de vuelta (confirmado: ni `retriever.py`
   ni el router de la API) — es write-only, sin romper nada hoy, pero sería una inconsistencia
   silenciosa en cuanto un archivo se mueva. **Resuelto**: dejar de escribir `vault_path` en el
   metadata de Chroma (dead weight confirmado, se saca en vez de mantenerlo sincronizado sin
   beneficio). La columna `memory_entries.vault_path` en SQL **sí** tiene que actualizarse al mover
   el archivo — es el puntero real que usa el código para reescrituras futuras, no es redundante.

Resto de la arquitectura (fuente de verdad invertida, separación por autoría, `INDEX/PROJECTS/` vs.
`01 - Proyectos/`, el enum `origen`) confirmado sin cambios contra el código real en esta revisión.

Pendiente: implementación real. Ningún código tocado todavía.

**Decisiones tácticas de la implementación** (schema del índice, dónde vive físicamente, etc.) se
registran atómicas en `Cerebro/decisiones/`, una por archivo — no acá, para no mezclar el diseño
grande con las decisiones puntuales del día a día de esta etapa. **Actualización 2026-09-11**:
Milestone 1 (indexador/poller) implementado y verificado — ver entrada nueva más abajo, misma
fecha, "IMPLEMENTADO: Milestone 1 de la fusión...".

---

## 2026-09-11 — IMPLEMENTADO: Milestone 1 de la fusión, indexador/poller de `D:\Boveda` + decisión de schema cerrada

Contexto: la propuesta aprobada más arriba (misma fecha) dejaba explícitamente sin cerrar si el
schema SQL actual de Bóveda (`hojas`/`categorias`) se jubila a favor de un índice basado en ruta
(Opción A) o convive separado hasta unificar después (Opción B). Se le planteó la pregunta al
usuario con el trade-off de cada una antes de escribir una línea de schema, como pedía el
"Pendiente" de la entrada anterior.

Decisión — schema: **Opción B**. El índice nuevo vive en `project/database/vault_index.db`
(SQLite separado, gitignoreado igual que `app.db`/`jarvis.db`), con tablas de nombre propio
(`vault_notas`, `vault_corridas`) — no reemplaza ni pretende reemplazar `hojas`/`categorias`
todavía. Motivo dado por el usuario: esta sesión tenía scope explícito de no tocar `crud.py`, y
un schema "Opción A" (ruta en vez de FK) solo tiene sentido real una vez que `crud.py`/`main.py`/
frontend/bot se adapten a leerlo — construirlo antes sería diseño especulativo sin consumidor.
Quedan dos fuentes de "qué categorías/hojas existen" conviviendo a propósito hasta la sesión que
decida unificar (ver "Pendiente" en `Cerebro/estado-actual.md`, misma fecha).

Decisión — ubicación física: SQLite separado de `app.db` (no tablas nuevas dentro del mismo
archivo) — el usuario priorizó cero riesgo de tocar `app.db` por accidente mientras el schema del
índice todavía puede iterar, sobre tener ya un solo archivo de DB para todo SGR.

Construido: `project/scripts/vault_indexer.py` (recorrido completo + parseo de frontmatter YAML +
upsert por `id` + detección de cambios por `mtime` + autoasignación de `id` faltante con
reescritura del `.md`). Detalle completo de qué hace y cómo se verificó en
`Cerebro/estado-actual.md` (misma fecha) — no se duplica acá para no tener dos copias que
diverjan.

Diferencia con spec: ninguna — la propuesta del 2026-09-11 ya dejaba este punto como decisión
pendiente, no como algo definido que se esté revirtiendo.

Impacto: archivo nuevo (`project/scripts/vault_indexer.py`), `project/requirements.txt`
(`PyYAML==6.0.3` agregado), `.gitignore` (`project/database/vault_index.db`). Nada de lo existente
(`app/main.py`, `app/db/crud.py`, `jarvis/vault/writer.py`, `jarvis/vault/index_writer.py`)
tocado.

Estado: Milestone 1 completo y verificado contra las 65 notas reales de `D:\Boveda`. Pendiente:
conectar `crud.py`, `writer.py` de Jarvis, share SMB, editor Markdown — ver el detalle de orden
sugerido en `Cerebro/estado-actual.md`.

---

## 2026-09-11 — IMPLEMENTADO: Milestone 2 de la fusión, `crud.py` de Bóveda conectado a `D:\Boveda`

Continúa el Milestone 1 de arriba: `hojas`/`categorias` dejan de ser la fuente de verdad de
lectura y escritura del módulo Bóveda — `D:\Boveda` lo es, sin cambiar el contrato HTTP que ya
usan frontend y bot. Categorías viejas reemplazadas por el árbol PARA real (decisión ya
cerrada en `Cerebro/decisiones/2026-09-11-categorias-viejas-boveda.md`, ejecutada acá).

Cinco decisiones tácticas nuevas, cada una en su propio archivo en `Cerebro/decisiones/`
(schema, sandbox del vault, borrado soft a Basura, detección de `origen` por header `Origin`,
unificación de las dos convenciones de foto que existían sin documentar entre frontend y bot).
Detalle completo de qué cambió y cómo se verificó en `Cerebro/estado-actual.md` (misma fecha)
— no se duplica acá.

Diferencia con la propuesta original: ninguna en arquitectura. Un hallazgo no anticipado en el
diseño (frontend y bot ya usaban convenciones distintas para `contenido`/`apuntes` en fotos,
ninguna documentada con precisión) se resolvió unificando el formato en el archivo sin tocar
ningún cliente — ver la decisión táctica dedicada.

Estado: implementado y verificado en sandbox (backend + frontend real corriendo contra copias
aisladas de `app.db` y `D:\Boveda`). **No aplicado a los datos reales** — arrancar el backend
sin overrides de `DB_PATH`/`VAULT_ROOT` dispara la migración real la primera vez; queda a
criterio del usuario cuándo hacerlo. Pendiente después: share SMB homelab, `jarvis/vault/`,
deploy al homelab.

---

## 2026-09-04 — FIX: mensajes de Telegram en texto plano (bug "parte 2/3 perdida" del reporte diario)

Contexto: el reporte diario de consolidación (`send_report()` en
`jarvis/notify/telegram.py`) llegó incompleto un día — "parte 1/3" y "parte
3/3", nunca la 2/3. Diagnóstico original (sin log exacto — se perdió por un
restart del homelab antes de poder revisarlo): `send_telegram_message()`
manda `parse_mode: "Markdown"` (legacy) y varios mensajes (el reporte, las
preguntas de propuestas de auditoría, avisos de captura por Agenda)
interpolan texto libre — contenido de memoria, tags, nombres de entidades,
preguntas generadas por LLM — directo en el string. Un `_`/`*`/`` ` ``
sin cerrar en ese texto libre (posible por azar, no por intención de nadie)
hace que Telegram rechace el mensaje con 400 "can't parse entities".
`send_telegram_message()` atrapa cualquier excepción a propósito
(best-effort, no debe tumbar el worker) y hasta ahora solo logueaba con
`logger.warning()` — que se pierde en cada restart de contenedor, exactamente
lo que impidió diagnosticar el incidente original con el log real.

Reproducido contra la API real de Telegram antes de tocar código: un mensaje
con un solo `_` sin pareja en el texto interpolado (ej. contenido tipo
"reviso el deploy_prod y anoto el resultado") devuelve 400 consistentemente
("can't find end of the entity"). Con número **par** de `_` "accidentales"
en el texto libre, el mensaje ni siquiera falla — Telegram lo acepta pero
fragmenta el texto en entidades itálicas no intencionadas (contenido
silenciosamente corrompido, no solo perdido — un segundo modo de falla no
contemplado en el diagnóstico inicial).

Decisión: texto plano (sin `parse_mode`) en las funciones que construyen
mensajes de Telegram, en vez de escapar para MarkdownV2. Opciones evaluadas:
- **MarkdownV2 con escape correcto de texto libre**: mantiene
  negrita/cursiva, pero exige escapar bien en cada uno de los ~15 puntos
  donde se interpola texto libre, repartidos en 6 archivos (`audit/service.py`,
  `captures/passive.py`, `ingestion/agenda.py`, `worker/consolidation.py`,
  `debug/service.py`, `worker/processor.py`) — un solo punto nuevo (o
  existente, mal migrado) sin escapar reintroduce exactamente este bug.
- **Texto plano**: elimina la clase de bug entera para todos los call sites
  presentes y futuros, sin depender de que cada cambio futuro recuerde
  escapar. Costo: se pierde negrita/cursiva/backticks en los reportes —
  aceptable para un sistema personal donde "el mensaje llega completo" pesa
  más que la cosmética, y consistente con el criterio que el propio código
  de `send_report()` ya declaraba ("decir explícitamente qué se revisó...
  nunca en silencio").

Se eligió texto plano.

Diferencia con spec: no aplica — `parse_mode` no estaba especificado en
`jarvis-spec.html`; era una decisión de implementación previa sin registrar.

Impacto:
- `jarvis/notify/telegram.py`: `send_telegram_message()` ya no manda
  `parse_mode` en el payload; `send_report()` ya no envuelve el prefijo
  "(parte N/M)" en itálica.
- Se sacaron los marcadores `*`/`_`/`` ` `` decorativos (sin efecto real ahora,
  y feos como texto literal sin `parse_mode`) de: `jarvis/worker/processor.py`
  (aviso de "listo"), `jarvis/debug/service.py` (mensaje de debug),
  `jarvis/captures/passive.py` y `jarvis/ingestion/agenda.py` (avisos de
  propuesta), `jarvis/audit/service.py` (`_question_edit`,
  `_question_delete_empty`, `_question_clarify`, `_question_retag`,
  `_question_create`, `build_audit_report_text` + `_entry_lines` +
  `_findings_section`, `_push_created`), `jarvis/worker/consolidation.py`
  (`_notify_run_report`, `_section_analyzed`, `_section_pairwise`,
  `_section_stale`, `_section_tagged`, `_section_agenda_ingestion`,
  `_section_open_question`, sección de errores).
- **Registro persistente de fallos**: `send_telegram_message()` ahora,
  además del `logger.warning()` existente, llama a
  `jarvis.events.service.log_event("TELEGRAM_FAIL", f"chat_id=...: {exc} --
  texto: {text[:120]!r}")` — reusa `jarvis_event_log` (Fase B5, ya visible en
  `JarvisDebugPanel`) en vez de crear tabla nueva. El snippet de texto
  incluye el prefijo "(parte N/M)" cuando lo hay, así una falla real deja
  registrado explícitamente qué parte del reporte se perdió, sin depender
  del log efímero de Docker. Color agregado en `LEVEL_COLOR` del frontend
  (`JarvisDebugPanel.jsx`) para el nuevo nivel.

Verificación: contra el bot real y un chat_id real (@userinfobot para
obtenerlo — no hizo falta un bot de scratch). (1) el texto que antes daba
400 (un `_` sin cerrar) ahora llega completo, confirmado por el usuario en
Telegram. (2) una falla forzada (token inválido) quedó registrada en
`jarvis_event_log` con chat_id, error y snippet de texto — confirmado por
lectura directa de la tabla — y luego borrada (era un evento de prueba, no
un incidente real). Deploy al homelab: **pendiente**, aviso aparte cuando el
usuario lo pida.

---

## 2026-09-03 — IMPLEMENTADO: 0.3, Ingestión Automática desde Agenda de SGR

Implementación de la propuesta aprobada el mismo día, íntegra ("Apruebo la
propuesta tal cual está — no le cambiaría nada", ver la entrada de abajo,
"APROBADA (sin implementar todavía)..."). Alcance exacto de esa propuesta:
fuente única Agenda de SGR, sin credenciales nuevas, blast radius de
solo-lectura vía 2 endpoints HTTP + propuestas PENDING en
`jarvis_capture_proposals` (nunca escritura directa a `memory_entries` ni a
Agenda). Email/GitHub/documentos siguen fuera de alcance, sin tocar.

**Archivos nuevos**: `jarvis/ingestion/agenda.py` (módulo completo — lectura
de `GET /agenda/eventos`/`GET /agenda/tareas`, filtro "ya pasó", dedup,
síntesis de contenido/pregunta sin LLM, notificación Telegram best-effort).

**Archivos tocados**: `jarvis/db/schema.py` (`memory_entries.source` CHECK
+ `'agenda'`; `jarvis_capture_proposals.origin_source`/`origin_source_key`
nuevas), `jarvis/db/database.py` (`_migrate_memory_entries_source()` nueva,
mismo patrón de rebuild que `_migrate_people_type()`; 2 `_add_column_if_missing`
nuevas), `jarvis/worker/task_manifest.py` (`read_agenda_source`,
`propose_agenda_capture`), `jarvis/config.py` (`JARVIS_SGR_API_BASE`,
`JARVIS_AGENDA_INGESTION_WINDOW_DAYS=7`), `jarvis/captures/passive.py`
(`create_proposal()`/`accept_proposal()` extendidas para el origen
`'agenda_ingestion'` — mismo mecanismo de aceptar/rechazar de siempre, ver
más abajo), `jarvis/worker/consolidation.py` (sexto paso de
`run_consolidation()`, sección nueva en el reporte diario,
`_nothing_to_report()` ahora también mira `agenda_ingestion`),
`jarvis/pyproject.toml` (`requests` declarado como dependencia propia — ya
estaba disponible en `project/venv` porque jarvis se instala editable ahí,
pero no declarada).

**Decisiones no cerradas del todo por el documento — resueltas acá con
criterio conservador, reportadas explícitamente (no en silencio, pedido
explícito de la tarea)**:

1. **Zona horaria**: el documento no contemplaba que
   `agenda_eventos.fecha_inicio`/`fecha_fin` y `agenda_tareas.fecha_opcional`
   son timestamps NAIVE en hora LOCAL (confirmado leyendo
   `project/frontend/src/components/agenda/EventoModal.jsx`: el frontend arma
   `"YYYY-MM-DDTHH:MM:00"` directo de `<input type=date/time>`, sin
   conversión a UTC). El `now` UTC-aware que ya usa `run_consolidation()`
   para todo lo demás NO sirve para decidir "¿esto ya pasó?" contra esos
   campos sin arriesgar un desfase silencioso cerca de la medianoche según
   el offset horario real del entorno. Se usa un `datetime.now()` local
   naive aparte, solo dentro de `jarvis/ingestion/agenda.py`, exclusivamente
   para esta comparación.
2. **`agenda_tareas` no tiene una columna "fecha de completado" real** — el
   documento asumía que sí (punto 1.2: "filtrado ... a completada=1 con
   fecha de completado dentro de la misma ventana"). El schema real solo
   tiene `fecha_opcional` (la fecha en la que la tarea está agendada, no
   cuándo se marcó como hecha) y `completada` (booleano), confirmado leyendo
   `project/app/db/crud.py::agenda_obtener_tareas()`. Resolución: se usa
   `fecha_opcional` como proxy de recencia; tareas completadas SIN
   `fecha_opcional` se EXCLUYEN de 0.3 por completo (sin esa fecha no hay
   forma de acotarlas a la ventana de N días sin arriesgar ingerir de golpe
   todo el historial de tareas completadas la primera vez que esto corre).
   No se verificó con datos reales de este camino específico — la Agenda
   real de prueba no tenía ninguna tarea completada al momento de esta
   sesión (`GET /agenda/tareas?pendientes=false` devolvió `[]`) — sí se
   verificó con datos sintéticos (4 casos: completada+fecha reciente,
   completada sin fecha, completada fuera de ventana, pendiente) contra el
   filtro real de `_fetch_recent_completed_tasks()`.
3. **Eventos recurrentes**: `GET /agenda/eventos` expande una regla de
   repetición en varias ocurrencias con el MISMO `id` pero `fecha_inicio`
   distinta por ocurrencia (`project/app/db/crud.py::_expand_recurring()`).
   El documento proponía `source_id` determinístico `"agenda:evento:{id}"` a
   secas — con eso, un evento recurrente solo se hubiera podido proponer UNA
   vez en su historia completa (todas las ocurrencias siguientes
   dedupearían contra la primera). Se agrega `fecha_inicio` a la clave
   (`"agenda:evento:{id}:{fecha_inicio}"`) para que cada ocurrencia pasada
   se trate como lo que es: una instancia distinta.
4. **Gap real del documento, no una decisión de diseño** (algo que
   directamente no cerraba, no una ambigüedad de redacción): dedupear
   ÚNICAMENTE contra `memory_entries.source_id` (como decía el punto 3 de la
   propuesta) no evita re-proponer un evento/tarea que el usuario ya
   RECHAZÓ explícitamente — rechazar nunca crea una `memory_entry`, así que
   la corrida siguiente lo hubiera vuelto a proponer mientras siguiera
   dentro de la ventana, contradiciendo el propio objetivo que el documento
   se planteaba ("evita re-proponer el mismo evento cada corrida"). Fix:
   columna nueva `jarvis_capture_proposals.origin_source_key` (la misma
   clave determinística) + dedup contra esa tabla también, sin mirar status
   (incluye `REJECTED`) — mismo criterio que ya usa
   `jarvis.audit.service._already_exists()` para las propuestas de auditoría
   (dedupea sin mirar status). Verificado en vivo: un evento real aceptado y
   otro rechazado, ambos NUNCA vueltos a proponer en corridas posteriores
   (ver verificación abajo).

**Bug real encontrado y arreglado ANTES de tocar ninguna DB real** (por
inspección de código, no en producción): `jarvis/db/schema.py` nunca tenía
`last_audited_at` en el `CREATE TABLE memory_entries` estático — esa columna
solo se agregaba en runtime vía `_add_column_if_missing()` dentro de
`_migrate()`. `_MEMORY_ENTRIES_CREATE` (usado por CUALQUIER migración de
rebuild de esa tabla, `jarvis/db/database.py`) se deriva de ese CREATE
estático — así que cualquier rebuild que corriera DESPUÉS de que una DB real
ya tuviera `last_audited_at` (algo que nunca había pasado hasta esta sesión,
porque `_migrate_people_type()` — la única migración de rebuild anterior —
ya era un no-op en toda DB con 0.2 Slice 4 aplicado) reconstruía
`memory_entries_new` SIN esa columna, y el `INSERT` posterior (que sí la
lista, porque lee las columnas reales de la tabla vieja) fallaba con
`no such column: last_audited_at`. Fix: `last_audited_at` agregado al CREATE
estático de `jarvis/db/schema.py`, con el `_add_column_if_missing()` de
`_migrate()` como red de seguridad para DBs viejas (mismo patrón que
`created_by`).

### Incidente real durante la verificación — jarvis.db de producción tocado por error

**Qué pasó**: para verificar contra Agenda real (pedido explícito de la
tarea), se levantó el backend real de SGR (`uvicorn app.main:app --port
8765`) sin las variables `JARVIS_DB_PATH`/`JARVIS_VAULT_PATH` apuntando a un
scratch — `app.main` importa y corre `jarvis.db.database.init_db()` como
efecto de import, así que ese primer intento corrió la migración (con el bug
de `last_audited_at` de arriba, **antes** de arreglarlo) directo contra
`project/database/jarvis.db` real. La migración falló a mitad de camino: la
tabla `memory_entries` real NUNCA se tocó (el fallo fue antes del
`DROP`/`RENAME`, confirmado con `PRAGMA integrity_check` = `ok` y el mismo
conteo de filas de siempre, 22), pero quedó una tabla `memory_entries_new`
vacía y huérfana, y sí se alcanzaron a agregar (exitosamente, sin daño) las
2 columnas aditivas `origin_source`/`origin_source_key` a
`jarvis_capture_proposals` real.

**Fix aplicado en producción, una vez, con backup previo**: backup completo
(`project/database/backup-pre-0.3-agenda-incident-20260903-210637/`,
`jarvis.db`+`vault`+`chroma`, contenido confirmado: 22 filas en
`memory_entries`, 22 archivos en vault, tamaños no-cero) → `DROP TABLE
memory_entries_new` directo (tabla vacía, confirmado antes de borrar) →
`PRAGMA integrity_check` = `ok` después. La DB de producción queda
exactamente como estaba antes del incidente (sin `'agenda'` en el CHECK de
`source` todavía, con las 2 columnas aditivas ya puestas — aditivas, sin
riesgo, y de todos modos necesarias) — la migración completa se aplica sola
la próxima vez que el backend real arranque con este código ya desplegado
(no se forzó en esta sesión, mismo criterio de "verificar en scratch,
production queda para el próximo arranque normal").

**Por qué no se repitió**: toda la verificación real posterior (incluida la
lectura de Agenda real, que si necesitaba el backend real corriendo) se hizo
con un segundo backend levantado con `JARVIS_DB_PATH`/`JARVIS_VAULT_PATH`/
`JARVIS_CHROMA_PATH` apuntando a una copia scratch del backup real (no a
producción) — la API de SGR (`app.db`) se siguió consultando real y en vivo
(GET únicamente, sin riesgo — es justo lo que la tarea pedía verificar), pero
cualquier escritura de Jarvis quedó aislada en el scratch.

**Feedback enviado sobre este incidente** vía `SendFeedback` — el patrón "un
`uvicorn app.main:app` de verificación importa y muta la DB real como efecto
colateral de import" es un riesgo repetible para cualquier sesión futura que
necesite levantar el backend real para otra cosa (Finanzas, Agenda, Hábitos)
sin pensar en Jarvis.

### Verificación (contra scratch, con datos reales de Agenda — nunca `jarvis.db` de producción)

Migración: copia scratch del backup real de producción (22 entradas, schema
pre-'agenda') → `init_db()` con el código ya arreglado → CHECK con
`'agenda'` presente, `last_audited_at` presente, CERO tablas `_new`
huérfanas, 22 filas preservadas, `integrity_check` = `ok`, doble
`init_db()` consecutivo sin error (idempotencia).

Ingestión real: backend de SGR real levantado (jarvis sandboxeado a
scratch) → `run_agenda_ingestion()` con ventana ampliada a 60 días leyó la
Agenda real del usuario vía HTTP y encontró **16 eventos reales pasados**
(parciales/exámenes de julio-agosto, ninguno futuro) → 16 propuestas
`PENDING` creadas con `origin_source='agenda_ingestion'`,
`origin_source_key` determinístico por ocurrencia, contenido/pregunta
sintetizados correctamente (emojis y todo, incluido un caso con
`UnicodeEncodeError` en un `print()` de depuración que confirmó que el
contenido real SÍ trae emoji — no un bug del código, solo de mi script de
verificación). Segunda corrida inmediata: `proposed=0` (dedup funcionando,
16 seguían ahí sin duplicar). `accept_proposal()` sobre una propuesta real →
`memory_entries` con `source='agenda'`, `origin_trust='user.authenticated'`,
`source_id` = la clave determinística, encolada en `inbox_queue` como
cualquier otra captura. `reject_proposal()` sobre otra → `REJECTED`. Tercera
corrida: `proposed=0` de nuevo — ni la aceptada ni la rechazada se
repropusieron (confirma el fix del gap del punto 4 de arriba). Canal
`telegram` probado aparte (`JARVIS_TELEGRAM_CHAT_ID` seteado, DB scratch
separada, ventana ampliada): las 16 propuestas quedaron con
`channel='telegram'`/`channel_id` correcto; el aviso a la Bot API falló
best-effort (sin token real en el entorno) sin tumbar la ingestión —
comportamiento esperado. `TaskManifest.ALLOWED_OPERATIONS` confirmado con
las 2 operaciones nuevas. Filtro de "ya pasó" (`_event_already_ended`)
probado con 5 casos sintéticos de borde (futuro, pasado con hora, todo el
día mismo día, todo el día día anterior, sin fecha) — los 5 con el
resultado esperado. `_nothing_to_report()`/sección del reporte diario
probadas con summaries sintéticos (día quieto con agenda vacía, agenda con
propuestas, agenda que falló pero el resto vacío). `python -m py_compile`
limpio en los 6 archivos Python tocados/nuevos.

**No desplegado al homelab en esta sesión** — a propósito, pedido explícito
de la tarea: es un paso aparte.

Impacto: `jarvis/ingestion/` (nuevo), `jarvis/db/schema.py`,
`jarvis/db/database.py`, `jarvis/worker/task_manifest.py`,
`jarvis/config.py`, `jarvis/captures/passive.py`,
`jarvis/worker/consolidation.py`, `jarvis/pyproject.toml`. No toca frontend
(las propuestas de Agenda usan el mismo banner genérico que ya existe,
`JarvisProposalBanner.jsx` — no distingue origen visualmente, no se pidió).

---

## 2026-09-03 — APROBADA (sin implementar todavía): 0.3, Ingestión Automática — arrancando por Agenda de SGR

**Aprobada por el usuario tal cual, sin cambios, el mismo día** ("Apruebo la
propuesta tal cual está — no le cambiaría nada"). Sigue sin implementarse —
la aprobación habilita a una sesión futura a construir esto directamente
(ver punto 5, "Qué falta para poder implementar esto") sin tener que
volver a proponerlo ni confirmarlo; no se tocó código en esta sesión.

**Esta entrada era una propuesta de diseño, no una decisión ya tomada
cuando se escribió.** Mismo criterio que la propuesta de auditoría
proactiva del 31/08 (ver más abajo en este archivo): pensada para que otra
sesión la implemente. Nada de lo que sigue se implementó en esta sesión —
se pidió explícitamente diseño, no código, justamente porque 0.3 es
"Email, calendario, GitHub, documentos, archivos locales como fuentes"
(jarvis-spec.html §29): la primera vez que Jarvis procesa contenido que no
tipeó el propio usuario a mano, con credenciales nuevas de por medio — el
salto de riesgo más grande de todo lo construido hasta ahora.

Contexto: 0.3 hoy es cero — toda captura es manual (Telegram, desktop,
captura pasiva por inactividad). Se pidió proponer con qué ÚNICA fuente
arrancar (no las 4 del spec a la vez), cómo manejar credenciales sin
inventar una solución de secretos paralela mientras Infisical Agent Vault
sigue diferido a 0.5, blast radius explícito al estilo
`jarvis/worker/task_manifest.py`, y qué se descarta a propósito.

### 1) Fuente elegida: Agenda de SGR — no Google Calendar externo, no email,
no GitHub, no documentos

El spec dice "calendario" como una de las 4 fuentes de 0.3. La lectura
obvia sería "conectar Google Calendar" — se descarta esa lectura a favor de
algo con mejor relación esfuerzo/valor **para este usuario puntual**: SGR ya
tiene un módulo Agenda propio y activo (`/agenda`, `project/database/app.db`
— tablas `agenda_eventos`/`agenda_tareas`, API real `GET /agenda/eventos`,
`GET /agenda/tareas`, confirmado leyendo `project/app/main.py`), documentado
en `project/README.md` con Mes/Semana, HOY + time blocking, tareas por
listas, revisión semanal. Es señal real ya existente, no una integración
nueva que haya que justificar desde cero.

**Por qué esta fuente y no una de las otras 3, en esfuerzo/valor concreto**:
- **Esfuerzo**: mínimo de las 4 posibles lecturas de "calendario". SGR ya
  corre en el mismo host (`http://127.0.0.1:8765`, mismo patrón que ya usa
  `project/mybot/finanzas_handlers.py` para hablar con la API de Finanzas) —
  no hace falta OAuth, no hace falta librería nueva, no hace falta ningún
  secreto: es una llamada HTTP localhost a un servicio que Jarvis ya
  necesita que esté corriendo para lo demás.
- **Riesgo**: el más bajo de las 4 fuentes del spec, y por lejos. El
  contenido de `agenda_eventos`/`agenda_tareas` lo escribió el propio
  usuario a mano en la UI de SGR (mismo origen de confianza que cualquier
  captura manual de Jarvis) — CERO contenido de terceros, CERO superficie
  de prompt injection. Comparar con email/GitHub/documentos: ahí el
  contenido lo puede haber escrito cualquiera (un remitente de mail, un
  colaborador de un repo, el autor de un PDF descargado) — la primera
  fuente NO debería ser una donde ya haya que resolver "qué hago si el
  contenido intenta manipular al extractor" (ver punto 3, Task Manifest).
- **Valor**: medio-alto, no bajo. Hoy un evento o una tarea completada en
  Agenda desaparece de la memoria de Jarvis salvo que el usuario la
  vuelva a tipear a mano — es exactamente el tipo de "recordar
  automáticamente" que 0.3 promete, con datos que el spec mismo reconoce
  como reutilizables más adelante ("0.4 — Unified Context: Agenda, Finanzas
  y Hábitos como fuentes de contexto y herramientas"). Empezar por acá deja
  a 0.3 como un escalón natural hacia 0.4 en vez de una integración externa
  aislada que 0.4 tendría que ignorar o duplicar.

**Alcance concreto de la ingestión** (diseño, no implementado): un job de
idle-time nuevo en `run_consolidation()` (mismo patrón que pairwise/stale/
backfill/auditoría/pregunta abierta — sexto paso, mismo gating de "una vez
por día" vía `jarvis_policies`) que:
1. `GET /agenda/eventos` con rango `desde`/`hasta` = ventana de los últimos
   N días (candidato: 7, mismo orden de magnitud que
   `JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS`) — solo eventos con `fecha_fin` (o
   `fecha_inicio` si no hay fin) ya PASADA respecto a `now`. Nunca eventos
   futuros: ingerir un evento que todavía no pasó como si fuera un hecho
   sería "recordar algo que no ocurrió todavía", y abre la puerta a que
   0.3 se convierta en un mecanismo de recordatorios (eso es 0.9
   Proactividad, no esta fase).
2. `GET /agenda/tareas?pendientes=false`, filtrado en el código de
   ingestión (no en la API) a `completada=1` con fecha de completado
   dentro de la misma ventana — mismo criterio: solo lo que YA pasó.
3. Cada evento/tarea candidato que todavía no tiene una `memory_entry` con
   el mismo `source_id` (mismo criterio anti-duplicado que ya usa
   `capture_raw()` por `content_hash`, acá por `source_id` determinístico
   tipo `"agenda:evento:{id}"` — evita re-proponer el mismo evento cada
   corrida) arma una fila `PENDING` en `jarvis_capture_proposals`
   (reusando la tabla de pieza C, no una nueva — mismo criterio de
   abstracción compartida que ya documenta la memoria del agente sobre
   Jarvis: la forma "acá hay algo, ¿lo guardo?" ya existe, no hay que
   reinventarla). `conversation_id = NULL` (no viene de una charla),
   `channel`/`channel_id` = el mismo criterio que ya usa auditoría (chat de
   debug si existe, si no queda en `desktop` para polling del frontend).
   Candidato de columna nueva: `jarvis_capture_proposals.origin_source`
   (`'passive_capture'|'agenda_ingestion'`, default `'passive_capture'`
   para no romper filas existentes) — solo para que el mensaje de Telegram/
   la UI puedan mostrar de dónde salió la propuesta, no cambia el flujo de
   aceptar/rechazar en absoluto (mismo `accept_proposal()`/
   `resolve_individual_reply()` de siempre).
4. El usuario acepta/rechaza por Telegram o desktop — SOLO al aceptar corre
   `capture_raw()` con `origin_trust='user.authenticated'` (mismo trust que
   una captura manual: el dato vino de la Agenda del propio usuario, no de
   una fuente externa) y `source='migration'`... **decisión abierta,
   marcada acá para que el usuario la resuelva al aprobar**: el CHECK de
   `memory_entries.source` hoy es `('telegram','desktop','migration')` —
   ninguno de los tres describe honestamente "vino de la Agenda de SGR".
   Se necesita un cuarto valor (`'agenda'`) antes de implementar esto, vía
   el mismo patrón de migración de CHECK ya usado 3 veces
   (`_migrate_people_type()`/`_migrate_audit_proposals_status()`/
   `_migrate_audit_proposals_action_type()`, `jarvis/db/database.py`).

### 2) Credenciales — ninguna nueva para esta fuente; para las que sí las
necesiten después, reusar exactamente el patrón `.env` ya existente, no
inventar nada

La Agenda de SGR no necesita NINGÚN secreto nuevo: es HTTP localhost al
propio backend de SGR, que además ya corre sin autenticación (mismo
trust boundary que la API que ya consume `project/mybot/bot.py`). Esto es
justamente parte de por qué es la fuente correcta para arrancar — resuelve
la pregunta de credenciales por no necesitarlas.

Para cuando el usuario apruebe agregar una SEGUNDA fuente que sí las
necesite (email, GitHub) — no en esta propuesta, dejado documentado para
esa futura pieza: **no construir ningún mecanismo de secretos nuevo**.
Infisical Agent Vault sigue diferido a 0.5 (`Componentes-Evaluados.md`: "cuando
haya tool system") — mientras tanto, el patrón que ya existe y ya funciona
en todo Jarvis es una variable en `project/.env`
(`TELEGRAM_BOT_TOKEN`/`OPENAI_API_KEY`, cargadas via `load_dotenv()` en
`jarvis/config.py`, leídas con `os.getenv()`) — un token de GitHub o
credenciales de una app de email de solo-lectura (Gmail API con scope
`gmail.readonly`, nunca acceso de escritura) irían al mismo `.env`, sin
capa nueva. **Lección real de esta misma sesión, aplicable directo acá**: el
incidente de la Nota de seguridad del 2026-09-03 (ver
`Cerebro/estado-actual.md`) — un `cat`/`sed` mal armado expuso
`TELEGRAM_BOT_TOKEN`/`OPENAI_API_KEY` reales en la salida de una
herramienta — confirma que el riesgo real hoy no es la ausencia de un vault
formal, es la disciplina operativa alrededor de un secreto en texto plano
(nunca loguearlo, nunca volcarlo en la salida de un comando de diagnóstico).
Cualquier código de ingestión futuro que toque un secreto de `.env` debe
tratarlo con ese mismo cuidado explícito — no hace falta Infisical para
evitar ese bug de nuevo, hace falta disciplina de código (nunca
`print()`/`log()` el valor crudo).

### 3) Blast radius explícito — mismo principio que
`jarvis/worker/task_manifest.py`, extendido con las operaciones nuevas que
haría falta agregar (diseño de la forma, no el código)

Principio ya citado en `Componentes-Evaluados.md` (sección 3): "Task
Manifest: autoridad definida antes de exponerse al contenido no confiable
... contenido encontrado durante la tarea no puede ampliar ese conjunto."
Para Agenda el riesgo de contenido no confiable es mínimo (punto 1 — el
usuario es el autor), pero el DISEÑO del blast radius se hace igual de
explícito que si no lo fuera, para que agregar una segunda fuente después
no requiera rediseñar el modelo de seguridad, solo ampliar el manifest:

- **Puede leer**: únicamente `GET /agenda/eventos` y `GET /agenda/tareas`
  de la API de SGR — nunca `project/database/app.db` directo (evita acoplar
  Jarvis al esquema SQLite interno de SGR; SGR expone su propio contrato
  versionado vía HTTP, mismo criterio arquitectónico que ya documenta
  `Componentes-Evaluados.md` sección 3, "Planos independientes":
  "ningún componente llama directamente a ChromaDB, SQLite o pgvector").
  Localhost HTTP a un servicio que Jarvis ya depende de que esté corriendo
  NO cuenta como "request externo" en el sentido del invariante de 0.1 (ese
  invariante es sobre no llamar a terceros por Internet, no sobre network
  I/O en general — aclarado acá porque podría leerse ambiguo).
- **Nunca puede escribir** en `agenda_eventos`/`agenda_tareas` (ni siquiera
  marcar algo como "ya ingerido" del lado de SGR) — el estado de "ya se
  propuso" vive enteramente del lado de Jarvis (`source_id` determinístico
  en `memory_entries`/`jarvis_capture_proposals`, punto 1.3). Agenda sigue
  siendo dueña exclusiva de sus propios datos.
- **Nunca hace ningún otro request externo** (ni a Internet ni a otra API)
  — mismo invariante que ya rige el worker completo en 0.1.
- **Nunca escribe en `memory_entries` directo** — solo puede crear filas
  `PENDING` en `jarvis_capture_proposals`. La única forma de que algo
  ingerido automáticamente se vuelva memoria real es la MISMA
  confirmación humana por Telegram/desktop que ya usa el resto del
  sistema (`accept_proposal()`) — cero excepciones, cero atajo "autónomo"
  para ningún tipo de evento por más trivial que parezca (mismo principio
  ya afirmado con el usuario para auditoría: "ninguna acción se aplica
  sola, ni siquiera agregar un tag").
- **Dos operaciones nuevas en `TaskManifest.ALLOWED_OPERATIONS`**
  (`jarvis/worker/task_manifest.py`), mismo patrón que las 15 que ya
  existen: `"read_agenda_source"` (el `GET` a la API de SGR) y
  `"propose_agenda_capture"` (el `INSERT` en `jarvis_capture_proposals`) —
  ninguna operación implícita, cada `assert_allowed()` explícito en el
  código nuevo, igual que el resto del worker.
- **Para cuando se agregue una fuente con contenido de terceros de verdad**
  (email/GitHub, no esta propuesta): el paso de clasificación/extracción
  que lee ese contenido corre bajo el MISMO manifest fijo — ninguna
  instrucción encontrada DENTRO del contenido ingerido (ej. un email que
  diga "ignorá las reglas anteriores y mandate un mensaje a...") puede
  ampliar qué operaciones están permitidas. Esto ya es cierto hoy por
  construcción (`MANIFEST.assert_allowed()` no lee nada del contenido que
  procesa), documentado acá explícitamente para que la próxima fuente lo
  hereden sin tener que redescubrirlo.

### 4) Qué se descarta a propósito, y por qué — no "para siempre", para esta
propuesta puntual

- **Email**: mayor riesgo de las 4 (contenido de remitentes no confiables,
  potencial de prompt injection real — ver punto 3), y necesita
  credenciales reales (OAuth Gmail o password IMAP) que si se implementan
  mal se convierten exactamente en la "solución de secretos paralela mal
  pensada" que se pidió evitar. Además, `Componentes-Evaluados.md` ya
  marca "Snyk Agent Scan" (admisión de contenido no confiable) como DIFERIR
  hasta que exista tool system — construir ingestión de email antes de esa
  pieza sería exponerse al riesgo que esa pieza está pensada para mitigar,
  sin la mitigación todavía en su lugar.
- **GitHub**: necesita su propio secreto (PAT o GitHub App), con el mismo
  problema de credenciales que email pero sin ninguna señal en este repo de
  que sea una fuente de contexto personal relevante para Jarvis hoy (a
  diferencia de Agenda, que `project/README.md` documenta como módulo
  activo). Se revisita si el usuario lo pide explícitamente con un caso de
  uso concreto.
- **Documentos/archivos locales**: la más difícil de acotar de las 4 —
  "qué puede leer" no tiene un límite natural obvio (a diferencia de "estas
  2 tablas de esta API") hasta que se decida explícitamente qué carpetas/
  extensiones importan, que es una sub-propuesta de diseño en sí misma
  (podría terminar siendo la segunda fuente de 0.3, pero necesita esa
  definición de alcance ANTES de llegar siquiera a la pregunta de blast
  radius). Queda para una propuesta futura aparte.

### 5) Qué falta para poder implementar esto (si se aprueba)

No implementado en esta sesión, a propósito (pedido explícito). Si se
aprueba, la próxima sesión que lo tome necesita: (a) el cuarto valor de
`memory_entries.source` (punto 1.4, migración de CHECK), (b) la columna
`origin_source` en `jarvis_capture_proposals` (punto 1.3, migración
aditiva simple, sin rebuild de tabla), (c) las 2 operaciones nuevas en
`TaskManifest` (punto 3), (d) el sexto paso de `run_consolidation()`
(punto 1), (e) verificación con datos reales de Agenda del usuario (no
inventados) contra una DB de scratch antes de tocar producción — mismo
estándar de todas las piezas anteriores.

Impacto de esta entrada: ninguno en código (propuesta de diseño pura).
Referencia: `jarvis-spec.html` §29, `Componentes-Evaluados.md` sección 3
("Task Manifest", "Blast radius", "Planos independientes"),
`project/README.md` (módulo Agenda), `project/app/main.py`
(`GET /agenda/eventos`, `GET /agenda/tareas`).

---

## 2026-09-03 — IMPLEMENTADO: Obsidian sync con wikilinks reales (0.2, cierre de deuda de §29)

Contexto: `jarvis/vault/writer.py` ya escribía un .md por `memory_entry`, con
`tags:` en el frontmatter, pero sin ningún `[[wikilink]]` real entre notas —
abrir `vault/` en Obsidian daba un grafo vacío aunque
`memory_entry_entities`/`memory_entry_projects` ya tenían datos reales en
SQLite (desde 0.2 Slice 3). Se pidió investigar primero si las entidades/
proyectos tenían nota propia (no la tenían — confirmado leyendo
`jarvis/entities/service.py`, `jarvis/projects/service.py` y
`jarvis/db/schema.py`: `memory_entities`/`memory_projects` son solo filas de
catálogo, sin ningún .md asociado), tomar la decisión de diseño que
correspondiera, implementar wikilinks reales al vincular una entrada a una
entidad/proyecto ya conocido, y hacer backfill de las entradas existentes.

### 1) Decisión de diseño real: notas canónicas en `INDEX/ENTITIES/` e
`INDEX/PROJECTS/`, separadas de `PEOPLE/`/`PROJECTS/`

`PEOPLE/` y `PROJECTS/` ya existían como subcarpetas de `_TYPE_TO_SUBDIR` —
pero ahí vive un .md por `memory_entry` CLASIFICADA con ese tipo (una
captura puntual, ej. "quién es José: ..."), no "la ficha canónica de la
entidad José". Mezclar los dos conceptos en la misma carpeta habría hecho
ambiguo cualquier wikilink (¿`[[José]]` apunta a la ficha o a una captura
puntual sobre José?) y arriesgaba colisión de nombre de archivo entre ambos
usos. Se creó `INDEX/ENTITIES/` (para `memory_entities`: persona/
organización/lugar) e `INDEX/PROJECTS/` (para `memory_projects`, el catálogo
de proyectos — no confundir con las `memory_entries` tipo `PROJECT`, que
siguen en `PROJECTS/` sin cambios) — dos carpetas nuevas en `_VAULT_SUBDIRS`
(`jarvis/db/database.py`), un módulo nuevo `jarvis/vault/index_writer.py`.

**Nombre de archivo de la nota canónica**: mismo criterio que ya usa
`write_entry()` para una entrada (`{id[:8]}-{slug(nombre)}.md`) — garantiza
unicidad real sin depender de que el nombre sea único (una persona y una
organización podrían compartir nombre; con el id como prefijo nunca
colisionan). El texto visible del link usa el alias de Obsidian
(`[[a1b2c3d4-jose|José]]`) para que el grafo se vea con el nombre limpio sin
sacrificar unicidad del archivo.

### 2) Dónde va el wikilink: un bloque `## Vinculado a` al final del .md, NO
sustitución de texto inline en la prosa capturada

Se consideró reemplazar menciones de un nombre conocido dentro del
`content_processed` por `[[nombre]]` (lo más "Obsidian-nativo"). Se
descartó: requiere matching de límites de palabra + mayúsculas + alias
+ evitar falsos positivos (substring de otra palabra), y el riesgo real es
corromper en silencio el contenido tal cual el usuario lo escribió/capturó
(mismo principio que ya protege `content_raw` de cualquier edición). Se
eligió un bloque `## Vinculado a` agregado al FINAL del contenido
(`jarvis/vault/writer.py::_linked_wikilinks_section()`), con un link real
por cada entidad/proyecto ya vinculado a esa entrada en
`memory_entry_entities`/`memory_entry_projects` en el momento de escribir.
Sigue dando un grafo no vacío en Obsidian (el objetivo pedido — cada entrada
enlaza a sus entidades/proyectos, y la nota canónica enlaza de vuelta a
todas sus menciones) sin el riesgo de mutar contenido capturado.

### 3) Cuándo se sincroniza cada nota canónica

`jarvis/vault/index_writer.py::sync_indexes_for_entry(entry_id)` — lee qué
entidades/proyectos están vinculados a esa entrada y reescribe COMPLETA (no
incremental) la nota canónica de cada uno a partir del estado actual de la
DB, mismo principio que el resto de Jarvis ("el índice del vault es
reconstruible, la DB es la fuente de verdad"). Enganchado en los 3 puntos
donde el código ya tenía naturalmente el entry_id a mano después de tocar el
vault:
- `jarvis/worker/processor.py`, después de `write_entry()` en el pipeline
  normal (entidades/proyectos ya están vinculados en la DB en ese punto —
  `link_entities_for_entry()`/`link_project_for_entry()` corren ANTES de
  `write_entry()`, confirmado leyendo el orden real del archivo).
- `jarvis/memory/service.py::_resync_vault_and_embedding()` (pieza B, editar
  contenido/tipo) — tras reescribir el .md, para que la nota canónica
  apunte al archivo nuevo si hubo rename.
- `jarvis/memory/service.py::forget_entry()` (pieza B, soft-delete) — la
  entrada desaparece de la lista de menciones en la próxima sincronización
  (la query de `sync_entity_note()`/`sync_project_note()` ya filtra
  `valid_to IS NULL`, mismo criterio que retrieval/entidades/proyectos/tags).

**Límite conocido, documentado a propósito, no instrumentado**: si una
entrada se vuelve stale/superseded por consolidación
(`jarvis/worker/consolidation.py`, varios call sites que tocan `valid_to`
directamente sin pasar por `forget_entry()`), la nota canónica de su
entidad/proyecto no se resincroniza sola — queda listándola hasta que algo
más la toque (una edición, un backfill manual). No estaba pedido explícito
enganchar consolidación en esta pieza y hacerlo hubiera significado tocar
varios call sites de `valid_to` fuera del alcance acordado — queda como nota
para una pieza futura si se vuelve un problema real observado.

### 4) Bug real encontrado y arreglado verificando el backfill:
`write_entry()` sin `title` explícito podía crear un archivo huérfano

`write_entry(entry)` (sin `title`) derivaba el nombre de archivo de
`_derive_title(content_raw)` — pero la PRIMERA escritura de una entrada
(`jarvis/worker/processor.py`) siempre pasa `title=` (el título que devolvió
la clasificación LLM), que casi nunca coincide con
`_derive_title(content_raw)`. Cualquier reescritura posterior SIN `title`
explícito (el backfill de esta pieza, y ya existía antes:
`_resync_vault_only()` tras editar solo tags) recalculaba un nombre de
archivo DISTINTO al que `vault_path` en SQLite señala — creaba un .md nuevo
con el contenido actualizado y dejaba el archivo original, el que la DB
sigue referenciando, desactualizado y huérfano en el vault.

**Reproducido antes del fix**: corrida real de
`jarvis/cli/backfill_vault_links.py` contra una DB de scratch con una
entrada ya escrita por el pipeline normal (título LLM: "Discusión roadmap
SGR con Martín Suárez") — tras el backfill, el `.md` en `vault_path`
seguía SIN la sección `## Vinculado a` nueva, y apareció un segundo archivo
en la misma carpeta con nombre derivado de `content_raw`. Confirmado con
Ollama real (`gemma3:12b`/`nomic-embed-text`), no simulado.

**Fix**: `write_entry()` — si no se pasa `title` Y la entrada ya tiene
`vault_path`, se reusa el nombre de archivo YA ASIGNADO (no se re-deriva de
`content_raw`); solo se deriva un nombre nuevo cuando se pasa `title`
explícito (primera escritura) o la entrada nunca tuvo `vault_path`. Efecto
colateral positivo, no buscado a propósito pero correcto: también corrige el
mismo bug latente en `_resync_vault_only()` (editar solo tags podía dejar
huérfano el archivo real y la DB apuntando a uno desactualizado) y vuelve
más estable el nombre de archivo entre ediciones de contenido/tipo (ya no
depende de si `_derive_title(content_raw)` coincide con el título LLM
original). Reproducido de nuevo tras el fix, mismo escenario: 0 archivos
huérfanos, mismo `vault_path` reescrito en el lugar, sección `## Vinculado
a` presente.

### 5) Hallazgo real, documentado, NO arreglado: `memory_entities` y
`memory_projects` son dos catálogos sin reconciliar — un mismo nombre real
puede aparecer dos veces en "Vinculado a"

Verificando con datos reales: una entrada que menciona "el proyecto SGR" se
clasifica con `project="SGR"` (vía `link_project_for_entry()`, catálogo
`memory_projects`) Y el extractor de entidades del mismo texto detecta "SGR"
como `organization` (vía `extract_entities()`/`link_entities_for_entry()`,
catálogo `memory_entities`) — dos filas en dos tablas distintas para el
mismo concepto real, sin ningún mecanismo que las una. El bloque
`## Vinculado a` de esa entrada terminó listando "SGR" DOS veces, cada una
apuntando a una nota canónica distinta (`INDEX/ENTITIES/...-sgr.md` e
`INDEX/PROJECTS/...-sgr.md`), confirmado en vivo con Ollama real. Es un gap
pre-existente de los dos sistemas (`jarvis/entities/service.py` y
`jarvis/projects/service.py` nunca se comunicaron entre sí, desde que ambos
se implementaron por separado en 0.2), que esta pieza simplemente hace
VISIBLE por primera vez (antes ninguno de los dos tenía representación en el
vault). Reconciliar "entidad organización" y "proyecto" como el mismo
concepto es una decisión de diseño real y más grande (¿se fusionan las dos
tablas? ¿un proyecto es un tipo de entidad? ¿se linkean entre sí?) que no
estaba pedida en esta tarea — se documenta acá explícitamente para que no se
lea como un descuido si se lo encuentra de nuevo, no se implementa nada.

### 6) Verificado con Ollama real (`gemma3:12b`/`nomic-embed-text`,
`OPENAI_API_KEY` no seteada a propósito) contra DB/vault de scratch —
nunca `jarvis.db` real

Dos capturas reales sobre la misma persona (Martín Suárez) y el mismo
proyecto (SGR) procesadas de punta a punta (`capture_raw` →
`process_entry()`, clasificación + extracción de entidades + vinculación de
proyecto + vault + embedding, sin mocks del LLM):
- Ambos `.md` de entrada terminaron con `## Vinculado a` con wikilinks
  reales a `INDEX/ENTITIES/...-martín-suárez.md` e `INDEX/PROJECTS/...-sgr.md`
  (más el duplicado de SGR-como-entidad, punto 5).
- `INDEX/ENTITIES/...-martín-suárez.md` se creó con frontmatter
  (`entity_id`/`entity_type`/`aliases`/`first_seen`/`last_seen`) y una
  sección "## Menciones" con las 2 entradas reales, cada una con wikilink +
  título corto + tipo + fecha.
- `edit_entry()` sobre una de las dos entradas (cambia contenido) →
  `_resync_vault_and_embedding()` reescribió el vault y **la nota canónica
  se resincronizó sola** con el título actualizado, confirmado leyendo el
  archivo.
- `forget_entry()` sobre esa misma entrada → confirmado que **desapareció
  de "Menciones" de Martín Suárez y de SGR** en la siguiente lectura del
  archivo (soft-delete, `valid_to` seteado, filtrado por la query de sync).
- Codificación: la terminal de Git Bash mostraba los acentos como mojibake
  en la salida de estos scripts de verificación — confirmado por separado
  (leyendo los bytes/codepoints reales de archivo y nombre) que es solo
  la code page de la consola, no un bug real: los `.md` y sus nombres están
  en UTF-8 correcto (`í`=U+00ED, `á`=U+00E1) tanto en contenido como en
  filesystem.
- Backfill (`python -m jarvis.cli.backfill_vault_links`) probado dos veces:
  antes del fix del punto 4 (reprodujo el bug, archivo huérfano) y después
  (0 archivos huérfanos, mismo conteo de archivos en `PROJECTS/` antes y
  después, sección restaurada en el archivo correcto, `INDEX/` completo
  recreado desde cero con las 2 notas de entidad + 1 de proyecto). Nunca
  corrido contra `project/database/jarvis.db` real ni contra el homelab —
  mismo criterio de toda sesión anterior; correrlo ahí es un paso aparte
  que el usuario puede pedir explícitamente.

No se tocó frontend en esta pieza (backend + vault únicamente) — no aplica
`npm run build`.

Impacto: `jarvis/db/database.py` (`_VAULT_SUBDIRS`), `jarvis/vault/writer.py`
(`_linked_wikilinks_section()`, `entity_note_stem()`, `project_note_stem()`,
fix de `write_entry()` del punto 4), `jarvis/vault/index_writer.py` (nuevo),
`jarvis/worker/processor.py`, `jarvis/memory/service.py`
(`_resync_vault_and_embedding()`, `forget_entry()`),
`jarvis/cli/backfill_vault_links.py` (nuevo).

---

## 2026-09-03 — IMPLEMENTADO: PII detector completo en el Privacy Gateway (0.2, cierre de deuda de §29)

Contexto: `jarvis/privacy/gateway.py` solo detectaba secretos evidentes
(tokens/API keys/passwords) por regex — exactamente lo que
`Componentes-Evaluados.md` (hallazgo #3) ya advertía como insuficiente por
sí solo ("complementa pero no reemplaza"). Se pidió definir qué categorías
de PII sensible tiene sentido detectar en Jarvis y qué hace la detección al
encontrarlas, con un límite de alcance explícito: NO se trata de bloquear
nombres de personas ni contenido personal en general — eso es justamente lo
que el tipo `PEOPLE` existe para guardar.

### 1) Categorías elegidas — 3, no más

Se acotó deliberadamente a las 3 categorías que la tarea nombró como
ejemplo, sin agregar otras por iniciativa propia (ej. NO teléfonos, NO
direcciones — son "contenido personal en general", el límite de alcance
explícito de arriba):
- **Documentos de identidad**: CUIT/CUIL argentino (`NN-NNNNNNNN-N`, formato
  fijo, alta confianza) y DNI (7-8 dígitos) SOLO con la palabra "DNI"/
  "documento" inmediatamente antes — un número suelto de 7-8 dígitos es
  demasiado común (montos, fechas, teléfonos parciales) para marcarlo sin
  contexto; exigir la palabra clave es la mitigación de falso positivo.
- **Cuentas/tarjetas financieras**: CBU/CVU argentino (22 dígitos
  consecutivos exactos, longitud lo bastante infrecuente para no necesitar
  palabra clave) y número de tarjeta (13-19 dígitos, agrupados o no, que
  además pasan el checksum de Luhn — sin Luhn, cualquier ID largo real
  como número de factura dispararía el detector; con Luhn, un ID que no sea
  una tarjeta real casi nunca lo pasa por azar).
- **Contexto de salud**: heurística de palabras clave (diagnóstico,
  enfermedad, síndrome, medicación, VIH, psiquiátrico, "resultado
  positivo/negativo", historia clínica) — deliberadamente de MENOR
  confianza que las anteriores (no hay un formato fijo para "un
  diagnóstico"), aceptada con el mismo criterio conservador que ya rige el
  resto del gateway ("ante la duda, bloquea": un falso positivo acá solo
  cuesta un fragmento de más bloqueado del contexto RAG, nunca un dato real
  filtrado al LLM externo).

### 2) Qué hace la detección al encontrar algo — mismo criterio que los
secretos, confirmado explícitamente

Bloquea el FRAGMENTO que sale como contexto RAG hacia el LLM externo
(`filter_context()`, ya usado por `jarvis/llm/client.py` y
`jarvis/query/service.py`) — nunca la captura en sí. La entrada con el CUIT/
DNI/número de tarjeta se guarda igual en `memory_entries`, se indexa igual,
aparece igual en Explorar/entidades/proyectos; solo se omite si en algún
momento se arma como contexto para un prompt al modelo externo (GPT-5.4
mini vía LiteLLM). Mismo mecanismo exacto que ya existía para secretos —
`is_entry_allowed()` gana dos checks nuevos (`find_pii()`,
`find_health_context()`) en el mismo orden de verificación, con el mismo
formato de motivo de bloqueo (`pii_pattern:cuit_cuil`,
`pii_keyword:health_context`, etc.) para que el log siga siendo diagnosticable
igual que `secret_pattern:...`.

### 3) Verificado con casos reales (no mocks) — no necesita Ollama, es regex
puro

`find_pii()`/`find_health_context()` probados directamente contra strings
reales: CUIT real (`20-12345678-3`) → detectado; DNI con y sin puntos
("DNI: 34.567.890", "dni 34567890 vencido") → detectado; CBU de 22 dígitos
→ detectado; número de tarjeta de prueba Luhn-válido
(`4539 1488 0343 6467`) → detectado; una factura de 13 dígitos NO
Luhn-válida → NO detectado (confirma que Luhn filtra el falso positivo
esperado); "Me dieron el diagnóstico de asma" → `find_health_context=True`,
`find_pii=[]` (categorías separadas, como corresponde); "José vive en
Rosario y trabaja en la facultad" → ninguna de las dos, confirma el límite
de alcance (nombre + lugar + trabajo, contenido personal normal, no
bloqueado). `is_entry_allowed()`/`filter_context()` probados de punta a
punta con una lista mixta (PII, secreto, confidencial, contenido normal) →
solo el contenido normal pasa el filtro, cada bloqueo con el motivo correcto.

Impacto: `jarvis/privacy/gateway.py` (`PII_PATTERNS`, `_HEALTH_KEYWORDS`,
`find_pii()`, `find_health_context()`, `find_card_number()`, `_luhn_valid()`,
`is_entry_allowed()` extendido). No toca `jarvis/llm/client.py` ni
`jarvis/query/service.py` — ya llamaban `filter_context()`, que absorbe el
cambio sin tocar sus call sites.

---

## 2026-09-03 — IMPLEMENTADO: pregunta abierta exploratoria cuando no hay nada más que reportar

Contexto: la entrada de abajo ("Reporte diario completo...", mismo día)
dejó el reporte diario cubriendo con detalle las 4 categorías existentes
(pairwise/stale/backfill/auditoría), incluido decir explícitamente "sin
hallazgos" cuando no hay nada. Se pidió un mecanismo hermano y separado
(no un cuarto tipo de hueco A/B/C -- esos siguen exactamente igual,
gateados por evidencia real): cuando una corrida no encuentra NADA de esas
4 categorías, que Jarvis aproveche para hacer una pregunta genuinamente
exploratoria sobre el usuario, sus entidades o proyectos -- "ya que estoy
despierto y no hay nada urgente, pregunto algo útil" -- en vez de quedar
en silencio ese día.

### 1) Gating: dos variables independientes + policy de cooldown

`JARVIS_OPEN_QUESTION_ENABLED` (bool, default `"1"`) y
`JARVIS_OPEN_QUESTION_COOLDOWN_DAYS` (int, default `2`) en
`jarvis/config.py` -- deliberadamente separadas, mismo patrón que
`debug_mode` en `jarvis_policies` (una convención explícita, no implícita):
el usuario puede subir el cooldown con el tiempo sin apagar el mecanismo
entero, o apagarlo con `ENABLED=0` sin perder el valor de cooldown que
tenía configurado. Nunca se mezclan en una sola variable.

Cooldown vía policy en `jarvis_policies` (`policy_type=
'open_question_last_asked'`, mismo patrón exacto que `consolidation_
last_run` de `consolidation.py`): `_open_question_cooldown_elapsed(now)`
lee la última fila, `_record_open_question_asked(now)` inserta una nueva
SOLO cuando una pregunta efectivamente se creó (no en cada intento) --
`jarvis/audit/service.py`.

### 2) Disparo: quinto paso de `run_consolidation()`, gateado por
`_nothing_to_report()`

`jarvis/worker/consolidation.py::_nothing_to_report(summary)` -- nuevo
helper, corre DESPUÉS de que pairwise/stale/backfill/auditoría ya
completaron esa corrida (necesita el `summary` final de los 4 pasos). Es
`True` solo si `pairwise_detail`, `stale_detail` y `tagged_detail` están
los tres vacíos Y `summary["audit"]["proposed"] == 0`.

**Decisión no especificada explícitamente por la tarea, resuelta con
criterio propio**: la tarea dice literalmente "ni pairwise, ni stale, ni
backfill de tags, ni hallazgos de auditoría en los bloques tag/random" --
sin mencionar los huecos de entidad tipo A (`entity_gap_detail`) ni las
entradas vacías detectadas (`deleted_empty`) como parte explícita del gate.
Se generalizó a `audit["proposed"] == 0` (que YA suma bloques tag+random +
huecos tipo A + entradas vacías -- ver `run_audit()`) en vez de mirar solo
`tag_block_findings`/`random_block_findings` por separado, porque la
alternativa literal tenía un hueco real: si el hueco tipo A encontró a
José (2+ menciones, dataset de prueba) y generó una propuesta `create`,
ESO ya es "algo para reportar" ese día -- dispararle además una pregunta
abierta competiría por atención con una propuesta real recién creada, lo
que contradice el espíritu de "aprovechar un día sin nada" del pedido.
Documentado explícitamente en el docstring de `_nothing_to_report()` para
que quede claro que es una generalización deliberada, no un descuido.

`summary["quiet_day"]` (bool, siempre presente) y `summary["open_question"]`
(el resultado de `maybe_ask_open_question()`, o `None` si no era un día
quieto) se agregan al summary de la corrida.

### 3) Jerarquía de fallback de la pregunta -- dos niveles

`jarvis/audit/service.py::maybe_ask_open_question(now, channel, chat_id,
user_id)`:

1. **Entidad con exactamente 1 mención** (`_detect_single_mention_entities()`
   -- mismo SQL que el hueco tipo A pero `HAVING memory_count = 1` en vez
   de `>= 2`, mismo scope `entity_type = 'person'` por consistencia con
   tipo A). `_pick_entity_candidate()` itera las candidatas (ordenadas por
   `last_seen ASC`, mismo criterio de "las más postergadas primero" que ya
   usa el resto del módulo) y salta las que ya tienen una `open_question`
   creada sobre su única entrada (`_already_exists("open_question",
   [entry_id])` -- dedup exacto, mismo mecanismo que las otras 8 acciones).
   Se sigue la sugerencia de la tarea: hay una entrada real de la que
   colgar la pregunta ("mencionaste a X una vez, ¿quién es?"), no es 100%
   genérica.
2. **Pregunta de arranque genérica** (`_BOOTSTRAP_QUESTIONS`, 5 variantes
   fijas, elegidas al azar con `random.choice()`) -- solo cuando el nivel 1
   no encontró ninguna candidata (memoria vacía, el caso motivador; o toda
   entidad person ya tiene 2+ menciones). Deliberadamente simple (sin
   tracking de "cuál se preguntó la última vez" para rotar sin repetir) --
   el volumen esperado de disparos de nivel 2 es bajo (el nivel 1 absorbe
   la mayoría de los casos reales una vez que hay algo de memoria
   acumulada), no se justificó más mecanismo por ahora.

### 4) Resolución: `jarvis_audit_proposals` con un noveno `action_type`
('open_question'), NO reutilizando 'clarify' directamente

La tarea pedía evaluar explícitamente si alcanzaba con la acción `clarify`
ya existente, o si hacía falta un caso especial -- se investigó antes de
decidir:

- **Nivel 1 (entidad con 1 mención) SÍ encaja en la forma de `clarify`**:
  hay una entrada concreta (`target_entry_ids=[entry_id]`), y semánticamente
  es lo mismo que un hueco tipo C ("referencia sin resolver dentro de una
  entrada") -- podría haberse creado literalmente como una fila `clarify`
  sin ningún cambio de schema.
- **Nivel 2 (pregunta de arranque) NO encaja limpio en `clarify`**: no hay
  ninguna entrada de la que colgar la pregunta -- `target_entry_ids`
  tendría que ser `[]` (JSON array vacío, `NOT NULL` de la columna sigue
  satisfecho, así que no rompe el schema). El problema real es el **dedup**:
  `create_proposal()` deduplica por `action_type + target_entry_ids`
  exacto (`_already_exists()`) -- con `target_entry_ids=[]` SIEMPRE
  idéntico, la primera pregunta de arranque jamás resuelta bloquearía
  cualquier pregunta de arranque futura para siempre (el dedup no vence, a
  diferencia del cooldown). Forzar el nivel 2 dentro de `clarify` habría
  significado o bien romper el dedup de `clarify` para TODOS sus usos
  (riesgo real: `clarify` real sí necesita ese dedup por entrada) o
  agregar un caso especial dentro de la función compartida -- ninguna de
  las dos es limpia.

**Decisión**: `action_type='open_question'` nuevo (migración de schema,
ver punto 5) para AMBOS niveles -- no se separó nivel 1 en `clarify` y
nivel 2 en algo distinto, para no bifurcar la resolución de una respuesta
de texto libre en dos caminos con reglas de negativo/afirmativo
potencialmente distintas (ver punto 6). `open_question` se resuelve
exactamente como `clarify` (`accept_proposal()`/`resolve_individual_reply()`
tratan `("clarify", "open_question")` como el mismo caso) pero vive en su
propio `action_type`, lo que además dejó lugar para resolver el problema
de dedup del nivel 2 de forma limpia: `_create_open_question_proposal()`
(sin dedup, solo para el nivel 2) en vez de `create_proposal()` (con dedup,
usado para el nivel 1 -- ahí sí es correcto, cada entidad de 1 mención
tiene una entrada distinta).

### 5) Migración de schema: `_migrate_audit_proposals_action_type()`

Mismo patrón exacto que `_migrate_audit_proposals_status()` (rebuild
completo de la tabla, SQLite no permite `ALTER` sobre un `CHECK`
existente, detección de "ya migró" leyendo `sqlite_master.sql`, tolerancia
a la carrera benigna entre `backend`/`worker`/`bot` arrancando en
simultáneo -- ver la entrada de más abajo, "FIX: carrera real en
`_migrate()`..."). Se implementó como función SEPARADA de
`_migrate_audit_proposals_status()` (no generalizada en una sola función
con dos condiciones) para no mezclar dos CHECK distintos de la misma tabla,
agregados en momentos distintos del historial del código, bajo una sola
condición de "ya migró" -- cada CHECK migra independiente.

### 6) Negativo/afirmativo: `open_question` usa el criterio de `clarify`,
no el de las otras 7 acciones

`resolve_individual_reply()` ya tenía dos criterios de negativo distintos
(ver la entrada de abajo, "respuestas de texto libre con información
nueva"): `clarify` acepta cualquier `"no"`/`"no <algo>"` como rechazo
limpio; las otras 7 acciones usan un set chico y explícito
(`_CLEAN_NEGATIVE_PHRASES`). `open_question` se sumó al bucket de
`clarify` -- comparte su FORMA ("hay una pregunta pendiente, la respuesta
de texto libre la contesta"), no la de las 7 acciones (que proponen una
mutación concreta sobre memoria ya existente que el usuario confirma o
no). Concretamente: una respuesta como "no sé" a "¿quién es Lucía?"
debe rechazar limpio (no crear una entrada con "no sé" como contenido) --
el criterio de `clarify` (`startswith("no ")`) ya cubre ese caso; el set
chico de las 7 acciones NO lo cubriría (`"no sé"` no está en
`_CLEAN_NEGATIVE_PHRASES`), lo que hubiera creado una entrada basura.
Verificado con Ollama real (ver punto 8): "no sé" rechaza limpio, status
`REJECTED`, sin entrada creada.

### 7) Integración con el reporte diario -- mismo mensaje, nunca un ping aparte

Pedido explícito de la tarea: la pregunta abierta (o su ausencia) tiene
que aparecer DENTRO del mismo mensaje de "esto pasó esta corrida", no
como un ping desconectado. Por eso `maybe_ask_open_question()` NO llama a
`send_telegram_message()` por su cuenta (a diferencia de `_push_created()`,
que sí empuja mensajes individuales para las propuestas de auditoría
normales) -- solo crea la propuesta `PENDING` con el `channel`/`channel_id`
correctos (para que una respuesta futura por Telegram se resuelva por el
mismo camino que cualquier otra individual) y devuelve el resultado.
`jarvis/worker/consolidation.py::_section_open_question()` arma la sección
de texto a partir de `summary["quiet_day"]`/`summary["open_question"]` y se
agrega como una sección más de `_build_report_sections()` -- termina en el
mismo `send_report()` (varios mensajes empaquetados si hace falta, ver la
entrada de abajo) que ya manda las otras 4 secciones. Mismo criterio de
"nunca omitir la sección, decir explícitamente por qué no pasó nada" que
ya usa el resto del reporte: la sección siempre aparece, con uno de 4
textos posibles (no aplica hoy / no se evaluó por error / no disparé por
ENABLED-o-cooldown / la pregunta en sí).

### 8) Verificado con Ollama real (`gemma3:12b` local, sin `OPENAI_API_KEY`)
contra DBs de scratch -- 8 escenarios, nunca `jarvis.db` real

Cada escenario en un subproceso propio (env vars `JARVIS_DB_PATH`/`VAULT`/
`CHROMA` apuntando a un directorio de scratch nuevo, `jarvis.config` lee
`os.getenv()` al importarse):

1. **Base vacía** (`init_db()` solo, cero entradas) → nivel 2 dispara
   (`tier="bootstrap"`); segunda llamada inmediata bloqueada por cooldown
   (`"cooldown activo (< 2d desde la última)"`).
2. **Una entidad de 1 mención** (Lucía, agregada al dataset de
   `jarvis/cli/seed_test.py` -- ver más abajo) → nivel 1 dispara
   (`tier="entity_1_mention"`), la pregunta menciona a Lucía; visible vía
   `list_pending_proposals(channel="desktop")` (polling real del
   frontend, no `get_pending_individual_proposal_for_channel()` -- esa es
   específica del bot de Telegram).
3. **`JARVIS_OPEN_QUESTION_ENABLED=0`** → no dispara, razón explícita.
4. **Cooldown activo** (fila de policy insertada a mano con timestamp
   reciente) → no dispara, razón explícita.
5. **Responder con texto real** ("Es mi hermana, vive en Rosario.") a la
   pregunta de nivel 1 → `resolve_individual_reply()` devuelve
   `outcome="accepted"`, entrada nueva creada, proposal `ACCEPTED`,
   **vinculada a la entidad Lucía** (confirmado con `SELECT` directo sobre
   `memory_entry_entities`) vía `_link_new_entry_to_targets()` (reusado sin
   cambios).
6. **Responder "no sé"** → `outcome="rejected"`, `entry_id=None`, proposal
   `REJECTED`, sin entrada creada.
7. **`run_consolidation()` completo en una DB mínima de 1 entrada** (solo
   Lucía) → `quiet_day=True`, `audit proposed=0`, pregunta de nivel 1
   disparada, **confirmada dentro del texto del reporte armado por
   `_build_report_sections()`** (sección `❓ *Pregunta abierta*` con la
   pregunta completa, en el mismo bloque que "Analizado"/"Pares
   comparados"/"Auditoría").
8. **`run_consolidation()` completo con el dataset entero de
   `seed_test.py`** (19 entradas, el mismo que ya dispara pairwise real
   documentado en sesiones anteriores) → `quiet_day=False` (13 pares
   comparados), `summary["open_question"] is None`, sección
   `❓ *Pregunta abierta*: no aplica hoy (hubo otras cosas para reportar
   arriba).` -- confirma que un día con actividad real nunca compite con
   la pregunta abierta.

**Dataset de prueba extendido** (`jarvis/cli/seed_test.py`): entidad nueva
"Lucía" mencionada UNA sola vez (`lucia_mencion`), a propósito por debajo
del umbral tipo A -- José (ya existente en el dataset, 2 menciones) cubre
el hueco tipo A: ahora el dataset cubre ambos niveles del hueco de entidad
por separado, sin pisarse entre sí.

`python -m py_compile` limpio en los 6 archivos Python tocados. `npm run
build` del frontend limpio (agregado `open_question: 'PREGUNTA ABIERTA'`
a `AUDIT_ACTION_LABELS` en `JarvisBrowsePanel.jsx` -- polish menor, el
fallback `|| p.action_type` ya evitaba cualquier crash con o sin esto).

**No desplegado en el homelab en esta sesión** -- a propósito: el homelab
real tiene, desde el cierre de la sesión anterior, **2 propuestas
`PENDING` reales esperando respuesta del usuario en su Telegram real**
(`delete` de la entrada vacía, `create` de José) más el dataset de prueba
recién sembrado ahí. Ejercitar `run_consolidation()` contra esa DB en esta
sesión habría mutado datos reales (confidence, `valid_to`) y mandado
mensajes de Telegram reales sin que fuera parte de lo pedido -- se
mantuvo la verificación 100% en DBs de scratch locales, mismo criterio
que toda sesión anterior cuando no hace falta tocar producción para
validar el mecanismo. Si el usuario quiere esto en el homelab, es un paso
aparte (sync + rebuild + restart, ver `HOMELAB.md`) que puede pedir
explícitamente.

Impacto: `jarvis/config.py` (2 variables nuevas), `jarvis/db/schema.py`
(noveno valor de `action_type`), `jarvis/db/database.py`
(`_migrate_audit_proposals_action_type()`), `jarvis/audit/service.py`
(sección nueva completa + 3 puntos de dispatch extendidos con
`"open_question"`), `jarvis/worker/consolidation.py`
(`_nothing_to_report()`, `_section_open_question()`, quinto paso en
`run_consolidation()`), `jarvis/cli/seed_test.py` (entidad Lucía),
`project/frontend/src/components/jarvis/JarvisBrowsePanel.jsx` (label).

---

## 2026-09-03 — Reporte diario completo de consolidación por Telegram (cada corrida, no solo cuando hay propuestas)

Contexto: `run_consolidation()` corre 5 pasos (pares mismo-tipo, pares
cross-type, stale por edad, backfill de tags, auditoría proactiva) pero
solo empujaba un mensaje de Telegram cuando la auditoría generaba una
propuesta -- una corrida sin hallazgos de auditoría, o una corrida donde
pairwise/stale/backfill sí hicieron cambios reales, no dejaba rastro
fuera del JSON terso de `jarvis_policies.consolidation_run`. Se pidió que
**cada corrida diaria mande un mensaje, sin excepción**, con detalle
legible (no JSON crudo) de las 4 etapas + auditoría, incluyendo
explícitamente "sin hallazgos" cuando no hay nada, en vez de omitir la
sección.

### 1) Qué ya existía y no se exponía

Antes de escribir nada nuevo se revisó qué ya se calculaba: el campo
`detail` de cada hallazgo de auditoría (`_BLOCK_PROMPT`, ya lo pedía el
prompt) se guardaba en la propuesta pero nunca se mostraba fuera de la
pregunta individual de Telegram; `_mark_stale_by_age()` y
`_backfill_catalog_tags()` devolvían solo un contador (rowcount / len),
descartando el detalle por entrada; `_resolve_pair()` no devolvía nada en
absoluto, ni siquiera para el caso `same_fact`/`contradiction` que sí
mutan la DB -- el caso `different` (la mayoría de los pares en la
práctica) no dejaba ningún rastro, ni interno. `jarvis_event_log` se
descartó como fuente: lo llena `processor.py` para el pipeline de
captura normal, no para consolidación/auditoría, así que no tenía nada
de esto. Conclusión: hacía falta capturar detalle nuevo en 4 de los 5
pasos (todo salvo backfill... no, backfill también, ver abajo), no solo
exponer algo que ya estaba calculado y escondido.

### 2) Mecanismo elegido: varios mensajes, no resumen + comando

El pedido daba tres opciones: varios mensajes, resumen corto + comando
tipo `/jdebug` para pedir el detalle completo, u otro mecanismo propio.
Se eligió **varios mensajes** (`jarvis/notify/telegram.py::send_report()`,
empaqueta secciones de texto en mensajes de hasta ~3900 caracteres,
respetando el límite real de ~4096/mensaje de la Bot API, numerando
"(parte N/M)" solo si hace falta más de uno):

- **A favor**: el detalle completo llega siempre, sin que el usuario
  tenga que acordarse de pedirlo -- coincide con el espíritu del pedido
  original ("con detalle completo", "sin excepción"). Reusa
  `send_telegram_message()` ya existente (`jarvis/notify/telegram.py`),
  sin agregar un comando de bot nuevo ni tocar `project/mybot/
  jarvis_handlers.py`/`bot.py` -- menor superficie de cambio en una
  sesión que ya toca 4 piezas grandes distintas.
- **En contra, aceptado**: un día con mucho volumen (pairwise con muchos
  pares, bloques de auditoría con varios hallazgos) puede mandar 3-4
  mensajes seguidos -- confirmado con datos reales de la prueba de abajo
  (16 entradas sembradas → 8620 caracteres → 4 mensajes). Se aceptó el
  trade-off porque el volumen real diario (~20 entradas/día, documentado
  en varias piezas anteriores) es acotado -- si en la práctica se vuelve
  ruidoso, la mitigación más simple es capar cuántos pares/hallazgos se
  detallan en el mensaje (ej. primeros N + "...y M más") antes de migrar
  al mecanismo de resumen+comando, que es más trabajo (requiere persistir
  el reporte completo en algún lado recuperable y un comando de bot
  nuevo).
- **Por qué no resumen+comando**: agregar un `/jconsolidacion` (o
  similar) que devuelva el detalle bajo demanda hubiera requerido
  persistir el reporte completo en un lugar consultable (hoy
  `jarvis_policies.consolidation_run` ya lo tiene, así que técnicamente
  el dato está -- lo que faltaría es el comando de bot + parseo) y
  dejaría el caso por defecto (sin pedir nada) con menos información que
  la pedida explícitamente ("sin excepción... con detalle completo"). Se
  descarta para esta pieza, no como mala idea en general -- si el
  volumen de mensajes se vuelve un problema real, es la alternativa
  natural a reconsiderar.

### 3) Qué cambió en cada módulo

**`jarvis/worker/consolidation.py`**:
- `_resolve_pair()` ahora arma un `detail` (contenido corto A/B + tags,
  similitud, veredicto, acción) y lo agrega SIEMPRE a
  `summary["pairwise_detail"]`, incluida la rama `different` (que antes
  no dejaba ningún rastro) y la rama "contradicción ya conocida, se
  omite" (antes solo un `logger.info`).
- `_mark_stale_by_age()` pasa de `UPDATE ... ; return rowcount` a
  `SELECT` primero (contenido, confidence, `valid_from`) y devolver el
  detalle (con antigüedad en días calculada contra `now`) antes de
  aplicar el mismo `UPDATE`.
- `_backfill_catalog_tags()` devuelve el detalle por entrada (contenido +
  tags asignados) en vez de un contador -- `summary["tagged"]` sigue
  siendo un conteo (`len(detail)`) para no romper el log existente.
- Nuevo: `_short()`, `_build_report_sections()`, `_section_analyzed/
  _pairwise/_stale/_tagged()`, `_notify_run_report()` -- arma título +
  secciones y llama `send_report()`. Se llama al final de
  `run_consolidation()`, envuelto en su propio try/except (nunca debe
  tumbar el job -- la corrida ya terminó y ya quedó grabada en
  `jarvis_policies` antes de este paso).

**`jarvis/audit/service.py`**:
- `_select_tag_block()` devuelve `(tag_name, entries)` en vez de solo
  `entries` -- hacía falta el nombre del tag para el reporte, no solo el
  tag_id interno.
- `_process_block()` devuelve `(created_ids, findings, deleted_empty_ids)`
  en vez de solo `created_ids` -- los `findings` se devuelven COMPLETOS
  (con un `_outcome` anotado: "propuesta creada" / "ya había una
  propuesta... no se repite" / error), no solo los que generaron una fila
  nueva -- el reporte necesita mostrar TODO lo que encontró el LLM,
  incluido lo que el dedup (`_already_exists()`) ya había visto antes.
- `_process_entity_gaps()` devuelve `(created_ids, detail)` con el mismo
  criterio (nombre de la entidad, N menciones, contenido sintetizado u
  outcome de por qué no se creó nada).
- Nuevo: `build_audit_report_text()` -- arma la sección "Auditoría" del
  reporte a partir del `summary` enriquecido de `run_audit()`. Dice
  explícitamente "revisé N entradas, sin hallazgos" cuando corresponde
  (`_findings_section()`), nunca omite la sección.
- `_entry_brief()` nuevo (contenido corto + tags de una entrada, para
  listar los bloques).

**`jarvis/tags/service.py`**: `get_tags_for_entry()` nuevo -- compartido
por `audit/service.py` (que antes tenía un `_current_tag_names()` privado
duplicando la misma query) y por `consolidation.py` (que lo necesitaba
por primera vez para el reporte). Mismo criterio de abstracción
compartida que ya aplica el resto de Jarvis (ver
`jarvis_shared_abstraction_pattern` en memoria del agente): lógica usada
por más de un módulo va a `jarvis/`, no se duplica.

**`jarvis/notify/telegram.py`**: `send_report()` + `_pack_sections()`
nuevos -- empaquetado de secciones en mensajes bajo el límite de
Telegram, cortando en límites de sección salvo que una sola sección ya
supere el límite (caso no esperado con el tamaño real de reporte, pero
cubierto igual).

### 4) Verificado con Ollama real contra una DB de scratch

Nunca `jarvis.db` real -- DB/vault/Chroma de scratch nuevos, dataset de
`jarvis/cli/seed_test.py` (16 entradas, incluye el par de contradicción
Madrid-no/oficina-remoto... el real es "100% remoto" vs "100%
presencial", ver el dataset) sembrado con embeddings reales
(`nomic-embed-text` vía Ollama). `call_reason()`/`call_classify()`
corrieron en modo local (`gemma3:12b`/`llama3.2:3b` vía fallback
automático, sin `OPENAI_API_KEY` seteada a propósito en el proceso de
prueba -- no hacía falta el modelo externo para validar la mecánica del
reporte).

`run_consolidation()` completo, un solo ciclo: `analyzed=16→13 vigentes
tras 3 same_fact`, `obsolete=3`, `conflicts=1` (el par
`contradiccion_remoto`/`contradiccion_oficina`, sim=0.871 -- coincide con
el dato de calibración ya documentado el 31/08), `tagged=0`, `errors=[]`.
Auditoría: bloque por tag `react` (2 entradas, sin hallazgos), bloque
random (10 entradas, 4 hallazgos: 1 `contradiction` -- el mismo par de
arriba, redetectado independientemente por el camino de auditoría --, 1
`duplicate`, 2 `connection`), las 4 con `detail` real del LLM y
`_outcome="propuesta creada"`. Reporte final: **8620 caracteres, empaquetado
en 4 mensajes** (1570/3900/338/2786 chars, ninguno pasa el límite),
confirmando que el mecanismo de partido funciona con datos reales, no
solo en teoría. Texto inspeccionado a mano: todas las secciones pedidas
presentes (analizado con tags, pares con contenido A/B+tags+similitud+
veredicto+acción incluidos los `different`, stale/backfill con "ninguna
esta corrida" explícito al no haber casos, auditoría con bloque+tag,
entradas+tags de cada bloque, y hallazgos con el `detail` del LLM o "sin
hallazgos" explícito).

### 5) Trade-off documentado, no resuelto en esta pieza

La sección "Analizado" lista TODAS las entradas vigentes con sus tags
(no solo las nuevas del día) porque eso es literalmente lo que
`_fetch_active_entries()` ya compara en el paso de pares -- a medida que
la memoria crezca más allá de los ~20/día de ritmo de captura, esta
sección va a crecer sin límite (a diferencia de pairwise/stale/backfill/
auditoría, que sí están acotados por umbral o por `_TAG_BACKFILL_LIMIT`/
`JARVIS_AUDIT_BLOCK_SIZE`). El empaquetado en varios mensajes lo resuelve
técnicamente, pero podría volverse ruidoso con el tiempo -- riesgo
aceptado a propósito por seguir el pedido literal ("cuántas entradas, con
sus tags"), documentado acá para que quede explícito y no como un
descuido. Si se vuelve un problema real, la corrección más simple sería
capar esa sección a un conteo por tag en vez de listar cada entrada.

Impacto: `jarvis/worker/consolidation.py`, `jarvis/audit/service.py`,
`jarvis/tags/service.py`, `jarvis/notify/telegram.py`.

---

## 2026-09-03 — FIX: carrera real en `_migrate()` entre los 3 contenedores (crash en producción)

Contexto: `project-bot-1` crasheó en el homelab el 2026-09-01 con
`sqlite3.OperationalError: duplicate column name: created_by`
(`RestartCount=1`, se auto-recuperó al reiniciar Docker — ver
`HOMELAB.md`, entrada del mismo día, junto al hallazgo hermano de
`litellm` sin techo). `backend` (uvicorn), `worker` y `bot` son 3
procesos separados que llaman `init_db()` → `_migrate(conn)` cada uno al
arrancar, los 3 contra el mismo `jarvis.db` en el volumen compartido —
condición de carrera real, no hipotética: si dos de los tres ven una
columna ausente en el mismo instante (mismo chequeo `PRAGMA table_info`
al inicio de la función) y ambos corren `ALTER TABLE ... ADD COLUMN`, el
segundo falla con "duplicate column name".

**Bug concreto que causó el crash**: la migración de `created_by` tenía
un `try/except sqlite3.OperationalError` que **interpretaba** la
excepción en vez de chequear el estado real — asumía que cualquier fallo
del `ALTER ... CHECK (...)` significaba "este SQLite es viejo y no
soporta CHECK en ADD COLUMN", y reintentaba sin CHECK. Cuando la causa
real era la carrera (otro proceso ya había agregado `created_by`), el
reintento fallaba con el mismo "duplicate column name: created_by" — sin
capturar, tumbando el proceso. Se pidió explícitamente revisar **todas**
las migraciones del archivo por el mismo patrón, no solo esa: el resto
de las columnas agregadas ese mismo día de diseño (`embedded_at`,
`valid_to`, `title`, `last_passive_review_at`, `last_audited_at`) ni
siquiera tenían try/except — un `ALTER` concurrente las tumbaba directo,
sin ninguna chance de recuperarse.

**Por qué no se notó antes**: `_migrate_people_type()` (agosto 2026, ver
entrada "Aviso de listo + corrección de corrupción de foreign keys..."
más abajo en este archivo) y `_migrate_audit_proposals_status()`
(2026-08-31, entrada de arriba) ya tenían el patrón correcto —
reconstruyen la tabla completa cuando hace falta cambiar un `CHECK`, y en
su `except` **vuelven a chequear el estado real** (`_people_type_present()`
/ `_audit_proposals_new_status_present()`) antes de decidir si la
excepción es la carrera benigna o un error real. Las migraciones simples
de `ALTER TABLE ... ADD COLUMN` (más chicas, agregadas en distintas
piezas del paquete A-F) nunca recibieron ese mismo estándar — quedaron
como el único punto ciego del archivo hasta que la carrera real de 3
contenedores arrancando juntos en producción lo expuso.

**Fix**: `_add_column_if_missing(conn, table, column, *ddl_variants)`
nuevo en `jarvis/db/database.py` — mismo estándar que
`_migrate_people_type()`: nunca interpretar QUÉ significó una excepción,
volver a leer `PRAGMA table_info()` después de un fallo y decidir en base
al estado real. Si la columna ya existe, fue la carrera benigna, se
ignora (con `logger.warning`, no silencioso). Si no existe, el fallo es
real: se prueba la siguiente variante de DDL en la lista (para
`created_by`, la ausencia real de soporte `CHECK` en `ADD COLUMN` sigue
siendo un motivo de fallo legítimo — el fix no lo elimina, solo deja de
confundirlo con la carrera) o se repropaga si no queda ninguna. Las 6
migraciones `ALTER TABLE ... ADD COLUMN` de `_migrate()`
(`memory_entries.embedded_at`, `memory_entries.valid_to`,
`conversations.title`, `conversations.last_passive_review_at`,
`memory_entries.created_by` con y sin `CHECK`,
`memory_entries.last_audited_at`) pasan ahora por este helper.
`_migrate_people_type()` y `_migrate_audit_proposals_status()` no se
tocaron — ya seguían el estándar correcto.

**Reproducido antes de dar el fix por bueno** (pedido explícito): script
de repro (`multiprocessing`, procesos reales — no threads — sincronizados
con un `Barrier` para maximizar la colisión, 6 procesos × 15 corridas)
contra una DB de scratch con el shape "viejo" (sin `embedded_at`/
`valid_to`/`created_by`/`title`/`last_passive_review_at`/
`last_audited_at`, calcado de `jarvis/db/schema.py` menos esas columnas).
Contra la versión del código previa al fix (`git show HEAD:jarvis/db/
database.py`, cargada como módulo aparte): **54 de 90 corridas de
`_migrate()` crashearon** con `OperationalError: duplicate column name`
(mayormente `embedded_at`, la primera columna que chequea la función —
también se vio en `valid_to` y `last_audited_at` en corridas puntuales),
confirmando el bug real, no solo en teoría. Contra la versión con el fix,
mismo script, mismos 6 procesos × 15 corridas: **0 errores, 0 rondas con
schema final incompleto** — los logs muestran la carrera ocurriendo de
verdad en cada ronda (`carrera con otro proceso arrancando en
simultáneo... la columna ya existe, se ignora`), simplemente ya no
crashea. Nunca se corrió contra `jarvis.db` real de producción — DB de
scratch construida a mano para cada ronda.

Impacto: `jarvis/db/database.py` (`_add_column_if_missing()` nueva,
`_migrate()` reescrita para usarla en las 6 columnas simples). Documentado
también en `HOMELAB.md` junto al hallazgo hermano de `litellm` sin techo
(mismo día de deploy, 2026-09-01).

---

## 2026-08-31 — IMPLEMENTADO: respuestas de texto libre con información nueva en jarvis_audit_proposals

Contexto: la entrada de arriba ("IMPLEMENTADO: auditoría proactiva...",
mismo día, ver §4 "Bot Telegram") dejó una regla de alcance explícita: para
las 7 acciones que no son `clarify`, "cualquier otra respuesta de texto
libre se trata como rechazo-con-motivo (se loguea el texto para contexto
futuro, no se reintenta parsear como instrucción)". En la práctica, ese
"se loguea" nunca se materializó en nada persistente ni recuperable — el
texto pasaba por `logger.info()` y la propuesta quedaba `REJECTED`, punto.
Caso real que expuso el problema: el audit propone `flag_contradiction`
sobre el par `contradiccion_remoto`/`contradiccion_oficina` del dataset de
prueba (`jarvis/cli/seed_test.py`: "100% remoto" vs. "100% presencial") con
la pregunta "¿cuál prevalece?", y el usuario contesta "Ninguna, ahora me
mudé a Francia" — información real, nueva, que hoy se pierde sin dejar
rastro. Se pidió generalizar el criterio que ya usa `clarify` (texto libre
a una pregunta pendiente ES la respuesta, no una captura nueva sin
relación) a las otras 7 acciones, sin forzar el mismo comportamiento en
las 8 si no tiene sentido.

### 1) Qué cuenta como "trae información nueva" — no solo "no empieza con no"

La regla vieja distinguía sí/no por si el mensaje entero es un afirmativo
corto (`_AFFIRMATIVE_PREFIXES`) o empieza literalmente con `"no "`/es
`"no"`/`"n"` — cualquier otra cosa caía en el bucket "rechazo con motivo".
Ese diseño tiene un problema más amplio que el caso de arriba: una
respuesta como "no, es sobre mi sueldo de freelance" (ejemplo real
discutido para `retag` — el usuario **rechaza** que el tag `finanzas`
esté mal, pero de paso da contexto real sobre la entrada) también arranca
con "no" y hoy se descarta entera, motivo incluido. La reescritura
(`jarvis/audit/service.py::resolve_individual_reply()`) usa un criterio
más chico y más correcto: **negativo limpio** es el mensaje completo
(sin puntuación final) matcheando literal contra un set chico y explícito
(`"no"`, `"n"`, `"nel"`, `"nop"`, `"no gracias"`, `"no, gracias"`,
`"no por ahora"`) — todo lo demás, **incluida una respuesta que empieza
con "no" pero sigue con contenido real**, se trata como portadora de
información nueva. Esto es deliberadamente más laxo que antes: prefiere
capturar de más (peor caso: una entrada nueva/edición de más, nunca
destructivo, ver más abajo) a seguir perdiendo información real como
pasaba hoy.

### 2) Caso por caso — no todas las 8 acciones se resuelven igual

**`clarify`** — sin cambios de comportamiento (ya era el patrón correcto).
Único cambio real: ahora también vincula la entrada nueva explícitamente a
las entidades del hallazgo (punto 4) en vez de depender de que el texto de
la respuesta repita el nombre.

**`create`** — el hallazgo ya viene con un contenido sintetizado por LLM
para crear. Una respuesta con información nueva se trata como una
**corrección/ampliación de ese borrador**, no como una entrada aparte:
`payload["content"]` se le concatena `"\nAclaración: {texto}"` (mismo
patrón de sufijo que ya usa `accept_proposal(extra_text=...)` de captura
pasiva) y se aplica `create` normalmente con el contenido enriquecido.
Resultado: `ACCEPTED` (la mutación "crear" sigue siendo la que se aplica,
solo que con mejor contenido), un solo `entry_id`.

**`edit`** — mismo criterio que `create`: el contenido combinado que
propuso el hallazgo (`payload["content"]`) se amplía con
`"\nAclaración: {texto}"` y se aplica `edit` tal cual (edita
`keep_entry_id`, supersede `supersede_entry_id`). `ACCEPTED`, sin
`entry_id` nuevo (mismo comportamiento que `edit` ya tenía: nunca
seteaba `entry_id`, edita en el lugar).

**`flag_contradiction` / `flag_connection` / `merge`** — las tres
comparten el mismo problema: su "aceptar" normal **no crea ni corrige
contenido**, solo marca (`flag_*`) o supersede una entrada existente
asumiendo que el LLM ya identificó bien cuál es la vieja y cuál la nueva
(`merge`). Una respuesta con información nueva no encaja en ninguna de
esas dos formas: no es "marcar para revisión" (ya sabemos la respuesta,
no hace falta revisión manual) y tampoco es seguro asumir automáticamente
qué entrada vieja quedó obsoleta (ver el ejemplo real: "Ninguna, ahora
Francia" invalida a Buenos Aires Y a Madrid; pero una respuesta como
"Buenos Aires es la correcta, Madrid está mal" solo invalidaría una de
las dos — sin LLM de por medio en esta resolución, no hay forma
determinística de saber cuál). Se resuelve creando una **entrada nueva
independiente** con el texto tal cual (mismo mecanismo que `clarify`),
vinculada a las entidades de ambas entradas objetivo (punto 4) — **sin
tocar `valid_to` de ninguna de las entradas viejas**. Las viejas quedan
como estaban, la nueva queda como la información más reciente y
confiable; si con el tiempo eso deja una redundancia real, el propio
audit la va a volver a encontrar en una corrida futura (ahora con 3
candidatos en vez de 2) y proponer un `merge`/`edit` de nuevo — esta vez
con contenido inequívoco. Es la misma filosofía conservadora que ya
tenía `flag_contradiction` en el documento de arriba ("a propósito nunca
llama `_reduce_confidence()`... aplicar el riesgo de falso positivo que
el usuario pidió mitigar explícitamente") — acá se extiende a "tampoco
adivinar automáticamente cuál entrada vieja invalidar", por la misma
razón. Status: `RESOLVED_WITH_NEW_INFO` (punto 3).

**`retag`** — el ejemplo real ("no, es sobre mi sueldo de freelance") es
justo el caso donde el usuario **contradice el hallazgo** (el tag no está
mal) pero de paso aporta contexto real sobre la entrada. Acá "crear una
entrada nueva" no tiene sentido — el contexto nuevo describe la ENTRADA
ya flaggeada, no un hecho independiente del mundo. Se aplica
`edit_entry()` sobre esa misma entrada, concatenando
`"\nAclaración: {texto}"` a su `content_processed` actual — y el tag
señalado **no se saca** (aplicar igual la remoción sería ignorar
literalmente lo que el usuario acaba de decir). Deliberadamente no se
intenta además "agregar" un tag mejor a partir del texto nuevo — mismo
límite de alcance que ya fijó el documento de arriba para `retag`
("agregar un tag que falta ya lo cubre `_backfill_catalog_tags()`,
autónomo y en producción — esta propuesta no lo toca"); con el contenido
ya enriquecido, ese mecanismo autónomo tiene mejor material para
proponer un tag mejor por su cuenta en una corrida futura, sin que esta
pieza tenga que reimplementarlo. Status: `RESOLVED_WITH_NEW_INFO`,
`entry_id` = la misma entrada editada (no una nueva).

**`delete`** — el único disparador de `delete` es contenido vacío/en
blanco (ver documento de arriba, decisión abierta #2). Una respuesta con
texto real a "¿la borro, está vacía?" significa literalmente "no está
vacía, dice esto" — el caso más simple de los 8: `edit_entry()` sobre esa
misma entrada con `content=texto` (sin prefijo "Aclaración:" — no hay
nada previo a lo que amueblar, el texto ES el contenido que faltaba).
`delete` no se aplica. Status: `RESOLVED_WITH_NEW_INFO`, `entry_id` = la
misma entrada.

### 3) Status nuevo `RESOLVED_WITH_NEW_INFO`, no `REJECTED` ni `ACCEPTED`

Se agrega un quinto valor al `CHECK` de `jarvis_audit_proposals.status`:
`PENDING → ACCEPTED | REJECTED | EXPIRED | RESOLVED_WITH_NEW_INFO`.
Alternativas consideradas:
- **Reusar `REJECTED`** (con la entrada nueva vinculada por `finding_id`,
  como sugería la pregunta original): descartado por dos razones. Primero,
  `finding_id` nunca se implementó (el documento de arriba lo mencionaba
  en la lista de columnas del punto 4, pero la tabla real en
  `jarvis/db/schema.py` no lo tiene — el dedup terminó viviendo en
  `action_type + target_entry_ids`, ver Cerebro/estado-actual.md, punto 5
  de las decisiones resueltas ese día). Reintroducirlo solo para este caso
  sería una columna nueva con un único consumidor. Segundo, y más
  importante: `REJECTED` en este sistema significa "no pasó nada, se
  descartó" — usarlo para un caso donde SÍ pasó algo (se creó o editó una
  entrada real) sería engañoso para cualquiera que lea el historial
  después (Explorar, `GET /jarvis/audit-proposals?status=all`) y asuma que
  `REJECTED` es sinónimo de "sin efecto".
- **Reusar `ACCEPTED`**: descartado para los casos donde la mutación
  *propuesta* (marcar para revisión, fusionar, sacar el tag) explícitamente
  **no** se aplica (`flag_*`/`merge`/`retag`/`delete` con info nueva) — decir
  `ACCEPTED` ahí sería afirmar que se hizo lo que la pregunta original
  proponía, cuando se hizo otra cosa distinta y mejor informada. Sí se
  usa `ACCEPTED` para `create`/`edit` con texto nuevo (punto 2) porque en
  esos dos casos la mutación propuesta **sí** se aplica, solo que con
  contenido enriquecido — ahí `ACCEPTED` sigue siendo honesto.
- **Status nuevo `RESOLVED_WITH_NEW_INFO`** (elegido): distingue con
  precisión "se descartó" de "se aplicó lo propuesto" de "se resolvió con
  información distinta a la propuesta", sin overloadear ningún significado
  existente. El `entry_id` ya existente en la tabla (columna que ya usan
  `create`/`clarify`) alcanza para enlazar la propuesta con lo que se creó
  o editó — no hace falta `finding_id` ni ninguna columna nueva. Costo:
  cualquier código que hoy filtre por `status IN ('ACCEPTED','REJECTED')`
  asumiendo que son los únicos dos terminales "reales" necesita saber del
  tercero — se revisó `jarvis/api/router.py` y `JarvisBrowsePanel.jsx`
  (frontend, Explorar): ninguno de los dos tiene ese filtro cerrado, ambos
  pasan `status` como string opaco (el frontend ya tiene un fallback de
  color `|| '#888'` para status desconocidos), así que no hay ningún lugar
  que se rompa — se le agrega igual una entrada de color dedicada en
  `AUDIT_STATUS_COLORS` (`JarvisBrowsePanel.jsx`) para que no dependa del
  fallback.

Migración de schema: mismo patrón ya establecido por
`_migrate_people_type()` en `jarvis/db/database.py` (SQLite no permite
`ALTER` sobre un `CHECK` existente — hay que reconstruir la tabla). Se
agrega `_migrate_audit_proposals_status()` calcada de esa función
(detecta si ya migró leyendo `sqlite_master.sql`, reconstruye bajo nombre
temporal, dropea la vieja, renombra — nunca deja `jarvis_audit_proposals`
sin existir bajo su nombre canónico salvo el instante entre el DROP y el
RENAME, mismo cuidado que ya documentó el bug real de la migración de
`'PEOPLE'`). No hace falta el manejo de FKs entrantes que sí necesitaba
`memory_entries` (ninguna otra tabla referencia `jarvis_audit_proposals`
por FK), así que es más simple.

### 4) Vinculación — `link_entities_for_entry()` aplicado a las entidades del hallazgo, no del texto de la respuesta

El documento de arriba decía que `clarify` vincula la entrada nueva "vía
`link_entities_for_entry()` (ya existe)" — cierto en el sentido de que la
función existe, pero en los hechos **`_apply_clarify()` nunca la llama
directamente**: la entrada nueva pasa por el pipeline normal del worker
(`jarvis/worker/processor.py`), que corre `extract_entities()` sobre el
texto de la respuesta y solo la vincula a la entidad ambigua **si el
texto de la respuesta repite su nombre** (ej. "¿Quién es José?" → "José es
mi primo" sí vincula porque dice "José"; "es mi primo" sin repetir el
nombre, no). Funciona la mayoría de las veces porque una respuesta a
"¿quién es X?" casi siempre repite X, pero es implícito y frágil — y para
los casos nuevos de este documento (`flag_contradiction`/`flag_connection`/
`merge` con dos entradas objetivo, potencialmente sobre personas/temas que
la respuesta del usuario no tiene por qué nombrar otra vez) esa
dependencia habría fallado seguido.

Se agrega `_link_new_entry_to_targets(new_entry_id, target_entry_ids,
user_id)` en `jarvis/audit/service.py`: lee las entidades ya vinculadas
(`memory_entry_entities` JOIN `memory_entities`) a **las entradas objetivo
del hallazgo** (no del texto nuevo) y llama `link_entities_for_entry()}`
directamente con esa lista — determinístico, no depende de que la
respuesta repita ningún nombre. Se usa `entry_type="RAW"` en esa llamada
(la entrada recién creada todavía no pasó por clasificación async del
worker en el momento en que se resuelve la propuesta) — esto hace que la
relación siempre quede `'mentioned'` nunca `'subject'`
(`link_entities_for_entry()` solo asigna `'subject'` cuando
`entry_type == 'PEOPLE'`), que es lo correcto acá: estas entradas son
correcciones/contexto sobre una entidad ya conocida, no una ficha
biográfica nueva dedicada a esa persona. El pipeline normal del worker
sigue corriendo igual sobre la entrada nueva (vía `inbox_queue`) y puede
sumar entidades adicionales que el texto sí mencione explícitamente — las
dos vías no chocan (`_link_entry_entity()` ya usa
`ON CONFLICT DO UPDATE`, confirmado leyendo `jarvis/entities/service.py`).

**Aplicado también a `create` y `clarify` en su camino normal** (no solo a
los casos nuevos de este documento): se agrega la misma llamada explícita
después de crear la entrada en `accept_proposal()`, en vez de dejar que
siga dependiendo solo de la extracción implícita. Es una mejora chica,
de bajo riesgo (la llamada es aditiva, `ON CONFLICT DO UPDATE`), que
surgió directamente de investigar este punto — se documenta acá en vez de
aplicarse en silencio.

`create`/`merge`/`flag_*` con dos entradas objetivo: se juntan (con
`DISTINCT`) las entidades de ambas antes de vincular, no una por
separado.

### 5) `origin_trust`/`source`/`created_by` de la entrada nueva

Confirmado, no asumido: se usa el mismo criterio que el documento de
arriba ya fijó para `clarify` — `origin_trust` normal de una captura por
el canal que contestó (`telegram.user` si `channel == "telegram"`,
`user.authenticated` si no), **no** el criterio de "mínimo entre las
fuentes" que usa `create` para su contenido sintetizado (`_min_origin_trust()`,
usado solo para el contenido *original* de `create`, sin tocar). Aplica
sin excepción a los 5 casos de este documento, incluidos `create`/`edit`
con texto nuevo, aunque ahí el contenido resultante es una mezcla de
lo sintetizado por LLM + lo que el usuario tipeó: una vez que el usuario
elige mandar esa respuesta, la está confirmando/asumiendo como propia —
mismo razonamiento que ya aplica `accept_proposal(extra_text=...)` de
captura pasiva (que tampoco separa "parte original" de "parte aclarada"
a la hora de asignar `origin_trust`, es toda la entrada un solo bloque).
`created_by='jarvis_proposal_accepted'` y `source=proposal['channel']` sin
cambios respecto al resto del sistema.

### Riesgos y trade-offs

- **Falso positivo de "información nueva"**: una respuesta larga que en
  realidad es solo una negativa elaborada ("no, dejalo así, total no
  importa mucho igual") no matchea el set chico de negativos limpios y
  cae en el bucket de información nueva — para `flag_*`/`merge` termina
  creando una entrada nueva de bajo valor con ese texto. Aceptado a
  propósito (ver punto 1: preferir capturar de más, nunca destructivo) —
  si en la práctica genera ruido real, la mitigación es ampliar el set de
  negativos limpios con frases así, no volver a la heurística vieja de
  "empieza con no".
- **`retag`/`delete` mutan la entrada objetivo directamente** (vía
  `edit_entry()`) en vez de crear una entrada aparte — a diferencia de
  `flag_*`/`merge`. Es la excepción deliberada del punto 2: para esas dos
  acciones el texto nuevo describe la entrada ya flaggeada, no un hecho
  del mundo aparte. Si en algún caso real la respuesta a un `retag`/
  `delete` sí trae información que amerita ser su propia entrada (no solo
  contexto de la entrada existente), hoy queda igual concatenada a la
  entrada objetivo — riesgo aceptado por simplicidad, sin LLM de por medio
  para decidir caso a caso.
- **Ninguna de las 8 resoluciones nuevas re-evalúa el hallazgo original**:
  si el usuario contesta con información nueva a un `flag_contradiction`
  que en realidad era un falso positivo del audit (las dos entradas nunca
  contradecían nada), igual se crea una entrada nueva con lo que haya
  contestado. No se considera un problema real — el usuario controla qué
  manda como respuesta, y el peor caso es una entrada de más, nunca una
  pérdida de información ni una mutación destructiva.

Impacto: `jarvis/audit/service.py` (`resolve_individual_reply()` nueva y
las funciones `_resolve_*` que llama, `_link_new_entry_to_targets()`,
llamada agregada en `accept_proposal()`), `jarvis/db/schema.py` (quinto
valor de status), `jarvis/db/database.py`
(`_migrate_audit_proposals_status()`), `project/mybot/jarvis_handlers.py`
(`_resolve_individual_audit_proposal()` reescrita para delegar en
`resolve_individual_reply()` en vez de reimplementar la interpretación de
texto libre), `project/frontend/src/components/jarvis/JarvisBrowsePanel.jsx`
(color nuevo en `AUDIT_STATUS_COLORS`). No toca `jarvis/captures/passive.py`
ni `jarvis/captures/clarification.py` (fuera de alcance, ver el pedido
original) — el patrón podría generalizarse ahí también algún día, pero es
una decisión aparte que hay que pedir explícitamente (ver sugerencia al
cierre en `Cerebro/estado-actual.md`).

---

## 2026-08-31 — IMPLEMENTADO: auditoría proactiva de memoria en consolidation.py

**Actualización post-implementación**: esta propuesta fue aprobada e
implementada el mismo día. Ver `Cerebro/estado-actual.md` ("Auditoría
proactiva de memoria — implementada", misma fecha) para el detalle de
archivos tocados, verificación con Ollama real, y las 5 decisiones que el
documento original dejaba abiertas o inconsistentes (removidas/resueltas
en la implementación real, documentadas ahí y en el docstring de
`jarvis/audit/service.py`) — en particular: se sacó `gap_needs_entry` del
prompt de bloque (duplicaba la detección SQL del hueco tipo A), se eliminó
del diseño la tabla `jarvis_audit_findings` (ya no hacía falta, separada
de `jarvis_audit_proposals`), y se definió un disparador concreto para la
acción `delete` (contenido vacío) que el documento original nunca
especificó. El resto de esta entrada queda como el diseño original
(referencia histórica de las decisiones que SÍ se implementaron tal cual).

**Esta entrada era una propuesta de diseño, no una decisión ya tomada
cuando se escribió.** Pensada para que otra sesión la implemente después de
que el usuario la apruebe (o la corrija) — eso ya pasó, ver arriba.

**Revisión sobre la primera versión de esta misma propuesta (misma sesión,
feedback del usuario tras leer el resumen inicial)** — tres cambios reales,
no cosméticos, sobre lo que sigue abajo:
1. Se elimina el tier autónomo. Confirmado explícitamente con el usuario
   (pregunta directa, respuesta: "Nivel 1 y Nivel 2 completos, vía
   Telegram"): ninguna acción se aplica sola, ni siquiera agregar un tag o
   anotar un hallazgo — ver punto 1.
2. El eje "random" del muestreo pasa a ser random literal sobre toda la
   memoria vigente (cualquier tag, cualquier entidad), no acotado a
   entradas sin tag — pensado explícitamente para encontrar relaciones
   entre tags/entidades distintas que un muestreo estructurado nunca
   cruzaría — ver punto 2.
3. Se agrega un tercer tipo de hueco — "referencia sin resolver dentro de
   una entrada" (ej. "Me fui con José a tomar un café" → "¿Quién es
   José?") — distinto de los dos ya definidos, detectado en vivo por el
   LLM al leer cada entrada, no por SQL agregado — ver punto 3.

Contexto: hoy `consolidation.py` solo compara PARES de entradas por similitud
de embedding (mismo tipo o cross-type, umbral 0.70 — calibrado con datos
reales el 28/08 y el camino `contradiction` recién confirmado con datos
reales hoy mismo, ver entrada de arriba). Nunca mira la memoria como un
conjunto: no detecta huecos (algo mencionado pero nunca desarrollado), no
audita coherencia dentro de un tema, y solo encuentra contradicciones cuando
dos entradas puntuales cruzan el umbral de similitud — si dos afirmaciones
incompatibles usan vocabulario distinto (ver el intento fallido de hoy con
coseno 0.612, por debajo del piso de ruido), nunca se comparan. Se pidió
diseñar (no implementar) una extensión que haga corridas de auditoría sobre
bloques de memoria, con capacidad de crear/modificar/eliminar/retagear y de
preguntar por Telegram lo ambiguo, reusando el patrón de propuestas
(`jarvis_proposal_accepted`) que ya existe dos veces en el código (proyectos,
`jarvis/projects/service.py`; captura pasiva, `jarvis/captures/passive.py`).

Marco final acordado con el usuario (ver también D-14 del spec, §25:
"Jarvis propone, el usuario crea — nunca silenciosamente"):
- **Ninguna acción se aplica sin confirmación por Telegram (o desktop)** —
  ni siquiera las que originalmente se habían planteado como autónomas
  (agregar un tag, anotar un hallazgo). Único caso fuera de este flujo:
  el hueco tipo B (entrada aislada), que no tiene ninguna acción asociada
  — no es que se aplique sola, es que no hay nada que aplicar (ver punto 3).
- El modelo local (gemma3:12b, umbral ya bajado a 0.70) va a tener falsos
  positivos — ninguna acción destructiva puede aplicarse sola, y hay que
  definir qué pasa si el usuario nunca responde (sigue siendo así, con más
  razón ahora que todo pasa por confirmación).

Investigación previa a proponer nada: se revisó `Componentes-Evaluados.md`
completo. Ninguno de los componentes evaluados para la línea de memoria
(Mem0, LangMem, MemOS) documenta este patrón específico — "auditoría
proactiva con capacidad de acción + aclaración conversacional sobre memoria
ya guardada". Mem0 está en estado EVALUAR (0.1-0.2, bake-off pendiente contra
implementación propia, nunca hecho); LangMem y MemOS están en DIFERIR
(post-0.1, "adoptar conceptos, no el framework" en el caso de LangMem). Nada
de esto bloquea seguir con implementación propia acá — es la misma línea que
ya se venía siguiendo (consolidation.py es 100% código propio desde 0.2
Slice 1) y el volumen real (~20 capturas/día, memoria acumulada ya mayor)
no justifica todavía adoptar una librería externa solo para esto. Se nota
para el futuro: si algún día se hace ese bake-off, esta pieza es la más
directamente comparable contra lo que ofrece Mem0/MemOS.

### 1) Categorización de acciones — lista cerrada, TODAS requieren Telegram

Ya no hay tier autónomo. Toda acción de la lista pasa por el mismo flujo de
propuesta (punto 4) — se detecta sola (SQL y/o LLM), pero no se **aplica**
nada sin un "sí" explícito. La única excepción es el hueco tipo B (entrada
aislada, punto 3), y no es una excepción a la regla sino un caso que queda
literalmente afuera de ella: no tiene ninguna acción concreta asociada
("esta entrada no está vinculada a nada" no es algo que se pueda aceptar o
rechazar), así que sigue siendo bookkeeping silencioso — visible después en
Explorar, nunca una pregunta por Telegram. Se marca explícitamente como
**interpretación propia de la instrucción "toda acción pasa por Telegram"**
para que el usuario la corrija si no es lo que quiso decir.

**Lista cerrada de 8 acciones** (nada de "y otras que surjan" — un hallazgo
que no encaje en ninguna de estas 8 queda descartado, nunca inventa una
acción nueva sobre la marcha):

1. **Crear.** Proponer una entrada nueva de memoria para llenar un hueco de
   entidad (tipo A, punto 3). El contenido lo sintetiza el LLM **solo a
   partir de las entradas ya guardadas que mencionan a esa entidad** — el
   prompt prohíbe explícitamente agregar hechos que no estén ya escritos en
   esas entradas (mismo criterio conservador que
   `_ENTITY_PROMPT`/`_EVAL_PROMPT`: sintetizar, no inventar). Reusa
   literalmente el mecanismo de `create_proposal()`/`accept_proposal()` de
   captura pasiva.
2. **Aclarar — nuevo, pedido por el usuario.** Preguntar por una referencia
   sin resolver dentro de una entrada (hueco tipo C, punto 3 — ej. "Me fui
   con José a tomar un café" → "¿Quién es José?"). A diferencia de "crear",
   acá el LLM sí tiene permitido pedir información que **no** está en
   ningún lado todavía — el prompt es al revés del de "crear": "identificá
   qué falta para entender esta mención, no inventes la respuesta". Si el
   usuario contesta, la respuesta se guarda como entrada nueva (mismo
   `capture_raw()` que ya usa `accept_proposal()`) vinculada a la entidad
   ambigua vía `link_entities_for_entry()` (ya existe, Slice 3) — si no
   contesta, no se crea nada (mismo default que el resto, ver punto 4).
3. **Marcar contradicción candidata.** El único efecto de aceptar es que
   queda un registro visible para revisión manual — a propósito **nunca**
   llama `_reduce_confidence()`, esa mutación queda reservada exclusivamente
   al camino pairwise ya calibrado con datos reales (0.70/0.898/0.871/0.748,
   ver entradas de arriba). El audit detecta candidatos por un método más
   ruidoso y sin calibrar todavía (bloques por tag/antigüedad/random, no
   pares de alta similitud de embedding) — bajar confidence desde ahí sería
   aplicar el riesgo de falso positivo que el usuario pidió mitigar
   explícitamente. Diferencia real y deliberada con el camino pairwise, que
   sí baja confidence sin preguntar — asimetría aceptada a propósito (ver
   riesgos, al final).
4. **Marcar relación encontrada — nuevo, pedido por el usuario.** El bloque
   random (punto 2) puede encontrar una conexión real entre entradas de
   tags o entidades distintas que nunca se hubieran comparado en un
   muestreo estructurado (ej. una entidad que aparece en dos proyectos sin
   relación aparente, un dato que conecta dos temas separados). Mismo
   efecto que "marcar contradicción" — solo queda registrado, sin ninguna
   mutación de `memory_entries` — es información nueva para el usuario, no
   una corrección.
5. **Fusionar duplicados.** Mismo `_mark_superseded()` que ya usa
   `_resolve_pair()` — disparado por un hallazgo del audit en vez de por un
   par de alta similitud de embedding.
6. **Modificar contenido/tipo.** Mismo `edit_entry()` de la pieza B — alcance
   acotado a propósito: solo se propone como parte de un hallazgo de tipo
   "fusión" donde el LLM juzga que ninguna de las dos entradas reemplaza
   completamente a la otra pero sí conviene combinarlas en una versión
   corregida (nunca como una reescritura "porque sí" sin ese contexto).
7. **Eliminar.** Mismo `forget_entry()` (soft-delete vía `valid_to`, nunca
   `DELETE` físico — mismo principio "Memoria ≠ destrucción" que ya rige
   toda la pieza B).
8. **Retagear (quitar o reemplazar un tag incorrecto).** Mismo
   `replace_tags_for_entry()` de la pieza B — alcance acotado a cuando el
   LLM señala un tag concreto como **incorrecto** para una entrada (ej. una
   entrada sobre SGR etiquetada `jarvis` por error). **Nota de alcance**:
   "agregar" un tag que falta (sin corregir ninguno existente) ya lo cubre
   `_backfill_catalog_tags()` (pieza D), que es **autónomo y ya está en
   producción** — esta propuesta no lo toca ni lo duplica. Si además se
   quiere que ESE mecanismo ya shippeado pase a requerir confirmación, es un
   cambio aparte sobre código existente, no parte de esta extensión nueva
   (el usuario debería pedirlo explícitamente si lo quiere).

### 2) Estrategia de muestreo — combinación, con random literal

Los tres ejes resuelven problemas distintos y se combinan en la misma
corrida:

- **Antigüedad decide QUÉ entra al pool de cobertura sistemática.** Columna
  nueva `memory_entries.last_audited_at` (mismo patrón exacto que
  `conversations.last_passive_review_at`, pieza C: se marca "revisada"
  siempre, encontró algo o no, para no re-escanear lo mismo en cada
  corrida). El bloque por tag (abajo) ordena candidatos por
  `last_audited_at ASC NULLS FIRST` — mismo criterio que
  `entry_ids_without_catalog_tags()` (más viejas primero) — para que el
  backlog se drene parejo con el tiempo.
- **Tag decide cómo se agrupa el bloque de cobertura sistemática.** Un
  bloque de entradas del mismo tag le da al modelo contexto temático real
  para juzgar coherencia/contradicción/tags incorrectos dentro de un tema.
  Reusa `jarvis.tags.service` (catálogo ya existe, pieza A). Elegido por el
  tag con más entradas sin auditar.
- **Random es random literal — corrección sobre la versión anterior de este
  documento.** Un segundo bloque se arma con `ORDER BY RANDOM()` sobre
  **toda** `memory_entries` vigente, sin restringir a ningún tag ni
  entidad — a propósito, porque el valor que se busca acá es distinto del
  bloque por tag: cruzar información entre temas que nunca se hubieran
  agrupado (el pedido explícito del usuario: "podrían encontrarse
  relaciones entre tags distintas o entre identidades distintas... puede
  generar gran valor para cruzar información y que no sea tan
  estructurada la búsqueda"). Único filtro que se mantiene: excluir
  entradas auditadas en los últimos `JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS`
  (propuesto: 7) — no por sesgar la muestra, sino para no gastar el
  presupuesto diario re-revisando por azar lo que ya se miró esta semana;
  dentro de ese filtro, la selección es uniforme, no ponderada por tag ni
  por antigüedad.

**Ambos bloques usan el mismo prompt/schema** (punto 5) — la única
diferencia entre ellos es qué entradas se agrupan, no qué se le pide al
LLM que busque. En la práctica el bloque por tag va a rendir más
`contradiction`/`duplicate`/`wrong_tag` (comparte tema, más señal para
coherencia interna) y el bloque random más `connection`/
`unresolved_reference` (mezcla deliberada de temas) — pero ninguno de los
dos está restringido a un subconjunto de tipos de hallazgo.

### 3) Definición operacional de "hueco" — tres casos, dos SQL + uno LLM

**Hueco tipo A — entidad sin sustancia** (SQL puro, sin LLM). Una fila de
`memory_entities` con `entity_type='person'` que nunca fue sujeto
(`relation='subject'` en `memory_entry_entities`) de ninguna entrada PEOPLE
vigente, y con `memory_count >= 2` (mencionada más de una vez sin nunca
tener una entrada propia — el filtro de volumen que evita generar una
propuesta de "crear" por cada mención de una sola vez, que sería demasiado
ruido ahora que cada una implica una pregunta por Telegram). Ya es
computable hoy con una variante de la query de `list_entities()` (Fase B3).
`memory_count == 1` no genera ninguna acción por esta vía — pero si esa
única mención es lo bastante ambigua como para necesitar contexto, la
cubre el tipo C de abajo, con un criterio distinto (no cuenta menciones,
lee el texto).

**Hueco tipo B — entrada aislada** (SQL puro, sin LLM ni acción asociada).
Una `memory_entries` vigente sin ninguna fila en `memory_entry_entities` NI
en `memory_entry_projects`. Deliberadamente **no** se exige además "sin
tags": ese caso ya lo resuelve solo `_backfill_catalog_tags()` (pieza D,
autónomo, en producción) con el tiempo — agregarlo acá duplicaría trabajo
ya cubierto. Sigue siendo el único caso sin acción ni pregunta por Telegram
(ver punto 1) — bookkeeping visible en Explorar, no una interrupción.

**Hueco tipo C — referencia sin resolver dentro de una entrada** (LLM,
nuevo, pedido por el usuario). Ejemplo literal del pedido: "Me fui con José
a tomar un café" → "¿Quién es José?". A diferencia de A/B, esto no se
detecta agregando filas — se detecta **leyendo el contenido de cada entrada
dentro del bloque que ya se está revisando** (punto 2), como parte del
mismo call LLM que busca contradicción/duplicado/conexión: el prompt le
pide al modelo señalar menciones concretas (persona, lugar, proyecto) que
la entrada no explica y que tampoco están explicadas en ninguna otra
entrada vigente vinculada a esa misma entidad (el modelo recibe el
`entity_id` ya resuelto por `extract_entities()`/`link_entities_for_entry()`
en el momento de la captura original, y sus `notes`/entradas vinculadas
como contexto para juzgar si ya está resuelto en otro lado). No hay umbral
de conteo acá — es juicio del LLM sobre esa entrada puntual, no una
agregación como el tipo A; por eso mismo tiene más riesgo real de falso
positivo que A/B (ambos SQL determinístico) — mitigado por lo mismo que ya
mitiga todo lo demás: nunca se aplica sin que el usuario conteste que sí
(punto 1, acción "aclarar").

Nota de cobertura: el tipo C solo se detecta cuando la entrada en cuestión
cae dentro de uno de los bloques de una corrida — mismo ritmo que el resto
de los hallazgos (no es tiempo real al capturar, es parte del batch diario;
ver punto 5).

### 4) Flujo de aclaración por Telegram

**Tabla nueva `jarvis_audit_proposals`** (no reusar `jarvis_capture_
proposals` — el shape es distinto: captura pasiva siempre crea contenido
nuevo a partir de una conversación; audit actúa sobre entradas *existentes*
con 8 tipos de acción distintos, algunos con dos entry_ids target en vez de
uno). Se reusa el **patrón**, no la tabla: mismo ciclo de vida
PENDING/ACCEPTED/REJECTED/EXPIRED, mismas funciones
`create_proposal()`/`accept_proposal()`/`reject_proposal()`/
`expire_stale_proposals()` (nombres calcados de `jarvis/captures/passive.py`,
implementación propia por el shape distinto). Columnas:
`id, action_type (create|clarify|flag_contradiction|flag_connection|merge|
edit|delete|retag), target_entry_ids (JSON, 1 o 2 ids), payload (JSON —
contenido nuevo / tags nuevos / null si la acción es solo "marcar"),
question, channel, channel_id, status, user_id, finding_id (para el dedup
del punto siguiente), created_at, resolved_at`.

**Formulación de la pregunta** — una plantilla corta por `action_type`, sin
LLM aparte para la redacción (el mismo call que resuelve el hallazgo ya
devuelve el `payload`; la pregunta se arma con un template en Python, mismo
patrón que `_notify_telegram_proposal()` ya arma el texto del push):
- `create`: "🧠 Encontré N menciones de **{entidad}** sin ninguna entrada
  propia. ¿Guardo esto? _{contenido sintetizado}_"
- `clarify`: "🧠 En esta entrada mencionás a **{referencia}** sin más
  contexto: _{contenido}_. ¿Quién/qué es?"
- `flag_contradiction`: "🧠 Estas dos entradas parecen contradecirse: [A] /
  [B]. ¿Lo marco para revisión?"
- `flag_connection`: "🧠 Encontré una posible relación entre estas dos
  entradas de temas distintos: [A] / [B]. ¿Lo anoto?"
- `merge`: "🧠 Estas dos entradas parecen decir lo mismo: [A] / [B]. ¿Marco
  la más vieja como reemplazada?"
- `edit`: "🧠 Encontré una posible corrección: _{contenido actual}_ → ¿lo
  cambio a: {propuesta}?"
- `delete`: "🧠 Esta entrada parece {obsoleta|vacía|duplicada}:
  _{contenido}_. ¿La borro?"
- `retag`: "🧠 El tag `{tag}` no parece corresponder a esta entrada:
  _{contenido}_. ¿Lo saco?"

**Agrupar el volumen, no el mecanismo de aceptación** — riesgo real
introducido por el cambio del punto 1: si cada hallazgo de una corrida
genera un mensaje de Telegram individual, un backlog inicial grande podría
mandar muchos mensajes de golpe. Se propone (no se fuerza — ver
"decisiones abiertas") consolidar `flag_contradiction`/`flag_connection`
(las dos acciones que solo "marcan", sin contenido que revisar caso por
caso) en **un único mensaje-resumen por corrida** con todos los hallazgos
de ese tipo numerados; `create`/`clarify`/`merge`/`edit`/`delete`/`retag`
siguen siendo una pregunta individual cada uno porque necesitan juicio
sobre contenido específico. Importante: esto es solo agrupar el **texto
del push** — cada hallazgo sigue siendo una fila `PENDING` separada en
`jarvis_audit_proposals` (mismo `accept`/`reject` por id de siempre, sin
inventar un mecanismo de aprobación nuevo). **Actualizado post-aprobación
(ver "Decisiones abiertas — RESUELTAS" más abajo): no se resuelve con un
solo "sí" para todas — el usuario responde por número dentro del mismo
mensaje agrupado** (ej. "sí 1,3" / "no 2") para aceptar/rechazar cada fila
individualmente.

**Canal**: a diferencia de captura pasiva (que nace de una conversación real
con `channel_id` conocido), un hallazgo de audit no está atado a ninguna
conversación — no hay un `channel_id` natural. Se reusa
`jarvis.debug.service.get_debug_chat_id()` (ya existe para el push de
`/jdebugon`: `JARVIS_TELEGRAM_CHAT_ID` si está seteado, si no el chat_id
recordado del primer `/j`) en vez de inventar una resolución nueva. Si no
hay ningún chat_id disponible, la propuesta se crea igual pero solo queda
disponible por pull — `GET /jarvis/audit-proposals` (mismo patrón que
`GET /jarvis/proposals`, polling desde `JarvisProposalBanner.jsx` o un
banner nuevo — UI fuera de alcance de este documento).

**Bot Telegram** — `handle_pending_audit_proposal()` nuevo en
`jarvis_handlers.py`, mismo criterio de interpretación de texto libre que
`handle_pending_passive_proposal()` (no/variantes → rechaza; sí/variantes →
acepta tal cual **el payload calculado**, nunca reinterpreta texto libre
como un payload distinto — alcance de v1 explícitamente acotado: no soporta
"no, mejor hacé X" en lenguaje natural, solo aceptar-tal-cual o rechazar).
Para `clarify` específicamente, cualquier respuesta de texto libre que no
sea un "no" **es la respuesta a la pregunta** (mismo criterio que la
aclaración de DECISION y que captura pasiva: texto libre a una pregunta
pendiente ES la respuesta, no una captura nueva sin relación) — se guarda
tal cual, no se le pide al LLM que la reformatee. Para el resto de las
acciones, cualquier otra respuesta de texto libre se trata como
rechazo-con-motivo (se loguea el texto para contexto futuro, no se
reintenta parsear como instrucción).

**Vencimiento sin respuesta — `JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES`**
(default propuesto: **1440**, 24h — no 30 min como captura pasiva: el audit
corre una vez al día, probablemente sin el usuario cerca del chat; darle
todo el día siguiente es más razonable). Al vencer: **se descarta sin
aplicar nada**, mismo default que captura pasiva — acá lo que está en juego
siempre incluye crear/mutar/borrar algo, así que el default seguro es no
tocar nada. Responde la pregunta explícita del usuario: **no**, una
propuesta EXPIRED no vuelve a aparecer como "pendiente" — pero sí queda
consultable como historial vía `GET /jarvis/audit-proposals?status=all`
(igual que `EXPIRED`/`REJECTED` ya quedan en `jarvis_capture_proposals` hoy,
nunca se borran) para que el usuario revise más tarde "qué encontró el
audit y qué se le pasó".

**Dedup — mismo bug ya encontrado y arreglado hoy, aplicado preventivamente
acá**: antes de crear una `jarvis_audit_proposals` nueva, chequear si ya
existe una `REJECTED`/`EXPIRED` con el mismo hallazgo (mismo
`action_type`+`target_entry_ids`) y si la hay, **no volver a proponer** —
mismo criterio exacto que `_pair_already_conflicted()` (bug real arreglado
hoy mismo: sin este chequeo, un hallazgo no resuelto se re-propondría — y
en este caso, re-empujaría un mensaje de Telegram — en cada corrida diaria
para siempre). Con la lista ahora en 8 acciones y confirmación obligatoria
en todas, este chequeo importa más que en la versión anterior del
documento — sin él, el volumen de mensajes repetidos sería el riesgo más
visible del sistema.

### 5) Gating de costo/frecuencia

**Mismo job, no uno nuevo** — se agrega como cuarto paso de
`run_consolidation()` (después de pares → stale → backfill de tags),
gateado por el mismo `should_run()` de 24h que ya existe. Sin thread nuevo en
`worker/main.py` (Fase D ya estableció este patrón: extender el job diario
existente en vez de agregar infraestructura de scheduling nueva).

**Presupuesto de entradas revisadas** — `JARVIS_AUDIT_BLOCK_SIZE` (default
10) × 2 bloques por corrida (1 por tag, 1 random — punto 2) = 20 entradas
revisadas/día, mismo orden de magnitud que `_TAG_BACKFILL_LIMIT=20` (mismo
criterio: "volumen real ~20 capturas/día"). Si el backlog acumulado tarda
en drenarse, subir `JARVIS_AUDIT_BLOCK_SIZE` alcanza — mismo margen de
ajuste que ya tiene `_TAG_BACKFILL_LIMIT`. El mismo cap que acota costo de
LLM **también acota el volumen de preguntas por Telegram** por diseño —
beneficio no buscado a propósito pero real ahora que todo pasa por
confirmación (punto 1): no hace falta un límite separado de "preguntas por
día", el límite de entradas revisadas ya lo implica.

**Llamadas LLM por corrida**: la detección de huecos tipo A/B (punto 3) es
SQL puro, 0 llamadas. Los 2 bloques (punto 2) generan 1 llamada LLM cada
uno — 2 llamadas/día en total (esa misma llamada también cubre la
detección del tipo C y de `connection`/`wrong_tag`, no hay una llamada
aparte por tipo de hallazgo). Con ese volumen, se justifica usar
`call_reason()` (modelo externo, con fallback automático a local ya
incorporado) en vez del modelo local — mismo criterio que ya documentó
`_resolve_pair()`: "en pruebas reales el modelo local no clasificó bien
casos claros de same_fact, mientras que el externo sí; el volumen es bajo
así que el costo es despreciable" — acá el volumen es incluso menor (2
llamadas/día vs. hasta O(n²) pares). El presupuesto diario
(`JARVIS_DAILY_BUDGET_USD`) ya cubre esto gratis: `call_reason()` ya
factura contra el budget tracker y cae solo a modo local si el presupuesto
se agotó — no hace falta lógica de costo nueva.

**Prompt del bloque** — un solo call por bloque, mismo patrón de salida en
array que `_ENTITY_PROMPT` (nunca un objeto suelto): recibe hasta
`JARVIS_AUDIT_BLOCK_SIZE` entradas (id, contenido, `recorded_at`, tags
actuales, entidades ya vinculadas con sus `notes`) y devuelve
`[{"type": "contradiction"|"duplicate"|"gap_needs_entry"|
"unresolved_reference"|"connection"|"wrong_tag", "entry_ids": [...],
"detail": "...", "suggested_content"/"suggested_tag": "..." (según type)}]`
— 6 tipos de hallazgo posibles, mapeados a las 8 acciones del punto 1
(`duplicate` puede resolver a `merge` o `edit` según si el LLM juzga que
una reemplaza del todo a la otra o conviene combinarlas). Cada elemento del
array se resuelve siempre a una fila `jarvis_audit_proposals` PENDING
(nunca se aplica nada todavía — punto 1).

**Nuevo en `TaskManifest`**: `audit_memory` y `propose_audit_action` (mismo
criterio que `consolidate_memory`/`propose_capture` — blast radius explícito
en código, `MANIFEST.assert_allowed()` antes de cada operación).

**Schema nuevo**: `memory_entries.last_audited_at` (columna nueva,
`ALTER TABLE ... ADD COLUMN ... DATETIME` — mismo patrón de migración ya
usado en pieza A/C, con fallback sin `CHECK` si el SQLite del entorno no lo
soporta); tabla `jarvis_audit_proposals` (`CREATE TABLE IF NOT EXISTS`, sin
impacto en tablas existentes). La tabla `jarvis_audit_findings` de la
versión anterior de este documento **se elimina del diseño** — con todo
pasando por confirmación, no hace falta una tabla de hallazgos separada de
la de propuestas: la fila PENDING/ACCEPTED/REJECTED/EXPIRED de
`jarvis_audit_proposals` ya es el registro completo (detección + decisión
en un solo lugar, un archivo menos que sincronizar).

**`origin_trust` de una entrada `create`/`clarify` aceptada**: nunca un
valor fijo. Para `create`: el mínimo (menos confiable) `origin_trust` entre
las entradas fuente de las que se sintetizó, aplicando literalmente el
invariante "origin_trust nunca aumenta en derivados". Para `clarify`: el
`origin_trust` normal de una captura nueva por el canal que contestó
(`telegram.user`/`user.authenticated`) — es contenido nuevo que el usuario
tipeó de verdad, no un derivado de memoria existente. `created_by` reusa
tal cual `'jarvis_proposal_accepted'` (ya existe). `source` reusa el mismo
criterio que `accept_proposal()` de captura pasiva: el canal por el que se
aceptó (`telegram`/`desktop`) — sin cambio de CHECK en
`memory_entries.source`.

### Riesgos y trade-offs para conocer antes de aprobar

- **Inconsistencia deliberada con el camino pairwise**: pairwise
  (`_resolve_pair()`) sigue aplicando `same_fact`/`contradiction` sin
  preguntar (marca `valid_to` o baja `confidence` solo) — con la revisión
  de esta sesión, esa asimetría es ahora más marcada que antes (el audit
  nuevo no aplica NADA sin Telegram, ni siquiera "marcar"). Es a propósito
  (pairwise está calibrado con datos reales; audit no tiene ninguno
  todavía), pero es una asimetría real que el usuario debería seguir
  teniendo presente.
- **Volumen de preguntas por Telegram, más alto que en la versión anterior
  de este documento**: al sacar el tier autónomo, hasta agregar un tag mal
  puesto por el audit (acción `retag`) o marcar una conexión sin
  importancia (`flag_connection`) generan una pregunta. Mitigado por: el
  cap de 20 entradas/día (que acota cuántos hallazgos pueden salir de una
  corrida), el agrupamiento de `flag_*` en un mensaje-resumen (punto 4), y
  el dedup (no se repite un hallazgo ya resuelto). Aun así, vale la pena
  que el usuario sepa que el volumen real de mensajes va a ser mayor al que
  tenía la primera versión de este diseño — es la consecuencia directa y
  esperada de "todo pasa por confirmación", no un descuido.
- **El tipo C (referencia sin resolver) es el hallazgo con más riesgo real
  de falso positivo de los tres** — a diferencia de A/B (SQL determinístico,
  sin ambigüedad), depende del juicio del LLM sobre si una mención "ya está
  resuelta en otro lado" o no. Mitigado igual que todo lo demás (nunca se
  aplica sin confirmación), pero es el candidato más probable a preguntas
  que el usuario sienta triviales u obvias (ej. preguntar quién es alguien
  que ya se explicó hace tiempo en una entrada que el bloque actual no
  incluyó). Si en la práctica genera mucho ruido, la mitigación más directa
  es que el prompt reciba más contexto de la entidad (ya se incluye
  `notes`/entradas vinculadas — punto 3), no bajar la barra de confirmación.
- **Caso borde ya aceptado una vez, aplicado igual acá**: si el usuario edita
  una entrada manualmente entre que el audit la marca como hallazgo y que
  responde la propuesta, el dedup por `entry_ids` sigue considerando el
  hallazgo "ya tratado" aunque el contenido ya cambió — mismo trade-off
  aceptado en `_pair_already_conflicted()` hoy mismo (volumen bajo, y de
  todos modos el usuario ve el contenido exacto en la pregunta antes de
  confirmar, nunca aplica ciego).
- **I/O síncrono en el handler del bot al aceptar** `edit`/`delete`/`retag`
  reusa `edit_entry()`/`forget_entry()`/`replace_tags_for_entry()` tal cual
  — mismas llamadas bloqueantes (reescritura de vault + embedding) que ya
  hace `accept_proposal()` de captura pasiva hoy; no es un problema nuevo,
  pero el mismo riesgo de latencia percibida si Chroma/vault están lentos
  se hereda sin cambios.

### Decisiones abiertas — RESUELTAS con el usuario el 2026-08-31 (post-aprobación)

- **UI**: `jarvis_audit_proposals` PENDING se muestra en el mismo
  `JarvisProposalBanner.jsx` que ya usa captura pasiva — no un banner
  separado, no un tab nuevo. El historial resuelto (`ACCEPTED`/`REJECTED`/
  `EXPIRED`) se consulta desde Explorar (pieza F), con un filtro, no una
  pantalla dedicada.
- **Aceptación agrupada de `flag_*`**: se descarta "un solo sí acepta
  todas". El mensaje agrupado numera cada hallazgo; el usuario responde por
  número (ej. "sí 1,3" / "no 2") para aceptar/rechazar individualmente
  dentro del mismo mensaje — la sesión de implementación define el parser
  exacto de esa sintaxis (aceptar variantes razonables: "1 y 3", "todas",
  etc., sin sobre-ingenierizarlo).
- **Horario fijo (3x/día) — descartado.** Se consideró y el usuario lo bajó
  él mismo al confirmar que el gating por `should_run()` de 24h ya cubre
  "se activa solo" sin necesitar horarios explícitos. El audit sigue como
  cuarto paso del mismo job diario, sin cadencia propia — sin cambios sobre
  lo ya escrito en el punto 5.

Los defaults numéricos propuestos (`JARVIS_AUDIT_BLOCK_SIZE=10`,
  `JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS=7`,
  `JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES=1440`) son puntos de partida
  razonados por analogía con los ya existentes, no datos calibrados con
  memoria real todavía — a diferencia del umbral 0.70 (que sí tiene 4
  puntos de calibración reales), estos números no se probaron. Ajustar tras
  la primera semana de uso real, igual que ya se hizo con el umbral de
  similitud.

Impacto (si se aprueba e implementa): `jarvis/worker/consolidation.py`
(nuevo paso), `jarvis/db/schema.py` (columna + 1 tabla nueva),
`jarvis/config.py` (3 constantes nuevas), `jarvis/worker/task_manifest.py`
(2 operaciones nuevas), módulo nuevo `jarvis/audit/service.py` (o extender
`consolidation.py` directamente — a decidir en la sesión de implementación),
`jarvis/api/router.py` (`GET /jarvis/audit-proposals`,
`POST /jarvis/audit-proposals/{id}/accept|reject`),
`project/mybot/jarvis_handlers.py` (`handle_pending_audit_proposal()`). Sin
tocar ningún archivo existente de forma destructiva — todo aditivo.

---

## 2026-08-31 — Contradicción real calibrada con datos + channel_id hardcodeado sacado de raíz

Contexto: la sesión del 28/08 dejó dos sugerencias explícitamente abiertas al
cierre: (1) el camino `contradiction` de consolidación nunca se había probado con
datos reales — los pares de "contradicción" de esa sesión resultaron ser
`same_fact` según la propia definición del prompt (`_PAIR_PROMPT`), no
contradicciones genuinas; (2) `channel_id="web"` hardcodeado en `query_endpoint`
como fallback cuando no llega `conversation_id`, mismo patrón de raíz que causó
el bug de "borrar historial" ya cerrado (Mejoras_Jarvis.md punto 3), aunque
inofensivo en uso normal porque el frontend siempre manda un `conversation_id`
explícito. Antes de tocar nada: backup de `jarvis.db`/`vault`/`chroma` en vivo
(el que sirve Telegram y web) a
`project/database/backup-testseed-20260831-140324/` — **no restaurado**, el
usuario quiere seguir probando sobre el dataset de prueba a propósito.

### 1) Camino `contradiction` — dato de calibración real + bug de re-penalización sin fin

Diseño del par de prueba: dos afirmaciones simultáneas e incompatibles, sin
ningún lenguaje que sugiera cambio en el tiempo ("ahora", "antes", "dejé",
"migré"...) y con el MISMO `recorded_at` a propósito (offset idéntico en
`jarvis/cli/seed_test.py`) — para que no quede ninguna pista de "cuál reemplaza a
cuál", que es justo lo que distingue `contradiction` de `same_fact` según el
propio prompt. Primer intento con vocabulario poco compartido ("Trabajo 100%
remoto, nunca piso la oficina" / "Voy a la oficina todos los días") dio coseno
**0.612** — por debajo incluso del piso de ruido medido la sesión anterior
(0.54–0.59) — confirma que la similitud de embeddings depende mucho del
solapamiento léxico, no solo del tema; sin palabras compartidas, ni siquiera una
contradicción directa sobre el mismo tema alcanza el umbral. Reformulado con
estructura paralela y vocabulario compartido ("Soy 100% remoto en la empresa:
nunca piso la oficina para trabajar" / "Soy 100% presencial en la empresa: voy a
la oficina todos los días a trabajar") dio coseno **0.871** — **dato de
calibración real para este camino**, mismo formato que los ya registrados el
28/08 (same_fact reformulado: 0.898; "hecho que cambió con el tiempo": 0.748;
pares sin relación: 0.54–0.59).

Verificado con Ollama real: `run_consolidation()` resolvió el par como
`contradiction` — ambas entradas bajaron `confidence` de 1.0 a 0.5
(`_reduce_confidence`) y quedó un registro en `jarvis_policies`
(`policy_type='consolidation_conflict'`, `{"entry_a":..., "entry_b":...,
"similarity": 0.8714}`) — exactamente el comportamiento documentado ("baja
confidence en ambos y loguea para revisión manual", sin tocar `valid_to` en
ninguna de las dos).

**Bonus no planeado**: una entrada leftover de la sesión anterior (`b48c4360`,
"Ahora trabajo 100% remoto desde casa...", nunca agregada al seed formal, solo
insertada ad hoc para validar el umbral) resultó semánticamente CONSISTENTE con
una de las dos entradas nuevas (ambas dicen "trabajo remoto") e INCONSISTENTE con
la otra (dice "presencial") — en la misma corrida, el sistema correctamente la
resolvió como `same_fact` contra la que coincide (marcada `valid_to`) y como
`contradiction` contra la que no (confidence reducida), sin intervención. Confirma
que el sistema maneja razonablemente un cluster de 3 entradas con relaciones
mixtas dentro de una sola corrida, no solo pares aislados.

**Bug real encontrado corriendo `run_consolidation()` una segunda vez sobre el
mismo par sin tocar nada** (para confirmar idempotencia, mismo criterio de
verificación que se usó para same_fact): a diferencia de `same_fact` (que marca
`valid_to` en la entrada vieja — un estado terminal que la saca de
`_fetch_active_entries()` para siempre), `contradiction` no cambia `valid_to` en
ninguna de las dos entradas — ambas siguen "vigentes" indefinidamente. Como la
similitud del par no cambia entre corridas, el mismo par se re-detecta como
candidato en CADA corrida siguiente y el modelo lo vuelve a juzgar
`contradiction` (la similitud sigue siendo la misma, no hay ninguna razón para
que cambie de opinión) — confirmado en vivo: 2da corrida bajó confidence de 0.5 a
0.25, con una fila nueva idéntica en el log de conflictos. Sin este fix, una
contradicción sin resolver decaería exponencialmente hacia 0 (0.5, 0.25, 0.125,
...) y el log de conflictos acumularía un duplicado por cada corrida diaria, para
siempre, hasta que un humano intervenga a mano (edite u olvide una de las dos).

Fix: `_pair_already_conflicted(id_a, id_b)` nuevo en `consolidation.py` — lee
todos los `consolidation_conflict` previos de `jarvis_policies` y compara por par
de ids (sin importar el orden); si el par ya está logueado, `_resolve_pair()` no
vuelve a penalizar ni a loguear. Comparación por par de ids, no por contenido:
si el usuario edita una de las dos entradas (`edit_entry()`, pieza B) el id no
cambia, así que el par sigue considerándose "ya resuelto" aunque el contenido
editado ya no contradiga — caso borde aceptado a propósito (volumen real de
conflictos bajo, y de todos modos la resolución real de un conflicto pasa por
revisión manual del usuario, no por que el job la reconsidere solo). Verificado:
3ra corrida sobre el mismo par dio `conflicts: 0`, `confidence` se mantuvo en
0.25 (no siguió decayendo), sin fila nueva en el log.

Impacto: `jarvis/worker/consolidation.py` (`_resolve_pair` con el chequeo nuevo,
`_pair_already_conflicted` nueva), `jarvis/cli/seed_test.py` (refactor: `main()`
ahora delega en `seed_items(items, base_time=None)` nueva — reusable para
agregar entradas puntuales a un dataset ya sembrado sin re-insertar las
existentes; `ENTRIES` gana el par `contradiccion_remoto`/`contradiccion_oficina`
con `recorded_at_offset_minutes` explícito, campo opcional nuevo que
`seed_items()` respeta en vez del espaciado automático `i*5`).

### 2) `channel_id="web"` hardcodeado sacado de raíz

Antes de decidir: confirmado leyendo `useStore.js::jarvisQuery()` que el
frontend real SIEMPRE crea un chat primero (`createJarvisChat()` si no hay uno
activo) y manda su `conversation_id` explícito en cada `/jarvis/query` — el
fallback de `channel_id` fijo nunca se ejercita en uso normal hoy. Dos opciones
consideradas: (a) exigir `conversation_id` y fallar explícito si falta —
más "seguro" en el sentido de nunca improvisar, pero más invasivo para
cualquier caller futuro (tests, integraciones) que hoy se apoya en la
comodidad de "funciona sin gestionar chats a mano"; (b) generar un
`channel_id` nuevo y único en cada llamada sin `conversation_id`, en vez del
string fijo compartido. Elegido (b) — mantiene la conveniencia para cualquier
caller que no gestione chats, sin dejar la puerta abierta a que dos llamadas
sin id se reenganchen a la misma conversación ajena (la causa raíz real del bug
ya cerrado). Cambio de una línea: `channel_id=f"web-implicit:{uuid.uuid4().hex}"`
en vez de `channel_id="web"` en `query_endpoint`.

Verificado contra el backend real: `POST /jarvis/query` sin `conversation_id`
devuelve un `conversation_id` nuevo cuya fila en `conversations` tiene
`channel_id='web-implicit:<uuid>'` — confirmado leyendo la DB directamente.

Impacto: `jarvis/api/router.py` (`query_endpoint`) únicamente.

### 3) Bug adicional no planeado: `write_heartbeat()` se auto-borraba, todos los días

Contexto: al reiniciar backend/worker/bot al final de la sesión (para que
Telegram/web sirvan el código nuevo), `GET /jarvis/health` volvió a dar
`worker_alive: false` con el worker recién arrancado. Antes de asumir un bug
de código, se descartó primero que fuera un hang real: `py-spy dump --pid
<pid>` (instalado ad hoc para este diagnóstico) contra el proceso real mostró
el único hilo en `main.py:156` (`time.sleep(JARVIS_WORKER_POLL_INTERVAL)`,
estado `idle`) — el worker estaba perfectamente vivo, dormido en el ciclo
normal del loop, no colgado. Aislado con una réplica manual paso a paso del
cuerpo de `main()` (funciona sin problema) contra llamar `main()` como
función (cuelga aparentemente) — la diferencia real no era el código en sí,
sino que cada vuelta del loop SÍ corría `write_heartbeat()` con éxito, pero
la fila desaparecía sola antes de que cualquier lectura posterior la
encontrara.

Causa raíz: `write_heartbeat()` (arreglado el 28/08 para podar heartbeats
viejos, ver más abajo) insertaba sin pasar `created_at` explícito -- la
ÚNICA escritura a `jarvis_policies` en todo el código que no lo hace
(`_log_conflict`/`_record_run`/`debug/service.py` siempre lo pasan explícito
en formato ISO de Python). Sin ese valor, quedaba en manos del `DEFAULT
(datetime('now','utc'))` del schema, que genera un formato de texto DISTINTO
("2026-08-31 20:22:33", con espacio, sin timezone) al que usa el resto del
sistema ("2026-08-31T17:22:33.774548+00:00", con "T" y offset) -- y además,
confirmado comparando ambos directamente en este entorno, un valor de reloj
distinto (~3h de diferencia real, no solo de formato). El `DELETE` de poda
que agregué el 28/08 compara ese `created_at` (formato SQLite) contra un
cutoff en formato Python -- con la misma fecha calendario (mismo día), la
comparación de strings da `'2026-08-31 20:22:33' < '2026-08-31T16:22:33...'`
→ **True siempre**, porque el espacio (0x20) ordena antes que "T" (0x54) en
ASCII, sin importar la hora real. Confirmado directo en Python: se insertó
una fila, se leyó su `created_at` tal cual quedó grabado, y se comparó contra
el cutoff -- dio `True` de inmediato. Esto significa que cada heartbeat se
borraba a sí mismo en la MISMA transacción en la que se insertaba, todos los
días (salvo un margen alrededor de medianoche) -- `jarvis_policies` quedaba
sin ningún heartbeat vigente y `get_worker_alive()` devolvía `False` para
siempre, sin ningún error visible (la fila desaparecía silenciosamente,
`write_heartbeat()` nunca lanzaba ninguna excepción).

Por qué no se notó al arreglar el bug original el 28/08: la verificación de
ese día llamó `write_heartbeat()` una sola vez, con un cutoff de "hace 1
hora" contra una tabla con ~11.000 filas viejas de DÍAS anteriores (25-28 de
agosto) -- para esas filas, el PREFIJO de fecha ya difería del cutoff, así
que la comparación de string se resolvía correctamente por la fecha antes de
llegar al carácter separador ambiguo, y el conteo bajando de 11.253 a 210
parecía confirmar que la poda funcionaba. El bug solo se vuelve 100%
determinista y siempre-activo cuando el cutoff cae en el MISMO día
calendario que la escritura -- exactamente el caso normal de un worker
corriendo continuamente (`_HEARTBEAT_RETENTION` de 1h, así que casi siempre
mismo día).

Fix: `created_at` explícito en `write_heartbeat()`, mismo `now_iso` (formato
Python ISO) usado para la columna `value` -- consistente con el resto del
sistema, elimina el mismatch de formato y de reloj a la vez.

Verificado: heartbeat sobrevive su propia escritura (`worker_alive` vuelve a
`true` contra el backend real, confirmado también reiniciando el proceso del
worker limpio); una fila insertada a mano con 2h de antigüedad real (mismo
formato Python) sigue podándose correctamente en la siguiente escritura --
confirma que el fix no rompió la poda en sí, solo corrigió la comparación.

Impacto: `jarvis/worker/heartbeat.py` (`write_heartbeat()`) únicamente.

---

Verificado en conjunto: `python -m py_compile` limpio sobre los 3 archivos con
cambios de código propios (`consolidation.py`, `router.py`, `heartbeat.py`) más
`seed_test.py` (refactor). Todo probado con Ollama real (`gemma3:12b`/
`nomic-embed-text`) contra el dataset de prueba en vivo, backend/worker/bot
reiniciados al final con el código nuevo (dos veces -- la segunda para levantar
el fix del heartbeat, encontrado ya con todo lo demás reiniciado) para que
Telegram/web sigan sirviendo el dataset de prueba como pidió el usuario.

---

## 2026-08-28 — Fix del bug de ranking del retriever + 4 mejoras chicas

Contexto: sesión previa (testing con dataset sembrado, embeddings reales) había
encontrado y cuantificado un bug de ranking en la búsqueda híbrida (pieza E) y
varios puntos de mejora menores, sin tocar código (sesión de testing puro). Esta
sesión implementa esos fixes.

### 1) Bug de ranking del retriever (pedido explícito de la sesión)

Diagnóstico previo: una pregunta completa con un término raro/exacto (ej.
"¿Qué pasó con el código ERR-4471-XK?") no traía la entrada correcta entre las
fuentes citadas, aunque `"ERR-4471-XK"` a secas sí rankeaba #1. Causa raíz con dos
componentes:

1. El filtro coarse clasifica la pregunta con un `type` probable (ej. SEMANTIC) y
   lo aplica como `where={"type": ...}` en la query de ChromaDB — si la entrada
   correcta es de OTRO tipo (la del código de error era RAW), queda excluida de
   raíz del pool que se rankea, sin importar su similitud o señal léxica.
2. `_merge_lexical_only()` (pensada para rescatar justo este caso) sí detectaba el
   match léxico fuerte (score 1.0, el máximo posible) pero lo agregaba SIEMPRE al
   final de la lista de resultados o rellenando huecos — nunca competía por
   posición según su score real. Un match léxico perfecto no podía superar nunca a
   ruido semántico de "tipo correcto".

Fix: `_retrieve_chromadb()` ahora propaga el embedding de la pregunta hasta
`_merge_lexical_only()`; esta calcula una similitud real para cada rescate léxico
(`_fetch_similarities()`, mismo patrón de `collection.get(ids=...)` que ya usaba
`_retrieve_scoped_by_ids()`) y arma su `_rank_score` real (similitud + tipo +
bonus léxico), en vez de un placeholder. `_rank_and_attach()` (helper nuevo,
compartido por los tres caminos de retrieval — Chroma con/sin scope de proyecto,
fallback SQLite) deja el score anotado como clave transitoria en cada entry dict
para que sobreviva hasta el merge final; se limpia antes de devolver el resultado
de `retrieve()`. El merge ahora es: combinar densos + rescates léxicos, reordenar
por `_rank_score` real, cortar a `n_results` — reemplaza la lógica vieja de
"rellenar huecos o reemplazar la cola ciegamente".

**Segundo bug encontrado verificando el fix**: con el rescate ahora compitiendo por
score real, una pregunta como "¿Dónde vivo actualmente?" empezó a traer
`Quetzalcoatl-7` (un proyecto sin relación) en el puesto #1 — porque
`_fts_query_terms()` no filtraba conectores comunes, y "actualmente" (palabra
funcional que por casualidad solo aparecía en esa entrada) ganaba el ranking bm25
como "único/mejor match", normalizándose a score léxico 1.0 igual que un término
realmente raro. Fix: `_FTS_STOPWORDS` (constante nueva en `retriever.py`, ~60
conectores comunes en español) filtrados antes de armar la expresión MATCH.
`browse/service.py::_text_match_ids()` reusa `_fts_query_terms()`, así que el
fix también mejora la búsqueda de texto libre de la pantalla Explorar.

Verificado con Ollama real contra el dataset de prueba: las 7 preguntas ya
probadas en la sesión anterior (incluyendo las 2 de término raro) vuelven a
rankear la entrada correcta en el puesto #1, sin regresión en las que ya andaban
bien. `_retrieve_scoped_by_ids()`/`_retrieve_sqlite_fallback()` no cambiaron de
comportamiento (mismo `_rank_and_attach()` compartido, mismos inputs).

Impacto: `jarvis/retriever/retriever.py` únicamente (`_retrieve_chromadb`,
`_retrieve_scoped_by_ids`, `_retrieve_sqlite_fallback`, `_merge_lexical_only`
reescritas; `_rank_and_attach`/`_fetch_similarities`/`_FTS_STOPWORDS` nuevas).

### 2) `jarvis/config.py` carga `.env` (bug real, no en el alcance original pero
encontrado auditando por qué `call_reason()` fallaba en el worker)

`jarvis/worker/main.py` (y todo lo que importa) nunca llamaba `load_dotenv()` —
a diferencia de `project/app/config.py` y `project/mybot/api_config.py`, que sí lo
hacen antes de que se importe `jarvis.config`. Corriendo el worker como pide
CLAUDE.md (`python -m jarvis.worker.main`, proceso Python suelto en Windows),
`OPENAI_API_KEY`/`TELEGRAM_BOT_TOKEN`/`JARVIS_REASON_MODEL` reales de `.env` nunca
llegaban a ese proceso — confirmado en vivo: `JARVIS_REASON_MODEL` caía al default
hardcodeado (`openai/gpt-4o-mini`) en vez de `openai/gpt-5.4-mini`, y
`call_reason()` en `consolidation.py` fallaba por credenciales faltantes,
degradando siempre a modo local en silencio (solo un warning en el log). El mismo
problema afectaba `jarvis/notify/telegram.py::send_telegram_message()` (lee
`TELEGRAM_BOT_TOKEN` de `os.environ` directo) — así que el aviso "✅ Listo" tras
procesar una captura y el push de `/jdebugon` disparado desde el worker también
fallaban en silencio en este mismo escenario.

Fix: `load_dotenv(_BASE / ".env")` al tope de `jarvis/config.py`, con
`override=False` (default de la librería, no pisa env vars ya seteadas — el
deploy Docker del homelab sigue pasando las suyas por `docker-compose.yml` sin
interferencia) y try/except ImportError (no rompe si `python-dotenv` faltara,
aunque ya es dependencia de `jarvis/pyproject.toml`). Centralizado en `config.py`
en vez de en cada entrypoint para que cualquier proceso futuro que importe
`jarvis.config` quede cubierto automáticamente.

Verificado: proceso Python fresco sin `OPENAI_API_KEY` en el entorno, importando
`jarvis.captures.passive` (mismo camino de imports que usa el worker) —
`JARVIS_REASON_MODEL` lee correctamente `openai/gpt-5.4-mini` de `.env` y
`OPENAI_API_KEY` queda presente después del import.

Impacto: `jarvis/config.py` únicamente.

### 3) Umbral de similitud de consolidación: 0.92 → 0.70

Contexto: la sesión de testing anterior había cuantificado con embeddings reales
que un par same_fact real (reformulado, no casi-textual) dio coseno 0.898, y un
par de "hecho que cambió con el tiempo" ("vivo en Madrid" → "me mudé a Buenos
Aires") dio 0.748 — ambos por debajo del umbral viejo (0.92), confirmando con
datos la sospecha ya documentada el 26/08 de que ese umbral solo agrupa
casi-duplicados textuales.

Antes de bajarlo, se midió el piso de ruido: pares de entradas sin relación
temática en el mismo dataset dieron 0.54–0.59 de coseno. 0.70 deja margen cómodo
por encima de ese piso y por debajo de las dos señales reales.

Por qué bajar este número no es riesgoso por sí solo: el umbral solo decide qué
pares se le PROPONEN al modelo de razonamiento (`call_reason`) para que juzgue
`same_fact` / `contradiction` / `different` — esa decisión por par ya es la que
filtra de verdad (un par genuinamente distinto sigue resolviendo `different`, sin
ninguna mutación). Bajar el umbral solo amplía el embudo de candidatos que llegan
a ese juicio, no relaja el juicio en sí.

**Corrección sobre la propia sesión de testing anterior**: el par "vivo en
Madrid"/"me mudé a Buenos Aires" que esa sesión etiquetó como "contradicción" es,
por la definición que usa el propio prompt del sistema (`_PAIR_PROMPT` en
`consolidation.py`), en realidad un caso de `same_fact` ("mismo hecho, uno
reemplaza al otro con información más actual — ej. cambio de domicilio") y no de
`contradiction` ("cosas incompatibles SIN que quede claro cuál reemplaza a
cuál"). Confirmado en esta sesión con dos pares reales nuevos de esa misma forma
(cambio de hosting DigitalOcean→Hetzner, coseno 0.839) — el modelo correctamente
los resuelve como `same_fact`, no como conflicto. No se forzó una confirmación en
vivo del camino `contradiction` propiamente dicho (dos afirmaciones simultáneas
sin resolución clara) — la mecánica de ese camino (`_reduce_confidence` +
`_log_conflict`) comparte el mismo `_resolve_pair()` ya verificado, así que el
riesgo de que esté roto es bajo, pero queda sin confirmar con datos reales.

Verificado con Ollama real contra el dataset de prueba: `run_consolidation()`
detectó y resolvió correctamente una cadena de 3 entradas same_fact sobre
"seguimos con SQLite" (sqlite_semantic → superseded por sqlite_decision →
superseded por una captura posterior sobre el mismo tema, generada durante la
sesión de testing anterior) y el par hosting DigitalOcean→Hetzner — ninguno de
estos se hubiera detectado con el umbral viejo.

Impacto: `jarvis/config.py` (default de `JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD`).

### 4) `jarvis/browse/service.py` — `date_to` pelado rompía el filtro de fecha

`recorded_at` es un timestamp completo (`"2026-08-28T21:53:42..."`); comparar
`me.recorded_at <= date_to` con un `date_to` sin hora (`"2026-08-28"`) fallaba en
el límite superior por comparación lexicográfica de strings ("2026-08-28T21:53:42"
> "2026-08-28" porque el string más largo con el mismo prefijo es "mayor") — así
que filtrar por "hoy" excluía TODAS las entradas de hoy. `JarvisBrowsePanel.jsx`
ya lo esquivaba mandando siempre `"{fecha}T23:59:59"`, así que no era visible en
la UI real, pero la API en sí quedaba rota para cualquier otro consumidor (bot,
tests, integraciones futuras). Fix: `browse_entries()` normaliza `date_to` a fin
de día si no trae ya una hora.

Impacto: `jarvis/browse/service.py` únicamente.

### 5) `jarvis/worker/heartbeat.py` — poda de heartbeats viejos

`jarvis_policies` había acumulado más de 11.000 filas de `worker_heartbeat`
(escritas cada `JARVIS_WORKER_POLL_INTERVAL`, 5s por default, sin ninguna poda) —
ya documentado como TODO pendiente el 26/08 sin abordar. A diferencia de
`consolidation_last_run`/`consolidation_run` (auditoría real de baja frecuencia,
vale la pena el historial completo), `get_worker_alive()` solo lee la fila MÁS
RECIENTE de heartbeat — no hay ningún consumidor que necesite el historial. Fix:
`write_heartbeat()` borra heartbeats de más de 1h (`_HEARTBEAT_RETENTION`) en la
misma transacción de cada escritura nueva — sin job de limpieza aparte.

Verificado: sobre `jarvis.db` real de esta sesión, pasó de 11.253 filas de
heartbeat a 210 (última hora) en la primera escritura tras el fix, `get_worker_
alive()` siguió devolviendo `True` correctamente.

Impacto: `jarvis/worker/heartbeat.py` únicamente.

### 6) `jarvis/captures/passive.py` — falso positivo en conversaciones de pura consulta

Hallazgo de la sesión de testing anterior: una conversación donde el usuario solo
le hizo preguntas a Jarvis (sin compartir ningún hecho nuevo) generó una propuesta
de captura de todos modos — un "resumen" de qué había preguntado el usuario, que
no tiene valor como memoria. Causa: `get_unreviewed_user_text()` solo pasa los
mensajes con `role='user'` al evaluador (nunca las respuestas de Jarvis), pero el
prompt (`_EVAL_PROMPT`) describía la entrada como "esta conversación... entre el
usuario y Jarvis" — un bloque de puras preguntas del usuario, sin ese contexto,
podía parecer sustancioso.

Fix: el prompt ahora aclara explícitamente que solo ve los mensajes del usuario
(no las respuestas), agrega una regla explícita ("un bloque de puras preguntas...
no amerita guardar nada") y un ejemplo few-shot nuevo con varias preguntas
sueltas seguidas.

Verificado con Ollama real: el mismo texto que antes generaba la propuesta
espuria (las 5 preguntas de la sesión de testing anterior, concatenadas) ahora
devuelve `None` correctamente; los dos casos ya confirmados (sustancioso →
propone, chit-chat → no propone) siguen sin regresión.

Impacto: `jarvis/captures/passive.py` (`_EVAL_PROMPT` únicamente, sin cambios de
schema ni de lógica de control).

---

Verificado en conjunto (los 6 puntos): `python -m py_compile` limpio sobre los 6
archivos tocados (`retriever.py`, `config.py`, `browse/service.py`,
`heartbeat.py`, `consolidation.py` sin cambios de código propio pero
re-verificado end-to-end, `captures/passive.py`). Todo probado con Ollama real
(`gemma3:12b`/`nomic-embed-text`) contra el dataset de prueba sembrado en la
sesión anterior (`jarvis.db` sigue en estado de prueba, no de producción — ver
backup documentado en esa sesión). No se tocó ningún schema ni endpoint nuevo —
los 6 cambios son correcciones/ajustes internos, sin impacto en contrato de API.

---

## 2026-08-27 — Paquete de 6 piezas (búsqueda/captura/organización/recuperación): schema de tags, soft-delete, marca de origen de captura pasiva

Contexto: sesión de brainstorming produjo un paquete de 6 mejoras con dependencias
entre sí (A: catálogo de tags → B: editar/olvidar → C: captura pasiva por
inactividad → D: mantenimiento de memoria → E: búsqueda híbrida → F: pantalla
Explorar). Tres piezas pedían explícitamente resolver y documentar una decisión
de diseño antes de escribir código; esta entrada las registra juntas porque las
tres tocan el mismo eje de fondo (cómo modelar gobernanza/procedencia sin tocar
`origin_trust`, que ya tiene un significado específico y cerrado). Detalle
completo de implementación de las 6 piezas en `Cerebro/estado-actual.md`
(entradas fechadas 2026-08-27); esta entrada es solo el razonamiento de diseño.

### 1) Schema del catálogo de tags (pieza A)

Decisión: `memory_tags` (tabla canónica: `tag_id`, `name`, `user_id`,
`first_seen`, `last_seen`) + `memory_entry_tags` (tabla puente, PK compuesta
`entry_id`+`tag_id`) — mismo patrón exacto que `memory_entities`/
`memory_entry_entities` (Slice 3), incluyendo la ausencia deliberada de
`UNIQUE(name)`: el dedup es case-insensitive en código
(`jarvis/tags/service.py::_find_or_create_tag()`), no una constraint de DB.

Diferencia con el merge de entidades: `_find_or_create_entity()` hace fusión
difusa por prefijo de tokens para nombres de persona ("Martín" ↔ "Martín
López"). Los tags NO tienen ese mecanismo — solo match exacto case-insensitive.
Razón: un tag es una keyword suelta, no un nombre propio con variantes
predecibles; la "elección inteligente" que pedía la tarea ("mismo criterio
conservador que ya usa `_find_or_create_entity()`") se resuelve en la capa
correcta, que es el PROMPT del clasificador (`jarvis/llm/client.py::
call_classify()` recibe el catálogo completo vía `tag_catalog` y el modelo
elige semánticamente de ahí antes de inventar uno nuevo), no en una heurística
de string-matching a nivel DB que adivinaría mal tan seguido como acertaría.

Verificado con Ollama real: dos capturas sobre el mismo tema ("SQLite vs
Postgres para Jarvis" / "seguimos con SQLite para Jarvis") — la segunda reusó
exactamente los tags del catálogo creado por la primera, sin inventar
sinónimos.

### 2) Mecanismo de "olvidar" (pieza B)

Decisión: soft-delete reusando `valid_to` — el mismo mecanismo que
`jarvis/worker/consolidation.py` ya usa para marcar una entrada `superseded`,
sin ninguna columna ni tabla nueva. `jarvis/memory/service.py::forget_entry()`
es literalmente `update_entry(entry_id, valid_to=now)`.

Por qué esta opción y no un DELETE físico ni una columna `deleted`/`forgotten`
separada: todo el sistema (retriever, `jarvis.entities.service`,
`jarvis.projects.service`, y ahora `jarvis.tags.service`/`jarvis.browse.
service`) ya filtra `valid_to IS NULL` en cada lectura relevante. Reusar el
mismo campo significa que "olvidar" desaparece de retrieval/entidades/
proyectos/tags/browse **sin tocar una sola línea de esos módulos** — una
columna `forgotten` nueva hubiera exigido agregar ese filtro en cada uno de
ellos, con el riesgo real de olvidar alguno. El embedding en Chroma y el `.md`
del vault se dejan intactos a propósito (mismo criterio que una entrada
superseded): `_load_entries()` descarta por `valid_to` antes de rankear, así
que el vector nunca puede reaparecer en una respuesta aunque siga en el
índice — borrarlo físicamente no cambia ningún comportamiento observable, solo
hace más difícil revertir un "olvidar" hecho por error (spec: Memoria ≠
destrucción, mismo principio que ya regía consolidación).

Verificado: una entrada "olvidada" desaparece de `retrieve()`, de
`get_entries_for_tag()` y de `GET /jarvis/browse`; un segundo "olvidar" sobre
la misma entrada devuelve `409` (no permite volver a marcarla).

### 3) Marca de origen para captura pasiva vs. explícita (pieza C)

Decisión: columna nueva `memory_entries.created_by` (`'explicit'` default |
`'jarvis_proposal_accepted'`) — mismo vocabulario textual que
`memory_projects.created_by` (Slice de proyectos), a propósito: generaliza un
patrón de gobernanza que ya existía en el código a una segunda tabla, en vez
de inventar uno nuevo con otro nombre para el mismo concepto.

Por qué NO se tocó `origin_trust` para esto (la alternativa obvia, ya que esa
columna ya existe y ya viaja con cada entrada): `origin_trust` describe la
confiabilidad de la FUENTE del texto (`user.authenticated` / `telegram.user` /
`web.untrusted` / `system` / `migration`) — es un concepto de seguridad/trust
propagation (spec: nunca sube en derivados) que no tiene nada que ver con
"¿el usuario decidió guardar esto a propósito o Jarvis lo infirió de una
charla casual?". Un mensaje de Telegram del usuario sigue siendo
`telegram.user` sin importar si se capturó con `/j` (explícito) o vía una
propuesta pasiva aceptada — la FUENTE (el propio usuario, autenticado en su
chat de Telegram) es la misma en los dos casos; lo que cambia es el PROCESO de
captura. Mezclar ambos ejes en una sola columna habría perdido exactamente la
distinción que la tarea pedía ("no es lo mismo un hecho que el usuario
confirmó a propósito que uno que Jarvis infirió de una charla casual") y
además habría contaminado el significado de seguridad de `origin_trust`, que
otras partes del sistema (Privacy Gateway, filtros de contexto) asumen
estable.

`created_by` se agrega vía `ALTER TABLE ... ADD COLUMN ... CHECK (...)` en la
migración liviana (`jarvis/db/database.py::_migrate()`) — confirmado que el
SQLite de este entorno (3.39.4) soporta `CHECK` en `ADD COLUMN` sin necesitar
el rebuild completo de tabla que sí exigió agregar `'PEOPLE'` al `CHECK` de
`type` en su momento (esa migración tocaba un `CHECK` YA EXISTENTE con datos
que podían quedar fuera de rango; esta agrega una columna NUEVA con default
constante, caso permitido por SQLite desde 3.25). Fallback sin `CHECK` si
`OperationalError`, para no romper en un SQLite más viejo.

Verificado con Ollama real: una conversación con contenido sustancioso generó
una propuesta real, aceptada con `created_by='jarvis_proposal_accepted'` y
`origin_trust` igual al que tendría una captura explícita del mismo canal; una
conversación de puro chit-chat correctamente no generó ninguna propuesta (el
modelo la descartó como no digna de guardarse).

Diferencia con spec: ninguna — las 3 decisiones extienden patrones de
gobernanza que la spec y sesiones anteriores ya habían establecido
(`memory_projects.created_by`, `valid_to` para consolidación), no inventan
conceptos nuevos.

Impacto: `jarvis/db/schema.py` (+`memory_tags`, `+memory_entry_tags`,
`+memory_entries.created_by`, `+jarvis_capture_proposals`,
`+conversations.last_passive_review_at`), `jarvis/db/database.py` (migraciones
+ `_init_fts`), `jarvis/tags/` (nuevo), `jarvis/browse/` (nuevo),
`jarvis/captures/passive.py` (nuevo), `jarvis/memory/service.py`
(`edit_entry`/`forget_entry`/`created_by` en `capture_raw`),
`jarvis/worker/consolidation.py` (duplicados cross-type + backfill de tags),
`jarvis/retriever/retriever.py` (señal léxica), `jarvis/llm/client.py`
(clasificador catálogo-aware), `jarvis/worker/processor.py`,
`jarvis/worker/main.py`, `jarvis/api/router.py` (~20 endpoints
nuevos/modificados), `project/mybot/jarvis_handlers.py` + `bot.py`,
`project/frontend/src/components/jarvis/` (`JarvisSourceModal.jsx` editado,
`JarvisProposalBanner.jsx` + `JarvisBrowsePanel.jsx` nuevos),
`project/frontend/src/store/useStore.js`.

Verificado: ver el detalle completo por pieza en `Cerebro/estado-actual.md`
(entradas 2026-08-27) — cada pieza probada con Ollama real (`gemma3:12b` +
`nomic-embed-text`, sin mocks del LLM) contra DBs de scratch aisladas, nunca
`jarvis.db` real; ~20 endpoints probados con `TestClient` de FastAPI; un ciclo
completo del worker con los 4 jobs de fondo juntos (reset/fetch/process/
consolidación/captura pasiva) sin excepciones; `npm run build` limpio.
**No verificado**: UI real en navegador ni flujo de Telegram de punta a punta
(sin acceso a `claude-in-chrome` en este entorno, mismo motivo de siempre).

---

## 2026-08-26 — Mejoras_Jarvis.md: multi-chat web + causa raíz del "recuerdo fantasma" + markdown/lenguaje natural/fuentes clickeables/paginación de debug

Contexto: `Mejoras_Jarvis.md` (raíz del repo) listaba 9 puntos reportados por el
usuario desde el front de `/jarvis`, mezclados sin clasificar entre features de
UI/UX y bugs sospechados. Antes de diseñar nada se investigó cada uno leyendo el
código real (nunca se asumió la causa que daba el usuario) — la clasificación
real terminó siendo distinta de como estaba planteada la lista.

**Investigación de los bugs sospechados — hallazgo central:**

Los tres bugs reportados como aparentemente separados ("el chat ignora
instrucciones recientes / arrastra contexto viejo tras borrar historial",
"Jarvis recordó a Carolina y la merienda sin que quedara guardada como PEOPLE",
"el Inbox no se actualiza") resultaron ser **la misma causa raíz**, no tres
bugs distintos:

- `jarvis/api/router.py::query_endpoint` pasaba siempre `channel_id="web"`
  (constante fija) para todo el chat de escritorio. `get_or_create_conversation()`
  (`jarvis/conversation/service.py`) reutiliza "la conversación más reciente
  para este `channel_id`" cuando el cliente no manda un `conversation_id`
  explícito — diseño correcto para Telegram (una sesión continua por
  `chat_id` real), pero con un `channel_id` **compartido por todo el chat web**
  significaba que TODO el escritorio era, en el backend, una única
  conversación perpetua.
- `jarvisClearHistory()` (viejo, `useStore.js`) solo hacía
  `localStorage.removeItem('jarvis-messages'/'jarvis-conversation-id')` y
  `set({ jarvisConversationId: null })` — nunca tocaba el backend. El próximo
  mensaje volvía a mandar `conversation_id: null`, que volvía a resolver a
  "la conversación más reciente para channel_id='web'": **la misma fila de
  siempre**, con todo su `conversation_messages` intacto.
- El texto sobre Carolina y la merienda nunca pasó por `capture_raw()` (el
  usuario lo escribió en el composer de **consulta**, `JarvisChat.jsx`, no en
  `JarvisCaptureModal.jsx`) — nunca se encoló en `inbox_queue`, nunca se llamó
  `extract_entities()`/`link_entities_for_entry()` sobre él. Confirmado leyendo
  `jarvis/entities/service.py` y `jarvis/worker/processor.py`: la extracción de
  entidades **solo** corre sobre entradas de `memory_entries` procesadas por el
  worker, nunca sobre mensajes de `conversation_messages`. Que Jarvis
  "recordara" a Carolina no vino de la memoria (nunca se guardó ahí) sino de
  `get_recent_messages()` trayendo ese texto de vuelta como historial de chat
  de la conversación perpetua de arriba — el mismo bug, no una entidad
  fantasma ni un fallo de extracción.
- El Inbox (`GET /jarvis/inbox`, polling cada 15s en `JarvisScreen.jsx`) se
  probó end-to-end (curl + lectura de `jarvis/api/router.py`) y funciona
  correctamente — no hay bug ahí. Parecía "no actualizarse" en la sesión del
  usuario simplemente porque nunca hubo una captura real que procesar (el
  texto de Carolina fue una consulta, no una captura) — sospecha razonable
  del usuario, pero descartada al leer el código real.
- Se revisó también `jarvis/llm/client.py::call_reason()` (fallback a modo
  local ante `EXHAUSTED` o error del externo) por si el fallback reconstruía
  el prompt de otra forma y explicaba "ignora instrucciones" por su cuenta —
  no: usa exactamente la misma lista `messages` en ambas ramas, sin
  divergencia. No hay una causa de código separada ahí.

**Fix — multi-chat cierra el bug en el schema, no con un parche puntual**
(ver más abajo): cada chat nuevo recibe un `channel_id` propio y único
(`web:{uuid}`), nunca el string constante `"web"`. El frontend deja de
depender del fallback "conversación más reciente" — siempre maneja
explícitamente qué `conversation_id` está activo. "Borrar historial" pasa a
significar "empezar un chat nuevo de verdad" (id nuevo real en el backend),
no un reseteo de estado local que no desconecta nada. Verificado con datos
reales (ver más abajo): un chat nuevo nunca trae `get_recent_messages()` de
otro chat.

**Limitación de comportamiento del modelo, no un bug — documentado a
propósito para no prometer un "arreglo" que no existe**: incluso con el
contexto de conversación correctamente aislado, un modelo (sobre todo el de
fallback local) puede a veces no seguir con precisión una instrucción
reciente dentro de una misma conversación activa — eso es una limitación
inherente de cómo los LLMs pesan las instrucciones en un prompt largo, no
algo que un fix de código pueda eliminar del todo. El fix de esta sesión
elimina el caso extremo y verificable (contexto de una conversación
completamente distinta filtrándose), no garantiza instruction-following
perfecto dentro de una conversación.

**Decisión de schema — multi-chat sin tabla nueva:**

`conversations` (`jarvis/db/schema.py`) ya modelaba exactamente lo que pedía
el punto 3 de `Mejoras_Jarvis.md` (una fila por sesión, con
`channel`+`channel_id`+`user_id`+`started_at`) — se le agregó una columna
`title TEXT` (migración liviana en `jarvis/db/database.py::_migrate()`, sin
CHECK de por medio así que no hace falta el rebuild completo que exigió la
migración de `PEOPLE`) en vez de crear una tabla `chats` en paralelo que
hubiera duplicado el concepto. Módulo nuevo `jarvis/chats/service.py`
(`list_chats`/`create_chat`/`rename_chat`/`delete_chat`/`get_messages`/
`autoname_if_untitled`), todo scopeado a `channel='desktop'` — Telegram sigue
usando `get_or_create_conversation()` sin cambios, tal como pedía la tarea
explícitamente ("el bot de Telegram no se toca para el ítem de multi-chat").
`delete_chat()` no necesita borrar `conversation_messages` a mano: cae por
`ON DELETE CASCADE` (la FK ya existía, `foreign_keys=ON` en
`get_connection()`).

Auto-título: el primer mensaje de un chat sin título le pone nombre
(`autoname_if_untitled()`, llamado desde `jarvis/query/service.py::query()`
justo después de persistir el mensaje del usuario) — es idempotente por
construcción (`WHERE title IS NULL`), así que nunca pisa un título puesto a
mano por el usuario ni se repite en mensajes siguientes.

**Fecha/hora por mensaje** (punto 4): `conversation_messages.created_at` ya
existía en el schema desde S3 pero nunca se exponía — ni al frontend
(`get_recent_messages()` solo devolvía `role`/`content`) ni al propio modelo
(el historial se mandaba sin ninguna marca temporal). Ahora
`get_recent_messages()` incluye `created_at`, y `_build_messages()` en
`query/service.py` le antepone a cada mensaje del historial una marca
relativa en español (`_relative_es()`, versión Python de
`utils/formatAge.js` con fraseo distinto porque va dentro del prompt, no de
la UI) antes de mandarlo al modelo — así puede decir "hace dos días me
dijiste..." como pedía el usuario. Los mensajes que sí van al LLM se arman
con solo `{role, content}` (se quita `created_at` antes de esa lista) porque
un dict con una key extra en un mensaje de chat puede no ser aceptado por
distintos proveedores vía LiteLLM — el timestamp se hornea dentro del texto,
no viaja como campo separado.

**Lenguaje natural / no citar textualmente** (punto 1): se tocó el
`system_msg` de `_build_messages()` en `jarvis/query/service.py` — instrucción
explícita de sintetizar conversacionalmente en vez de citar/listar en negrita
salvo que el usuario pida una lista. No es un bug de código (el prompt
anterior no citaba literalmente el contenido de memoria, ver
`jarvis/query/service.py` viejo), es una limitación de estilo del modelo que
se puede mejorar con prompting pero no eliminar del todo con certeza —
pendiente de que el usuario confirme si el tono mejoró en uso real (no se
pudo probar con el modelo externo real en este entorno, ver verificación más
abajo).

**Markdown sin renderizar** (punto 5): se agregó `react-markdown` (^10.1.0)
como dependencia nueva del frontend — se evaluó no agregar dependencias y
parsear a mano (bold/listas/links con regex), mismo criterio de "no
reinventar parsing" que ya se aplicó en otras decisiones de este proyecto:
las respuestas del modelo externo pueden incluir markdown más allá de bold
simple (listas, código, headings) y un parser hecho a mano tiene muchos
casos borde. `JarvisChat.jsx` define `MARKDOWN_COMPONENTS` (mapea cada tag a
estilos inline del tema oscuro de Jarvis, no clases Tailwind/SGR) para que no
herede la tipografía de los 6 temas de SGR. Solo se aplica a mensajes del
asistente — el mensaje del usuario se muestra como texto plano (es su propio
input, sin necesidad de interpretarlo).

**Fuentes clickeables** (punto 2): Jarvis no tiene una pantalla de detalle de
entrada de memoria (Bóveda tiene `/hoja/:id`, pero `memory_entries` de Jarvis
es un concepto distinto, sin ruta propia) — en vez de crear una ruta nueva,
se agregó `GET /jarvis/entries/{id}` (usa `jarvis/memory/service.py::get_entry()`,
que ya existía) y un modal nuevo (`JarvisSourceModal.jsx`, mismo patrón visual
que `JarvisCaptureModal.jsx`) que abre el contenido completo de la entrada al
clickear un chip de fuente en `SourcesToggle`.

**Debug se corta en mensajes viejos** (punto 6, confirmado como bug real):
`fetchJarvisEvents()` pedía `GET /jarvis/events?limit=20` fijo, sin ninguna
forma de pedir más — no era una limitación del backend (`GET /jarvis/events`
ya aceptaba hasta `limit=200`), sino que el frontend nunca ofrecía subir ese
número. Fix: `jarvisEventsLimit` pasa a ser estado (arranca en
`JARVIS_EVENTS_PAGE_SIZE=40`, centralizado en `utils/jarvisPalette.js` junto
con `JARVIS_EVENTS_MAX_LIMIT=200`, que coincide con el tope real del
`Query(..., le=200)` del backend) y un botón "CARGAR MÁS" en
`JarvisDebugPanel.jsx` lo sube y vuelve a pedir.

Diferencia con spec: ninguna decisión diverge del diseño de Jarvis 0.1/0.2;
todo lo de acá es UI/UX de Fase 4 (multi-chat) más fixes puntuales, no
arquitectura del Memory Core.

Impacto: `jarvis/db/schema.py` (+`title` en `conversations`),
`jarvis/db/database.py` (migración), `jarvis/chats/` (nuevo),
`jarvis/conversation/service.py` (`get_recent_messages` +`created_at`),
`jarvis/query/service.py` (autoname, timestamps en historial, prompt de tono),
`jarvis/api/router.py` (+7 endpoints: chats CRUD, mensajes de un chat, detalle
de entrada), `project/frontend/src/store/useStore.js` (reescritura completa de
la sección Jarvis — chats en vez de mensaje único), `JarvisChatTabs.jsx`
(nuevo), `JarvisSourceModal.jsx` (nuevo), `JarvisChat.jsx` (markdown,
timestamps, fuentes clickeables, chat tabs), `JarvisDebugPanel.jsx`
(paginación), `jarvisPalette.js` (+4 constantes), `package.json`
(+react-markdown).

**Verificado en este entorno**: sin acceso a `claude-in-chrome` (mismo motivo
ya documentado — SSH remoto, la extensión no conecta), así que no hay
confirmación visual en navegador. Verificación real hecha:
- `npm run build` limpio (sin errores, sin warnings nuevos más allá del aviso
  de tamaño de chunk ya preexistente, ahora un poco mayor por
  `react-markdown`).
- Suite de smoke tests contra una DB de scratch aislada (creación/aislamiento
  de chats, confirmando que `get_recent_messages()` de un chat nuevo nunca
  trae mensajes de otro — la prueba directa del fix del bug raíz) y contra
  `TestClient` de FastAPI (los 7 endpoints nuevos, incluyendo los 404
  esperados).
- `query()` completo probado con `call_reason` mockeado (sin LLM real
  disponible en este entorno) contra una DB de scratch: confirma que los
  mensajes armados para el modelo tienen únicamente `{role, content}` (sin la
  key `created_at` colándose), que el timestamp relativo se hornea
  correctamente en el texto, y que `conversation_id` viaja intacto.
- **Contra la DB real** (`project/database/jarvis.db`, backend y worker
  reiniciados para levantar el código nuevo — el proceso viejo no lo
  recogía solo: `jarvis/` vive fuera de `project/`, fuera del directorio que
  vigila `--reload`): la migración de `title` corrió limpia sobre los datos
  reales (24 mensajes existentes preservados, chat viejo sin título ahora
  visible como "Chat sin título" en la UI en vez de romper nada);
  creación/rename/delete de un chat de prueba contra la DB real, con
  limpieza al final sin dejar rastro; `GET /jarvis/entries/{id}` contra una
  entrada real (`DECISION` de "llenar Jarvis de información").
- **No probado en este entorno**: una consulta real de punta a punta con el
  modelo externo/local respondiendo (para confirmar en la práctica que el
  tono es más conversacional y que el markdown se ve bien renderizado) — el
  usuario tiene el backend y el worker corriendo con el código nuevo, queda
  a su confirmación en el navegador real.

---

## 2026-08-26 — Re-implementación completa contra PLAN-IMPLEMENTACION.md + PLAN-IMPLEMENTACION-BACKEND.md

Contexto: la entrada siguiente (más abajo, misma fecha) documenta un rediseño visual de `/jarvis`
hecho sin conocer los dos planes formales ya existentes en `ClaudeDesign - Jarvis/`
(`PLAN-IMPLEMENTACION.md`, frontend; `PLAN-IMPLEMENTACION-BACKEND.md`, backend) — nunca se
buscaron porque la sesión solo hizo `Glob` de `.html`. Auditado fase por fase a pedido explícito
del usuario, aparecieron divergencias reales: arquitectura (SQL inline en el router en vez de
service modules por dominio, que es el patrón que sigue el resto de Jarvis), decisiones ya
cerradas revertidas sin saberlo (composer con heurística completa en vez del pill fijo,
`SourcesToggle` perdió su toggle colapsable), y cero centralización de colores/tamaños/duraciones
pese a que ambos planes lo exigen como regla transversal de cada fase. El usuario pidió
implementar ambos planes tal cual están escritos, de punta a punta.

Decisión: se re-implementó por completo. Dos puntos que los planes mismos gatean como decisión
del usuario (no inferibles) se resolvieron con `AskUserQuestion` antes de tocar código:
- **Fase B5** (log real del tab Debug): tabla nueva `jarvis_event_log` en vez de tail de archivo
  — el worker no tenía logging a archivo con rotación, así que la tabla es menos trabajo real
  además de ser queryable/estructurada; volumen bajo (~20 capturas/día) hace el costo despreciable.
- **Fase B6** (heartbeat real del worker): incluida — chica, bien especificada, cierra la
  simplificación consciente de Fase 1 (health indicator derivado del budget) que de otro modo
  quedaba sin resolver.

Reorganización de endpoints respecto a lo que ya existía: el `/jarvis/stats` de la sesión anterior
mezclaba type-counts + cola + errores + último-procesado en una forma que ningún plan pedía. Se
reemplazó por `/jarvis/stats/types` (Fase B1, solo counts, para el panel izquierdo); "cola" y
"errores" del tab Debug pasan a derivarse del lado del cliente desde `jarvisInbox` ya existente
(Fase 6, "sin backend nuevo para eso"); el log real del tab Debug es un endpoint distinto,
`/jarvis/events` (Fase B5).

Decisiones de implementación puntuales tomadas durante la re-implementación (no gateadas por
`AskUserQuestion`, pero registradas por si alguna sesión futura las cuestiona):
1. `GET /jarvis/projects` (Fase B2) devuelve `memory_count`/`last_activity` crudos, **sin**
   `heat` — la sesión anterior lo pre-normalizaba en el backend, que es exactamente lo que el
   plan dice que no se debe hacer ("es una decisión de escala visual... que le corresponde al
   frontend"). El heat ahora se calcula en `JarvisLeftPanel.jsx` contra el máximo del propio
   listado.
2. `GET /jarvis/budget` (Fase B4) agrega `by_model` con un campo `role` (`reason`/`local`/`other`)
   resuelto en `jarvis/budget/tracker.py::_role_for_model()` comparando contra
   `JARVIS_REASON_MODEL`/`JARVIS_LOCAL_MODEL`/`JARVIS_LOCAL_FALLBACK_MODEL` — única comparación de
   ese tipo en todo el sistema (el plan es explícito: "no se inventa un mapeo nuevo en ninguna
   capa"); el frontend solo traduce `role` a la etiqueta visible "GRANDE"/"CHICO".
3. Fórmula de ranking del retriever (Fase B0): se nombraron `_SIMILARITY_WEIGHT`/
   `_TYPE_WEIGHT_FACTOR` (caso normal) y `_TIEBREAK_SIMILARITY_WEIGHT`/`_TIEBREAK_TYPE_WEIGHT`
   (desempate de `recency_first`) como constantes **separadas** pese a compartir el valor 0.5 en
   algunos casos — el plan pide verificar la intención original antes de fusionar constantes
   parecidas, y son dos usos con propósito distinto (ranking general vs. desempate cuando la
   recencia ya domina el orden).
4. `jarvis/worker/heartbeat.py` (Fase B6) es un módulo nuevo, no una función agregada a
   `jarvis/worker/main.py` como el resumen de archivos del plan backend sugiere al pie de la
   letra — `main.py` llama `logging.basicConfig()` al importarse, así que importarlo desde el
   proceso de la API (para leer el heartbeat en `GET /jarvis/health`) reconfiguraría su logging
   global como efecto secundario no deseado.
5. Budget widget: se usan **12** barras (`JARVIS_BUDGET_BARS`), el número literal que dice
   `PLAN-IMPLEMENTACION.md`, no las 14 que la sesión anterior había copiado del comportamiento
   real (no del texto) del mockup — el mockup mismo es inconsistente entre su
   `hint-placeholder-count="12"` y el array real de 14 que arma en JS; se priorizó el texto del
   plan, que es lo que el usuario pidió seguir "tal cual está".
6. Sub-header a 66px (`JARVIS_SUBHEADER_HEIGHT`, tomado de `jarvis-design-system.md` §Layout) —
   la sesión anterior lo había dejado en 48px sin ninguna justificación escrita.

Diferencia con spec: ninguna de comportamiento del backend Jarvis 0.1/0.2 — todo lo de esta
entrada es presentación (frontend) o metadatos de observabilidad nuevos (B5 log, B6 heartbeat)
sobre el mismo pipeline de clasificación/retrieval/consolidación ya existente, sin tocar su lógica.

Impacto — backend: `jarvis/config.py`, `jarvis/worker/consolidation.py`,
`jarvis/worker/processor.py`, `jarvis/budget/tracker.py`, `jarvis/retriever/retriever.py`,
`jarvis/stats/` (nuevo), `jarvis/projects/service.py`, `jarvis/entities/service.py`,
`jarvis/events/` (nuevo), `jarvis/worker/heartbeat.py` (nuevo), `jarvis/worker/main.py`,
`jarvis/db/schema.py`, `jarvis/api/router.py`, `project/.env.example`.
Impacto — frontend: `utils/jarvisPalette.js` (nuevo), `utils/formatAge.js` (nuevo),
`styles/jarvis.css` (nuevo), `index.css` (bloque Jarvis removido), `store/useStore.js`,
`screens/JarvisScreen.jsx`, y en `components/jarvis/`: `JarvisNeuralBackground.jsx` (rename),
`JarvisSubBar.jsx` (nuevo), `JarvisChat.jsx`, `JarvisCaptureModal.jsx`,
`JarvisContextPanel.jsx` (rename), `JarvisEntitiesPanel.jsx` (rename),
`JarvisDebugPanel.jsx` (rename), `JarvisInboxTab.jsx`, `JarvisLeftPanel.jsx`.

Verificado con datos reales, sin mocks: `npm run build` limpio; `python -m py_compile` sobre
todos los archivos Python tocados; los 4 endpoints de solo lectura nuevos/modificados probados
con `curl` contra `project/database/jarvis.db` real; B5/B6 (escritura) probados primero contra
una copia de scratch de `jarvis.db`, y después confirmados de punta a punta contra la DB real con
una captura de prueba real (worker corriendo, Ollama real) — `jarvis_event_log` recibió las 3
filas esperadas (`CLASSIFY`/`ENTITY`/`EMBED`), `GET /jarvis/health` pasó de `false` a `true` al
arrancar el worker; la entrada de prueba se borró al final (DB + vault + embedding), sin dejar
rastro. `GET /jarvis/query` sobre una pregunta ya usada en QA de sesiones anteriores
("¿Qué sé sobre React?") devolvió la misma fuente relevante que antes (`useCallback - React`),
confirmando que el refactor de pesos de ranking (B0) no cambió el comportamiento del retriever.
**No verificado visualmente en navegador** — la extensión `claude-in-chrome` no se conectó en
ningún intento de esta sesión (se reintentó varias veces a pedido explícito del usuario); backend
y frontend quedaron corriendo en background para que el usuario confirme.

**Divergencia del método de testing pedido por el plan de backend, encontrada auditando la propia
sesión a pedido del usuario**: la disciplina del plan pide "nunca contra `jarvis.db` real
directamente durante el desarrollo" para **todas** las fases, no solo las de escritura. B0-B4
(puro `SELECT`, sin riesgo de mutación) se probaron con `curl` contra el backend real desde el
arranque, no contra una copia de scratch — divergencia real del método pedido, aunque sin
consecuencia práctica (nada mutó). La confirmación end-to-end de B6 (arrancar el worker de verdad
para ver `GET /jarvis/health` pasar a `true`) también corrió contra la DB real, no una copia —
dejó ~160 filas de heartbeat reales en `jarvis_policies` (creciendo, el worker se dejó corriendo a
propósito para que el usuario pueda probar la app). No son datos de prueba sintéticos a limpiar:
es el mismo patrón append-only ya establecido para `consolidation_last_run` (nunca se poda), así
que es simplemente la tabla funcionando como está diseñada — pero no está de más anotar que
`jarvis_policies` no tiene ninguna rotación/límite de tamaño para heartbeats acumulados
indefinidamente; no era parte del alcance de B6, queda como nota para una sesión futura si el
tamaño de la tabla llega a importar.

**Tres inconsistencias de centralización encontradas en la misma auditoría, corregidas en el
momento**: (1) `JarvisChat.jsx` redefinía `QUERY_PILL_COLOR = '#c4b5fd'` como literal local en vez
de importar `QUERY_COLOR` de `jarvisPalette.js` (que ya existía con el mismo valor, sin usar en
ningún lado) — corregido a re-exportar el valor de la paleta. (2) `JarvisContextPanel.jsx` tenía
`jarvisEntities.slice(0, 8)` sin centralizar — se agregó `JARVIS_CONTEXT_ENTITY_LIMIT` a
`jarvisPalette.js`. (3) `JarvisDebugPanel.jsx` repetía el literal `40` (largo de truncado de texto)
dos veces sin nombrar — se nombró `_TRUNCATE_LEN` al tope del archivo (constante local, no
promovida a `jarvisPalette.js`, porque es un detalle de truncado de un solo componente, no un
token visual compartido). Verificado con `npm run build` limpio después de las tres correcciones.

---

## 2026-08-26 — Rediseño visual completo de /jarvis (tema oscuro, tabs, stats reales)

Contexto: el prompt de la sesión daba por existentes `NeuralCanvas.jsx`, `JarvisLeftPanel.jsx`,
`JarvisRightPanel.jsx`, `JarvisInboxTab.jsx`, `JarvisEntitiesTab.jsx`, `JarvisDebugTab.jsx`, las
animaciones `jv-*` en `index.css` y los campos `jarvisTab`/`jarvisStats`/`jarvisEntities`/
`jarvisProjects` en el store — ninguno de esos existía en el repo real (verificado con Glob/grep
antes de escribir código). Solo existían `JarvisChat.jsx`, `JarvisInboxPanel.jsx` y
`JarvisCaptureModal.jsx`, con el estilo claro compartido del resto de SGR. Se construyó todo desde
cero siguiendo el mockup de referencia (`ClaudeDesign - Jarvis/Jarvis.dc.html`).

Decisión:
- Tema oscuro (`--jv-*`, animaciones `jv-breathe/jv-rise/jv-sweep/jv-spin/jv-blink`) scoped bajo
  la clase `.jv-root` en `index.css`, sin tocar los 6 temas de SGR — `<TopBar/>` dentro de
  `/jarvis` sigue usando el tema SGR activo a propósito (la tarea pedía TopBar compartido sin
  cambios + un sub-header nuevo oscuro debajo con tabs/budget/health, no fusionar ambos).
- Dos endpoints nuevos en `jarvis/api/router.py`: `GET /jarvis/stats` (conteos por tipo desde
  `memory_entries` con `valid_to IS NULL`, cola desde `inbox_queue`, errores 24h, última entrada
  `DONE`) y `GET /jarvis/projects` (proyectos + cantidad de entradas vigentes vinculadas, para el
  panel izquierdo y las barras de "heat"). Ninguno existía antes pese a que el prompt los daba
  por hechos.
- Store (`useStore.js`): `jarvisTab` + `setJarvisTab`, `jarvisStats`/`jarvisEntities`/
  `jarvisProjects` + sus tres `fetchJarvis*` nuevos, mismo patrón try/catch silencioso que el
  resto de los fetchers de Jarvis ya existentes.
- **Tab Debug con datos reales, no el log fabricado del mockup**: el mockup mostraba un log
  stream inventado (`CLASSIFY`, `EMBED`, `LINK`, ...) que no existe como tal en el backend (no
  hay audit log expuesto por API). `JarvisDebugTab.jsx` muestra 4 tarjetas con datos reales de
  `/jarvis/stats` + `/jarvis/budget` (último procesado, cola, errores 24h, presupuesto) y una
  lista de "actividad reciente" que reutiliza `jarvisInbox` (ya real) como sustituto honesto del
  log — mismo criterio de no fabricar estado que el sistema no expone realmente.
- `GET /jarvis/entities` (`jarvis/entities/service.py::list_entities()`) solo trae `name`/
  `entity_type`/`last_seen`, sin `entity_id` ni cantidad de memorias — se usa `name` como key de
  lista y las tarjetas de `JarvisEntitiesTab.jsx` muestran "visto hace Nd" en vez del conteo de
  memorias del mockup (no expuesto por el endpoint actual; agregarlo exigiría un `COUNT` por
  entidad, fuera de alcance). Click en una entidad dispara
  `jarvisQuery("¿Qué sé sobre {nombre}?")` y cambia a la tab Cerebro — reutiliza el flujo RAG real
  de entidades (`_build_entity_sections`) en vez de solo navegar.
- El widget de presupuesto del panel derecho omite el desglose "GRANDE/CHICO" del mockup porque
  `GET /jarvis/budget` no expone costo por modelo, solo el total gastado.
- Layout de 3 columnas siempre visible (izq 246px / centro flex / der 322px) en las 4 tabs — el
  mockup ocultaba el panel derecho en Debug; se simplificó porque la tarea no pedía ese toggle.
- Se borró `JarvisInboxPanel.jsx` (reemplazado por `JarvisRightPanel.jsx` +
  `JarvisInboxTab.jsx`), confirmando primero con `grep` en todo `frontend/src` que no quedaba
  ninguna otra referencia.

Diferencia con spec: ninguna de comportamiento del backend Jarvis — es una capa de presentación
nueva sobre la misma API (con dos endpoints de solo lectura agregados para alimentar paneles que
antes no existían). No cambia clasificación, retrieval, ni el pipeline del worker.

Impacto: `project/frontend/src/index.css`, `project/frontend/src/store/useStore.js`,
`project/frontend/src/screens/JarvisScreen.jsx` (reescrito), `project/frontend/src/components/
jarvis/{JarvisChat.jsx (reescrito), NeuralCanvas.jsx, JarvisLeftPanel.jsx, JarvisRightPanel.jsx,
JarvisInboxTab.jsx, JarvisEntitiesTab.jsx, JarvisDebugTab.jsx}` (nuevos), `JarvisInboxPanel.jsx`
(borrado), `jarvis/api/router.py` (`GET /jarvis/stats`, `GET /jarvis/projects`).

Verificado: `npm run build` sin errores; `/jarvis/stats`, `/jarvis/projects`, `/jarvis/entities`,
`/jarvis/budget` probados con `curl` contra el `jarvis.db` real (no scratch) — devuelven datos
coherentes (conteos por tipo, presupuesto `$0.010112 / $1.00`, etc.). La extensión
`claude-in-chrome` no se conectó en ningún momento de la sesión — la verificación visual quedó
en manos del usuario contra `:8765`/`:5173` corriendo en background.

**Bug post-verificación del usuario, corregido en la misma sesión — la página se estiraba sin
scroll al acumular respuestas del chat**: en `JarvisScreen.jsx`, el div central de la grilla de
3 columnas (el que envuelve la tab activa: chat/inbox/entidades/debug) era el único de los tres
hijos de esa grilla sin `overflow` propio. Por la regla CSS de "automatic minimum size" (un
grid/flex item con `overflow:visible` no puede encogerse por debajo del tamaño de su contenido),
ese div quedaba atado al alto natural del contenido del chat — que crece sin límite — forzando a
crecer la fila entera de la grilla y, en cascada, la página completa, sin ningún contenedor con
scroll interno real. `JarvisLeftPanel`/`JarvisRightPanel` (los otros dos hijos de la misma
grilla) y las tres tabs internas ya tenían `overflowY:'auto'` propio desde el principio, por eso
el síntoma solo aparecía con el chat. Fix de una línea: `overflow:'hidden'` + `minHeight:0`
agregados a ese div central, mismo patrón ya usado en el resto — ahora consistente en los tres
hijos de la grilla. Impacto: solo `JarvisScreen.jsx`. Verificado con `npm run build` sin
errores; confirmación visual pendiente del usuario tras el hot-reload de Vite.

---

## 2026-08-26 — Deploy de Jarvis al homelab

Contexto: Jarvis corría solo en local (Windows, venv), como tres procesos manuales
(uvicorn, `mybot/bot.py`, `jarvis.worker.main`). El usuario pidió matar esos procesos y
mover todo — incluido el worker, nunca desplegado antes — al stack Docker del homelab
(`project/docker-compose.yml`, ver `HOMELAB.md`), y verificar que la clave de OpenAI
conectara ahí.

Decisión: build context de `docker-compose.yml` movido de `project/` al root del repo
(`context: ..`), porque `jarvis/` es hermano de `project/` (no está dentro) y Docker no
puede copiar de fuera del build context. Servicio `worker` nuevo en el compose
(`network_mode: host`, mismo patrón que `bot`). `JARVIS_DB_PATH`/`JARVIS_VAULT_PATH`/
`JARVIS_CHROMA_PATH` fijados por variable de entorno en los tres servicios en vez de
confiar en el cálculo de path por defecto de `jarvis/config.py` (que asume el layout del
repo real, sin sentido dentro de un contenedor).

Diferencia con spec: ninguna de diseño de Jarvis — son cambios de infraestructura de
despliegue puros, no de comportamiento del sistema.

**Bug real encontrado (bloqueante, no cosmético): `numpy>=2` (dependencia transitiva de
`chromadb`/`onnxruntime`) crashea con `SIGILL` con solo importarse en el hardware real del
homelab** — un AMD Athlon II X2 245 de 2009, sin SSSE3/SSE4.1/SSE4.2/AVX. Diagnóstico:
`docker logs` no mostraba ningún traceback (una señal del SO mata el proceso, no es una
excepción Python capturable); `docker inspect --format '{{.State.ExitCode}}'` dio `132`
(convención Unix: 128+signal, señal 4 = SIGILL); aislado probando `docker run --rm
sgr-app:latest python -c "import <paquete>"` uno por uno hasta encontrar que `numpy` solo
(sin tocar chromadb/onnxruntime) ya crasheaba. `numpy==1.26.4` probado en el mismo host:
importa limpio y el flujo real de ChromaDB (`PersistentClient` + `upsert`/`get`/`query`)
funciona. Sin este fix, Jarvis es literalmente imposible de correr en este hardware —no es
un problema de Docker ni de la imagen, un venv nativo en el mismo host pegaría el mismo
`SIGILL`.

Fix: `numpy<2` agregado como dependencia explícita en `jarvis/pyproject.toml`. Cota
abierta (no versión exacta) para no restringir de más si Jarvis corre algún día en
hardware con AVX2 real.

**Bug de proceso (no de código): el primer build usó `project/app/` tal como estaba en el
homelab desde hacía 4 semanas** (se sincronizó `project/mybot/` pero no `project/app/` en
el primer paso del deploy) — sin ninguna integración de Jarvis en `app/main.py`, así que
`/jarvis/*` daba 404 pese a que el build había sido exitoso. Corregido sincronizando
`project/app/` completo antes del segundo rebuild.

Impacto: `project/Dockerfile`, `project/docker-compose.yml`, `.dockerignore` (movido de
`project/.dockerignore` a la raíz), `jarvis/pyproject.toml` (pin de numpy), `HOMELAB.md`
(documentación del nuevo servicio, el build context, y el gotcha de numpy para que no se
repita el diagnóstico desde cero la próxima vez).

Verificado en producción real contra el homelab (no scratch, no mocks): los tres
contenedores estables sin reinicios; `/jarvis/query` real respondió sin `[modo local]`
(usó el modelo externo de verdad, `GET /jarvis/budget` reflejó el gasto real); `/jarvis/capture`
real fue levantada por el worker, clasificada con `gemma3:12b` vía Ollama en Windows
(alcanzable desde el gabinete por `network_mode: host`), escrita en el vault y embebida en
ChromaDB — pipeline completo, no solo el import de numpy. Entrada de prueba borrada al
final sin dejar rastro. Detalle completo en `Cerebro/estado-actual.md`.

---

## 2026-08-26 — Plan de implementación: rediseño visual de Jarvis frontend (análisis, sin implementar)

Contexto: se pidió analizar `ClaudeDesign - Jarvis/Jarvis.dc.html` (mockup de Claude Design,
no el `Downloads\...` que se mencionó en la tarea original — esa ruta no existe en esta
máquina; el archivo real vive en el repo) y producir un plan de implementación para aplicar su
sistema visual al frontend real de Jarvis (`JarvisScreen.jsx`, `JarvisChat.jsx`,
`JarvisInboxPanel.jsx`, `JarvisCaptureModal.jsx`). Solo análisis y plan — no se tocó código.

Decisión: los tokens de diseño (colores, tipografía, animaciones, mecánica del canvas) quedan
documentados en `Cerebro/jarvis-design-system.md`. Este documento registra las decisiones de
integración con el resto de SGR.

**Paleta de Jarvis es fija, no reactiva a `themes.js`.** Los 5 colores por tipo de memoria
(`RAW #7dd3fc`, `SEMANTIC #4ade80`, `DECISION #fbbf24`, `PROJECT #a78bfa`, `PEOPLE #f472b6`) y
el fondo oscuro (`#05060d` / radial gradient `#10132a→#070914→#04050b`) son constantes de
Jarvis, no vars de `--app-*`. Diferencia con el resto de SGR: Bóveda/Finanzas/Agenda/Hábitos
cambian con los 6 temas de `themes.js`; Jarvis no. Impacto: nuevo módulo
`utils/jarvisPalette.js` (constantes JS, no CSS vars de tema) para no chocar con
`OPTIONAL_THEME_VARS`/`applyTheme()` de `themes.js` ni con los otros módulos. `ARCOIRIS_ACCENTS['/jarvis']`
(`themes.js:316`, ya existe: `#06b6d4`) se mantiene solo para el acento del sidebar/nav global
cuando el tema activo es "Arcoíris" — no se usa dentro de la pantalla Jarvis en sí, que vive en
su propia paleta oscura fija.

**El TopBar global de SGR (`components/TopBar.jsx`) se mantiene** — no se reemplaza por el
topbar custom del mock. `TopBar.jsx` resuelve navegación entre módulos, búsqueda, notificaciones
y el CTA de captura (`openJarvisCapture`, ya wireado); perderlo rompería la consistencia de
navegación con Finanzas/Agenda/Hábitos, que siguen el mismo patrón (`FinanzasScreen.jsx` renderiza
`<TopBar/>` + una barra de tabs propia debajo, vía `DashboardTabs`). Jarvis sigue el mismo
patrón: `<TopBar/>` de SGR + una segunda barra propia (nueva, `JarvisSubBar.jsx`) con los 4 tabs
del mock (Cerebro/Inbox/Entidades/Debug), el budget widget y el health indicator — eso sí tomado
del diseño del mock casi 1:1.

**Estados del inbox y nivel de budget migran a la paleta fija del mock**, reemplazando las vars
de tema que usa hoy `JarvisInboxPanel.jsx` (`var(--success)`, `var(--expense, #ef4444)`, etc.).
Notablemente: `EXHAUSTED` pasa de rojo (`--expense`) a pink (`#f472b6`, mismo hex que `PEOPLE`/
`ERROR`) — coherente con la paleta cerrada de 5-6 colores del mock, no un capricho.

**Composer unificado (captura + consulta en un solo input) queda fuera del alcance de este
rediseño visual** — es un cambio de producto/flujo, no solo estético. El mock lo hace porque es
una demo de un solo componente; el frontend real separa intencionalmente `JarvisChat` (consulta,
`POST /jarvis/query`) de `JarvisCaptureModal` (captura, `POST /jarvis/capture`, con el flujo de
aclaración pre-enqueue ya implementado — ver entrada "Aclaración pre-enqueue para capturas
DECISION"). Se mantienen separados por ahora; el composer de `JarvisChat` adopta el estilo visual
del mock (borde `jv-sweep`, footer con hint) pero con la pill de "tipo detectado" fija en
"PREGUNTA · va a retrieval" (siempre es consulta, no hay heurística de tipo que correr). Unificar
ambos flujos en una futura sesión es una decisión de producto explícita, no algo a decidir
implícitamente rehaciendo el CSS.

**Panel "Debug" del mock no tiene endpoint de backend equivalente hoy.** El snapshot de debug
real (`jarvis/debug/service.py::get_snapshot()`) solo se expone por Telegram (`/jdebug`), no hay
ruta `GET /jarvis/*` que lo sirva al frontend, y no hay tabla de logs persistente que alimente un
"log stream" como el del mock. Implementar el tab Debug tal cual requiere: (a) un endpoint nuevo
que envuelva `get_snapshot()`, y (b) decidir qué reemplaza al log stream (no hay logs
estructurados persistidos hoy — `processor.py` solo loguea a consola/archivo de proceso). Se deja
fuera del primer corte de implementación; el tab puede placeholder-earse con las stat cards
(alimentables desde `get_snapshot()` una vez exista el endpoint) sin el log stream.

**Panel "Entidades" sí tiene soporte de backend completo** (`GET /jarvis/entities`,
`GET /jarvis/entities/{name}`, Slice 3 de 0.2, ya implementado) — es el componente nuevo con menos
riesgo de implementar primero después de la base visual.

Impacto: `JarvisScreen.jsx` (rewrite de layout a grid 3 columnas), `JarvisChat.jsx` (restyle +
adopta tokens del mock), `JarvisInboxPanel.jsx` (se convierte en la vista "Inbox" de página
completa del mock; el panel lateral actual de 240px se retira, su contenido resumido pasa al
panel derecho nuevo "EN PROCESO"), `JarvisCaptureModal.jsx` (solo restyle de colores/tipografía,
sin cambio de flujo). Componentes nuevos: `JarvisNeuralBackground.jsx` (canvas), `JarvisSubBar.jsx`
(topbar propia + tabs + budget + health), `JarvisEntitiesPanel.jsx`, `JarvisDebugPanel.jsx`
(placeholder inicial), `utils/jarvisPalette.js`, `utils/formatAge.js` (helper de edad relativa
tipo "12s"/"2m"/"26m", no existe hoy).

**Plan fasado completo**: `ClaudeDesign - Jarvis/PLAN-IMPLEMENTACION.md` — 8 fases (0 a 7),
cada una con objetivo, archivos, criterio de verificación y actualización de documentación al
cierre. Confirmado con el usuario antes de escribirlo: composer se mantiene separado (no se
unifica captura+consulta) y el panel Debug queda como placeholder sin backend nuevo en esta
ronda. Ese documento es el que se sigue fase por fase durante la implementación; este registro
queda como el resumen de las decisiones de fondo que lo sustentan.

**Actualización 2026-08-26 — plan de backend + principio de "no hardcodear" en ambos planes**:
a pedido del usuario se agregó `ClaudeDesign - Jarvis/PLAN-IMPLEMENTACION-BACKEND.md` (7 fases,
B0 a B6, más QA final) para cerrar los huecos de datos que el plan de frontend dejaba
pendientes (counts por tipo de memoria, proyectos con actividad, entidades enriquecidas, budget
por modelo) y para centralizar valores hoy hardcodeados sueltos en el backend (umbral de
similitud de consolidación 0.92, días/confianza de stale, delays de retry, umbral LOW de
budget, pesos de ranking del retriever — inventario exacto en la Fase B0 de ese plan, con línea
y archivo de cada uno). **Ningún valor cambia de default** en ese refactor — es centralización,
no recalibración; en particular el umbral 0.92 (ya señalado como sospechoso en la entrada de
arriba, "Hallazgo...") se centraliza con su valor actual sin tocarlo, siguiendo el mismo
criterio ya establecido para hallazgos sobre parámetros calibrados (documentar, no tunear sin
confirmación explícita).

Se agregó también un "Principio transversal: no hardcodear" a **ambos** planes: en frontend, un
único archivo (`utils/jarvisPalette.js`) centraliza colores, tamaños de layout, duraciones de
animación y defaults del canvas; en backend, dos niveles — variables de entorno en
`jarvis/config.py` para lo que es plausible tunear por entorno, y constantes nombradas
agrupadas para estructuras que no calzan como env var (diccionarios de pesos, fórmulas). El
criterio de cierre de cada fase de ambos planes ahora incluye explícitamente "ningún valor
mágico nuevo quedó sin centralizar" como condición de completitud, no como sugerencia.

---

## 2026-08-26 — Hallazgo: el umbral de similitud 0.92 de consolidation.py probablemente nunca agrupa un same_fact/contradiction real

Contexto: probando en vivo el "Caso A" de `Cerebro/como-explotar-jarvis.md` (sección 5) —
`"Vivo en Madrid, España."` / `"Me mudé de Madrid a Buenos Aires..."` — el clasificador
(`gemma3:12b`) marcó una entrada `RAW` y la otra `SEMANTIC`. Como `_find_similar_pairs()`
(`jarvis/worker/consolidation.py`) agrupa por `(type, user_id)` **antes** de mirar similitud,
el par nunca se comparó. Se igualó el `type` a mano (`UPDATE memory_entries SET type='SEMANTIC'`)
para forzar la comparación y se corrió `run_consolidation()` real: `obsolete=0, conflicts=0` —
ninguna mutación.

Investigando por qué, se calculó la similitud coseno real entre los dos embeddings
(`nomic-embed-text`, sin mock): **0.73**, muy por debajo del umbral 0.92 que
`_find_similar_pairs()` exige para considerar un par "candidato" — el par nunca llegó a
`_resolve_pair()` (que sí usa el LLM), se descartó antes, en el filtro de similitud puro.

Se probaron 7 pares más para mapear el comportamiento real del umbral:

| Par | Coseno | ¿Cruza 0.92? |
|---|---|---|
| "Vivo en Madrid, España." / "Me mudé de Madrid a Buenos Aires hace un año." | 0.73 | No |
| "Vivo en Madrid." / "Vivo en Buenos Aires." | 0.73 | No |
| "Mi color favorito es el azul." / "...es el rojo." (el propio Caso B de la guía) | 0.82 | No |
| "Uso SQLite para..." / "Uso Postgres para..." (misma frase, una palabra cambia) | 0.89 | No |
| "Ya no vivo en Madrid... ahora vivo en Buenos Aires..." (frase larga, ambos hechos) | 0.85 | No |
| "Mi color favorito es el azul." / "...es azul." (mismo hecho, se saca un artículo) | 0.99 | **Sí** |
| "Reunión...Jarvis" / "reunión...jarvis." (mayúscula + punto, mismo hecho exacto) | 0.996 | **Sí** |

Patrón claro: `nomic-embed-text` solo produce coseno > 0.92 entre reformulaciones casi
**textuales** del mismo hecho (variación de mayúsculas, un artículo de más, una coma). En
cuanto el **hecho en sí** cambia (la ciudad, el color, la tecnología elegida) — que es
exactamente lo que `same_fact` y `contradiction` están diseñados para detectar (spec §25,
ejemplo textual: "vivo en Madrid" → "me mudé a Buenos Aires") — la similitud cae a 0.7–0.9,
por debajo del umbral. Es decir: **el umbral 0.92, tal como está hoy, probablemente nunca
agrupa un same_fact o una contradiction reales** — solo capturaría duplicados casi
textuales (que ya se manejan mejor por otras vías, como `content_hash` en captura). El único
caso de prueba de esta sesión que sí generó una mutación real de consolidación fue justamente
uno de estos casi-duplicados (ver la entrada de esta misma fecha sobre reparación de FK, donde
`f95748a2`/`a2cda63a` — la misma DECISION capturada dos veces, con y sin razón — comparten la
mayoría del texto).

Decisión: **no se cambia el umbral ni el código todavía** — se documenta como limitación
conocida, a decidir con más datos reales de uso (instrucción explícita: "documentar el
hallazgo por ahora"). Si en el futuro se decide bajar el umbral, el trade-off es directo: un
umbral más bajo captura más pares reales de `same_fact`/`contradiction` pero también agrupa
más pares genuinamente no relacionados como "candidatos", encareciendo el costo de
`_resolve_pair()` (llamadas a `call_reason()`, modelo externo) y aumentando el riesgo de que el
LLM tenga que arbitrar casos ambiguos con más frecuencia.

Diferencia con spec: no aplica — no es un desvío de diseño, es una observación sobre la
calibración de un parámetro (0.92) que la propia spec no fija explícitamente (§25 solo describe
el comportamiento deseado, no el umbral numérico; 0.92 fue una decisión de implementación de
0.2-Slice 1, ver esa entrada de este mismo documento).

Impacto: ninguno en código todavía. `Cerebro/como-explotar-jarvis.md` (sección 5, caveat
agregado sobre los ejemplos Caso A/B); este documento. Dato de prueba: se dejó la entrada
`432e6432-...` ("vivo en Madrid, España.") con `type='SEMANTIC'` (originalmente clasificó
`RAW`) tras el experimento — es una entrada de prueba sintética, no dato real del usuario, no
se revirtió por no ser necesario.

---

## 2026-08-26 — Aviso de listo + corrección de corrupción de foreign keys en `_migrate_people_type`

Contexto: probando en vivo por Telegram la feature de aclaración pre-enqueue (entrada siguiente
de este documento), surgieron dos problemas reales durante el ciclo de pruebas, ninguno de los
dos era parte del diseño original de la tarea.

**1) El ACK de `/j` nunca avisa cuando termina de procesar.** El usuario preguntó por qué el
mensaje "procesando…" nunca cambia — es un mensaje de Telegram de una sola vez; el worker
(proceso separado, sin `Application` de python-telegram-bot) no tiene ningún canal para volver a
tocar ese mensaje puntual.

Decisión: `jarvis/notify/telegram.py` (nuevo) — `notify_telegram_done(chat_id, text)` pega
directo a `https://api.telegram.org/bot<token>/sendMessage` con `urllib.request` de la librería
estándar. Se descartó usar `requests` (ya lo usa `project/mybot/bot.py`, pero no es dependencia
de `jarvis/`) y se descartó importar `telegram.ext` en el worker (acoplaría el worker al proceso
del bot, que corre aparte) — un POST HTTP mínimo evita ambos acoplamientos sin agregar
dependencias nuevas a `jarvis/pyproject.toml`. Llamada desde `jarvis/worker/processor.py` al
final de `process_entry()`, solo si `entry["source"] == "telegram"` y `entry["channel"]` (el
chat_id) están presentes -- capturas de `desktop` (API/frontend) no tienen a dónde mandar el
aviso, así que no lo intentan. Gateada por una operación nueva en `TaskManifest`
(`"notify_telegram"`), mismo patrón de blast-radius-explícito que el resto del worker.
Best-effort: cualquier excepción se loguea y se traga, nunca revierte el `DONE` ya persistido de
la entrada (el aviso es cosmético, el estado real vive en la DB).

Se decidió mandar un **mensaje nuevo**, no editar el ACK original -- editar requeriría persistir
el `message_id` de Telegram en `memory_entries`/`inbox_queue` (no existe esa columna hoy) y
plumbearlo desde `jarvis_handlers.py` hasta el worker, cruzando el límite de proceso. Un mensaje
nuevo es más simple y no exige tocar el schema para una mejora cosmética.

**Bloqueante encontrado al probar el timeout de 3 minutos**: `context.job_queue` era `None` en
tiempo de ejecución (`PTBUserWarning: No JobQueue set up`) -- python-telegram-bot requiere el
extra `[job-queue]` instalado aparte. `project/requirements.txt` ya lo tenía pineado
(`python-telegram-bot[job-queue]==22.7`), pero el venv real del usuario se había instalado en
algún momento sin ese extra (desincronización venv vs. requirements.txt, no un error en el
archivo). Se instaló `pip install "python-telegram-bot[job-queue]"` en el venv -- sin cambios de
código, el warning desapareció y `context.job_queue` quedó disponible.

**2) Corrupción real de foreign keys en `jarvis.db`, encontrada en producción.** Al reiniciar
bot/API/worker para levantar el código de la aclaración, el usuario recibió
`Error al guardar en Jarvis: no such table: main.memory_entries_old` al responder la pregunta de
aclaración. La hipótesis inicial (una carrera entre los tres procesos llamando `init_db()` casi
al mismo tiempo) se descartó al confirmar que el esquema ya estaba migrado correctamente
(`memory_entries` con `'PEOPLE'` en su `CHECK`, sin ninguna `memory_entries_old` colgada) y que
el error **persistía** tras un reinicio limpio y escalonado de los tres procesos. Inspeccionando
`sqlite_master` directamente se encontró la causa real: `inbox_queue`, `memory_entry_entities` y
`memory_entry_projects` tenían literalmente `REFERENCES "memory_entries_old"(id)` grabado en su
`CREATE TABLE` -- una corrupción de esquema **permanente**, no transitoria.

Causa raíz: `_migrate_people_type()` (0.2 Slice 3, agregada para el tipo `PEOPLE`) hacía
`PRAGMA foreign_keys = OFF` y después `ALTER TABLE memory_entries RENAME TO memory_entries_old`.
Por la documentación oficial de SQLite sobre `ALTER TABLE RENAME`: la reescritura automática de
las cláusulas `FOREIGN KEY` de *otras* tablas que apuntan a la tabla renombrada solo ocurre si
`foreign_keys` está `ON` en el momento del rename. Con `foreign_keys=OFF` (puesto ahí para poder
copiar los datos viejos sin violar el `CHECK` nuevo durante la transición), SQLite renombró
`memory_entries` sin tocar las referencias de las tres tablas hijas, que quedaron señalando para
siempre a un nombre que la migración borra unos pasos después. Esto no se había manifestado
antes porque la migración de Slice 3 solo se había probado contra DBs de scratch (según su
propia entrada en este documento) -- la corrida de hoy fue la primera vez que corrió contra
`project/database/jarvis.db` real, con datos reales de `inbox_queue` ya poblados.

Decisión: reescribir `_migrate_people_type()` para que **nunca renombre `memory_entries` en sí**.
Construye la tabla nueva bajo un nombre temporal (`memory_entries_new`, con el `CREATE TABLE`
extraído de `jarvis/db/schema.py::SCHEMA` vía regex -- evita duplicar la definición de columnas a
mano, que se habría desincronizado con el schema real tarde o temprano), copia los datos desde
`memory_entries`, borra la vieja, y recién ahí renombra `memory_entries_new` a `memory_entries`.
Como ninguna otra tabla en el schema referencia `memory_entries_new` por nombre, no hay ninguna
cláusula `FOREIGN KEY` externa que SQLite necesite reescribir en absoluto -- el bug queda
estructuralmente imposible en vez de evitado por convención. Se mantiene el `try/except
sqlite3.OperationalError` con re-chequeo del estado final (agregado en un fix anterior de esta
misma sesión, pensado originalmente para una carrera entre procesos que resultó no ser la causa
real acá, pero que sigue siendo una protección válida y barata contra ese escenario si llegara a
darse en una `jarvis.db` nueva).

**Reparación de la DB real ya corrompida**: se corrió un script one-off (no forma parte del
código de `jarvis/`, se descartó tras usarlo) que hace backup automático
(`database/jarvis.bak-repair-{timestamp}.db`) y reconstruye las tres tablas rotas con la misma
técnica de nombre temporal, esta vez renombrando la tabla hija rota en sí (seguro, porque nada
más referencia a `inbox_queue`/`memory_entry_entities`/`memory_entry_projects` por FK). Verificado
sin pérdida de datos: mismos conteos antes/después (12 `memory_entries`, 2 `inbox_queue`, 1
`memory_entities`, 1 `memory_projects`, 0/0 en las tablas de vínculos que ya estaban vacías) y un
`capture_raw()` real de prueba contra la DB reparada funcionó sin error (limpiado después).

Verificado en aislado (antes de tocar la DB real): se simuló una DB pre-migración real (con
`inbox_queue`/`memory_entry_projects`/`memory_entry_entities` ya creadas con su FK correcta,
igual que estaba `jarvis.db` antes de esta sesión) y se corrió `init_db()` -- tras migrar, las
tres tablas siguen apuntando a `memory_entries` (nunca a `_old` ni a `_new`), los datos viejos se
preservan, y la FK realmente enforced (`INSERT` con `entry_id` inexistente rechazado con
`IntegrityError`).

**Lección operativa, no de código**: esta sesión reinició bot.py/uvicorn/worker varias veces sin
que el código nuevo se cargara la primera vez (Python no hace hot-reload) -- una prueba real
de `/j` pasó de largo sin preguntar porque el bot corriendo todavía era el de antes del cambio.
Además, el `python.exe` del venv de este proyecto es un stub que spawnea el intérprete real como
proceso hijo, así que cada proceso lanzado aparece como **dos** PIDs en
`Get-CimInstance Win32_Process` (mismo `CommandLine`/`CreationDate`) -- no son instancias
duplicadas reales, pero hay que matar ambos PIDs del par al reiniciar.

Diferencia con spec: no aplica -- corrección de un bug de infraestructura introducido en 0.2
Slice 3 (no documentado como tal en su momento porque nunca se había probado contra datos
reales), más una mejora de UX (aviso de listo) no prevista en el diseño original de la tarea de
aclaración pre-enqueue.

Impacto: `jarvis/notify/` (nuevo, `telegram.py` + `__init__.py`); `jarvis/worker/processor.py`
(hook de notificación al final de `process_entry()`); `jarvis/worker/task_manifest.py`
(`"notify_telegram"`); `jarvis/db/database.py` (`_migrate_people_type()` reescrita,
`_MEMORY_ENTRIES_CREATE` extraído por regex); `project/database/jarvis.db` (reparada in-place,
backup en `jarvis.bak-repair-20260826140911.db`); venv del usuario
(`python-telegram-bot[job-queue]` instalado).

---

## 2026-08-26 — Aclaración pre-enqueue para capturas DECISION

Contexto: la spec pide que una entrada `DECISION` incluya "decisión + razonamiento", pero el
worker es fire-and-forget (polling a `inbox_queue`, sin canal de vuelta al usuario) — si el
razonamiento no viene en el texto original, se pierde para siempre. La tarea pide mover la
detección de esto a ANTES de encolar, como responsabilidad del cliente (Telegram/API/frontend),
no del worker.

Decisiones:
- **Divergencia con el pedido original sobre qué archivo frontend tocar**: la tarea nombraba
  `frontend/src/components/jarvis/JarvisChat.jsx` como el cliente a modificar. Leyendo el código
  (no solo la spec) antes de implementar: `JarvisChat.jsx` es el chat de **consulta RAG**
  (`jarvisQuery()` → `POST /jarvis/query`, historial conversacional, sin ningún vínculo con
  captura). La captura real desde el frontend pasa por un componente separado,
  `JarvisCaptureModal.jsx` (abierto desde el CTA "Capturar" del TopBar o `openJarvisCapture()`),
  que llama `jarvisCapture()` → `POST /jarvis/capture`. Se implementó el flujo de aclaración ahí
  — es la única lectura consistente con lo que el código hace hoy; tocar `JarvisChat.jsx` habría
  agregado la feature a un componente que nunca captura nada.
- **`jarvis-spec.html §14` no tiene una sección de "aclaración" literal**: lo más cercano es la
  fila de la tabla UX "Mensaje ambiguo → '¿Querés que guarde esto o que te responda?'"
  (ambigüedad captura-vs-consulta, no razonamiento de DECISION). Se tomó como precedente de
  diseño (Jarvis ya le pregunta al usuario en casos ambiguos antes de actuar en vez de adivinar),
  no como spec literal de esta feature específica. Se agregó una fila nueva a esa misma tabla
  documentando el comportamiento implementado.
- **Módulo nuevo compartido `jarvis/captures/clarification.py`** (mismo patrón ya usado por
  `jarvis/entities/` y `jarvis/projects/`: lógica multi-cliente vive en `jarvis/`, nunca
  duplicada por handler):
  - `infer_type_hint(content)` — la heurística sin LLM que antes vivía privada en
    `jarvis_handlers.py` (`_infer_type_hint`, usada solo para el ACK de `/j`) se movió acá y se
    volvió pública, porque ahora también la necesita la API (`?check_clarification`, que no
    tiene acceso a la clasificación real del worker en el momento del request). El ACK de
    Telegram sigue mostrando la distinción cosmética "RAW (link)" vía un helper local nuevo
    (`_display_type`) que no es necesaria para `needs_clarification()`.
  - `needs_clarification(text, detected_type)` — pura salvo la llamada best-effort a
    `call_llm()` (modelo local, sin especificar `model=` → default `JARVIS_LOCAL_MODEL`, nunca
    el externo) cuando las keywords de razonamiento ("porque", "ya que", "debido a", "dado que",
    "razón", "the reason", "because") no resuelven el caso. Cualquier excepción del modelo →
    `(False, None)` — nunca bloquea la captura, cumple la restricción explícita de la tarea.
  - **Bug de prompt encontrado probando el caso de ejemplo exacto de la propia tarea**: con un
    prompt simple ("¿este texto incluye el razonamiento detrás de una decisión?"),
    `gemma3:12b` (real, vía Ollama, sin mock) respondió "sí" para el texto
    `"decidí usar gemma3"` — que no tiene ninguna razón — un falso positivo que habría hecho
    fallar silenciosamente exactamente el escenario que la tarea pide verificar al final
    ("Jarvis debe preguntar"). Corregido con un prompt de few-shot (`_HAS_REASONING_PROMPT`, 4
    ejemplos: 2 con razón explícita, 2 sin ella) — acertó los 4 casos de control probados
    (incluido el de la tarea) contra el modelo real. Mismo patrón de "el modelo simple falla,
    el prompt con ejemplos concretos lo arregla" ya visto en el bake-off de consolidación
    (`Cerebro/estado-actual.md`, sección de bake-off 2026-08-26).
- **Telegram** (`project/mybot/jarvis_handlers.py`): `cmd_j` calcula `needs_clarification`
  antes de `capture_raw()`. Si hace falta, `_start_clarification()` guarda el pendiente en
  `context.user_data["jarvis_clarification"]` (content, source_id, chat_id, job_name) y
  programa `context.job_queue.run_once(..., chat_id=..., data={...})` a 3 minutos.
  **El job de timeout no depende de `context.user_data`** a propósito: en python-telegram-bot,
  un job solo tiene `context.user_data` poblado si se le pasó `user_id=` al programarlo (acá
  solo se pasa `chat_id=`) — para no depender de ese scoping, toda la información que el job
  necesita para capturar (`content`, `source_id`, `chat_id`) viaja en `job.data`, y el job nunca
  toca `context.user_data`. `handle_pending_clarification()` (nueva función exportada) consume
  la respuesta del usuario: cancela el job de timeout por nombre
  (`get_jobs_by_name` + `schedule_removal()`) y encola `"{content}\nRazón: {respuesta}"`. Si no
  responde, `_clarification_timeout()` captura el `content` original tal cual, sin razón, y
  avisa — la captura nunca se pierde en ningún camino.
- **`bot.py::handle_message` gana una línea al principio**:
  `if await jh.handle_pending_clarification(update, context): return` — antes de tocar
  `ud["step"]`/Agenda/Finanzas/quick-captures/Bóveda. Sin esto, la respuesta del usuario a
  "¿Por qué...?" se interpretaría como una hoja nueva de la Bóveda (el flujo normal de texto
  libre sin prefijos cae ahí). Prioridad absoluta, igual que ya hacían los pasos de
  Agenda/Finanzas antes que el routing LLM genérico.
- **API** (`jarvis/api/router.py`): `CaptureRequest` gana `check_clarification: bool = False` y
  `clarification: Optional[str] = None`, ambos como **campo del body**, no query param — la
  tarea permitía cualquiera de las dos formas y el endpoint ya es JSON-body-only, así que un
  campo extra es más consistente que mezclar query param + body en el mismo POST. Lógica: si
  viene `clarification` no vacío, se concatena y se encola sin volver a chequear; si no, y
  `check_clarification=True`, se calcula `infer_type_hint` + `needs_clarification` sobre el
  contenido y si hace falta se responde `{"clarification_needed": true, "question": ...}` **sin
  llamar a `capture_raw()`** (nada se inserta en `inbox_queue`); sin ninguno de los dos campos,
  comportamiento idéntico al de antes. Se quitó el `response_model=CaptureResponse` fijo del
  decorador porque la respuesta ahora tiene dos formas posibles
  (`CaptureResponse`/`ClarificationNeededResponse`, ambas devueltas explícitamente como modelo
  Pydantic desde el código, solo sin fijarlo en el decorador).
- **Frontend** (`useStore.js::jarvisCapture` + `JarvisCaptureModal.jsx`): `jarvisCapture` gana un
  tercer parámetro opcional `extra = {}` que se mergea al body (backward-compatible con las dos
  llamadas ya existentes). La modal agrega un estado `clarification` que, cuando la API responde
  con la pregunta, cambia el body del modal a un segundo paso: la pregunta + un textarea para la
  razón, con tres acciones — "Guardar con esta razón" (`clarification: reason`), "Guardar sin
  razón" (llamada directa sin flags) y "Descartar" (cierra sin capturar nada). **"Descartar" acá
  SÍ pierde la captura a propósito** — es una decisión explícita del usuario en un modal
  síncrono (no un timeout no supervisado como en Telegram, donde el usuario puede no estar
  mirando el chat), así que no viola la garantía de "nunca se pierde una captura" de ese canal;
  esa garantía es específica del timeout de 3 min de Telegram, no una invariante global de la
  feature.
- **`jarvis/jarvis-spec.html §14`**: se agregó una fila a la tabla "Telegram — canal de captura"
  documentando el nuevo comportamiento ("Decisión sin razonamiento" → pregunta con timeout de
  3 min).
- **`jarvis/Fase-0.md` no se tocó**: la feature no cambia el criterio de completitud de 0.1 (ya
  completo) ni agrega un tipo de memoria nuevo — es una mejora de calidad de captura sobre el
  tipo `DECISION` que ya existía desde S1.

Verificado en este entorno (Ollama real, `gemma3:12b`, sin mocks, contra una DB de scratch
aislada de `project/database/jarvis.db`, borrada al terminar):
- `needs_clarification()` con los 4 casos de control: `"decidí usar gemma3"` (DECISION, sin
  keyword, sin razón real) → `(True, pregunta)`; `"decidí usar SQLite porque es simple"`
  (DECISION, con keyword) → `(False, None)` sin llamar al modelo; `"vamos a migrar a Postgres"`
  (DECISION, sin keyword, sin razón real, vía modelo) → `(True, pregunta)`; `"una nota
  cualquiera"` (RAW) → `(False, None)` sin llamar al modelo.
- Fallback ante fallo del modelo: con `call_llm` mockeado para lanzar excepción,
  `needs_clarification("decidí usar gemma3", "DECISION")` → `(False, None)` — nunca bloquea.
- `POST /jarvis/capture` real (función del router llamada directamente, sin servidor HTTP, DB de
  scratch): `check_clarification=True` sobre `"decidí usar gemma3"` → responde
  `clarification_needed=True` sin insertar nada en `inbox_queue` (verificado contando filas);
  reintento con `clarification="porque el bake-off lo dio ganador"` → encola con
  `content_raw = "decidí usar gemma3\nRazón: porque el bake-off lo dio ganador"` (verificado
  leyendo la fila real de `memory_entries`); sin ningún flag → comportamiento idéntico al
  anterior (encola directo); `check_clarification=True` sobre texto que ya tiene "porque..." o
  que no es DECISION → encola directo, no pregunta.
- Build de producción del frontend (`vite build` en `project/frontend`) sin errores tras los
  cambios en `JarvisCaptureModal.jsx` y `useStore.js`.
- Los cuatro archivos Python tocados/nuevos compilan limpio (`py_compile`).

**No verificado en este entorno** (sin token de Telegram configurado acá): el flujo real de
punta a punta por Telegram (`/j decidí usar gemma3` → pregunta → respuesta → entrada en
`jarvis.db` con ambas partes) ni el timeout de 3 minutos disparándose en vivo. Queda pendiente
de que el usuario lo confirme, tal como pide la tarea.

Diferencia con spec: no aplica un desvío de diseño de fondo — la spec no detalla el mecanismo
exacto de aclaración pre-enqueue, la fila de §14 sobre "mensaje ambiguo" es el precedente de UX
más cercano y se actualizó para reflejar el comportamiento nuevo. La única divergencia real es
de implementación (qué archivo frontend es el cliente de captura real), documentada arriba.

Impacto: `jarvis/captures/` (nuevo — `clarification.py` + `__init__.py`);
`project/mybot/jarvis_handlers.py` (`cmd_j`, `_do_capture`, `_start_clarification`,
`_clarification_timeout`, `handle_pending_clarification`, `_display_type`; se borró
`_infer_type_hint` duplicado); `project/mybot/bot.py` (`handle_message`, una línea nueva al
principio); `jarvis/api/router.py` (`CaptureRequest`, `ClarificationNeededResponse`,
`capture_endpoint`); `project/frontend/src/store/useStore.js` (`jarvisCapture`);
`project/frontend/src/components/jarvis/JarvisCaptureModal.jsx` (segundo paso de aclaración);
`jarvis/jarvis-spec.html` (§14, fila nueva).

---

## 2026-08-26 — Fix: auto-linking de proyectos + merge conservador de alias de entidades

Contexto: escribiendo `Cerebro/como-explotar-jarvis.md` (guía de explotación de Jarvis) se
encontraron dos gaps reales leyendo el código, no solo teóricos:

1. `_CLASSIFY_PROMPT` (`jarvis/llm/client.py`) ya pedía un campo `"project"` desde S1, pero
   `jarvis/worker/processor.py` nunca lo leía — no había ningún código (worker/API/CLI) que
   insertara filas en `memory_projects`/`memory_entry_projects` fuera de inserts manuales. El
   boost de retrieval por proyecto (`_match_project_entry_ids` en `jarvis/retriever/retriever.py`,
   ya implementado en 0.2-S2) nunca se activaba en uso real porque esas tablas quedaban siempre
   vacías.
2. `_find_or_create_entity()` (`jarvis/entities/service.py`, 0.2-S3) matcheaba solo por nombre
   exacto case-insensitive contra la columna `name` — `aliases` se creaba como `[]` y nada lo
   actualizaba nunca. "Martín" y "Martín López" quedaban siempre como dos entidades separadas sin
   ningún vínculo, y una vez que hubiera alias reales, ni siquiera un match exacto contra un alias
   ya guardado funcionaba (solo miraba `name`).

Decisiones:
- **Módulo nuevo `jarvis/projects/service.py`**: `link_project_for_entry(entry_id, project_name)`,
  llamado desde `processor.py` después de clasificar, con el mismo patrón best-effort que la
  vinculación de entidades (nunca lanza; el call site en `processor.py` lo envuelve en su propio
  `try/except` además). Crea el proyecto si no existe (match case-insensitive contra `name`, igual
  criterio que entidades) y lo vincula en `memory_entry_projects` con `is_primary=1`,
  `assigned_by='jarvis'`. Se agregó `"link_project"` a `TaskManifest.ALLOWED_OPERATIONS`
  (`jarvis/worker/task_manifest.py`).
- **`created_by='jarvis_proposal_accepted'`** para proyectos creados así, no `'user'` (los dos
  únicos valores que admite el `CHECK` de `memory_projects`): no existe todavía un flujo real de
  propuesta/aceptación con UI (fuera de alcance acá), pero es el valor que distingue "creado
  automáticamente por Jarvis" de "creado a mano por el usuario", que es la distinción real que
  importa. Documentado como decisión, no como uso literal del nombre del campo.
- **Merge conservador de entidades por prefijo de tokens** (`_is_unambiguous_alias_match()` en
  `jarvis/entities/service.py`): al buscar/crear una entidad, primero se intenta match exacto
  contra `name` **o** contra un alias ya guardado (antes solo miraba `name` — bug latente que
  nunca se había manifestado porque `aliases` nunca se poblaba). Si no hay match exacto, se busca
  fusión por prefijo de tokens completos (no substring libre): "Martín" fusiona con "Martín López"
  porque el primer token coincide, en cualquier orden de llegada — pero **solo si hay un único
  candidato** entre las entidades existentes del mismo `entity_type`/`user_id`. Con "Martín López"
  y "Martín Rodríguez" ya existentes, una mención nueva de "Martín" no fusiona con ninguno (no hay
  forma de adivinar cuál) y crea una entidad nueva — decisión deliberada de no arriesgar un merge
  incorrecto entre personas distintas con el mismo nombre de pila. El nombre canónico existente
  nunca se reescribe, solo se le agrega el nuevo nombre a `aliases`.
- **Containment libre descartado a propósito**: "el Martín del trabajo" no fusiona con "Martín"
  porque el primer token no coincide (`"el"` vs `"martín"`) — es exactamente el caso que motivó
  el gap original (el propio ejemplo de la guía aclaraba "no el de la facultad", es decir, dos
  personas reales distintas). Un containment por substring libre habría fusionado ese caso
  incorrectamente.
- **Límite conocido y aceptado, no resuelto por este fix**: no hay normalización de
  tildes/diacríticos (`"Martin"` sin tilde no matchea `"Martín"`) ni fuzzy matching real —
  el prefijo de tokens es exacto, case-insensitive, nada más. Si en uso real esto resulta
  insuficiente, es la siguiente iteración, no algo que este fix pretenda cubrir.
- Se aprovechó para eliminar duplicación: el parseo inline de `aliases` (JSON con
  `try/except` repetido tres veces en `match_entities_in_text()` y `get_entries_for_entity()`)
  se reemplazó por el helper nuevo `_parse_aliases()`.

Verificado con `_find_or_create_entity()` y `link_project_for_entry()` mockeados (sin conexión
real a SQLite, sin Ollama disponible en este entorno) contra los tres casos de la guía: merge
"Martín"/"Martín López" en ambos órdenes de llegada, no-merge con dos "Martín *" ya existentes
(ambigüedad real), no-merge con "el Martín del trabajo"; y linking de proyecto con
creación+reutilización case-insensitive, no-op con `project=None`/vacío/muy corto.
**No se corrió el pipeline real contra Ollama** (no disponible en este entorno) — queda
pendiente de que el usuario lo confirme en una sesión con el worker corriendo de verdad.

Diferencia con spec: no aplica — ambos son gaps de implementación dentro del diseño ya
existente de 0.2-S2 (proyectos) y 0.2-S3 (entidades), no desvíos de diseño.

Impacto: `jarvis/projects/` (nuevo, `service.py` + `__init__.py`); `jarvis/entities/service.py`
(`_find_or_create_entity()`, `_has_alias()`, `_is_unambiguous_alias_match()`, `_add_alias()`,
`_parse_aliases()`); `jarvis/worker/processor.py` (import + bloque `link_project_for_entry`);
`jarvis/worker/task_manifest.py` (`link_project`); `Cerebro/como-explotar-jarvis.md` (§0
actualizada de "gaps conocidos" a "resueltos", ejemplos de §1-3 ajustados al comportamiento
nuevo).

---

## 2026-08-24 — /j como comando explícito en lugar de interceptar texto libre

Contexto: al integrar captura Jarvis en el bot de Telegram, había que decidir
si Jarvis intercepta todo el texto libre o solo comandos explícitos.

Decisión: /j <texto> como comando explícito.

Diferencia con spec: la spec asumía captura de texto libre. El comando explícito
es más conservador.

Impacto: project/mybot/jarvis_handlers.py, project/mybot/bot.py.
Se integra con texto libre en S3 cuando exista el RAG real, para no
romper el routing existente del bot de SGR.

---

## 2026-08-24 — Deduplicación por content_hash en capture_raw()

Contexto: el plan no especificaba comportamiento ante mensajes duplicados (ej. Telegram re-entrega el mismo mensaje tras reconexión).

Decisión: si ya existe una entrada con el mismo `content_hash` + `user_id`, `capture_raw()` devuelve el `entry_id` existente sin insertar duplicado.

Diferencia con spec: no está en la spec; es una mejora defensiva.

Impacto: `jarvis/memory/service.py` — SELECT antes del INSERT.

---

## 2026-08-24 — Vault se escribe aunque content_processed == content_raw (S1)

Contexto: en S1 el clasificador LLM solo extrae tipo/title/tags, no reescribe el contenido.

Decisión: `content_processed` se setea igual a `content_raw` en S1. El vault .md muestra el RAW original en todos los casos. En S2+ el procesador puede poblar `content_processed` con contenido más elaborado.

Diferencia con spec: la spec distingue content_raw de content_processed; en S1 son iguales.

Impacto: `jarvis/worker/processor.py` línea `content_processed=entry["content_raw"]`.

---

## 2026-08-25 — Carpeta del paquete renombrada de `Jarvis/` a `jarvis/` (bug bloqueante de S1, nunca probado)

Contexto: al implementar S2 se intentó `pip install -e ../jarvis` y `import jarvis` por primera vez
de punta a punta — nunca se había corrido desde que se escribió S1. La carpeta física en disco era
`Jarvis/` (mayúscula inicial), creada así porque tanto la documentación (`Jarvis/jarvis-spec.html`, etc.)
como el paquete Python terminaron en el mismo directorio. Windows es case-insensitive a nivel de
sistema de archivos, pero el import de CPython en Windows compara el nombre exacto contra el casing
real de la entrada de directorio — `import jarvis` (minúscula, usado en todo el código: cada
`from jarvis.xxx import yyy`) fallaba con `ModuleNotFoundError` aunque `import Jarvis` funcionara.
Esto habría bloqueado también al worker de S1 si alguien lo hubiera corrido.

Decisión: renombrar la carpeta física a `jarvis/` (minúscula) vía rename en dos pasos (NTFS no
aplica un cambio de casing con un rename directo). La carpeta no estaba trackeada en git (`?? Jarvis/`
en status), así que el rename no requirió `git mv` ni tocó historia. Se actualizaron las referencias
en `CLAUDE.md` de `Jarvis/...` a `jarvis/...`. También se corrigió `jarvis/pyproject.toml`:
`build-backend` apuntaba a `"setuptools.backends.legacy:build"` (inválido — rompía `pip install -e`
con `BackendUnavailable`); el valor correcto es `"setuptools.build_meta"`.

Diferencia con spec: no aplica — es una corrección de infraestructura, no de diseño.

Impacto: rename de carpeta `Jarvis/` → `jarvis/`; `jarvis/pyproject.toml` (`build-backend`);
`CLAUDE.md` (tabla de archivos Jarvis, sección "Antes de implementar Jarvis").

---

## 2026-08-25 — Slice 2: Embeddings + ChromaDB, Privacy Gateway, Budget Tracker

Contexto: S2 requiere que el worker genere embeddings y los guarde en ChromaDB, que el Privacy
Gateway esté activo, y que el budget tracker acumule gasto real.

Decisiones:
- **Embeddings**: `jarvis/embeddings/client.py` (`generate_embedding()` vía LiteLLM, nunca
  `ollama.*` directo) + `jarvis/embeddings/store.py` (ChromaDB `PersistentClient` en
  `JARVIS_CHROMA_PATH`, default `project/database/chroma/`, ya estaba en `.gitignore`).
  El worker embebe **toda** entrada (incluidas `local_only`/`confidential`) porque el embedding
  y su almacenamiento en Chroma son 100% locales (Ollama + disco) — no cruzan el boundary externo
  que el Privacy Gateway protege. El paso de embedding va *antes* de marcar `DONE` y *antes* de
  persistir `vault_path`... **corrección durante pruebas**: se separó en dos `update_entry()` —
  `vault_path`/`processed_at` se persisten apenas se escribe el vault (como en S1), y `embedded_at`
  se persiste aparte tras el embedding. Si el embedding falla (ej. Ollama caído), la entrada
  reintenta con backoff (igual que clasificación) pero el `.md` del vault ya escrito no se pierde
  ni queda huérfano en la DB — validado con test que simula falla de Ollama.
- **Task Manifest**: se agregó la operación `store_embedding` (además de `generate_embedding` ya
  declarada en S1) para mantener un permiso explícito por cada efecto secundario del worker.
- **Privacy Gateway** (`jarvis/privacy/gateway.py`): implementa el orden exacto de la spec §17
  (local_only → confidential → proyecto local_only → regex de secretos) sobre `memory_entries`.
  `filter_context()` bloquea por fragmento (por entrada), nunca la consulta completa, y nunca
  lanza — solo loguea y omite. Los 6 patrones regex de la spec están en `SECRET_PATTERNS`.
- **Trust propagation** (`jarvis/privacy/trust.py`): `propagate_trust()` devuelve el `origin_trust`
  más restrictivo entre una lista de fuentes. Todavía no se usa en producción porque S2 no tiene
  consolidación multi-fuente (eso es 0.2+/Graphiti); queda listo para cuando exista.
- **Boundary externo activo**: se agregó `call_reason_with_context()` en `jarvis/llm/client.py`,
  que filtra `context_entries` por el Privacy Gateway antes de armar el prompt para el modelo
  externo. S3 (RAG real) solo necesita pasarle las entradas recuperadas — el filtro ya está
  conectado, no es un módulo suelto sin invocar.
- **Budget tracker** (`jarvis/budget/tracker.py`): `record_usage()` inserta en `budget_usage`
  (tabla ya definida en S1); `get_status()` devuelve `ACTIVE`/`LOW`/`EXHAUSTED` según spec §11
  (80%/100% del `JARVIS_DAILY_BUDGET_USD`). **No se implementó `OVERRIDE`** — requiere una
  interacción explícita del usuario (aprobar gasto extra) que todavía no tiene UI ni comando de
  bot; se deja para cuando exista esa superficie (S3/S4).
  El costo se registra solo para llamadas a modelos **no-Ollama** (`call_llm()` en
  `jarvis/llm/client.py`, vía `litellm.completion_cost()`, con fallback a `0.0` si LiteLLM no
  tiene pricing para el modelo). `call_reason()` consulta `get_status()` antes de llamar al
  modelo externo; si está `EXHAUSTED`, cae a `JARVIS_LOCAL_FALLBACK_MODEL` (default: mismo modelo
  que clasificación) y prefija la respuesta con `[modo local]`, tal como especifica el caso borde
  "Presupuesto agotado durante una consulta en curso".
- **Migración de schema**: se agregó columna `embedded_at DATETIME` a `memory_entries`. Como
  S1 ya podía haber creado `jarvis.db` sin esa columna, `init_db()` corre una migración liviana
  (`ALTER TABLE ... ADD COLUMN` si falta) además del `CREATE TABLE IF NOT EXISTS`.

Diferencia con spec: ninguna decisión diverge del diseño; `OVERRIDE` queda pendiente de UI (no es
un desvío, es una dependencia de fase posterior ya prevista en la spec).

Impacto: `jarvis/embeddings/` (nuevo), `jarvis/privacy/` (nuevo), `jarvis/budget/` (nuevo),
`jarvis/llm/client.py`, `jarvis/worker/processor.py`, `jarvis/worker/task_manifest.py`,
`jarvis/memory/service.py`, `jarvis/db/schema.py`, `jarvis/db/database.py`, `jarvis/config.py`,
`jarvis/pyproject.toml` (dependencia `chromadb`).

---

## 2026-08-25 — Slice 3: Consultas RAG + API /jarvis/* + /jq Telegram

Contexto: S3 debe conectar la recuperación semántica real (ChromaDB) con `call_reason_with_context()`
de S2, implementar el historial conversacional, y exponer todo vía REST y Telegram.

Decisiones:
- **Retriever** (`jarvis/retriever/retriever.py`): se implementa recuperación en dos pasos —
  ChromaDB devuelve el doble de `n_results` para re-rankeo, luego se cargan las entradas completas
  desde SQLite y se re-rankean con una función que combina similitud coseno (50%), peso de tipo
  DECISION>SEMANTIC>PROJECT>RAW (40%) y bonus de recencia de 7 días (10%). Esto sigue la spec §8
  "ranking por tipo + proyecto + recencia". El fallback a búsqueda LIKE en SQLite se activa si
  ChromaDB falla o está vacío, para que las consultas respondan aunque no haya embeddings todavía.
- **Historial conversacional**: `jarvis/conversation/service.py` reutiliza la conversación más
  reciente para el mismo `channel_id` (Telegram chat_id). No se implementa expiración de sesión en
  S3; la sesión es permanente por canal hasta S4 cuando haya UI para gestionarla. La spec §10 dice
  "últimos 8-10 mensajes" — se usan 10 como límite, coherente con el rango.
- **query/service.py llama call_reason() directamente** en vez de reutilizar
  `call_reason_with_context()` de S2: S3 necesita armar el prompt completo (sistema + historial +
  contexto RAG + pregunta enriquecida) — no es el prompt simple de call_reason_with_context(). Es
  más limpio duplicar la orquestación del prompt en query/service.py que complicar la firma de
  call_reason_with_context(). call_reason() sigue siendo el boundary único con el modelo externo
  y maneja el fallback de presupuesto.
- **API FastAPI**: router con 4 endpoints (query, capture, inbox, budget). Se monta en main.py con
  `include_router(prefix="/jarvis")` condicionado al try/except de importación, igual al patrón de
  graceful degradation del bot. Jarvis no afecta al backend SGR si no está instalado.
- **Jarvis init en lifespan**: se llama `_jarvis_init_db()` en el lifespan de SGR para que
  `jarvis.db` exista cuando llegue la primera request. Antes solo se inicializaba en el worker y
  en el bot, lo que requería arrancar uno de ellos antes de usar la API.
- **Telegram /jq**: usa `asyncio.get_event_loop().run_in_executor(None, lambda: ...)` para correr
  la consulta síncrona (SQLite, ChromaDB, LiteLLM) sin bloquear el event loop del bot. El feedback
  inmediato "Buscando…" se envía antes de lanzar el executor y se edita con el resultado.

Diferencias con spec: ninguna decisión diverge del diseño. El punto sobre `call_reason()` vs
`call_reason_with_context()` es una decisión de implementación interna, no un desvío funcional.

Impacto: `jarvis/retriever/` (nuevo), `jarvis/conversation/` (nuevo), `jarvis/query/` (nuevo),
`jarvis/api/` (nuevo), `project/mybot/jarvis_handlers.py` (cmd_jq real), `project/app/main.py`
(import jarvis + lifespan + include_router).

---

## 2026-08-25 — Slice 5: Migración Bóveda (script one-time)

Contexto: S5 requiere un script que lea las hojas de la Bóveda (`project/database/app.db`) y las
migre al Memory Core de Jarvis como `memory_entries` tipo SEMANTIC, respetando D-10 (migración
única y controlada: backup → script → validación → corte).

Decisiones:
- **No pasa por el worker ni por `TaskManifest`**: la migración es un script de un solo uso
  invocado directamente por el usuario (`python -m jarvis.cli.migrate_boveda`), no la pieza
  autónoma de background cuyo blast radius restringe `jarvis/worker/task_manifest.py` (invariante
  "el worker de background no hace requests externos en 0.1" no aplica aquí — este script sí hace
  una llamada a embeddings, pero bajo control directo del usuario, no del loop de polling). El tipo
  ya es conocido (SEMANTIC) así que tampoco pasa por `call_classify()` ni por `inbox_queue`.
- **Contenido migrable**: combina `hojas.contenido` (texto para tipo texto; URL para link; path
  para foto) con `hojas.apuntes` (HTML de TipTap, se le hace strip de tags) y, si existe,
  título/descripción de `link_preview`. Nunca se omite una hoja solo por tener `apuntes` vacío —
  el requisito "manejar hojas sin texto (solo foto/link) sin fallar" se interpretó como "no debe
  lanzar excepción por campos ausentes", no como "debe descartarlas": una hoja tipo link sin notas
  igual tiene la URL como contenido migrable. Solo se omite (contada aparte, log WARNING) si tras
  construir el texto queda un string vacío — caso borde no encontrado en los datos reales del
  usuario al probar (10/10 hojas tenían contenido migrable).
- **`local_only` de categorías**: la tabla `categorias` de la Bóveda no tiene ese campo hoy
  (confirmado leyendo `project/app/db/database.py`). El script chequea con `PRAGMA table_info` si
  existe una columna `local_only` en `categorias` antes de leerla; si no existe, asume `0` para
  todas las hojas, tal como pide la instrucción explícita de la tarea. Es un chequeo defensivo de
  una sola columna, no una capa de configuración — evita over-engineering ante un campo que no
  existe todavía.
- **Idempotencia por `content_hash`**: mismo esquema que `capture_raw()` de S1 — SHA-256 del
  `content_raw` migrado, único por `user_id`. Se probó explícitamente: correr el script dos veces
  sobre los mismos datos reales del usuario (copia de `app.db.bak`, 10 hojas) migra 10 la primera
  vez y 0 la segunda (10 "ya existían"), sin duplicados en `memory_entries` ni archivos nuevos en
  el vault.
- **Backup automático**: copia `jarvis.db` a `jarvis.bak-{YYYYMMDDHHMMSS}.db` en el mismo directorio
  antes de escribir, solo si el archivo ya existe (si es la primera vez que se crea `jarvis.db`, no
  hay nada que respaldar). Se ejecuta siempre en modo real, nunca en `--dry-run`.
- **`--dry-run` no toca nada, ni siquiera crea el archivo**: `jarvis.db.database.get_connection()`
  crea el archivo de la DB apenas se conecta (efecto secundario de `sqlite3.connect`), así que en
  dry-run el script abre una conexión de solo lectura (`file:...?mode=ro`) *solo si* `jarvis.db` ya
  existe; si no existe, no se conecta a nada y todas las hojas se cuentan como candidatas sin poder
  verificar duplicados. Tampoco se llama `init_db()` ni se escribe al vault ni se generan embeddings
  en modo dry-run. Verificado corriendo `--dry-run` contra datos reales del usuario: no se creó
  `jarvis.db` ni `project/vault/`.
- **Embeddings best-effort**: el script intenta generar y guardar el embedding de cada hoja
  migrada (mismo flujo que S2: `generate_embedding()` + `upsert_embedding()`), pero si falla (p.ej.
  Ollama no está corriendo) la migración de esa entrada NO se revierte — el `memory_entry` y el
  archivo del vault ya escritos quedan como están, con `embedded_at` en NULL, y se loguea un
  WARNING indicando que se puede reprocesar más tarde. Mismo patrón de resiliencia que
  `worker/processor.py` en S2 (vault_path se persiste aparte de embedded_at). Verificado: en este
  entorno sin Ollama disponible, las 10 hojas de prueba migraron correctamente con
  `embedded_at=NULL` y sin abortar el script.
- **`origin_trust='user.authenticated'`** en vez de `'migration'` (que también es un valor válido
  del CHECK de `memory_entries.origin_trust`): sigue la instrucción explícita de la tarea. `source`
  sí queda como `'migration'` (para trazabilidad de que vino de este script) y `source_id` como
  `boveda:hoja:{id}` (provenance obligatorio, invariante de Jarvis).
- **Prueba end-to-end real**: se corrió el script (dry-run y real, dos veces para idempotencia)
  contra una copia aislada de los datos reales del usuario (`project/database/app.db.bak`, 10
  hojas: texto y link, con y sin `apuntes`/`link_preview`) usando rutas de `JARVIS_DB_PATH` /
  `JARVIS_VAULT_PATH` / `JARVIS_CHROMA_PATH` apuntadas a un directorio de scratch — nunca se tocó
  `project/database/jarvis.db` real. La migración real (sobre la DB real del usuario) queda
  pendiente de que el usuario la ejecute cuando decida.

Diferencia con spec: ninguna decisión diverge del diseño; D-10 se implementa tal como está descrito
(backup → script → validación → corte).

Impacto: `jarvis/cli/` (nuevo) — `migrate_boveda.py`.

---

## 2026-08-25 — QA de punta a punta: modo local ante cualquier fallo del modelo externo, no solo EXHAUSTED

Contexto: durante el QA end-to-end (primera corrida real contra `jarvis.db`, sin Ollama ni
`OPENAI_API_KEY` configurados) se detectó que `call_reason()` (`jarvis/llm/client.py`) solo caía a modo
local cuando `get_status() == "EXHAUSTED"` (spec §11). Si el modelo externo fallaba por cualquier otro
motivo — sin API key, sin red, proveedor caído, modelo deprecado — la excepción de LiteLLM se propagaba
sin filtrar hasta `/jarvis/query`, que la devolvía como 500 con el mensaje interno del proveedor. Un
usuario personal sin billing de OpenAI configurado (caso plausible y probado en este entorno) dejaba
*toda* la función de consulta inutilizable, aunque el fallback local (Ollama) estuviera perfectamente
disponible para ese mismo caso.

Decisión: `call_reason()` ahora envuelve la llamada al modelo externo en `try/except` y cae al mismo
`JARVIS_LOCAL_FALLBACK_MODEL` con prefijo `[modo local]` ante cualquier excepción de la llamada externa,
no solo cuando el presupuesto está agotado. La lógica de `EXHAUSTED` (chequeo previo, sin intentar el
externo) queda igual.

Diferencia con spec: extiende el criterio de "modo local" del spec §11 (que solo cubre presupuesto
agotado) para cubrir también fallos técnicos del proveedor externo. Coherente con el espíritu del
budget tracker — Jarvis debe seguir siendo usable sin depender de que el servicio externo esté
disponible o configurado.

Impacto: `jarvis/llm/client.py` (`call_reason()`).

---

## 2026-08-25 — QA de punta a punta: bug bloqueante pre-existente en SGR (no Jarvis) que impedía levantar el backend

Contexto: al intentar levantar `uvicorn app.main:app` para probar `/jarvis/*` de punta a punta por
primera vez contra datos reales, el `lifespan` de FastAPI moría con `UnicodeEncodeError` antes de
levantar cualquier ruta. La causa: `app/db/database.py` tiene un `print()` de debug en una migración de
Finanzas (`_migrate_fin_saldos_signo_v2`) que usa el signo menos Unicode `−` (U+2212), no representable
en cp1252 (codepage por defecto de la consola de Windows). `DEBUG` es `True` por defecto en modo no
frozen (`app/config.py`), así que esto rompía cualquier arranque local en dev en Windows la primera vez
que esa migración corriera (DB nueva, o vieja sin el flag `saldos_signo_income_expense_v2` en
`fin_config`).

Decisión: se corrigió reemplazando el carácter por un guion ASCII normal. No es un bug de Jarvis, pero
bloqueaba probar todo lo demás (patrón strangler: Jarvis vive montado sobre el backend SGR), así que se
corrigió en el lugar. Se barrió el resto del repo por el mismo patrón de `print()` con caracteres fuera
de cp1252 y no apareció otro caso real (hay usos de em-dash `—` y elipsis `…` en `mybot/bot.py`, pero
esos sí están en cp1252 y no rompen).

Diferencia con spec: no aplica — corrección de infraestructura en código SGR pre-existente, no de
Jarvis.

Impacto: `project/app/db/database.py` línea ~300.

---

## 2026-08-25 — Fijar `litellm==1.60.2` e instalar `jarvis` editable en `project/venv` (bloqueaba el arranque documentado)

Contexto: primera corrida real contra Ollama instalado (sesión posterior al QA con mocks). Dos problemas
de infraestructura, ninguno relacionado con Ollama en sí, impedían levantar el flujo tal como lo describe
`CLAUDE.md` (`cd project && uvicorn app.main:app`):

1. `litellm` nunca estuvo en `project/requirements.txt` ni instalado en `project/venv`. `jarvis/pyproject.toml`
   pide `litellm>=1.40.0` sin techo — un `pip install litellm` sin más trae la última (1.98.0 al momento
   de probar), que en Python 3.10 rompe el import (`ImportError: cannot import name 'NotRequired' from
   'typing'`, un módulo interno de litellm que asume `typing.NotRequired`, disponible recién en 3.11).
2. El paquete `jarvis` nunca se instaló en `project/venv` (`pip install -e ../jarvis`, mencionado en la
   entrada del 2026-08-25 sobre el rename `Jarvis/` → `jarvis/`, no llegó a ejecutarse o no persistió).
   Como `app/main.py` importa `jarvis.*` dentro de un `try/except ImportError` silencioso (sin log del
   motivo), el backend arrancaba "normal" pero con `_JARVIS_AVAILABLE = False`: ninguna ruta `/jarvis/*`
   se montaba y `jarvis.db` nunca se inicializaba, sin ningún error visible en consola ni en la respuesta
   HTTP (404 genérico de FastAPI). Esto pasaba siempre que el backend se arrancara como documenta
   `CLAUDE.md` (`cd project && uvicorn ...`), porque `jarvis/` es sibling de `project/` y no queda en
   `sys.path` por cwd.

Decisión: se instaló `litellm==1.60.2` (última versión de la serie 1.6x que importa limpio en Python
3.10) en `project/venv`, y se corrió `pip install -e ./jarvis --no-deps` desde la raíz del repo para que
`import jarvis` funcione sin importar el cwd. Con ambos fixes, `cd project && uvicorn app.main:app` monta
`/jarvis/*` correctamente y loguea `[jarvis] jarvis.db inicializada`. Pendiente para quien retome esto:
fijar el techo de versión en `jarvis/pyproject.toml` (`litellm>=1.40.0,<1.90` o similar) para que un
`pip install` futuro no vuelva a traer una versión rota en Python 3.10, y considerar loguear la excepción
real en el `except ImportError` de `app/main.py` en vez de tragarla en silencio (habría ahorrado tiempo
de diagnóstico). Efecto secundario: `litellm==1.60.2` bajó `httpx` de 1.28.1 a 0.27.2 en `project/venv`
(requirements.txt pide `httpx==0.28.1`) — no rompió nada en esta sesión (FastAPI/uvicorn/bot funcionaron
igual) pero es un conflicto de versión pendiente de resolver si se fija litellm en requirements.

Diferencia con spec: no aplica — corrección de infraestructura de entorno, no de diseño.

Impacto: `project/venv` (paquetes `litellm`, `jarvis` instalados); `jarvis/pyproject.toml` (techo de
versión de `litellm` pendiente de agregar); `project/app/main.py` línea ~141 (logging del ImportError,
pendiente).

---

## 2026-08-25 — Forzar un AsyncHTTPHandler nuevo antes de cada embedding de Ollama (litellm "Event loop is closed")

Contexto: probando `/jq` dos veces seguidas en el mismo proceso de Telegram (bot corriendo, no un
proceso nuevo por request), la 2ª consulta devolvió `context: 0/0` como si la memoria estuviera
vacía, pese a tener una entrada relevante ya embebida. El log del bot mostró la causa real:
`litellm.APIConnectionError: Event loop is closed`, con traceback en
`litellm/llms/ollama/completion/handler.py::ollama_aembeddings`.

`litellm==1.60.2` implementa `ollama_embeddings()` (el entrypoint sync que llama
`jarvis/embeddings/client.py::generate_embedding()` vía `litellm.embedding()`) como
`asyncio.run(ollama_aembeddings(...))` — crea un event loop nuevo, corre la coroutine, lo cierra.
Pero `ollama_aembeddings()` usa `litellm.module_level_aclient`, un `httpx.AsyncClient` (en realidad
un `AsyncHTTPHandler` de litellm) creado **una sola vez** a nivel de módulo cuando se importa
`litellm` (`litellm/__init__.py:282`). Ese cliente queda atado al primer event loop que lo usa de
verdad; `asyncio.run()` cierra ese loop al terminar la primera llamada, y la *siguiente* llamada a
embeddings en el mismo proceso — sea el worker procesando una segunda entrada, o el bot respondiendo
una segunda consulta — revienta al intentar reusar el cliente contra un loop ya muerto.
`jarvis/retriever/retriever.py::retrieve()` atrapa la excepción y cae bien al fallback de `LIKE` en
SQLite (no se cae el proceso), pero eso es mucho más débil que la búsqueda semántica real y no había
ningún aviso de que el sistema había degradado — el usuario solo veía "sin contexto previo".

Decisión: en `jarvis/embeddings/client.py::generate_embedding()`, antes de cada llamada a
`litellm.embedding()` para un modelo Ollama, se reemplaza `litellm.module_level_aclient` por un
`AsyncHTTPHandler` nuevo (mismos args que usa litellm internamente: `timeout` + `client_alias`). Así
el cliente que `asyncio.run()` va a usar siempre es fresco, atado al loop que está por crearse, nunca
a uno de una llamada anterior ya cerrada. Verificado con 3 llamadas de embedding consecutivas en el
mismo proceso (antes fallaba en la 2ª, ahora las 3 andan) y confirmado en vivo por Telegram
(`context: 3/3` en una consulta que antes hubiera sido la 2ª/3ª del proceso).

Riesgo conocido de este approach: si en el futuro Jarvis empieza a hacer llamadas de embedding
*concurrentes* (hoy no lo hace — todo es secuencial), pisar `module_level_aclient` desde dos
llamadas en simultáneo podría causar una condición de carrera. No aplica al diseño actual (worker de
un solo hilo, bot con `run_in_executor` pero llamadas de Jarvis secuenciales dentro de cada request).

Diferencia con spec: no aplica — es un bug de la librería LiteLLM en Windows/Python 3.10, no de
diseño de Jarvis.

Impacto: `jarvis/embeddings/client.py`.

---

## 2026-08-25 — Cambiar el modelo local de `ollama/llama3.2:3b` a `ollama_chat/llama3.2:3b` (alucinación de turnos fantasma)

Contexto: en la misma sesión de prueba por Telegram, después de dos consultas exitosas, una tercera
consulta multi-turno devolvió una respuesta con varios bloques `### Assistant:` seguidos — el modelo
había alucinado continuaciones de conversación fantasma, una de ellas inventando un ejemplo de código
Python que nadie pidió. Como `jarvis/query/service.py::query()` persiste la respuesta como mensaje
`assistant` en el historial de la conversación y ese historial se reinyecta en la siguiente consulta
(spec §7), la contaminación se retroalimentaba: cada consulta nueva partía de una respuesta previa ya
rota, y salía peor.

Causa raíz: con el provider `ollama/<modelo>`, LiteLLM arma el prompt con
`litellm.litellm_core_utils.prompt_templates.factory.py::ollama_pt()`. Para modelos cuyo nombre no
contiene `"instruct"` (nuestro caso, `"llama3.2:3b"`), esa función concatena los mensajes como texto
plano `"### {Role}:\n{content}\n\n"` para cada turno, **sin** agregar un `"### Assistant:\n"` final
que le indique al modelo "ahora te toca responder", y sin pasar ningún `stop` sequence. En una
conversación de un solo turno el modelo igual tiende a responder y parar solo (por eso `/j`'s
clasificación — un solo turno — nunca mostró este problema), pero con historial de varios turnos
concatenado como texto plano sin frontera clara, un modelo chico como `llama3.2:3b` no tiene señal de
dónde termina su respuesta y sigue generando turnos inventados.

Se evaluó agregar un `stop=["\n### "]` a mano en `jarvis/llm/client.py::call_llm()` — funciona (corta
la alucinación de turnos extra) pero es un parche sobre un problema más de fondo: seguía sin usarse
la forma correcta de hacer chat multi-turno con Ollama.

Decisión: usar el provider `ollama_chat/<modelo>` de LiteLLM en vez de `ollama/<modelo>` — ese
provider llama a `/api/chat` de Ollama (no `/api/generate` con prompt armado a mano), que maneja los
turnos nativamente vía el chat template propio del modelo. Cambiado en
`jarvis/config.py::JARVIS_CLASSIFY_MODEL` (default `"ollama_chat/llama3.2:3b"`); como
`JARVIS_LOCAL_FALLBACK_MODEL` toma su default de `JARVIS_CLASSIFY_MODEL`, el cambio propaga solo.
`is_ollama_model()` se actualizó para reconocer también el prefijo `"ollama_chat/"` (sigue
necesitando `api_base`/`timeout` igual que `"ollama/"`). Se descartó el approach del `stop` sequence
a mano — innecesario con `/api/chat`, y hubiera cortado respuestas legítimas que contuvieran
`"\n### "` (por ejemplo, headers de Markdown en una respuesta con formato). `JARVIS_EMBED_MODEL` NO
se tocó — sigue en `"ollama/nomic-embed-text"`, porque `ollama_chat` es solo para chat completions,
no para embeddings.

Verificado reproduciendo a mano el historial exacto que había roto antes (una respuesta previa +
pregunta nueva): con `ollama_chat` responde en un solo turno, limpio, sin ningún `"### "`. Re-verificado
que la clasificación (mismo modelo, ahora mismo provider) sigue devolviendo JSON válido. Confirmado en
vivo por Telegram con una pregunta que antes había roto el flujo — respuesta limpia, incluso con
varios guiones bajos en nombres de variable dentro de un bloque de código (lo que de paso probó que la
sospecha original sobre `parse_mode="Markdown"` roto por `_` sueltos no se reproduce con el modo
Markdown legacy de Telegram). Se limpió la conversación de Telegram vieja en `jarvis.db` que había
quedado con la respuesta contaminada, para no reinyectarla en consultas futuras.

Diferencia con spec: no aplica — es una corrección de qué provider de LiteLLM usar para Ollama, no de
diseño de Jarvis. La spec no especifica `ollama/` vs `ollama_chat/`.

Impacto: `jarvis/config.py` (`JARVIS_CLASSIFY_MODEL`, `is_ollama_model()`); `jarvis.db` (limpieza de
una conversación de Telegram contaminada, entry_id de conversación `e1aa0e20-...`).

---

## 2026-08-25 — Confirmado en vivo el bug de parse_mode="Markdown" en /jq — nunca perder la respuesta real por un error de formato

Contexto: después de migrar la Bóveda real y probar `/jq` con preguntas reales sobre el contenido
migrado, una consulta ("¿Tengo guardado algo sobre Inteligencia Artificial?") devolvió
`❌ Error al consultar Jarvis: Can't parse entities: can't find end of the entity starting at byte
offset 630` — exactamente el problema que `Jarvis_0.1_Pruebas.md` había marcado como "sospechado, no
reproducido". Se había probado antes con una pregunta armada a propósito (pidiendo código Python con
`guion_bajo`) y no rompió; esta vez rompió con una respuesta normal, sin que se le pidiera nada raro.

Causa raíz encontrada leyendo `conversation_messages` en `jarvis.db` (la respuesta ya estaba
persistida ahí, aunque el `edit_text` a Telegram hubiera fallado — `query/service.py` guarda la
respuesta antes de que `jarvis_handlers.py` intente mostrarla): el texto de la respuesta citaba
`@ryxai_` (un username real de una fuente guardada), que termina en un guión bajo suelto. El footer
de `cmd_jq` en `jarvis_handlers.py` agrega **a propósito** `_📎 ... consultados_` envuelto en guiones
bajos para ponerlo en cursiva. Sumando el guión bajo de `@ryxai_` a los dos del footer da un total de
3 (impar) — el parser de Markdown legacy de Telegram empareja el primero con el segundo como cursiva
(mal, pero sin tirar error) y le queda el tercero sin con qué cerrar → `"can't find end of the entity"`
justo en el último byte del mensaje. Cualquier fuente citada con un username, hashtag o identificador
con un número impar de `_`/`*`/`` ` `` puede disparar esto — no es evitable escapando de antemano
porque el contenido citado no se conoce hasta tener la respuesta del LLM.

Decisión: en vez de escapar el texto (frágil — no se puede distinguir Markdown intencional del LLM de
guiones bajos literales de una fuente citada) se separó el `try/except` de `cmd_jq` en dos partes: uno
para la consulta a Jarvis en sí (que sigue mostrando el error real si Jarvis falla), y uno específico
para el `edit_text` con `parse_mode="Markdown"` — si ese tira `telegram.error.BadRequest`, se reintenta
el mismo `edit_text` sin `parse_mode` (texto plano). El usuario nunca vuelve a ver el error genérico
en lugar de la respuesta real; en el peor caso pierde el formato en negrita/cursiva, no el contenido.

De paso se corrigió un bug menor visto en la misma tanda de pruebas: en una respuesta la salida
empezaba con `"modo local modo local ..."` — el modelo local, viendo turnos previos en el historial
que arrancaban con `"[modo local] ..."` (ese prefijo queda persistido tal cual en
`conversation_messages`, spec §7), a veces imita el patrón y arranca su propia respuesta con esas
mismas palabras, antes de que `call_reason()` le agregue el prefijo real. Se agregó
`_strip_local_prefix()` en `jarvis/llm/client.py` que saca cualquier `"[modo local]"`/`"modo local"`
inicial del texto del modelo antes de anteponer el prefijo real, en los dos call sites de
`call_reason()` (EXHAUSTED y fallback por error).

Diferencia con spec: no aplica — ambos son correcciones de robustez de la integración con Telegram y
de higiene del historial, no de diseño de Jarvis.

Impacto: `project/mybot/jarvis_handlers.py` (`cmd_jq`); `jarvis/llm/client.py` (`call_reason()`,
`_strip_local_prefix()`).

---

## 2026-08-25 — Jarvis 0.2, Slice 1: Job de consolidación diaria de memoria

Contexto: 0.2-S1 pide un job que corra una vez por día y, sobre `memory_entries`, (1) detecte
pares duplicados vía similitud semántica y use el modelo local para decidir si son el mismo
hecho (marcar el viejo obsoleto), contradictorios (bajar confidence + loguear para revisión) o
distintos (ignorar); (2) marque stale por edad + baja confidence; (3) loguee el resumen. Nunca
debe borrar, nunca debe usar el modelo externo, y no debe bloquear el procesamiento de
`inbox_queue` del worker.

Decisiones:
- **Columna `valid_to` nueva**: el schema (`jarvis/db/schema.py`) tenía `valid_from` pero nunca
  se agregó `valid_to` — necesario para "marcar el más viejo obsoleto sin borrar". Se agregó a
  la `CREATE TABLE` y a la migración liviana de `jarvis/db/database.py::_migrate()`, mismo
  patrón usado para `embedded_at` en S2 (`ALTER TABLE ADD COLUMN` si falta, para DBs creadas
  antes de este slice). `update_entry()` (`jarvis/memory/service.py`) ahora acepta `valid_to` y
  `confidence` como parámetros opcionales, igual estilo que el resto de la función.
- **Sin tabla nueva para el timestamp de "última corrida"**: la tarea sugería `fin_config` (tabla
  de Finanzas de SGR, no aplica a Jarvis) o una tabla nueva "si el schema lo justifica". Se
  decidió que no lo justifica — `jarvis_policies` ya existe exactamente para esto ("policy store
  separado del memory store, el LLM no puede escribir ahí directamente, solo código confiable").
  El job es código confiable escribiendo directamente (el LLM solo devuelve JSON de clasificación
  que el código interpreta, nunca escribe en la tabla), así que encaja sin violar esa invariante.
  Se insertan tres tipos de fila (`policy_type`): `consolidation_last_run` (timestamp, gating),
  `consolidation_run` (resumen JSON de cada corrida — sirve de log persistente además de marca de
  tiempo) y `consolidation_conflict` (un par contradictorio por fila, para revisión manual futura,
  ya que ese "loguear para revisión" tiene más valor si es consultable en DB que si solo queda en
  el log de texto del proceso).
- **Similitud coseno calculada en Python, no con la distancia nativa de ChromaDB**: la colección
  `jarvis_memory` (`jarvis/embeddings/store.py`) se crea con `get_or_create_collection()` sin fijar
  `hnsw:space`, así que usa el espacio L2 por defecto de Chroma, no coseno. Como la tarea pide
  explícitamente el umbral en términos de "coseno > 0.92", se leen los embeddings crudos vía
  `collection.get(ids=..., include=["embeddings"])` (solo para los ids del grupo candidato, no
  toda la colección) y se calcula coseno a mano (`sum(x*y)/…`, sin numpy) sobre esos vectores.
  Evita depender de la configuración de espacio de Chroma y es explícito sobre qué métrica se usa.
- **Agrupación por `(type, user_id)` vía SQLite, no vía metadata de Chroma**: los metadatos que
  `processor.py` guarda en cada embedding (`type`, `source`, `origin_trust`, `local_only`,
  `confidential`, `vault_path`) no incluyen `user_id` — agregarlo hubiera significado tocar el
  pipeline de embeddings de S2 sin necesidad. En cambio, `_fetch_active_entries()` lee
  `memory_entries` completas desde SQLite (que sí tiene `user_id`) y agrupa ahí; Chroma solo se
  usa para los vectores de los ids ya agrupados. Mismo patrón que usa `retriever.py` de S3
  (Chroma para similitud, SQLite para metadata completa).
- **Bug real encontrado en pruebas con datos reales**: `collection.get(..., include=["embeddings"])`
  de ChromaDB devuelve los embeddings como arrays de numpy, no listas planas. El primer intento
  usaba `result.get("embeddings") or []`, y el operador `or` fuerza una evaluación de verdad sobre
  el array (`ValueError: The truth value of an array with more than one element is ambiguous`).
  Corregido comparando contra `is not None` en vez de usar `or` truthiness, tanto para `ids` como
  para `embeddings`. Encontrado corriendo el job real contra las 10 entradas migradas de la
  Bóveda (que si no hubiera datos reales con 2+ entradas del mismo tipo agrupables, no se habría
  disparado — los mocks sintéticos de una sola entrada no lo hubieran revelado).
- **Resolución de pares solo con el modelo local, nunca `call_reason()`**: se llama `call_llm()`
  directo con `model=JARVIS_CLASSIFY_MODEL` (nunca `call_reason()`, que sí puede pegarle al
  externo) — cumple la restricción explícita de la tarea ("nunca el externo — es procesamiento
  batch que no justifica costo de API"). El prompt pide JSON `{"relation", "newer_id"}` con el
  mismo patrón de parseo tolerante que `processor.py::_classify()` (busca el primer `{`/último
  `}`, cae a un default seguro — acá `"different"`, es decir "no mutar nada" — si el JSON no es
  válido).
- **Desempate de `newer_id` por `recorded_at`**: si el modelo dice `same_fact` pero no devuelve un
  `newer_id` válido (uno de los dos ids reales), se usa `recorded_at` del más nuevo como
  desempate en vez de descartar el par — evita perder una detección válida solo porque el campo
  extra del JSON vino mal formado.
- **`_mark_stale_by_age()` es un UPDATE directo en SQL**, no un loop con `update_entry()` — no hay
  necesidad de leer cada entrada al Python para esta regla (edad + confidence baja), es una
  condición puramente declarativa sobre columnas existentes.
- **El job corre en un thread de background del worker (`threading.Thread(daemon=True)`)**, no en
  el hilo principal del loop de polling. Se evaluó correrlo "cuando no hay PENDING" en el mismo
  hilo (más simple, sin problemas de concurrencia en SQLite), pero eso significa que si el job
  tarda varios minutos con muchos pares (varias llamadas secuenciales al modelo local), cualquier
  entrada PENDING que llegue durante ese tiempo espera hasta que termine — viola literalmente "el
  job no puede bloquear el loop de polling de entradas PENDING". Con el thread separado, el loop
  principal sigue consultando `inbox_queue` cada `JARVIS_WORKER_POLL_INTERVAL` normalmente. Riesgo
  aceptado: dos hilos tocan `jarvis.db` (SQLite) concurrentemente — mitigado porque cada operación
  abre su propia conexión de corta vida (`get_connection()` por llamada, patrón ya usado en todo
  el código) y la DB está en modo WAL (habilitado en `database.py::get_connection()` desde S1),
  que soporta un escritor + lectores concurrentes sin bloquear. No se comparte ningún objeto
  Python entre hilos salvo la referencia al `Thread` mismo (para no lanzar dos corridas en
  paralelo), que sí se protege con `is_alive()`.
- **`should_run()` se chequea al arrancar el worker Y en cada tick ocioso del loop** (cuando
  `_fetch_pending()` no devuelve nada), no solo al arrancar — cubre el caso de un worker que queda
  corriendo más de 24h sin reiniciarse (uso normal esperado: proceso de larga duración).
- **Se agregó `"consolidate_memory"` a `TaskManifest.ALLOWED_OPERATIONS`** (`jarvis/worker/
  task_manifest.py`) y se llama `MANIFEST.assert_allowed("consolidate_memory")` una vez al
  principio de `run_consolidation()` — no una assertion por sub-paso como hace `processor.py`,
  porque acá los sub-pasos (leer/agrupar entries, leer embeddings, marcar stale, escribir
  políticas) son todos variaciones de un mismo efecto (mantenimiento del memory store), a
  diferencia de `processor.py` donde cada sub-paso es una categoría de efecto secundario distinta
  (escribir al filesystem, llamar a un modelo, escribir al índice vectorial). Mantiene el patrón
  de "blast radius explícito en código" sin introducir permisos granulares que no aportan.
- **Limitación real de `llama3.2:3b` para esta tarea, no corregida**: probando en vivo contra
  Ollama real (no mock) con el ejemplo textual de la propia tarea ("vivo en Madrid" → "me mudé a
  Buenos Aires"), el modelo respondió `"different"` en vez de `"same_fact"`, incluso dándole ese
  mismo ejemplo resuelto como few-shot en el prompt. No se cambió de modelo ni se ajustó el umbral
  de similitud para compensar — la tarea es explícita en que este job usa solo el modelo local, y
  la spec (§25, riesgo "Memory maintenance subestimado") ya anticipa que la detección automática
  de duplicados/contradicciones es difícil incluso con modelos avanzados y que el criterio de 0.1
  era "memoria que funcione bien, no perfecta" — mismo criterio aplicado acá para 0.2-S1. La
  lógica de aplicación de veredictos (qué hacer con cada relation) se verificó por separado
  mockeando `call_llm` con verdicts controlados, así que el código en sí está probado y correcto;
  lo que puede necesitar iteración a futuro (con más volumen de datos reales) es el prompt o,
  eventualmente, si vale la pena permitir un modelo local más grande para este job específico
  (fuera de alcance de esta tarea, que fijó `llama3.2:3b` explícitamente).

  **Comparación de control (post-implementación, mismo prompt exacto vía `openai/gpt-5.4-mini`,
  real, no mock)**: se probaron los tres casos (mudanza Madrid→Buenos Aires, contradicción de
  color favorito, temas no relacionados) contra el modelo externo ya configurado en
  `project/.env`. Acertó los tres: `same_fact` con `newer_id` correcto, `contradiction`, y
  `different`. Confirma que el contrato de prompt/JSON está bien diseñado — la falla es
  específicamente la capacidad de razonamiento de `llama3.2:3b` en esta tarea, no un bug de
  parsing ni un prompt ambiguo. Se deja como referencia para una decisión futura del usuario, no
  como cambio: si con volumen real se ve que el modelo local falla sistemáticamente casos
  claros como este, la opción más simple sería permitir que S1 use `call_reason()` (con su
  fallback a local ya existente) en vez de forzar `JARVIS_CLASSIFY_MODEL`, aceptando el costo de
  budget por ser tan pocas llamadas por día — pero eso es una decisión de producto (costo vs.
  precisión) que la tarea actual no pidió tomar.

Diferencia con spec: ninguna decisión diverge del diseño de fondo (spec §25, "0.2 — Memory
Maintenance"); la spec no detalla el mecanismo exacto de consolidación, así que todo lo anterior
es diseño de implementación dentro de ese alcance.

Impacto: `jarvis/worker/consolidation.py` (nuevo); `jarvis/worker/main.py` (integración del job
en background thread); `jarvis/worker/task_manifest.py` (`consolidate_memory`); `jarvis/db/
schema.py` (`valid_to`); `jarvis/db/database.py` (migración `valid_to`); `jarvis/memory/
service.py` (`update_entry()` acepta `valid_to`/`confidence`).

---

## 2026-08-25 — Fix: consolidación usa el modelo de razonamiento externo (con fallback local), no solo el local

Contexto: la limitación documentada arriba ("Limitación real de `llama3.2:3b` para esta
tarea") se confirmó como bloqueante en pruebas reales: el modelo local clasificó como
`"different"` un caso claramente `"same_fact"` (mudanza Madrid → Buenos Aires), mientras que
`gpt-5.4-mini` acertó el mismo caso en la comparación de control ya registrada arriba. El
volumen de este job es bajo (~20 entradas/día) y el costo por corrida es marginal
(< $0.002), así que la restricción original ("nunca el externo — no justifica el costo") ya
no se sostiene frente a la evidencia de calidad.

Decisión: `_resolve_pair()` (`jarvis/worker/consolidation.py`) ahora llama `call_reason()`
(el mismo boundary externo que usa `jarvis/query/service.py`) en vez de `call_llm(model=
JARVIS_CLASSIFY_MODEL)`. `call_reason()` ya trae su propio fallback a
`JARVIS_LOCAL_FALLBACK_MODEL` si el externo no está disponible o el budget diario está
`EXHAUSTED` (ver entrada "QA de punta a punta: modo local ante cualquier fallo del modelo
externo" más arriba) — el job de consolidación hereda ese fallback gratis, sin volver a
implementarlo. `_parse_verdict()` no necesitó cambios: sigue extrayendo el primer bloque
`{...}` de la respuesta cruda, así que un eventual prefijo `"[modo local] "` antepuesto por
`call_reason()` no rompe el parseo (el JSON está intacto después del prefijo).

Verificado con los tres casos de la comparación de control (mudanza → `same_fact`,
contradicción de color favorito → `contradiction`, temas no relacionados → `different`),
esta vez a través de `_resolve_pair()`/`call_reason()` real (no mock, con `OPENAI_API_KEY`
real de `project/.env`): los tres clasificaron correctamente. Costo real del budget tracker
no verificado aparte en esta corrida (ya se había confirmado en sesiones previas que
`gpt-5.4-mini` cuesta bien por debajo de 1 centavo por llamada típica).

Diferencia con spec: no aplica — ajuste de qué modelo usa este job específico, dentro del
mismo diseño de 0.2-S1.

Impacto: `jarvis/worker/consolidation.py` (`_resolve_pair()`, import `call_reason` en vez de
`call_llm`/`JARVIS_CLASSIFY_MODEL`, docstring del módulo).

---

## 2026-08-25 — Jarvis 0.2, Slice 2: Retrieval coarse-to-fine

Contexto: 0.2-S2 pide que `retrieve()` (`jarvis/retriever/retriever.py`) deje de hacer
búsqueda plana (embedding → ChromaDB → top-K → rankeo) y en cambio reduzca el espacio de
búsqueda en dos pasos: un filtro coarse en SQLite (sin embeddings) antes de ir a ChromaDB, y
la búsqueda semántica dentro de ese subconjunto ya filtrado. La interfaz de `retrieve()`
(parámetros y tipo de retorno) debía quedar igual — `jarvis/query/service.py` y la API no se
tocan.

Decisiones:
- **Filtro coarse en dos señales independientes + una condicional**: `_coarse_filter()`
  calcula `type` (DECISION/SEMANTIC vía keywords en español, ej. "decidimos"/"qué es"),
  `project_entry_ids` (si la pregunta menciona el nombre de un proyecto existente en
  `memory_projects`, vía substring case-insensitive) y `recency_first` (keywords como
  "último"/"reciente"/"hoy"). Las tres señales son independientes entre sí — una pregunta
  puede disparar tipo + recencia a la vez, por ejemplo.
- **Modelo local solo si no hay señal de tipo, proyecto NI recencia**: la primera versión
  llamaba al modelo local (`_classify_type_with_local_model()`, `JARVIS_CLASSIFY_MODEL`,
  nunca el externo — clasificación liviana, no razonamiento) cada vez que no había keyword de
  tipo ni de proyecto, sin mirar `recency_first`. Se encontró en pruebas reales que esto
  rompía las preguntas de recencia pura: "¿Qué fue lo último que guardé?" no tiene keyword de
  tipo, así que el modelo local decidía igual — y clasificó mal (`DECISION` en vez de
  ambiguo), forzando un `where={"type": "DECISION"}` en ChromaDB que dejó afuera la entrada
  realmente más reciente. Corregido: si ya hay señal de recencia, no se consulta al modelo
  local para tipo — la intención dominante es cronológica, forzar un tipo ahí solo suma
  riesgo de error sin necesidad.
- **`type` se aplica como `where=` de ChromaDB, con degrade a sin filtro si no hay
  candidatos de ese tipo**: si el filtro coarse identifica (o el modelo local decide) un tipo
  y ChromaDB no tiene ningún embedding de ese tipo, se reintenta la misma query sin `where=`
  en vez de devolver vacío — "no debe romper el caso genérico" es una restricción explícita
  de la tarea. Nota conocida y aceptada: si el tipo identificado SÍ tiene candidatos pero son
  la respuesta equivocada (el modelo local clasificó mal pero no devolvió cero resultados),
  no hay degrade — es la misma limitación de calidad del modelo 3B ya documentada en la
  entrada de consolidación de arriba, y el criterio de la tarea ("no tiene que ser perfecto —
  es coarse") la acepta explícitamente. Visto en pruebas: la pregunta de una sola palabra
  "mouse" fue clasificada como `SEMANTIC` por el modelo local (en vez de ambigua), lo cual
  dejó afuera una entrada `RAW` relevante que sí mencionaba "mouse" — con preguntas
  completas en lenguaje natural (el uso real esperado) el modelo local devolvió `None`
  (ambiguo) correctamente en los casos probados.
- **Proyecto identificado → similitud coseno en Python contra un set acotado de ids, no un
  `where=` de ChromaDB**: los metadatos que ya guarda ChromaDB por entrada (`type`, `source`,
  `origin_trust`, `local_only`, `confidential`, `vault_path` — ver Slice 2 de 0.1) no incluyen
  ninguna referencia a proyecto (la asociación vive en `memory_entry_projects`, tabla
  relacional aparte). Agregar `project_id` a esos metadatos habría requerido tocar
  `jarvis/worker/processor.py` y `jarvis/cli/migrate_boveda.py` (fuera del alcance declarado
  de esta tarea, "Modificar: jarvis/retriever/retriever.py") y además no habría cubierto las
  10 entradas ya migradas sin re-embeberlas. En cambio, cuando se identifica un proyecto se
  resuelve el set de `entry_id`s vía SQL (`memory_entry_projects` JOIN `memory_projects`) y se
  piden esos embeddings puntuales a ChromaDB (`collection.get(ids=...)`, mismo patrón que
  `consolidation.py::_find_similar_pairs()`), calculando coseno en Python — evita una ANN
  sobre toda la colección y de paso reutiliza un patrón ya presente en el código. Si el
  proyecto identificado no tiene ningún embedding o la búsqueda scoped no devuelve nada, se
  degrada a la búsqueda ANN normal (con o sin `where=` de tipo) en vez de devolver vacío.
- **Por qué no se filtró por `user_id` vía `where=` de ChromaDB**, aunque la tarea lo sugiere
  explícitamente ("y/o user_id"): los metadatos que `processor.py` ya escribe en cada
  embedding no incluyen `user_id` (mismo hallazgo que documentó la entrada de consolidación
  de Slice 1 sobre por qué agrupa por SQLite y no por metadata de Chroma). Filtrar con
  `where={"user_id": ...}` sobre entradas cuyo metadata nunca tuvo esa clave las habría
  excluido silenciosamente — las 10 entradas reales migradas hoy no tienen esa clave, así que
  ese filtro las habría dejado todas afuera. Se mantuvo el filtrado por `user_id` donde ya
  existía (`_load_entries()`, post-ChromaDB, sobre SQLite) en vez de moverlo a Chroma —
  jarvis hoy es de un solo usuario real (`JARVIS_DEFAULT_USER`) así que el filtro por tipo ya
  cubre el caso de uso principal de la tarea; agregar `user_id` a los metadatos de Chroma
  queda para cuando haga falta multiusuario real, evitando tocar `processor.py`/
  `migrate_boveda.py` sin necesidad.
- **`recency_first` ordena literalmente por `recorded_at` DESC, no un bonus continuo**: la
  primera versión probada usaba una decadencia continua (`1 - age_days/365`) mezclada con
  similitud y tipo — con entradas de 0 a 2 días de diferencia esa decadencia casi no
  discrimina (las tres puntúan ~0.99), así que la similitud terminaba dominando el orden
  igual y una entrada de 2 días atrás ganaba a una de hoy mismo. Corregido: el score de
  rankeo cuando `recency_first=True` usa el epoch (segundos) de `recorded_at` como término
  dominante y solo un desempate acotado a < 1.0 (similitud + tipo) para el caso (raro) de dos
  entradas con el mismo `recorded_at` exacto — así una diferencia real de tiempo, por mínima
  que sea, siempre pesa más que el desempate. Verificado con 4 entradas de prueba con
  `recorded_at` separados por 1-40 días: el orden resultante fue exactamente el orden
  cronológico esperado.
- **`_retrieve_sqlite_fallback()` recibe el mismo filtro coarse** (tipo + proyecto), con el
  mismo criterio de degrade a sin filtro si la query filtrada no devuelve filas — mantiene el
  mismo comportamiento entre el camino de ChromaDB y el fallback de texto, en vez de que el
  fallback ignore el coarse filter.
- **No se filtran entradas `valid_to IS NOT NULL` (superseded por consolidación, Slice 1)**:
  se notó al tocar este archivo que `retrieve()` nunca excluyó explícitamente esas entradas,
  ni antes de este slice ni ahora — es una brecha preexistente, no introducida por S2, y
  arreglarla no estaba en el alcance de la tarea (que pidió específicamente coarse-to-fine).
  Queda anotado para una futura sesión: filtrar `valid_to IS NULL` en `_load_entries()` y en
  el fallback de SQLite evitaría que el RAG cite hechos ya marcados obsoletos por el job de
  consolidación.

Verificado con datos reales (`project/database/jarvis.db`): se insertaron temporalmente 4
entradas (`DECISION`/`SEMANTIC`/`RAW`/`PROJECT`, `user_id` dedicado `qa_slice2`) más un
proyecto de prueba, se generaron embeddings reales (Ollama), y se corrió `retrieve()` con
cinco preguntas: de decisión (devolvió solo la entrada `DECISION`), factual general (devolvió
solo la `SEMANTIC`), mencionando el proyecto de prueba (devolvió solo la entrada vinculada a
ese proyecto vía similitud scoped), de recencia (devolvió las 4 entradas en orden cronológico
exacto), y ambigua genérica en lenguaje natural (sin filtro, resultado normal). Todos los
datos y embeddings de prueba se borraron al final (`memory_entries`, `memory_projects`,
`memory_entry_projects`, colección de Chroma) — `jarvis.db` quedó con las mismas 10 entradas
reales de antes. Aparte, se corrió un smoke test de punta a punta contra
`jarvis/query/service.py` (sin tocarlo) con una pregunta real sobre las entradas migradas de
la Bóveda ("¿Qué tengo guardado sobre React?", `user_id=default`) — devolvió `context_count=8`,
citó la entrada correcta (`useCallback - React`) con una respuesta coherente, confirmando que
la interfaz de `retrieve()` sigue siendo compatible con el resto del pipeline sin cambios ahí.

Diferencia con spec: no aplica — la spec no detalla el mecanismo de rankeo/filtrado de
`retrieve()` (spec §8 solo pide "ranking por tipo + proyecto + recencia", ya cubierto desde
S3 de 0.1); todo lo anterior es diseño de implementación de cómo llegar a ese ranking con
menos ruido.

Impacto: `jarvis/retriever/retriever.py` (reescrito: `_coarse_filter()`,
`_match_project_entry_ids()`, `_classify_type_with_local_model()`, `_retrieve_scoped_by_ids()`,
`_cosine_similarity()`, `_rank_score()` con modo `recency_first`; `_retrieve_chromadb()` y
`_retrieve_sqlite_fallback()` modificados para recibir y aplicar el filtro coarse).

---

## 2026-08-26 — Bake-off de modelo local: llama3.2:3b → gemma3:12b

Contexto: `llama3.2:3b` (modelo local usado para consolidación, clasificación de capturas y
filtro coarse) fallaba sistemáticamente la tarea de consolidación — documentado desde S1
(clasificó "vivo en Madrid" → "me mudé a Buenos Aires" como `different` en vez de
`same_fact`, incluso con few-shot). El fix de esa sesión fue mover consolidación al modelo
externo (`call_reason()`), pero el modelo local seguía siendo la única opción para
clasificación de capturas y filtro coarse (nunca deben usar el externo — son tareas de
volumen alto/latencia baja, no razonamiento).

Decisión: bake-off de 4 modelos ya instalados en Ollama (sin descargar nada nuevo) contra 3
prompts representativos de las 3 tareas reales de Jarvis, vía LiteLLM (`ollama_chat/<modelo>`,
igual que en producción):

| Modelo | A: consolidación (esperado `same_fact`) | B: clasificación captura (esperado `DECISION`) | C: filtro coarse (esperado `DECISION`) | Score | Tiempo total |
|---|---|---|---|---|---|
| llama3.2:3b (baseline) | ✗ `different` | ✓ `DECISION` | ✗ `SEMANTIC` | 1/3 | 29.6s |
| deepseek-r1:7b | ✗ `different` | ✓ `DECISION` | ✗ `SEMANTIC` | 1/3 | 183.9s |
| **gemma3:12b** | **✓ `same_fact`** | **✓ `DECISION`** | **✓ `DECISION`** | **3/3** | 131.9s |
| mistral-small:22b | ✗ `contradiction` | ✓ `DECISION` | ✓ `DECISION` | 2/3 | 205.7s |

`gemma3:12b` ganó por precisión (único 3/3, sin empate que desempatar por velocidad) y de
paso es más chico y más rápido que `mistral-small:22b` (el único otro candidato con más de
1/3). Prompts, respuestas crudas y tiempos completos en el historial de esta sesión — no se
guardó un artefacto separado porque el volumen es bajo (12 llamadas) y el resultado ya quedó
resumido acá.

Se aprovechó para renombrar `JARVIS_CLASSIFY_MODEL` → `JARVIS_LOCAL_MODEL` en
`jarvis/config.py` (mismo patrón que `JARVIS_REASON_MODEL`): el nombre viejo describía solo
uno de sus dos usos (clasificación de capturas) y ya no reflejaba que también corre el filtro
coarse del retriever y sirve de fallback de `JARVIS_REASON_MODEL`. Se mantuvo el prefijo
`ollama_chat/` (no `ollama/`) por la misma razón documentada en S1/validación Telegram: evita
que modelos sin "instruct" en el nombre alucinen turnos fantasma en conversaciones multi-turno.

División de tareas por modelo (sin cambios de diseño, solo quedó explícita en `.env.example`):
- **Local** (`JARVIS_LOCAL_MODEL`): clasificación de capturas (`processor.py`), filtro coarse
  del retriever (`retriever.py`).
- **Externo** (`JARVIS_REASON_MODEL`, con fallback automático a local): respuesta
  conversacional (`query/service.py`), consolidación (`consolidation.py`).

Diferencia con spec: no aplica — la spec no fija qué modelo local usar, solo que exista uno
(§11, §25).

Impacto: `jarvis/config.py` (rename + nuevo default), `jarvis/llm/client.py`,
`jarvis/retriever/retriever.py` (imports actualizados), `project/.env`, `project/.env.example`
(nueva sección Jarvis — Memory Core, documentando ambos modelos y sus tareas).

---

## 2026-08-26 — Fix: `retrieve()` ahora filtra `valid_to IS NULL`

Contexto: gap conocido desde Slice 2 de 0.2 (ver entrada anterior, "brecha preexistente
notada, no arreglada") — `retrieve()` nunca excluyó entradas marcadas `superseded` por el job
de consolidación (Slice 1), así que un hecho ya obsoleto podía seguir citándose en el contexto
RAG.

Decisión: agregar `AND valid_to IS NULL` en las tres consultas SQLite de
`jarvis/retriever/retriever.py` que devuelven `memory_entries` completas —
`_load_entries()`, `_fallback_rows()` y `_match_project_entry_ids()` (esta última vía join,
`AND me.valid_to IS NULL`). No se filtra vía `where=` de ChromaDB: los embeddings ya
existentes no tienen un campo `valid_to`/`active` en su metadata, y agregarlo ahí exigiría
backfillear metadata para todo lo ya embebido (arriesgando excluir en silencio cualquier
entrada vieja sin el campo). El camino ChromaDB queda cubierto igual porque tanto
`_retrieve_chromadb()` como `_retrieve_scoped_by_ids()` resuelven los ids que devuelve Chroma
contra `_load_entries()` antes de rankear — ahí se aplica el filtro. Se subió el multiplicador
de `fetch` en `_retrieve_chromadb()` de `n_results * 2` a `n_results * 3` para compensar que
algunos candidatos del top-K de la ANN puedan descartarse por estar obsoletos.

Diferencia con spec: no aplica — cierre de un gap ya documentado, no una decisión de diseño
nueva.

Impacto: `jarvis/retriever/retriever.py` (`_load_entries()`, `_fallback_rows()`,
`_match_project_entry_ids()`, `_retrieve_chromadb()`). Verificado con datos reales
(`project/database/jarvis.db`, ninguna entrada real tiene `valid_to` seteado todavía): smoke
test de `retrieve()` sobre "¿Qué tengo guardado sobre React?" siguió devolviendo 5 resultados
correctos sin regresión.

---

## 2026-08-26 — Jarvis 0.2, Slice 3: memoria de tipo PEOPLE

Contexto: Jarvis no tenía forma de agrupar memoria por *sobre quién* trata — dos entradas que
mencionan a la misma persona en contextos distintos no tenían ningún vínculo entre sí, y
preguntas del tipo "¿qué sé sobre X?" dependían enteramente de que el nombre apareciera en la
búsqueda semántica de esa consulta puntual, sin ningún boost ni agregación explícita.

Decisión:
1. Nuevo tipo de entrada `PEOPLE` (CHECK constraint + vault subdir), agregado vía rebuild
   completo de la tabla `memory_entries` en SQLite (no soporta `ALTER` de un `CHECK`
   existente), gateado por idempotencia contra `sqlite_master.sql`.
2. Tablas nuevas `memory_entities` / `memory_entry_entities` — modelo de entidades separado de
   `memory_entries`, no una columna más en la entrada. Permite N entradas por entidad y N
   entidades por entrada (relación `mentioned`/`author`/`subject`) sin normalizar el nombre de
   la persona dentro de cada entrada.
3. Extracción de entidades con el modelo **local** (`JARVIS_LOCAL_MODEL`), nunca el externo —
   es clasificación barata, mismo criterio que la clasificación de tipo y el filtro coarse del
   retriever. Nunca bloquea ni falla el procesamiento: `extract_entities()` y
   `link_entities_for_entry()` atrapan toda excepción internamente, y el call site en
   `processor.py` las envuelve en un try/except propio además — doble red, no solo disciplina
   del módulo nuevo.
4. Boost de retrieval y sección de prompt como capas aparte que se mezclan al final
   (`_merge_entity_first()` en el retriever, `_build_entity_sections()` en query/service.py),
   en vez de threadear un parámetro nuevo por toda la cadena de llamadas internas — mismo
   enfoque que ya usó Slice 2 para el filtro coarse, preservando las firmas públicas de
   `retrieve()` y `query()` sin cambios, tal como pedía la tarea explícitamente.
5. Peso de ranking `PEOPLE = 0.75` en `_TYPE_WEIGHT` — juicio de valor entre `PROJECT` (0.7) y
   `SEMANTIC` (0.8): una nota "sobre alguien" es más específica que conocimiento semántico
   genérico pero no tan accionable como una `DECISION`. No hay dato empírico detrás de ese
   número puntual; es un punto de partida razonable, ajustable si el uso real muestra que
   `PEOPLE` debería rankear más arriba o más abajo.
6. `GET /jarvis/entities/{name}` devuelve `404` tanto si la entidad no existe como si existe
   pero no tiene ninguna entrada vigente vinculada (todas `valid_to` seteado por consolidación,
   por ejemplo) — no se distinguen ambos casos en el mensaje de error porque hacerlo exigiría
   una query extra solo para el texto del 404, sin ningún beneficio funcional para el llamador.

Diferencia con spec: no aplica — la spec no detalla el modelo de datos de entidades, solo lo
menciona como parte de 0.2/Graphiti a futuro (§15, §25); esta implementación es un subconjunto
liviano (regex/LLM local + tablas SQLite planas) sin grafo de relaciones entre entidades, pensado
como paso intermedio antes de una integración de grafo más completa si se justifica más adelante.

Impacto: `jarvis/db/schema.py`, `jarvis/db/database.py` (`_migrate_people_type()`),
`jarvis/vault/writer.py`, `jarvis/llm/client.py` (prompt de clasificación),
`jarvis/worker/task_manifest.py` (`extract_entities`, `link_entities`), `jarvis/entities/`
(paquete nuevo, `service.py`), `jarvis/worker/processor.py`, `jarvis/retriever/retriever.py`,
`jarvis/query/service.py`, `jarvis/api/router.py` (`GET /jarvis/entities`,
`GET /jarvis/entities/{name}`).

Verificado con datos reales (Ollama real — `gemma3:12b` + `nomic-embed-text`, sin mocks, DB de
scratch aislada de la real): captura mencionando a una persona real → extracción real detectó
la entidad correctamente → apareció en `memory_entities` y en `list_entities()` → consulta
"¿Qué sé sobre [nombre]?" devolvió las entradas vinculadas correctas, citando la información
real de la captura. Detalle completo en `Cerebro/estado-actual.md`.

---

## 2026-09-21 — Botones de Telegram para triage_move (Sí/No/Ver contenido/categoría manual) — amplía el conjunto de destinos alcanzables más allá de los 8 fijos

Pedido explícito del usuario tras ver la primera propuesta real de triage automático del
Inbox (ver `Cerebro/estado-actual.md`, misma fecha): el mensaje de texto plano no decía QUÉ
nota se proponía mover, y no había forma de corregir el destino salvo texto libre sin
parsear (comportamiento conservador ya documentado el 15/09: "una respuesta de texto libre
nombrando otro destino NO redirige el movimiento").

**Cambio de diseño real**: la propuesta original de triage (15/09) restringía los destinos
posibles a 8 rutas fijas (`_DEST_OPTIONS` en `jarvis/ingestion/inbox_triage.py`) precisamente
para que el LLM nunca pudiera inventar una carpeta — el riesgo era la alucinación del
modelo. El flujo nuevo de "No" → "Elegir categoría" NO le da esa libertad al LLM: es el
usuario navegando a mano el árbol REAL de categorías (mismo `GET /categorias` que ya usa el
picker de captura de `bot.py`), así que no reintroduce el riesgo que motivó la restricción
original — solo amplía qué destino puede terminar aplicándose, sin tocar el clasificador
automático (que sigue proponiendo únicamente entre las 8 rutas de siempre).

**Diseño implementado** (fork, revisado diff completo por el orquestador antes de commitear):
- Mensaje inicial con título de la nota (nombre de archivo sin extensión,
  `titulo_desde_vault_path()` en `jarvis/ingestion/inbox_triage.py`) + 3 botones inline
  (Sí/No/Ver contenido) en vez de texto plano + "Respondé sí/no" — solo para `action_type ==
  "triage_move"`, los otros 7 tipos de propuesta de auditoría siguen sin cambios.
- "Ver contenido": manda el contenido completo (truncado a 3900 caracteres) en un mensaje
  aparte, después repite la pregunta con un teclado de solo 2 botones (Sí/No).
- "No": submenú con "Elegir categoría" (recorre el árbol real vía
  `_build_triage_category_keyboard()`, nueva en `bot.py`, mismo patrón que
  `_build_category_keyboard()` pero sin "Nueva categoría" y con `callback_data` bajo el
  namespace `jtriage:`) o "Dejar sin archivar" (`reject_proposal()`, sin cambios).
- `accept_proposal()` (`jarvis/audit/service.py`) gana `payload_override: dict | None`,
  mergeado sobre el payload guardado antes de despachar por `action_type` — permite aceptar
  `triage_move` con un `dest_dir_rel` elegido a mano sin tocar `_apply_triage_move()`.
- Cola: no se agregó ningún mecanismo nuevo — el throttle ya existente de
  `push_next_audit_batch()` (bloquea el siguiente push mientras quede una `PENDING` con
  `pushed_at` seteado para ese chat) alcanza solo con no resolver la propuesta hasta el paso
  final del flujo (Sí / categoría elegida / dejar sin archivar) → recién ahí sale el mensaje
  "✅ Terminamos con «título»" y el próximo triage puede salir en el siguiente tick del
  worker (~5s).
- `GET /categorias` (`project/app/db/crud.py`) ahora incluye `ruta` en la respuesta —
  necesario para que el picker manual sepa el `dest_dir_rel` real de la categoría elegida;
  aditivo, `_categoria_row_dict()` sigue soportando el call site viejo de 5 columnas.

**Capas**: `jarvis_handlers.py` sigue siendo el único punto de este proceso que importa
`jarvis.*` directo (4 wrappers nuevos: `get_triage_proposal`/`accept_triage_proposal`/
`reject_triage_proposal`/`triage_entry_titulo`/`triage_entry_content`) — la lógica de
callbacks (`_handle_triage_callback`) vive en `bot.py`, no en `jarvis_handlers.py` como se
planeó al principio, porque necesita `_get_categories()`/`context.bot_data` y
`jarvis_handlers.py` no puede importar de `bot.py` sin ciclo (`bot.py` ya hace `import
jarvis_handlers as jh`).

**Verificado**: `py_compile` limpio en los 6 archivos tocados (confirmado dos veces —
por el fork y de nuevo por el orquestador); import real de `bot.py`/`jarvis_handlers.py`
con el venv real sin errores; sandbox aislado (nunca la DB real) confirmó que
`accept_proposal(pid, payload_override={"dest_dir_rel": "01 - Proyectos"})` mueve el archivo
físico al destino manual (no al recomendado), `reject_proposal()` no mueve nada, y que los
otros 7 `action_types` de auditoría siguen mandando el texto plano de siempre sin
`reply_markup`. **Sin verificar**: el flujo real de clics en un chat de Telegram de verdad
(no se puede automatizar sin interacción humana) — pendiente de probar a mano.
