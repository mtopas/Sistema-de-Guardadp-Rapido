# Triaje de feedback del usuario — 2026-10-02

Triaje de las notas de la tabla `feedback` (`GET http://192.168.137.10:8765/feedback`).
La nota #1 es un smoke test de deploy y se ignora. **Este documento no implementa ningún
arreglo**: solo determina, con evidencia en código/commits, el estado actual de cada nota, su
tamaño estimado y riesgo, y propone una agrupación en tickets.

Convención de tamaño:
- **S** — hasta unas decenas de líneas, un solo componente/archivo.
- **M** — varios archivos o un endpoint nuevo.
- **L** — feature nueva o decisión de diseño de producto.

Las notas están parafraseadas (no se transcribe el texto del usuario ni el texto de memoria que
Jarvis devolvió en la #3).

Método: verificación por código (archivo:línea y `git log`). **No se reprodujo en navegador** (no
se levantó el sandbox); donde la conclusión depende de comportamiento de UI se marca como
"verificado por código, sin reproducir" y se indica qué habría que confirmar manualmente.

---

## Tabla por nota

| id | Resumen | Estado | Evidencia | Tamaño | Riesgo |
|----|---------|--------|-----------|--------|--------|
| #2 | En celular/tablet no se podía editar el título de una hoja | **RESUELTA** | `DetailScreen.jsx:168-175` (input de título editable) + `BrowseScreen.jsx:12-15,46-52` (en modo compacto/móvil, tocar una hoja navega a `/hoja/:id`). Commit `12ef1b3` (2026-09-24 19:03) agregó la edición de título en DetailScreen; desplegado al homelab recién el 2026-09-30, por eso la nota (2026-09-24 20:29) lo reportaba como abierto. | S | Bajo |
| #3 | Jarvis no lee la agenda al preguntarle qué tiene agendado | **ABIERTA** | El flujo de chat (`jarvis/query/service.py:29-117`) responde SOLO con RAG sobre la memoria (ChromaDB `retrieve`, entidades, historial); no invoca ninguna tool ni consulta la agenda en vivo. La tool `agenda.list_events` existe (`jarvis/tools/builtin.py:43-72`) pero **no está cableada a ningún runtime** (sin llamadores de `register_builtin_tools`/`ToolExecutor` fuera de `jarvis/tools/`). La ingestión de Agenda (`jarvis/ingestion/agenda.py:31-34,221-255`) solo trae eventos **pasados** y tareas **completadas**, y solo como propuestas que requieren aceptación humana para volverse memoria. No hay ningún camino para que el chat vea la agenda futura/actual. | L | Medio |
| #4 | Panel "Proyectos Activos": el usuario no sabe de dónde salen ni cómo se actualizan | **ABIERTA (transparencia/producto)** | Los proyectos (`memory_projects`) los crea el clasificador al procesar memorias (`jarvis/projects/service.py:28-42`), que a su vez derivan de la Bóveda/vault ya ingerida y aceptada. El panel no explica su origen ni su cadencia de actualización. No es un bug de datos; es un hueco de explicación en la UI. | S (tooltip/empty-state) / L (si se quiere cambiar la fuente) | Bajo |
| #5 | Clic derecho Editar/Borrar en Bóveda y en "Últimas Hojas" | **PARCIAL** | El árbol de Bóveda YA tiene menú contextual Editar/Eliminar: `LeftPanel.jsx:325-338` y `BovedaWorkspace.jsx:80-89` (`onContextMenu` en `NoteCard`/`HojaRow`). Falta en "Últimas hojas" del `RightPanel.jsx:57-67`: esos ítems son `<button>` con solo `onClick`, sin `onContextMenu`. | S | Bajo |
| #6 | La IA debería recomendar TAGS para las hojas cuando corresponda | **ABIERTA (parcial infra)** | En la Bóveda los tags salen solo de `#hashtags` manuales (`utils/tags.js::extractTags`). El clasificador de Jarvis YA genera tags (`jarvis/llm/client.py:85-96,193`, "tags: array de 1-5 keywords" + catálogo), pero eso aplica a `memory_entries`, no se expone en el editor de hojas de la Bóveda. Falta decidir dónde/cómo sugerirlos. | M | Medio |
| #7 | El menú de clic derecho debería incluir "Abrir hoja" | **ABIERTA** | El menú de hoja actual tiene solo "Editar Hoja"/"Eliminar Hoja" (`LeftPanel.jsx:331-338`, `BovedaWorkspace.jsx:86-89`); nunca existió un ítem "Abrir hoja" (búsqueda en el historial sin resultados). `AgendaContextMenu` acepta un array `items` con `label`/`onClick`, así que agregarlo es trivial. | S | Bajo |
| #8 | Escribir "1." en los apuntes no arma lista numerada: solo indenta / no se ven números | **ABIERTA (bug CSS)** | `index.css:1` tiene `@tailwind base` activo (preflight resetea `ol,ul { list-style:none }`). `index.css:415-416` (`.ProseMirror ul,ol`) y `428-429` (`.apuntes-preview ul,ol`) fijan `padding-left` pero **no** `list-style-type`. La lista se crea (TipTap StarterKit funciona), pero los marcadores no se muestran → se ve como una indentación. | S | Bajo |
| #9 | El inbox de captura no capturaba nada hacía 3 días | **RESUELTA** | Dos causas raíz, ambas con fix en código y desplegadas: (1) el bot de Telegram no registraba mensajes → `register_telegram_message` cableado en `bot.py:786` (commit `ef8993c`); (2) el evaluador fallaba al parsear múltiples JSON → `raw_decode` en `jarvis/captures/passive.py:262` (commit `bfa853c`). Sumado a los arreglos del `.env` del homelab (sesiones 4-5 del Handoff). El usuario confirmó el 2026-10-01 que la captura por Telegram funciona. | — (ya resuelta) | Bajo |
| #10 | Al borrar el link del título desaparece la preview; debería colgar del link del cuerpo | **ABIERTA (diseño)** | La preview de una hoja `link` se arma con `hoja.contenido` (el campo que hace de título): `DetailScreen.jsx:208-216` y `CaptureModal.jsx:452-457`. No hay detección de URLs dentro de `apuntes` (cuerpo). Requiere decidir el modelo: extraer el primer link del cuerpo y colgar la preview de ahí. | M | Medio |
| #11 | La categorización de notas en "Sin Categorizar" debería ser más ágil | **ABIERTA** | "Sin categorizar" es la categoría default del seed (`app/db/database.py`); ahí caen capturas del bot/vault. Hoy recategorizar es nota por nota vía `EditHojaModal` (no hay selección múltiple, drag-and-drop ni picker inline rápido). El store solo expone PATCH por hoja (`useStore.js:1985-1989`). | M | Medio |
| #12 | No se puede asignar título al crear una nota | **ABIERTA** | `CaptureModal.jsx` (sección Bóveda) solo tiene textarea `contenido` + categoría + tipo (líneas 434-505); no hay campo de título separado. El "título" visible se deriva de `contenido` (`utils/hojaUtils.js::getHojaDisplayTitle`). | S-M | Bajo |
| #13 | La nota rápida debería guardarse en el cuerpo, no en el título | **ABIERTA** | Mismo origen que #12: lo que se escribe en la captura va a `contenido` (que renderiza como título); el cuerpo real es `apuntes` (TipTap) y queda vacío en una captura rápida. El modelo de datos conflaciona "título" y "contenido". | S-M | Medio |
| #14 | Sección para analizar tiempo en pantalla (carga semanal/mensual) | **ABIERTA (feature nueva)** | No existe ninguna feature de tiempo de pantalla ni fuente de datos de uso de app en el repo (las coincidencias de "pantalla" son UI de Jarvis, no datos de uso). Requiere definir de dónde salen los datos (carga manual vs. integración). | L | Alto (depende de fuente de datos) |
| #15 | En Finanzas, movimientos sin descripción deberían mostrar la categoría en Dashboard/Recientes | **ABIERTA** | En `MovimientosCard.jsx:51,71-73` la línea principal es `{icon} {desc}`; con `descripcion` vacía queda solo el ícono (la categoría ya aparece en la sub-línea, `:75`). El fix natural es usar la categoría como etiqueta principal cuando no hay descripción (`desc || cat`). (El literal "-" que menciona el usuario no está en el código actual de esa card; se ve como etiqueta en blanco.) | S | Bajo |

---

## Auditoría conjunta de la zona "crear/editar una nota" (#2, #8, #10, #12, #13)

Estas cinco notas tocan el mismo modelo: una hoja tiene `contenido` (hace de título/campo
principal) y `apuntes` (cuerpo TipTap). El problema de fondo es que la captura rápida y el modelo
de datos conflacionan "título" y "cuerpo":

- La captura (`CaptureModal`) escribe todo en `contenido` → #12 (no hay campo de título) y #13 (la
  nota rápida termina en el título, no en el cuerpo) son dos caras del mismo diseño.
