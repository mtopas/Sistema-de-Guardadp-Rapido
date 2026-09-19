# Próximamente

Ideas anotadas para evaluar/diseñar más adelante — no aprobadas, no implementadas. Formato libre, se promueven a una propuesta formal en `decisiones-implementacion.md` cuando se retoman.

---

## Ingestión de Agenda: que Jarvis también vea tareas pendientes a corto plazo, no solo completadas

**Fecha:** 2026-09-19

**Contexto:** el usuario preguntó por qué el reporte diario mostraba "1 tareas completadas
revisadas" cuando hay otras tareas sin completar en su Agenda. Se investigó y confirmó (ver
`Cerebro/decisiones-implementacion.md`, entrada `2026-09-19`) que **no es un bug** —
`run_agenda_ingestion()` (`jarvis/ingestion/agenda.py`) excluye tareas pendientes a propósito
desde el diseño original del 03/09: solo ingiere hechos ya cerrados (eventos pasados, tareas
completadas), nunca el to-do abierto, que vive en Agenda misma.

**Pedido nuevo del usuario**: quiere que Jarvis también tenga visibilidad de sus **tareas a corto
plazo** (pendientes, no completadas) — no necesariamente para "recordarlas como hecho" igual que
una tarea cerrada, sino para que el asistente sepa qué tiene por delante al conversar/responder
(ej. si le preguntás "¿qué tengo pendiente esta semana?" o si el contexto de una respuesta debería
tener en cuenta que hay un parcial por rendir).

**Sin diseñar todavía — preguntas a resolver cuando se retome:**
1. ¿Esto es una ingestión más (con su propia propuesta de captura, como las completadas) o algo
   más liviano tipo "contexto de solo lectura" que el retriever consulte en vivo sin pasar por
   `jarvis_capture_proposals` ni `memory_entries` (evitar duplicar el estado — la tarea YA vive en
   Agenda, ¿hace falta una copia en la memoria de Jarvis?)?
2. Si se guarda como memoria: ¿qué pasa cuando la tarea se completa o se borra después? Necesitaría
   algún mecanismo de actualización/expiración que hoy no existe para este tipo de contenido
   (`agenda_eventos`/`agenda_tareas` sí tienen estado vivo en `app.db`; una copia en `memory_entries`
   quedaría desactualizada sola).
3. Ventana de "corto plazo" — ¿cuántos días hacia adelante? `JARVIS_AGENDA_INGESTION_WINDOW_DAYS`
   (hoy 7 días, hacia atrás) es el precedente más cercano, pero es para lo ya pasado, no para lo que
   viene.
4. Relación con el retriever (`jarvis/retriever/`) — si la idea final es "que el asistente lo sepa
   al responder" más que "que quede en la memoria persistente", tal vez la solución correcta ni
   siquiera pase por ingestión sino por sumar una consulta en vivo a `agenda_tareas`/`agenda_eventos`
   como contexto adicional del chat, sin tocar `memory_entries` para nada.

---

## Pendiente real tras el deploy de la fusión Bóveda-Jarvis (2026-09-15)

Ninguno de estos ítems está implementado. Se registran acá para no perderlos — vivían solo en
la conversación que armó/desplegó `D:\Boveda`. Promover a `decisiones-implementacion.md` cuando
se retome cada uno.

1. ~~**Jarvis no ingiere el contenido ya existente de `D:\Boveda` en su propia memoria.**~~
   **Implementado y corrido contra el homelab real, 2026-09-15** — `jarvis/cli/backfill_vault_content.py`,
   74 notas reales indexadas, confirmado con una consulta real a Jarvis citando fuentes reales.
   Ver `Cerebro/estado-actual.md`. Sigue sin resolver la pregunta de fondo: no se decidió si
   `mybot/assistant.py::_gather_boveda()` (RAG de SGR) y el RAG propio de Jarvis
   (`jarvis/retriever/`) deberían unificarse, mantenerse separados a propósito, o preferir uno sobre
   el otro según el tipo de pregunta — hoy conviven sin ninguna regla que los distinga.
2. **Triage automático del Inbox** — el worker sugiriendo por Telegram dónde archivar lo que queda
   en `00 - Sin categorizar/`. Se diseñó y se aprobó en la conversación original, nunca entró en el
   alcance de ningún milestone implementado.
3. **Editor de SGR sigue produciendo HTML, no Markdown nativo.** Milestone 2 solo agregó la
   conversión HTML↔Markdown en el backend (`app/vault/markdown.py`) para que el archivo en disco
   quede limpio; el editor TipTap del frontend nunca se tocó (estaba explícitamente fuera de
   alcance). La experiencia "Typora-style" (WYSIWYG rindiendo Markdown real en vivo) que se discutió
   no está implementada en la UI.
