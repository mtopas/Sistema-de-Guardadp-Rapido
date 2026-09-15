# Próximamente

Ideas anotadas para evaluar/diseñar más adelante — no aprobadas, no implementadas. Formato libre, se promueven a una propuesta formal en `decisiones-implementacion.md` cuando se retoman.

---

## Pendiente real tras el deploy de la fusión Bóveda-Jarvis (2026-09-15)

Ninguno de estos ítems está implementado. Se registran acá para no perderlos — vivían solo en
la conversación que armó/desplegó `D:\Boveda`. Promover a `decisiones-implementacion.md` cuando
se retome cada uno.

1. **Jarvis no ingiere el contenido ya existente de `D:\Boveda` en su propia memoria.**
   La fusión (Milestone 3) solo conectó el camino de **escritura** hacia adelante (contenido nuevo
   del usuario → árbol PARA; síntesis de Jarvis → `Boveda/Jarvis/`). Las 65 notas ya migradas
   (vault de Obsidian + hojas de SGR) **nunca pasaron por el pipeline de captura de Jarvis** —
   no hay `memory_entries` ni embeddings de Jarvis para ese contenido. Confirmado en vivo
   (2026-09-15): preguntarle a Jarvis por Telegram sobre contenido real de la Bóveda no funciona
   vía la memoria propia de Jarvis. Lo que sí funciona (sin confirmar del todo, a revisar):
   `_gather_boveda()` en `mybot/assistant.py` usa el RAG propio de SGR (`emb.search()` sobre
   `hojas`, `app/semantic.py`), que sí debería tener el contenido real porque `hojas` ahora refleja
   `D:\Boveda`. Pendiente: decidir si hace falta un backfill real de Jarvis sobre el contenido
   existente, o si alcanza con que las preguntas sobre Bóveda siempre ruteen al RAG de SGR y no al
   de Jarvis (son dos sistemas de memoria distintos, cada uno con su propio índice).
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
7. **Fixes de empaquetado del `.exe` (tiktoken_ext, datos de litellm) sin portar a `master`** —
   se arreglaron en `feature/boveda-jarvis-fusion` (commit `6ee6c77`) porque aparecieron
   recompilando ahí, pero `master` probablemente tiene el mismo bug latente (nadie reconstruyó el
   `.exe` desde que `jarvis.api.router` quedó en la cadena de imports). No confirmado ni portado.
8. **Merge de `feature/boveda-jarvis-fusion` a `master`** — pendiente de que el usuario confirme el
   testeo de punta a punta (captura por Telegram, pregunta a Jarvis, `sgr-abrir.ps1`).

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