- La preview de link cuelga de `contenido` → #10.
- #8 es un bug CSS independiente del editor de cuerpo, pero vive en la misma pantalla (apuntes).
- #2 ya quedó resuelta por la edición de título en `DetailScreen`, pero pertenece a la misma zona.

**Conviene un ticket paraguas de diseño** que decida el modelo título/cuerpo antes de tocar #10,
#12 y #13 (ver "Decisiones de producto"). #8 puede ir por separado (bug acotado). #2 ya está cerrada.

---

## Agrupación recomendada en tickets

Ordenados por valor/tamaño (primero lo barato y de alto impacto):

1. **T1 — Bugs y pulido de Bóveda (S, bajo riesgo).** Cubre #8 (marcadores de lista en
   `.ProseMirror`/`.apuntes-preview`), #7 ("Abrir hoja" en el menú contextual) y #5 (menú
   contextual en "Últimas hojas" del `RightPanel`). Tres cambios chicos, mismo módulo, sin
   decisiones de producto. **Hacer primero.**

2. **T2 — Finanzas: fallback de categoría en Recientes (S).** Cubre #15 (`desc || cat` en
   `MovimientosCard`, y revisar la tabla de "ver todas"). Independiente, trivial, alto valor visible.

3. **T3 — Modelo título/cuerpo de la nota (M, requiere decisión previa).** Cubre #12, #13 y #10.
   Depende de la decisión de producto de abajo. Es el corazón de la queja repetida del usuario
   sobre la captura.

