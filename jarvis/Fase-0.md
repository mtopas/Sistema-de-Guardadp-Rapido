# Jarvis — Fase 0.1: Memory Core

> Estado: **En diseño** — Agosto 2026
> La especificación completa está en `jarvis/jarvis-spec.html`.
> El estado real de lo construido está en `Cerebro/estado-actual.md` (leer antes de implementar).
> Este archivo es un resumen rápido de referencia para la fase.

---

## Objetivo de la fase

Jarvis 0.1 está terminado cuando el usuario puede:
- Mandar información por texto o Telegram
- Cerrar todo y volver después
- Preguntar *"¿qué decidimos sobre X?"* o *"¿qué sé de Y?"*
- Obtener una respuesta usando memoria persistente, útil y coherente

---

## Qué se construye en esta fase

| Componente | Descripción |
|------------|-------------|
| **Memory Core** | Tipos RAW, SEMANTIC, DECISION, PROJECT en SQLite + vault Markdown |
| **Inbox worker** | Proceso Python separado; procesa entradas en background con reintentos |
| **Privacy Gateway** | Flags `local_only`/`confidential` + regex para secretos; solo RAG va al modelo externo |
| **Budget tracker** | Límite USD/día; fallback automático a modo local al agotarse |
| **LiteLLM** | Gateway unificado de modelos; todo llamado LLM pasa por aquí — cambiar modelo es una variable de entorno |
| **Langfuse (self-hosted)** | Observabilidad de trazas LLM: latencia, costo, tool calls |
| **OpenTelemetry** | Trazas de infraestructura + security audit log independiente del sistema LLM |
| **Interfaz /jarvis** | Nueva ruta en SGR: chat + panel lateral + inbox view + editor de entradas |
| **Integración Telegram** | Captura móvil + respuesta; clasificación captura/consulta automática |
| **Migración Bóveda** | Script one-time: backup → transformación → validación → corte |

---

## Tipos de memoria en 0.1

- **RAW** — Contenido original sin modificar
- **SEMANTIC** — Conocimiento extraído y consolidado
- **DECISION** — Decisiones tomadas con contexto y justificación
- **PROJECT** — Estado y contexto por proyecto

*(EPISODIC, PEOPLE/ENTITIES, ACTIONS, DERIVED, SUPERSEDED → 0.2+)*

---

## Modelos

| Tarea | Modelo | Dónde corre |
|-------|--------|-------------|
| Embeddings, clasificación, extracción de entidades | `nomic-embed-text` + `llama3.2:3b` | Local (Ollama) |
| Síntesis, razonamiento, respuestas a consultas | GPT-5.4 mini | API externa |
| Presupuesto | $1 USD/día | Variable de entorno `JARVIS_DAILY_BUDGET_USD` |

---

## Principios clave (ver spec para la lista completa)

1. Variables de entorno para todo — nunca hardcodear infraestructura
2. Captura primero, procesamiento después — el RAW nunca se pierde
3. El vault Markdown es la fuente durable — ChromaDB es un índice reconstruible (→ pgvector en 0.2)
4. Privacidad: bloquear ante la duda
5. SGR debe seguir funcionando durante toda la transición (patrón strangler)
6. Backup antes de tocar datos existentes
7. No avanzar a 0.2 sin que 0.1 cumpla genuinamente su criterio de éxito
8. Nunca llamar openai.* u ollama.* directamente — siempre vía LiteLLM
9. `origin_trust` nunca aumenta en derivados — propagación sin degradación
10. Toda escritura al memory store lleva `source_id` (provenance obligatorio)

## Campos de esquema obligatorios en 0.1

La tabla `memory_entries` incluye estos campos bitemporales/de provenance obligatorios:
- `valid_from`, `recorded_at` — temporalidad bitemposal mínima
- `source_id` — provenance de cada claim (obligatorio, no nulo)
- `confidence`, `extraction_confidence` — confianza del claim y de la extracción LLM por separado
- `origin_trust` — nivel de confianza de la fuente, se propaga sin degradación
- `user_id` — namespace para multiusuario futuro (default `'default'`)

---

## Lo que NO entra en esta fase

- Obsidian sync bidireccional
- Detector automático de PII completo
- Tipos EPISODIC, PEOPLE/ENTITIES, ACTIONS, DERIVED, SUPERSEDED
- Gmail, GitHub, WhatsApp, voz
- Tool system, agentes autónomos, interfaces generadas
- Multi-usuario, SaaS, distribución pública

---

## Criterio de finalización

> El usuario abandona la Bóveda como sistema principal de búsqueda
> y empieza a usar Jarvis para recuperar contexto de proyectos y decisiones.
