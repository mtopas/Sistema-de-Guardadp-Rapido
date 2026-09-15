# Backfill del contenido ya existente de `D:\Boveda` a `memory_entries` de Jarvis

## Contexto

`Cerebro/PROXIMAMENTE.md` (ítem 1, "Pendiente real tras el deploy de la fusión Bóveda-Jarvis
2026-09-15"): Milestone 3 de la fusión (`Cerebro/decisiones-implementacion.md`, 2026-09-11) solo
conectó el camino de **escritura hacia adelante** (contenido nuevo del usuario → árbol PARA;
síntesis de Jarvis → `Boveda/Jarvis/`). Las 71 notas que ya vivían en `D:\Boveda` (57 del vault
viejo de Obsidian + 8 hojas reales de SGR, más 6 notas manuales sueltas — total real confirmado
hoy, más que el "65+" con el que arrancó la fusión) nunca pasaron por el pipeline de captura de
Jarvis. Confirmado en vivo contra el `jarvis.db` del homelab: `memory_entries` con 0 filas.

Implementado: `jarvis/cli/backfill_vault_content.py`. Verificado con datos reales (Ollama local,
`gemma3:12b` + `nomic-embed-text`) contra una copia de scratch de `D:\Boveda` (71 archivos reales,
copiados sin tocar el original) + `jarvis.db`/`chroma` de scratch — nunca contra el homelab real.
El deploy/corrida real queda para una sesión aparte, explícita (a pedido de la tarea).

Distinto de `jarvis/cli/migrate_boveda.py` (script hermano, mismo patrón D-10 "backup → script →
validación → corte"): ese migra FILAS de `app.db` y llama `write_entry()` para CREAR archivos
nuevos. Acá el contenido YA ES un archivo real en `D:\Boveda` — este backfill nunca escribe, mueve
ni renombra esos archivos.

## Las 7 decisiones (investigadas contra el código real, no asumidas)

### 1. ¿Reusar el `id` del frontmatter como `memory_entries.id`, o generar uno nuevo?

**Reusado tal cual.** Es lo único que da trazabilidad real archivo↔fila sin mantener un mapeo
aparte, y es consistente con que el resto de la fusión ya trata el archivo como fuente de verdad.

Verificado que nada asume `memory_entries.id` nacido siempre de `uuid.uuid4()` en el momento de
captura: `grep` de todo `jarvis/` por usos de `entry_id` que dependan de su formato — solo
`entry_id[:8]` (slicing para nombres de archivo/logs en `writer.py`, `processor.py`,
`audit/service.py`), que funciona igual con cualquier string de al menos 8 caracteres. Los ids del
frontmatter YA son uuid4 reales (confirmados los 71, sin duplicados), así que ni siquiera hace
falta ese caso límite.

### 2. ¿`vault_indexer.py`/`sync.py` ya asignan id a un archivo que no lo tiene?

**Sí** — `project/app/vault/parser.py::assign_missing_id()`, invocado por `app/vault/sync.py` en
cada arranque de FastAPI y cada lectura de Bóveda (Milestone 2), y también por
`scripts/vault_indexer.py` (Milestone 1, CLI de auditoría manual) vía `parser.parse_nota()`. El
backfill **no duplica esa lógica**: confirmado en disco que los 71 archivos en alcance ya tienen
`id` (`grep '^id: '` sobre las 5 carpetas incluidas → 71/71, cero faltantes). Si algún archivo
llegara sin `id` al momento de correr el backfill (caso no encontrado hoy), el script lo **omite
con un WARNING** — nunca asigna uno él mismo. Esa responsabilidad sigue siendo de `app/vault/`, no
de un backfill de índice.

### 3. Alcance de carpetas

Allowlist explícita (no denylist), para que una carpeta PARA nueva futura no entre sola sin una
decisión consciente:

- **Incluidas**: `00 - Sin categorizar`, `01 - Proyectos`, `02 - Areas`, `03 - Recursos`,
  `04 - Archivo`. `04 - Archivo` SÍ es memoria consultable real — su propio README lo dice
  explícito: *"Proyectos o áreas que ya no están activos, pero se conservan por si hacen falta
  después. No es basura — es historia que dejó de requerir atención."*
- **Excluidas**: `05 - Basura` (su propio README: *"Candidatos a borrar, con demora antes de
  eliminarlos de verdad"* — no es memoria, es la papelera; consistente con
  `[[feedback_boveda_categorization]]`, "bot-artifact junk rows not migrated") y `Boveda/Jarvis/`
  (salida propia de Jarvis — reingerirla sería circular).
- `_adjuntos/` no aplica (no tiene `.md`).

Distribución real verificada: `00 - Sin categorizar` 14, `01 - Proyectos` 0, `02 - Areas` 0,
`03 - Recursos` 48, `04 - Archivo` 9 → 71 en alcance. `05 - Basura` tiene 1 nota (excluida, más
adjuntos .docx/.txt que ya no importan porque no son .md).

### 4. Clasificación real, no `SEMANTIC` fijo

El backfill reusa el mismo pipeline que una captura nueva
(`jarvis/worker/processor.py::process_entry()`): `call_classify()` (modelo local, catálogo de tags
vía `list_tag_catalog()`) → `update_entry(type, tags, extraction_confidence)` →
`link_tags_for_entry()` → `extract_entities()` + `link_entities_for_entry()` →
`link_project_for_entry()`. La única pieza que se salta a propósito es `write_entry()`: esa función
ESCRIBE el `.md`, y acá ya existe — `vault_path` se asigna directo a la ruta real (relativa a
`JARVIS_BOVEDA_PATH`) en el mismo INSERT, sin tocar el archivo.

**Limitación real, documentada, no arreglada** (consecuencia directa de nunca reescribir el
archivo): la sección `## Vinculado a` que `write_entry()` agrega al final de una captura nueva NO
se retrofitea en las notas migradas — haría falta reescribir el archivo, prohibido. El vínculo
hacia ADELANTE sí funciona igual que una captura nueva: `sync_indexes_for_entry()` →
`sync_entity_note()`/`sync_project_note()` derivan el wikilink desde `vault_path` (su nombre de
archivo sin extensión), así que la ficha de cada entidad/proyecto en `Boveda/Jarvis/Entidades|
Proyectos/` sí enlaza correctamente de vuelta a la nota real (`[[El Alquimista|El Alquimista]]`,
confirmado en la corrida real). Solo el sentido nota→entidad queda sin retrofitear.

### 5. Provenance: `source`, `authorship`, `origin_trust`

- `source = 'migration'` — ya válido en el `CHECK`, y es el valor correcto: describe CÓMO entró
  esta fila (por un script de backfill, no una captura en vivo), no la confiabilidad del contenido.
- `authorship = 'user'` — es contenido tipeado por el usuario (Obsidian/SGR), nunca síntesis de
  Jarvis.
- `origin_trust = 'user.authenticated'`, **no `'migration'`** (que también es válido en el CHECK).
  `origin_trust` describe la confiabilidad de la FUENTE del texto, no el mecanismo de ingestión
  (mismo criterio documentado en `jarvis/memory/service.py::capture_raw()`); este texto es
  inequívocamente autoría autenticada del usuario, sin ambigüedad de proveniencia. Mismo criterio
  ya establecido para el script hermano `migrate_boveda.py`
  (`Cerebro/decisiones-implementacion.md`, entrada del backfill de hojas de SGR): *"`origin_trust=
  'user.authenticated'` en vez de `'migration'`... sigue la instrucción explícita de la tarea"* —
  se sigue el mismo precedente acá por la misma razón, no por copiar el valor sin pensarlo.
- `source_id = f"boveda:vault:{id}"` — provenance obligatorio (invariante de Jarvis), mismo patrón
  `boveda:hoja:{id}` que ya usa el script hermano.
- `channel = NULL` — no hay canal conversacional real; la trazabilidad vive en `source_id`.
- Sin notificaciones de Telegram ni de debug (`notify_telegram_done`/`notify_debug_processed` de
  `processor.py` no se llaman): esto es ingestión histórica masiva, no una captura en vivo — mandar
  71 avisos de debug si el modo debug está prendido sería ruido, no señal. `migrate_boveda.py`
  tampoco las llama, mismo criterio.
- Sin `inbox_queue` ni `TaskManifest`: igual que `migrate_boveda.py`, es un script de un solo uso
  invocado por el usuario, no la pieza autónoma de background cuyo blast radius restringe
  `jarvis/worker/task_manifest.py`.

### 6. Idempotencia

Dedup por **`memory_entries.id` ya existente** (el id del frontmatter, no por `content_hash`): dos
notas reales distintas podrían compartir texto corto por casualidad, y cada una tiene su propio
archivo que merece su propia fila — `content_hash` (el criterio de `capture_raw()`) no es el
criterio correcto acá.

Verificado en vivo: corrida de `--limit 5` (5 ingeridas) seguida de la corrida completa sin límite
→ 66 ingeridas + **5 reconocidas como "ya existían"**, 0 omitidas, 0 duplicados en `memory_entries`
(71 filas totales, 71 `vault_path` distintos). Reproducible: correr el script de nuevo sobre el
mismo árbol no vuelve a crear nada.

### 7. Costo

`call_classify()` y `extract_entities()` usan siempre `JARVIS_LOCAL_MODEL` (`gemma3:12b` vía
Ollama, nunca el modelo externo de razonamiento); `generate_embedding()` usa `JARVIS_EMBED_MODEL`
(`nomic-embed-text`, también Ollama). `jarvis/llm/client.py::_record_cost()` solo se invoca para
modelos NO-Ollama (`if not is_ollama_model(model)`) — confirmado leyendo el código, no asumido: el
backfill completo de 71 notas (142 llamadas de clasificación/extracción + 71 embeddings) no afecta
`JARVIS_DAILY_BUDGET_USD` en absoluto.

Costo real es de tiempo, no de dinero: ~20-40s por nota en este entorno (CPU, sin GPU dedicada para
Ollama) — la corrida completa de 71 notas tomó del orden de una hora. Se agregó `--limit N` para
poder correrlo por tandas si hace falta (además de servir como mecanismo de throttle).

## Verificación end-to-end

1. `--dry-run` contra el scratch (antes de que existiera `jarvis.db` de scratch): 71 candidatas, 0
   ya existían, 0 omitidas — **no creó `jarvis.db`** (conexión de solo lectura condicional, mismo
   patrón que `migrate_boveda.py`).
2. Corrida real `--limit 5`, luego corrida real completa sin límite, contra `D:\Boveda` de scratch
   (copia read-only de las 5 carpetas en alcance + `05 - Basura` + `Jarvis/` vacía) y `jarvis.db` +
   `chroma` de scratch, con Ollama real (`gemma3:12b` + `nomic-embed-text`, nunca simulado).
   Resultado: 71 `memory_entries` (48 en `03 - Recursos`, 14 en `00 - Sin categorizar`, 9 en
   `04 - Archivo`, ninguna de `05 - Basura` ni `Jarvis/`), `source='migration'` × 71,
   `authorship='user'` × 71, `origin_trust='user.authenticated'` × 71, 0 `vault_path`/`embedded_at`
   nulos, `inbox_queue` vacía (como se diseñó), 65 entidades y 3 proyectos creados/vinculados desde
   cero, 45 tags en el catálogo.
3. **Confirmado por mtime que ningún archivo de la Bóveda de scratch fue tocado**: los 71 archivos
   del árbol PARA (00-05) quedaron con el mismo mtime que la copia inicial, sin cambios, durante
   toda la corrida (que sí llevó más de una hora de wall-clock). Lo único nuevo en disco fue
   `Boveda/Jarvis/Entidades/` (65 notas) y `Boveda/Jarvis/Proyectos/` (3 notas) — exactamente el
   comportamiento esperado (síntesis de Jarvis, no el árbol del usuario).
4. **Pregunta real a Jarvis contra el scratch** (`jarvis.query.service.query()`, RAG completo):
   *"¿Qué apuntes tengo sobre el libro El Alquimista?"* → recuperó como primera fuente
   `id=a739f8c6-...` (el id real del frontmatter de `03 - Recursos/Desarrollo Personal/Libros/
   El Alquimista.md`) y respondió con datos reales y correctos del archivo (autor Paulo Coelho,
   finalización 2023-11-11, puntaje 8/10, sin apuntes tomados) — confirma recuperación real, no
   alucinada, de contenido migrado que antes de este backfill Jarvis no podía ver.
2 warnings no bloqueantes durante la corrida completa: `extract_entities()` falló por JSON
inválido del modelo en 2/71 notas (comportamiento ya diseñado como best-effort en
`jarvis/entities/service.py` — la entrada igual se ingiere sin esas entidades puntuales, no es un
bug de este script).

## Pendiente (explícito, fuera de esta sesión)

Correr esto contra `D:\Boveda`/`jarvis.db` reales es una decisión aparte del usuario — antes,
backup de `jarvis.db`/`chroma` reales (mismo patrón de siempre). `D:\Boveda` en sí no se backupea
para esto porque el script nunca lo escribe (read-only sobre los archivos, confirmado con mtime en
el punto 3 de arriba).