4. **Política de limpieza de `05 - Basura/` sin cerrar** — ¿se vacía sola por antigüedad, o la
   revisás vos a mano? Quedó abierto más de una vez en la conversación, nunca se decidió.
5. **Agenda de SGR queda explícitamente fuera de esta fusión** — nunca se migró a archivo, sigue
   con `crud.py`/SQLite sin cambios. Es el módulo más complejo (recurrencia, time-blocking, ICS),
   pospuesto a propósito hasta que Bóveda+Jarvis funcionen bien en el día a día.
6. **Grafo/relaciones al estilo Obsidian en SGR** — extender `NetworkGraph.jsx` con aristas por
   `[[wikilinks]]` reales (no solo jerarquía de categorías), backlinks, hover preview. Deferred
   desde el principio del diseño, a propósito — ítem de roadmap propio, no bloqueante.
7. ~~**Fixes de empaquetado del `.exe`**~~ **Confirmado y recompilado desde `master`, 2026-09-15**
   — build limpio sin el error de `tiktoken_ext` (la causa real era compilar con el Python global en
   vez de `project/venv`, no un bug del propio fix).
8. ~~**Merge de `feature/boveda-jarvis-fusion` a `master`**~~ **Hecho, 2026-09-15** — fast-forward,
   sin conflictos, pusheado a `origin/master`.

---

## Vault centralizado (Obsidian) como fuente de lectura para Jarvis

**Estado: implementado y desplegado (2026-09-15)** — ver `Cerebro/decisiones-implementacion.md`
(entrada `2026-09-11 — PROPUESTA APROBADA...`) y `Cerebro/decisiones/`. La idea de abajo (2026-09-07)
es el borrador original que se promovió a diseño formal; queda como referencia histórica de cómo
arrancó, no como estado real actual — para eso, ver la entrada de `decisiones-implementacion.md`.

**Fecha:** 2026-09-07

**Idea:** el usuario quiere un "cerebro"/bóveda centralizada en Markdown que junte proyectos, memorias, contenidos, cursos, etc. de todos sus proyectos (no solo SGR), curada a mano en Obsidian (links, wikilinks, grafo). Quiere que Jarvis pueda leer ese contenido. Más adelante, la Bóveda del propio SGR también debería poder acceder a lo mismo.

**Contexto relevante ya existente:**
- Jarvis ya tiene su propio vault interno (`jarvis/vault/`, `JARVIS_VAULT_PATH`) que el sistema **escribe** (una nota `.md` por `memory_entry`, con wikilinks reales a entidades/proyectos vía `jarvis/vault/index_writer.py`). Ese vault es una proyección de `jarvis.db`, no la fuente de verdad.
- En la sesión "Jarvis 0.2→0.3" (2026-09-03) se armó la propuesta de Ingestión Automática y se descartó explícitamente "documentos/archivos locales" como fuente para esa primera iteración, dejando anotado que "el alcance de lectura no está acotado todavía, necesita su propia sub-propuesta" (ver `Cerebro/estado-actual.md`, sesión 0.2→0.3). **Esta idea es esa sub-propuesta.**

**Dirección de diseño discutida (sin comprometer nada todavía):**
- Vault centralizado del usuario = fuente de **lectura**, separada físicamente del vault interno que Jarvis ya escribe — nunca escribir directo ahí, para no pisar la curación manual del usuario.
- Mismo patrón que la ingestión de Agenda (0.3): Jarvis lee, arma propuestas en `jarvis_capture_proposals` (o similar), el usuario aprueba/rechaza por Telegram/desktop — nunca escritura directa a `memory_entries`.
- Contenido leído del vault personal pasa por el mismo gateway de PII (`jarvis/privacy/gateway.py`) antes de tocar un LLM externo — un vault de años puede tener cualquier cosa, no hay razón para tratarlo distinto a otras fuentes.
- Trade-off reconocido: lectura pasiva + aprobación humana es seguro pero no da absorción en tiempo real; cada nota nueva se propone, no se integra sola.

**Pendiente de decidir cuando se retome:**
1. Dónde vive físicamente el vault centralizado — ¿reemplaza/es el vault personal actual del usuario en Obsidian, o es una carpeta nueva separada que Jarvis apunta vía config (`JARVIS_EXTERNAL_VAULT_PATH` o similar)?
2. Alcance de lectura inicial: ¿todo el vault desde el día uno, o se arranca acotado (una subcarpeta, un tipo de nota) como se hizo con Agenda arrancando por una sola fuente?
3. Cómo evitar duplicar/pisar el propio vault interno de Jarvis si en algún punto conviven en la misma carpeta raíz de Obsidian (hoy son conceptualmente distintos: uno lo escribe el sistema, el otro lo escribe el usuario).
4. Integración con la Bóveda de SGR (módulo `/` del frontend) — consumidor futuro del mismo store, diseño explícitamente diferido a después de que la pieza de Jarvis exista.
