# Próximamente

Ideas anotadas para evaluar/diseñar más adelante — no aprobadas, no implementadas. Formato libre, se promueven a una propuesta formal en `decisiones-implementacion.md` cuando se retoman.

---

## Vault centralizado (Obsidian) como fuente de lectura para Jarvis

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
