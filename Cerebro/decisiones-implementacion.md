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
