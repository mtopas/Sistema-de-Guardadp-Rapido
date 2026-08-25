# Estado Actual de Jarvis
Última actualización: 2026-08-25

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
JARVIS_CLASSIFY_MODEL=ollama/llama3.2:3b
JARVIS_REASON_MODEL=openai/gpt-4o-mini
JARVIS_EMBED_MODEL=ollama/nomic-embed-text
JARVIS_LOCAL_FALLBACK_MODEL=  # default: mismo que JARVIS_CLASSIFY_MODEL
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

Ninguno planificado para 0.1 — Jarvis 0.1 está completo. Ver checklist de completitud al final de
este documento para el alcance de 0.2+.

## Qué NO está todavía

- **Migración Bóveda ejecutada**: el script de S5 existe y está verificado, pero la migración real
  sobre `project/database/jarvis.db` del usuario no se corrió — la ejecuta el usuario cuando decida
  (`python -m jarvis.cli.migrate_boveda`, sin `--dry-run`).
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
