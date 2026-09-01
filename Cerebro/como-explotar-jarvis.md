# Cómo explotar Jarvis al máximo

Guía de combate, no manual de usuario. Basada en el código real a 2026-08-26
(`jarvis/memory/service.py`, `retriever.py`, `query/service.py`,
`consolidation.py`, `processor.py`, `entities/service.py`, `privacy/gateway.py`,
`captures/clarification.py`).
Objetivo: capturar bien, presionar el retrieval, romper cosas a propósito, y
saber leer `jarvis.db` cuando algo no cierra.

DB real: `project/database/jarvis.db` (override: `JARVIS_DB_PATH`). Modelo
local actual: `gemma3:12b` (`JARVIS_LOCAL_MODEL`). Modelo externo:
`JARVIS_REASON_MODEL` (default `openai/gpt-4o-mini`, en `.env` de este
proyecto está seteado a `gpt-5.4-mini`).

---

## 0. Dos gaps que existían — resueltos 2026-08-26

**Auto-linking de proyectos (`jarvis/projects/service.py`, nuevo).**
`_CLASSIFY_PROMPT` ya devolvía un campo `"project"`, pero `processor.py`
nunca lo usaba — `memory_projects`/`memory_entry_projects` quedaban siempre
vacías fuera de inserts manuales, así que el boost de retrieval por
proyecto (`_match_project_entry_ids` en `retriever.py`) nunca se activaba.
Ahora `processor.py` llama `link_project_for_entry(entry_id,
classification.get("project"))` después de clasificar (best-effort, con su
propio `try/except` en el call site — mismo patrón que la vinculación de
entidades): crea el proyecto si no existe (`created_by='jarvis_proposal_accepted'`,
único valor del `CHECK` que distingue "creado por Jarvis" de "creado a
mano") y lo vincula con `is_primary=1`. La sección 3 ("forzar boost de
proyecto") ya no necesita el `INSERT` manual — con capturar dos entradas
mencionando el mismo proyecto en el texto alcanza, siempre que el
clasificador identifique el campo `project` (no está garantizado — sigue
siendo criterio del modelo, no keyword).

**Merge conservador de alias de entidades (`jarvis/entities/service.py::_find_or_create_entity`).**
Antes, "Martín" y "Martín López" quedaban siempre como dos entidades
separadas (match exacto contra `name` únicamente; `aliases` nunca se
poblaba). Ahora, al crear una entidad nueva:
1. Match exacto (case-insensitive) contra el nombre canónico **o** contra
   un alias ya guardado (antes solo miraba `name`).
2. Si no hay match exacto, fusión por prefijo de tokens
   (`_is_unambiguous_alias_match`): "Martín" fusiona con "Martín López"
   porque comparten el primer token, en cualquier orden de llegada — pero
   **solo si hay un único candidato**. Con "Martín López" y "Martín
   Rodríguez" ya existentes, una mención nueva de "Martín" no fusiona con
   ninguno (ambiguo, no hay forma de adivinar cuál) y crea una entidad
   nueva — decisión deliberada, no un gap pendiente.
3. Containment libre queda descartado a propósito: "el Martín del trabajo"
   no fusiona con "Martín" porque el primer token no coincide (`"el"` vs
   `"martín"`) — es justamente el caso que el ejemplo de la sección 4 usa
   para ilustrar que ahí SÍ puede haber dos personas distintas.

El nombre canónico nunca se reescribe, solo se le agregan alias. Verificado
con `_find_or_create_entity()` mockeado (sin Ollama) contra los tres casos
de arriba: merge cuando corresponde, no-merge cuando es ambiguo, no-merge
en el caso de calificador. **Sigue habiendo un límite conocido y aceptado**:
no hay normalización de tildes/acentos (`"Martin"` sin tilde no matchea
`"Martín"`) ni fuzzy matching real — el prefijo de tokens es exacto,
case-insensitive, nada más. Si eso se vuelve un problema real con datos de
uso, es la próxima iteración, no algo que este fix pretenda cubrir.

---

## 1. Aclaración pre-enqueue para DECISION (feature nueva, 2026-08-26)

Antes, una captura clasificada `DECISION` sin razonamiento explícito ("decidí
usar gemma3", sin ningún "porque...") se guardaba igual y el porqué se perdía
para siempre — el worker es fire-and-forget, sin canal de vuelta. Ahora hay un
gate **antes** de encolar: `jarvis/captures/clarification.py::needs_clarification(text,
detected_type)` — pura salvo una llamada best-effort al modelo local
(`JARVIS_LOCAL_MODEL`) cuando las keywords de razonamiento ("porque", "ya que",
"debido a", "dado que", "razón", "the reason", "because") no alcanzan.

**Hallazgo real al implementarla, útil para calibrar cuánto confiar en el
modelo local para esta clase de juicio**: con un prompt simple ("¿este texto
incluye el razonamiento?"), `gemma3:12b` respondió "sí" para
`"decidí usar gemma3"` — un falso positivo sobre un texto sin ninguna razón.
Se corrigió con un prompt de few-shot (`_HAS_REASONING_PROMPT`, 4 ejemplos).
Si en uso real volvés a ver que el gate deja pasar una DECISION sin razón sin
preguntar, es la misma clase de falla — probá el prompt a mano contra
`call_llm()` antes de asumir que es un bug del gate en sí.

**Confirmado de punta a punta por Telegram real** (no solo con mocks): `/j
Decidí usar gemma3.` → preguntó → el usuario respondió con una razón real →
quedó en `jarvis.db` como `"Decidí usar gemma3.\nRazón: Respondió todos los
test bien. Le ganó al mistral de 24B."`, clasificada `DECISION`, con vault y
embedding generados, y notificación `✅ Listo — guardado como *DECISION*.`
recibida al terminar (ver "Aviso de listo" más abajo). En el camino a esta
confirmación aparecieron dos bugs reales — ver el subtema de FK corruptas al
final de esta sección antes de asumir que un error de guardado es del gate.

### Bypasear el gate a propósito (confirmar que las keywords cortan camino sin gastar el modelo)
```
/j Decidí usar SQLite porque es más simple para este proyecto.
```
No debería preguntar nada — `needs_clarification()` corta en el chequeo de
keywords, sin llamar a `call_llm()` (confirmá mirando logs del bot: no debería
haber latencia extra de Ollama en el ACK).

### Disparar el gate (sin keyword, la decisión real recae en el modelo)
```
/j Decidí usar gemma3.
```
Por Telegram debería responder `🤔 ¿Por qué tomaste esta decisión?` en vez del
ACK normal, y avisar el timeout de 3 minutos. Respondé con la razón y confirmá
en `jarvis.db` (sección 7) que `content_raw` tiene ambas partes concatenadas
con `\nRazón: `. **No respondas** una segunda vez y confirmá que a los 3
minutos igual se guarda — la captura nunca se pierde en ningún camino
(`_clarification_timeout()` en `jarvis_handlers.py`, no depende de
`context.user_data`). Requiere `python-telegram-bot[job-queue]` instalado en
el venv (`pip install "python-telegram-bot[job-queue]"`) — sin eso,
`context.job_queue` es `None`, PTB loguea `PTBUserWarning: No JobQueue set
up` al arrancar el bot, y el timeout queda inactivo (la pregunta y la
respuesta manual igual funcionan). `requirements.txt` ya lo pinea; si el
warning aparece es que el venv está desincronizado, no que falte fijarlo.

### Aviso de "listo" al terminar de procesar
El ACK de `/j` ("procesando…") nunca se edita — es de una sola vez. Cuando el
worker termina (`DONE` o, tras 3 intentos, `ERROR`), `jarvis/worker/processor.py`
manda un mensaje **nuevo** vía `jarvis/notify/telegram.py::notify_telegram_done()`
(HTTP directo a la API de Telegram, sin pasar por el proceso del bot) — solo
si `source == "telegram"` y hay `channel` (chat_id); una captura desde
`/jarvis/capture` (API/frontend) no tiene a dónde mandarlo. Para confirmar
que el aviso realmente depende del worker y no del bot: pausá el worker
(`Ctrl+C` en su terminal), mandá `/j algo sin razón obvia`, confirmá que el
ACK llega pero el "Listo" nunca aparece mientras el worker esté abajo, y que
aparece apenas lo reiniciás y procesa la cola pendiente.

### Confirmar que una respuesta a la pregunta no se cuela como hoja de Bóveda
Mientras la pregunta está pendiente, cualquier texto libre que mandes se
consume como la razón — `bot.py::handle_message` llama
`jh.handle_pending_clarification()` antes que cualquier otro routing. Probá
mandar algo que en cualquier otro momento el bot rutearía a la Bóveda o a
Finanzas (ej. `"gasté 500 en el super"`) inmediatamente después de que Jarvis
pregunte — debería quedar como la razón de la DECISION pendiente, **no** crear
un movimiento en Finanzas ni una hoja en la Bóveda. Si lo hace, la prioridad
de la línea nueva en `handle_message` no está funcionando.

### API — los dos flags opt-in
```bash
curl -s -X POST http://127.0.0.1:8765/jarvis/capture \
  -H "Content-Type: application/json" \
  -d '{"content": "Decidí usar gemma3", "check_clarification": true}'
# -> {"clarification_needed": true, "question": "..."} sin encolar (confirmá con
#    la query "últimas N entradas" de la sección 7 que no aparece nada nuevo)

curl -s -X POST http://127.0.0.1:8765/jarvis/capture \
  -H "Content-Type: application/json" \
  -d '{"content": "Decidí usar gemma3", "clarification": "porque ganó el bake-off"}'
# -> {"entry_id": "..."} — content_raw queda con "\nRazón: porque ganó el bake-off"
```
Sin ninguno de los dos campos, el comportamiento es exactamente el de antes —
confirmá que un `POST /jarvis/capture` normal (sin flags) sobre el mismo texto
encola directo, sin preguntar nada.

### Frontend — el único camino donde "cancelar" sí pierde la captura
`JarvisCaptureModal.jsx` (no `JarvisChat.jsx` — ese es el chat de consulta
RAG, sin ningún vínculo con captura) muestra la pregunta con tres botones:
"Guardar con esta razón", "Guardar sin razón", "Descartar". Los primeros dos
siempre terminan en un `POST /jarvis/capture` real; "Descartar" cierra el
modal sin llamar a la API — es la única superficie de esta feature donde
perder la captura es el comportamiento esperado (decisión explícita del
usuario en un flujo síncrono, no el timeout no supervisado de Telegram).
Probá las tres ramas y confirmá con la sección 7 cuál efectivamente no generó
ninguna fila.

### Modelo local caído durante el gate
Con Ollama apagado, `call_llm()` lanza y `_has_reasoning_per_local_model()`
lo atrapa — el gate nunca debe bloquear la captura. Probá:
```
/j Decidí usar gemma3.
```
con Ollama detenido — debería capturar directo (sin preguntar), tal como con
una keyword de razonamiento. Si en cambio la captura falla o no responde
nada, el `try/except` de `_has_reasoning_per_local_model()` no está
cumpliendo su contrato.

### Bug real encontrado en este ciclo: FK corruptas apuntando a "memory_entries_old" (corregido)
Si alguna vez ves `Error al guardar en Jarvis: no such table: main.memory_entries_old`
al responder la pregunta de aclaración (o al capturar cualquier cosa), **no
es un bug del gate ni una carrera entre procesos** — ya se descartó esa
hipótesis. Es la migración `_migrate_people_type()`
(`jarvis/db/database.py`) que, en versiones anteriores a esta corrección,
dejaba `inbox_queue`/`memory_entry_entities`/`memory_entry_projects` con
`REFERENCES "memory_entries_old"(id)` grabado para siempre en su `CREATE
TABLE` — corrupción permanente de esquema, no transitoria (detalle completo
en `Cerebro/decisiones-implementacion.md`, 2026-08-26). Ya está corregido de
raíz (la migración nunca vuelve a renombrar `memory_entries` en sí) y la
`jarvis.db` real ya fue reparada. Para confirmar que **no** volvió a pasar en
tu entorno:
```sql
SELECT name FROM sqlite_master
WHERE type = 'table' AND sql LIKE '%memory_entries_old%';
```
Debería devolver **cero filas**. Si alguna vez ves una fila acá, es la misma
clase de bug reapareciendo (por ejemplo, si alguien agrega una migración
nueva con el mismo patrón de `RENAME` + `foreign_keys=OFF`) — no vuelvas a
intentar diagnosticarlo como carrera entre procesos sin primero correr esta
query.

---

## 2. Patrones de captura que maximizan la memoria

El clasificador (`_CLASSIFY_PROMPT` en `jarvis/llm/client.py`) decide el
`type` sobre el texto crudo tal cual se capturó — no hay reescritura en 0.1/0.2
(`content_processed == content_raw` siempre, S1). Escribí las capturas
pensando en qué keyword dispara cada tipo y qué necesita el retriever después.

### DECISION
Necesita el verbo de decisión explícito — el coarse filter del retriever
(`_DECISION_KEYWORDS`) busca literalmente "decidí", "decidimos", "elegí",
"acordamos", "resolvimos", "optamos". Si tu captura no tiene ese verbo, el
clasificador puede igual decidir `DECISION` (usa razonamiento, no keywords),
pero **la pregunta que la recupere después sí necesita esas keywords o cae al
modelo local ambiguo**.

```
/j Decidimos usar SQLite en vez de Postgres para Jarvis 0.1 porque no
justifica la complejidad operativa de un servidor de DB para un proyecto
personal de un solo usuario.
```

Incluí el **motivo** en el mismo texto — la spec de DECISION pide "decisión +
razonamiento", y el modelo lo usa para responder "por qué" en preguntas
posteriores sin tener que inferir. Si lo omitís a propósito, desde 2026-08-26
Jarvis te lo va a preguntar antes de encolar (ver sección 1) — para probar el
`DECISION` "pelado" real, sin que el gate intervenga, hace falta pasar por esa
pregunta o bypasearla con una keyword.

### SEMANTIC
Definiciones o explicaciones, sin verbo de decisión ni de "reunión con":

```
/j ChromaDB usa distancia L2 por defecto en sus colecciones, no coseno —
hay que pedir hnsw:space explícito si se necesita coseno real.
```

### PROJECT
El clasificador lo dispara con "estado de proyecto", "avance", "sprint",
"bloqueado". Desde el fix de la sección 0, si el clasificador también llena
el campo `"project"` del JSON, `processor.py` crea/vincula automáticamente
la fila en `memory_projects`/`memory_entry_projects` — nombrá el proyecto
explícito en el texto para ayudar al modelo a extraerlo:

```
/j Avance del proyecto Jarvis 0.2: slice 3 (entidades) completo, falta
slice 4 (prompts de resumen semanal). Bloqueado por decidir si el resumen
usa call_reason() o un modelo local nuevo.
```

No es garantía — sigue siendo criterio del modelo, no un keyword fijo. Si
después de un par de capturas así `SELECT * FROM memory_projects` sigue
vacío, el modelo no está extrayendo el campo `project` del prompt (revisar
`_classify()` con el JSON crudo antes del parseo).

### PEOPLE
El prompt pide explícitamente "quién es, cómo la conociste, preferencias,
datos de la relación, algo que dijo o hizo" — capturas genéricas tipo
"hablé con Martín" clasifican más seguido como `PROJECT` o `RAW` (visto en
el QA real de Slice 3: "reunión con Martín sobre el roadmap" clasificó
`PROJECT`, no `PEOPLE`, porque el contenido es sobre el roadmap, no sobre
Martín). Para forzar `PEOPLE` de verdad, centrá el texto en la persona:

```
/j Martín Rodríguez trabaja en el equipo de infraestructura, es el que
sabe de Kubernetes. Nos conocimos en la migración del homelab. Prefiere
que le escriban por Slack, no por mail.
```

### Contradicciones a propósito (para probar consolidation.py)
Necesitás **mismo `type`** y **coseno > 0.92** — dos oraciones parecidas en
estructura, mismo tema, mismo nivel de detalle. Ver receta completa en
sección 5; acá el patrón de captura:

```
/j Vivo en Madrid, España.
... (esperar a que el worker procese, o forzar el mismo día) ...
/j Me mudé de Madrid a Buenos Aires el mes pasado.
```

Ambas van a clasificar `SEMANTIC` o `RAW` — mismo tipo es lo único que
importa para que `consolidation.py::_find_similar_pairs()` las agrupe
(agrupa por `(type, user_id)`, no por similitud de contenido primero).

---

## 3. Consultas para presionar el retrieval

`retrieve()` en `jarvis/retriever/retriever.py` calcula tres señales
independientes en `_coarse_filter()`: `type`, `project_entry_ids`,
`entity_entry_ids`, más `recency_first`. Diseñá la pregunta para forzar una
señal a la vez y confirmá con `context_count`/`sources` de la respuesta (o
directo en `jarvis.db`, sección 7) que trajo lo que corresponde.

### Forzar tipo DECISION (no debe traer SEMANTIC)
```
/jq ¿Qué decidimos sobre la base de datos de Jarvis?
```
Si hay entradas `SEMANTIC` sobre el mismo tema (ej. "SQLite soporta JSON1"),
no deberían aparecer en `sources` — si aparecen, `where={"type": "DECISION"}`
en ChromaDB no está filtrando o degradó a sin filtro porque no encontró
candidatos DECISION (ver `_retrieve_chromadb`, línea del degrade).

### Forzar boost de entidad
Requiere que la entidad ya exista en `memory_entities` (se crea sola al
procesar una captura donde el modelo local la detectó — confirmá primero con
`GET /jarvis/entities` o la query de la sección 7).
```
/jq ¿Qué sé sobre Martín Rodríguez?
```
Si el nombre no matchea **exacto** (case-insensitive) contra `name` o
`aliases` en `memory_entities`, no hay boost — probá también la variante
corta ("¿Qué sé sobre Martín?") para confirmar que el substring-match de
`match_entities_in_text()` sí encuentra "Martín Rodríguez" conteniendo
"Martín" (`n.lower() in q_lower` es al revés — ojo: compara si el **nombre
completo de la entidad** está contenido en la pregunta, no si la pregunta
menciona una palabra suelta del nombre. "¿Qué sé sobre Martín?" con entidad
"Martín Rodríguez" **no matchea** porque "martín rodríguez" no es substring
de "qué sé sobre martín" — es al revés de lo intuitivo. Probá ambas
direcciones para confirmar el comportamiento real).

### Preguntas temporales (recency_first)
```
/jq ¿Qué fue lo último que guardé?
/jq ¿Qué anoté hoy?
```
`_rank_score()` con `recency_first=True` ordena por `recorded_at` DESC de
forma casi literal (el epoch domina, similitud+tipo solo desempatan). Si el
orden no es cronológico exacto, algo rompió en `_entry_epoch()` (probablemente
un `recorded_at` no parseable — ver caso borde de fechas raras).

### Preguntas ambiguas (fuerzan el modelo local del coarse filter)
Sin keyword de tipo, sin nombre de proyecto/entidad, sin keyword de
recencia — cae en `_classify_type_with_local_model()`, que sí gasta una
llamada a Ollama por consulta:
```
/jq contame de la migración de la Bóveda
```
Con preguntas de una sola palabra el modelo de 3B (ya no es el caso, ahora
`gemma3:12b`, pero vale re-probar) clasificaba mal — probá `/jq mouse` o
`/jq React` para ver si sigue pasando con el modelo nuevo; si clasifica un
tipo con candidatos reales pero equivocados, no hay degrade (limitación
conocida, documentada en `Cerebro/decisiones-implementacion.md`).

### Forzar boost de proyecto
Desde el fix de la sección 0, alcanza con dos capturas que el clasificador
identifique con el mismo `project` (sección 2) — confirmá que se creó con
`SELECT * FROM memory_projects` antes de preguntar. Si preferís no depender
del criterio del modelo, seguí armando el setup a mano:
```sql
INSERT INTO memory_projects (id, name, local_only, created_by)
VALUES ('proj-test-1', 'Jarvis', 0, 'user');

INSERT INTO memory_entry_projects (entry_id, project_id, is_primary, assigned_by)
VALUES ('<entry_id de una entrada real>', 'proj-test-1', 1, 'user');
```
Luego:
```
/jq ¿Qué pasó con Jarvis?
```
Debería usar `_retrieve_scoped_by_ids()` (similitud coseno en Python contra
solo esos ids) en vez de la ANN completa de ChromaDB — confirmalo mirando
logs del worker/API (`[jarvis.retriever]` no debería aparecer si tuvo éxito;
si cae al ANN normal, revisá que el embedding de esa entrada exista en Chroma).

---

## 4. Casos borde para encontrar bugs reales

**Texto largo (> 2000 chars).** Nada en el pipeline trunca `content_raw`
(columna `TEXT`, sin límite de SQLite) — pero `title` en `processor.py` sí se
trunca a 60 chars (`.strip()[:60]`) y el prompt de clasificación manda el
texto completo al modelo local, que puede tener su propio límite de contexto.
Probá pegar un capítulo entero y ver si `_classify()` devuelve JSON válido o
si el modelo corta la respuesta a mitad del JSON (`_classify()` cae a
`{"type": "RAW", ...}` si el parseo falla — confirmá con el log
`classify JSON inválido`).

**Emojis y caracteres especiales.** `content_hash` es SHA-256 sobre UTF-8
crudo — no debería romper. El riesgo real está en Windows/cp1252 al imprimir
en consola (ya documentado como mojibake de terminal, no de datos — verificado
leyendo la DB directo). Probá con emojis + tildes + `—`/`…` en la misma
captura y confirmá en `jarvis.db` (no en la consola) que el texto es UTF-8
correcto.

**Texto en inglés.** `_CLASSIFY_PROMPT` y `_ENTITY_PROMPT` están en español
pero no restringen el idioma del contenido. Probá:
```
/j We decided to use ChromaDB instead of pgvector for the 0.1 release.
```
¿Clasifica igual `DECISION`? ¿`extract_entities` detecta nombres propios en
inglés igual de bien? El coarse filter del retriever (`_DECISION_KEYWORDS`)
es **solo español** — una pregunta en inglés nunca va a activar el filtro de
tipo por keyword, siempre cae al modelo local.

**Captura de un secreto real.** El Privacy Gateway (`jarvis/privacy/gateway.py`)
bloquea el **fragmento en el contexto RAG hacia el modelo externo**, nunca la
captura en sí — por diseño (`is_entry_allowed`, corre en `filter_context()`,
llamado desde `query/service.py`, no desde `capture_raw()`).
```
/j Mi API key de OpenAI es sk-abcdefghijklmnopqrstuvwxyz1234567890
```
Esto se guarda igual, se clasifica igual, se embebe igual. Para confirmar
el bloqueo hay que preguntar algo que lo traiga como contexto:
```
/jq ¿cuál es mi api key?
```
La respuesta debería venir con `blocked=1` en el conteo (`context_sent <
context_count`) y el footer de Telegram debe decir "N omitido(s) por
privacidad". Patrones cubiertos: `sk-`, `ghp_`, `xoxb-`, `Bearer `,
`password[:=]`, `api_?key[:=]` — probá también `token: abc123` o `secret=xyz`
(NO están en `SECRET_PATTERNS`, deberían pasar sin bloqueo — confirmá que
efectivamente no bloquea, es el comportamiento esperado, no un bug).

**Dos capturas casi idénticas seguidas (no byte-idénticas).** `capture_raw()`
deduplica por `content_hash` = SHA-256 exacto del string completo — cualquier
diferencia de un carácter (mayúscula, tilde, espacio) genera un hash distinto
y **no dedupea en captura**. La única red de seguridad es `consolidation.py`
al día siguiente (`same_fact` si coseno > 0.92 y mismo `type`). Probá:
```
/j Reunión con el equipo sobre el roadmap de Jarvis
/j Reunión con el equipo sobre el roadmap de jarvis.
```
(nota el punto final y la minúscula) — confirmá que **ambas quedan
guardadas** como entradas separadas (`SELECT COUNT(*) ... WHERE content_hash
IN (...)`) y que ninguna se marca `valid_to` hasta que corra la
consolidación.

**Misma persona, nombres distintos.** Desde el fix de la sección 0 esto
fusiona quirúrgicamente, no a lo bruto — probá las tres variantes y mirá
qué fusiona y qué no:
```
/j Hablé con Martín sobre el deploy.
/j Reunión con Martín López, avanzamos con el deploy.
/j El Martín del trabajo (no el de la facultad) me pasó el script de deploy.
```
Esperado: `SELECT name, aliases FROM memory_entities WHERE user_id='default'`
va a mostrar **dos filas**, no tres — "Martín" con `aliases=["Martín López"]`
(fusionaron porque comparten el primer token y no hay otro "Martín *" que
compita) y "el Martín del trabajo" como entidad separada (el primer token
no coincide con "Martín" — no fusiona a propósito, ver sección 0). Si en tu
prueba real salen **tres** filas sin ningún alias poblado, el fix no está
activo (revisá que estés corriendo el worker con el código nuevo, no una
instancia vieja). Si el orden de llegada es al revés (primero "Martín
López", después "Martín"), el resultado esperado es el mismo par pero con
"Martín López" como canónico y "Martín" en `aliases` — la fusión no depende
de qué mención llegó primero. `/jq ¿qué sé de Martín López?` sí debería
traer también la nota que solo dice "Martín" (mismo `entity_id` por el
alias).

**Fecha/hora rara en `recorded_at`.** No hay caso de captura normal que la
rompa (siempre `datetime.now(timezone.utc).isoformat()`), pero si migrás o
insertás a mano con un formato no-ISO, `_parse_recorded_at()` en
`retriever.py` atrapa la excepción y devuelve `None` — la entrada pierde el
bonus de recencia y `recency_first` la manda al fondo (`epoch = -1e18`). Útil
para confirmar el fallback: insertá una fila con `recorded_at = 'ayer'` a
mano y preguntá "¿qué fue lo último que guardé?" — no debería explotar, solo
quedar última.

---

## 5. Prueba de estrés de la consolidación

`run_consolidation()` corre sola una vez cada 24h (gateada en
`jarvis_policies.consolidation_last_run`) o al arrancar el worker. Para
forzarla sin esperar, dos opciones:

```python
# python -m jarvis.worker.main deja correr el gating normal; para forzar YA:
from jarvis.worker.consolidation import run_consolidation
print(run_consolidation())
```

o borrá el gating manualmente (ver sección 7) y reiniciá el worker.

> **Antes de probar Caso A o B — hallazgo real (2026-08-26), no un supuesto**:
> se probó el Caso A exacto de abajo contra embeddings reales
> (`nomic-embed-text`) y dio **coseno 0.73**, muy por debajo del umbral 0.92
> que `_find_similar_pairs()` exige para considerar un par "candidato" — el
> par nunca llegó a `_resolve_pair()` (que sí usa el LLM), se descartó antes,
> solo por similitud. El Caso B ("azul"/"rojo") tampoco cruza: 0.82. Mapeando
> 7 pares se confirmó el patrón: `nomic-embed-text` solo pasa 0.92 entre
> reformulaciones casi **textuales** del mismo hecho (mayúsculas, un artículo
> de más, una coma) — en cuanto el **hecho en sí** cambia (la ciudad, el
> color, la tecnología), la similitud cae a 0.7–0.9. Detalle completo y tabla
> de los 7 pares en `Cerebro/decisiones-implementacion.md` (2026-08-26,
> "Hallazgo: el umbral de similitud 0.92..."). **No se cambió el umbral
> todavía** (decisión explícita: documentar primero, ajustar después con más
> datos reales) — así que, tal como está hoy, los Casos A y B de abajo sirven
> para entender el código y el flujo, pero **no vas a ver una mutación real**
> a menos que fuerces la similitud vos mismo (ver nota al final de cada caso).

### Caso A — mismo hecho, dos versiones (`same_fact`)
```
/j Vivo en Madrid, España.
/j Me mudé de Madrid a Buenos Aires el mes pasado.
```
Ambas deben clasificar el mismo `type` (confirmá con la query de la sección
7 antes de correr consolidación — si una salió `SEMANTIC` y la otra `RAW`,
**nunca se van a comparar**, `_find_similar_pairs()` agrupa por
`(type, user_id)` primero; si querés forzarlo a mano:
`UPDATE memory_entries SET type='SEMANTIC' WHERE id='<la que clasificó distinto>'`).
Esperado **si la similitud cruzara 0.92** (ver caveat arriba — con esta
redacción exacta no la cruza): la más vieja (Madrid) con `valid_to` seteado
al `recorded_at` de la más nueva; la más nueva (Buenos Aires) sigue con
`valid_to IS NULL`. Para calcular la similitud real de tu par antes de
correr la consolidación (evita perder tiempo esperando un `obsolete=0` sin
saber por qué):
```python
import math
from jarvis.embeddings.store import get_collection
res = get_collection().get(ids=['<id_a>', '<id_b>'], include=['embeddings'])
a, b = res['embeddings']
cos = sum(x*y for x, y in zip(a, b)) / (math.sqrt(sum(x*x for x in a)) * math.sqrt(sum(y*y for y in b)))
print(cos, cos > 0.92)
```
Si da por debajo de 0.92 (lo más probable con hechos que realmente cambian),
`_resolve_pair()` no se va a llamar — no es un bug, es el hallazgo de arriba.

### Caso B — contradicción directa
```
/j Mi color favorito es el azul.
/j Mi color favorito es el rojo.
```
Esperado **si la similitud cruzara 0.92** (con esta redacción da 0.82, no la
cruza): **ninguna** con `valid_to` seteado, **ambas** con `confidence`
reducida a la mitad (`1.0 → 0.5`), y una fila nueva en `jarvis_policies` con
`policy_type='consolidation_conflict'` conteniendo los dos `entry_id` y la
similitud. Mismo chequeo de similitud que en el Caso A antes de asumir que
"no pasó nada" es un bug.

### Caso C — hecho viejo con confidence baja → stale
Este camino (`_mark_stale_by_age`) es **edad + confidence**, no similitud —
no necesita un par. Condición exacta: `valid_from` con más de 90 días Y
`confidence < 0.4`. Como una sola contradicción solo baja la confidence a
0.5 (no alcanza), para forzarlo hace falta setear ambos campos a mano:
```sql
UPDATE memory_entries
SET valid_from = datetime('now', '-100 days'), confidence = 0.3
WHERE id = '<entry_id de prueba>';
```
Corré `run_consolidation()` y confirmá `valid_to IS NOT NULL` en esa fila
después.

### Verificar todo de una vez
```sql
SELECT id, type, content_raw, valid_from, valid_to, confidence
FROM memory_entries
WHERE id IN ('<id_a>', '<id_b>', '<id_c>');

SELECT policy_type, value, created_at
FROM jarvis_policies
WHERE policy_type IN ('consolidation_run', 'consolidation_conflict')
ORDER BY created_at DESC LIMIT 5;
```

**Nota de costo:** `_resolve_pair()` usa `call_reason()` (modelo externo, con
fallback a local) — cada par candidato es una llamada real a
`JARVIS_REASON_MODEL`. Con pocas entradas de prueba el costo es
insignificante (< $0.002 por corrida, confirmado en `decisiones-implementacion.md`),
pero si armás muchos pares a la vez revisá `GET /jarvis/budget` antes y
después.

---

## 6. Flujo de trabajo diario sugerido

- **Después de cada reunión o decisión real:** `/j` inmediato con el hecho +
  el motivo si es una `DECISION`, o la persona + contexto si es sobre
  alguien. No esperes a "ordenarlo" — el clasificador hace ese trabajo;
  capturar rápido y sucio es mejor que no capturar.
- **`/jq` para todo lo que necesitás recordar en el momento** — no solo
  "revisión semanal". Cada `/jq` es una oportunidad gratis de encontrar un
  bug real de retrieval con datos de verdad, no sintéticos.
- **Revisión semanal:** una sola consulta de recencia amplia
  (`/jq ¿qué guardé esta semana?`) más un vistazo directo a
  `jarvis_policies` (conflictos sin resolver) y a `memory_entities`
  (¿aparecieron duplicados de la misma persona?).
- **Browser vs Telegram:** Telegram (`/j`, `/jq`) para captura en el momento,
  sin fricción, desde el celular. El browser (`/jarvis` en el frontend) para
  sesiones más largas de consulta con historial visible y para revisar el
  panel de inbox/budget sin tener que pegar queries SQL. Usá el browser
  también cuando quieras ver `sources` completas — Telegram las trunca a un
  footer corto.
- **Antes de una sesión de prueba de estrés (secciones 4-5):** anotá qué
  `entry_id`s vas generando (el `/j` de Telegram devuelve los primeros 8
  caracteres) para poder limpiarlos después sin tener que adivinar por
  contenido.

---

## 7. Cómo leer las entrañas

Abrí la DB directo (SQLite, no hace falta el backend corriendo):
```bash
cd project
sqlite3 database/jarvis.db
```
o desde Python: `from jarvis.db.database import get_connection`.

**Últimas N entradas procesadas (con su estado real, no solo memory_entries):**
```sql
SELECT me.id, me.type, me.source, me.recorded_at, me.valid_to, me.confidence,
       me.embedded_at, iq.status, iq.attempts, iq.last_error
FROM memory_entries me
JOIN inbox_queue iq ON iq.entry_id = me.id
ORDER BY me.recorded_at DESC
LIMIT 20;
```

**Capturas DECISION y si quedaron con razón concatenada (confirma la sección 1):**
```sql
SELECT id, content_raw, recorded_at
FROM memory_entries
WHERE type = 'DECISION'
ORDER BY recorded_at DESC
LIMIT 10;
```
Una entrada que pasó por el gate y el usuario respondió debe tener
`content_raw` con un `\nRazón: ` al final; una que bypaseó por keyword no lo
tiene (viene tal cual se escribió); una que se guardó por timeout tampoco lo
tiene (es el texto original sin razón, a propósito).

**Entidades conocidas y cuántas entradas tiene vinculadas cada una:**
```sql
SELECT en.name, en.entity_type, en.aliases, en.first_seen, en.last_seen,
       COUNT(mee.entry_id) AS n_entradas
FROM memory_entities en
LEFT JOIN memory_entry_entities mee ON mee.entity_id = en.entity_id
GROUP BY en.entity_id
ORDER BY n_entradas DESC;
```
Si ves varias filas con nombres que claramente son la misma persona (ver
sección 4), ese es el gap de resolución de entidades confirmado con datos
reales, no solo con teoría.

**Entradas marcadas obsoletas por consolidación:**
```sql
SELECT id, type, content_raw, valid_from, valid_to, confidence
FROM memory_entries
WHERE valid_to IS NOT NULL
ORDER BY valid_to DESC;
```

**Conflictos sin resolver (contradicciones detectadas, revisión manual pendiente):**
```sql
SELECT value, created_at
FROM jarvis_policies
WHERE policy_type = 'consolidation_conflict'
ORDER BY created_at DESC;
```

**Última corrida de consolidación y su resumen:**
```sql
SELECT policy_type, value, created_at
FROM jarvis_policies
WHERE policy_type IN ('consolidation_last_run', 'consolidation_run')
ORDER BY created_at DESC
LIMIT 5;
```

**Budget acumulado del día:**
```sql
SELECT model, SUM(cost_usd) AS total_usd, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout
FROM budget_usage
WHERE date = date('now')
GROUP BY model;
```
(Los modelos Ollama nunca aparecen acá — `record_usage()` solo registra
costo real para modelos no-Ollama, confirmado en
`decisiones-implementacion.md` Slice 2 de 0.2.)

**Entradas con confidence baja (candidatas a revisión o a stale):**
```sql
SELECT id, type, content_raw, confidence, valid_from
FROM memory_entries
WHERE confidence < 0.6 AND valid_to IS NULL
ORDER BY confidence ASC;
```

**Entradas atascadas (DONE en inbox pero sin embedding — señal de fallo silencioso de Ollama):**
```sql
SELECT me.id, me.type, me.recorded_at, iq.status
FROM memory_entries me
JOIN inbox_queue iq ON iq.entry_id = me.id
WHERE iq.status = 'DONE' AND me.embedded_at IS NULL;
```

**Entradas en ERROR definitivo (agotaron los 3 reintentos):**
```sql
SELECT iq.entry_id, iq.attempts, iq.last_error, iq.updated_at, me.content_raw
FROM inbox_queue iq
JOIN memory_entries me ON me.id = iq.entry_id
WHERE iq.status = 'ERROR'
ORDER BY iq.updated_at DESC;
```

**Forzar que corra la consolidación en el próximo arranque del worker (borra el gating):**
```sql
DELETE FROM jarvis_policies WHERE policy_type = 'consolidation_last_run';
```

**Limpiar una entrada de prueba por completo (memory_entries + inbox_queue + vínculos):**
```sql
DELETE FROM memory_entry_entities WHERE entry_id = '<entry_id>';
DELETE FROM inbox_queue WHERE entry_id = '<entry_id>';
DELETE FROM memory_entries WHERE id = '<entry_id>';
```
(No borra el `.md` en `vault/` ni el embedding en ChromaDB — esos quedan
huérfanos; para limpieza completa hay que borrarlos aparte a mano en
`project/vault/<TIPO>/` y con `collection.delete(ids=[...])` en Chroma.)