4. **T4 — Jarvis lee la agenda en vivo (L).** Cubre #3. Cablear el Tool Registry/Executor
   (`jarvis/tools/`) al flujo de `query/service.py` (tool-calling) para que el chat pueda consultar
   `agenda.list_events` bajo demanda. Es trabajo de arquitectura; conviene su propia rama de feature.

5. **T5 — Categorización ágil de "Sin categorizar" (M, requiere decisión).** Cubre #11. Depende de
   elegir el mecanismo (ver abajo).

6. **T6 — Tags sugeridos por IA en la Bóveda (M, requiere decisión).** Cubre #6. Reutiliza la
   generación de tags que ya hace el clasificador de Jarvis; falta decidir dónde se ofrecen y si el
   usuario los confirma.

7. **T7 — Transparencia de "Proyectos Activos" (S) / fuente de proyectos (L).** Cubre #4. El tooltip
   explicativo es S; cambiar la fuente de datos es L.

8. **T8 — Sección de tiempo en pantalla (L).** Cubre #14. Feature nueva, bloqueada por la fuente de
   datos. Menor prioridad.

**#9 ya está resuelta y desplegada** — no genera ticket (solo cerrar el seguimiento del Handoff).

---

## Decisiones de producto necesarias antes de implementar

### #12 + #13 (T3) — ¿cómo se separa título y cuerpo en la captura?
- **(a) Campo de título opcional + textarea de cuerpo.** La captura rápida pasa a tener dos campos:
  "Título (opcional)" → `contenido`, y "Nota" → `apuntes`. Si el título va vacío, se deriva del
  cuerpo como hoy. Más explícito, un poco más de fricción en la captura.
