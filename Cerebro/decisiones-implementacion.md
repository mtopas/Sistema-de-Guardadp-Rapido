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