- **(b) Un solo campo "cuerpo" + título autogenerado.** La nota rápida va a `apuntes`; el título se
  genera de la primera línea del cuerpo. Mantiene la captura de un solo campo, pero invierte el
  destino actual (resuelve #13 directamente). Menos control manual del título.

### #10 (T3) — ¿de dónde cuelga la preview?
- **(a) Preview del primer link del cuerpo.** Si `apuntes` tiene una URL, la preview se arma de la
  primera; el título deja de ser el ancla. Coincide con lo que pide el usuario.
- **(b) Preview de un campo de link dedicado.** La hoja `link` tiene un campo URL explícito, separado
  del título; la preview cuelga de ahí. Más limpio a largo plazo, pero toca el modelo de datos.

### #11 (T5) — ¿qué mecanismo de recategorización?
- **(a) Picker de categoría inline en cada hoja de "Sin categorizar"** (un dropdown rápido sin abrir
  el modal completo). Bajo riesgo, mejora incremental.
- **(b) Selección múltiple + "mover a categoría"** (batch). Más potente para vaciar el inbox de
  golpe; requiere endpoint de PATCH múltiple o varios PATCH encadenados.

### #6 (T6) — ¿cómo se ofrecen los tags de IA?
- **(a) Sugerencias no intrusivas al editar/guardar** (chips "sugeridos" que el usuario acepta con un
  clic). El usuario mantiene el control; reutiliza el clasificador existente.
- **(b) Autoetiquetado automático con opción de quitar.** Menos fricción, más riesgo de ruido en los
  tags; necesita una forma fácil de revertir.

### #14 (T8) — ¿de dónde salen los datos de tiempo en pantalla?
- **(a) Carga manual** (el usuario ingresa su tiempo semanal/mensual, como ya hace con otros datos de
  Finanzas/Hábitos). Simple, sin integraciones, coherente con el resto de SGR.
- **(b) Integración con una fuente externa** (export de screen-time del teléfono/SO). Mucho más
  trabajo y dependencias; probablemente fuera del alcance offline-first actual.

### #4 (T7) — ¿alcance?
- **(a) Solo transparencia:** tooltip/empty-state que explique que los proyectos se derivan del
  clasificador sobre memorias aceptadas y cuándo se actualizan. S.
- **(b) Cambiar la fuente/edición de proyectos:** permitir crear/editar proyectos manualmente desde
  la UI. L, toca `memory_projects` y su CHECK de `created_by`.

---

## Qué quedó sin poder verificar

- **Reproducción en navegador:** no se levantó el sandbox (`dev-start.ps1`), así que ninguna nota de
  UI se reprodujo visualmente. Las conclusiones de #2 (ruteo a DetailScreen en móvil), #5/#7 (menús
  contextuales) y #8 (marcadores de lista) se basan en lectura de código y son concluyentes, pero
  faltaría la confirmación manual a ancho de pantalla de celular para #2 y una captura visual de #8.
- **#3 y #4 (Jarvis):** se verificó por código que el chat no consulta la agenda en vivo y que las
  tools no están cableadas. No se ejecutó una consulta real contra el Jarvis del homelab. Si se
  quiere evidencia en vivo, el usuario puede preguntarle a Jarvis por `/jarvis` algo como "¿qué
  eventos tengo esta semana?" y confirmar que responde desde memoria (no desde la agenda actual).
- **#15:** el usuario reportó ver un literal "-"; en el código actual de `MovimientosCard` la etiqueta
  queda en blanco (sin guion). Puede ser un build previo en el homelab o la lectura de la sub-línea.
  El arreglo propuesto (`desc || cat`) resuelve ambos casos; no cambia el triaje.
