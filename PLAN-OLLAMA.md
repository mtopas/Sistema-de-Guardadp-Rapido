# SGR — Plan Ollama: Asistente Personal con LLM Local

> Documento de diseño y roadmap. Arrancamos con el bot de Telegram como canal principal; la visión completa es un asistente conversacional que conoce toda tu vida (Bóveda, Finanzas, Agenda, Hábitos) y responde preguntas sobre ella.

**Estado (jun 2026):**

| Capa | Estado | Notas |
|------|--------|-------|
| 0 — Instalación Ollama | ✅ | Variables en `project/.env.example`; modelos documentados |
| 1 — `llm_client.py` | ✅ | Cliente síncrono con `requests`; ver `project/Bot.md` |
| 2 — `intent_router.py` | ✅ | Captura Finanzas/Agenda/Hábitos + detección de consultas |
| 3 — `assistant.py` | ✅ | Consultas Finanzas/Hábitos/Agenda/Bóveda; síntesis LLM |
| 4 — RAG Bóveda | ✅ | `app/semantic.py` + ChromaDB + hooks CRUD + `/pregunta` bot |
| 5 — Memoria de sesión | ⏳ | Contexto conversacional entre preguntas de seguimiento |

Detalle técnico del bot: `project/Bot.md` · README: `project/README.md` § Bot Telegram — LLM.

---

## Visión completa

El bot pasa de ser una interfaz de comandos a ser un **asistente personal** que vive en Telegram:

```
"gasté 1500 en el super con la Naranja X"
  → detecta: movimiento financiero
  → extrae: monto=1500, descripción="super", cuenta="Naranja X"
  → confirma y guarda

"¿cuánto gasté en delivery este mes?"
  → consulta fin_movimientos con filtro mes actual
  → LLM sintetiza: "Gastaste $18.400 en delivery — 23% más que el mes pasado"

"¿qué sé sobre machine learning?"
  → busca hojas de Bóveda con embedding similarity
  → LLM responde citando tus propias notas

"¿cómo van mis hábitos esta semana?"
  → pull de registros + stats de los últimos 7 días
  → LLM narra: "Completaste el 78% — el de correr fue el más consistente, leer se te fue 3 días"

"recordame llamar al dentista el viernes"
  → detecta: tarea de Agenda
  → extrae: título="Llamar al dentista", fecha=próximo viernes
  → guarda y confirma
```

---

## Arquitectura del sistema

```
┌─────────────┐     mensaje de texto
│  Telegram   │ ─────────────────────────────────────────────┐
└─────────────┘                                               ▼
                                                   ┌─────────────────────┐
                                                   │   intent_router.py  │
                                                   │                     │
                                                   │  LLM clasifica:     │
                                                   │  COMANDO o CONSULTA │
                                                   └──────────┬──────────┘
                                                              │
                          ┌───────────────────────────────────┤
                          ▼                                   ▼
               ┌──────────────────┐               ┌──────────────────────┐
               │  COMANDO         │               │  CONSULTA / PREGUNTA │
               │  (captura datos) │               │  (quiere saber algo) │
               └────────┬─────────┘               └──────────┬───────────┘
                        │                                     │
          ┌─────────────┼──────────────┐         ┌───────────┼─────────────┐
          ▼             ▼              ▼          ▼           ▼             ▼
     Finanzas        Agenda         Hábitos   Finanzas    Agenda/Hábitos  Bóveda
     handlers        handlers       handlers  API query   API query       RAG
          │             │              │          │           │             │
          └─────────────┴──────────────┘          └───────────┴─────────────┘
                        │                                     │
                   Guarda en                         Contexto → LLM
                   SQLite vía                        → Respuesta en
                   API SGR                           lenguaje natural
```

### Componentes

| Archivo | Rol | Estado |
|---------|-----|--------|
| `mybot/llm_client.py` | Cliente HTTP a Ollama (`classify`, `chat`, `embed`, `is_available`) | ✅ |
| `mybot/intent_router.py` | Clasifica intención + extrae datos estructurados; `route()`, `execute()` | ✅ |
| `mybot/assistant.py` | Modo consulta: reúne contexto de APIs + llama al LLM + respuesta texto plano | ✅ |
| `mybot/embeddings.py` | Wrapper REST → `GET /hojas/buscar-semantico` (RAG bot-side) | ✅ |
| `app/semantic.py` | Backend RAG: ChromaDB + embeddings Ollama; `index_hoja`, `search_hojas` | ✅ |

### Modelos Ollama

| Uso | Modelo recomendado | Motivo |
|-----|-------------------|--------|
| Clasificación / extracción JSON | `llama3.2:3b` | Rápido en CPU, sigue instrucciones estructuradas bien |
| Respuestas conversacionales | `llama3.2:3b` o `llama3.2:8b` | 3b suficiente para síntesis de datos estructurados |
| Embeddings (RAG) | `nomic-embed-text` | Especializado, ligero, bueno en español |

> Si tenés GPU dedicada, podés subir a `llama3.1:8b` o `mistral:7b` para mejor razonamiento.

---

## Capas de implementación

---

### Capa 0 — Instalación Ollama — ✅

```powershell
# 1. Instalar Ollama (Windows): https://ollama.com/download/windows

# 2. Verificar que corre
ollama --version

# 3. Bajar modelos
ollama pull llama3.2:3b        # ~2 GB — clasificación y chat
ollama pull nomic-embed-text   # ~270 MB — embeddings RAG

# 4. Verificar
ollama run llama3.2:3b "Hola, respondé en español"
```

**Variables en `.env`:**
```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_CLASSIFY=llama3.2:3b
OLLAMA_MODEL_CHAT=llama3.2:3b
OLLAMA_MODEL_EMBED=nomic-embed-text
OLLAMA_TIMEOUT=15
LLM_CONFIDENCE_THRESHOLD=0.75
```

---

### Capa 1 — Cliente LLM (`llm_client.py`) — ✅

Wrapper síncrono sobre la API HTTP de Ollama. Centraliza configuración, timeout y fallback.

```python
def classify(system_prompt: str, user_message: str) -> dict   # → {modulo, accion, datos, confianza}
def chat(messages: list[dict], system: str | None = None) -> str
def embed(text: str) -> list[float]
def is_available() -> bool
```

- Timeout configurable vía `OLLAMA_TIMEOUT` (default 15s; healthcheck usa 3s)
- Si `is_available()` falla → el bot cae al sistema de prefijos actual, sin excepción visible

---

### Capa 2 — Router de intención (`intent_router.py`) — ✅

**El corazón del sistema.** Recibe el mensaje crudo del usuario y devuelve intención estructurada.

#### Prompt de clasificación

```
Clasificá la intención del mensaje. Devolvé SOLO JSON válido.

Módulos: finanzas | agenda | habitos | boveda |
         consulta_finanzas | consulta_habitos | consulta_agenda | consulta_boveda | desconocido

Respuesta: {"modulo": "...", "accion": "guardar|consultar", "datos": {...}, "confianza": 0.0-1.0, "es_pregunta": bool}
```

#### Lógica del router

```python
def route(mensaje: str) -> RouteResult:
    raw = llm_client.classify(_PROMPT_TMPL, mensaje)
    # consulta_* o es_pregunta → action="question"
    # boveda / desconocido / confianza < 0.5 / campos faltantes → action="fallback"
    # confianza >= 0.75 → action="direct"; 0.5–0.74 → action="confirm"
```

#### Flujo en `bot.py`

```
Mensaje llega → is_available()? (caché 30s)
  NO  → handler actual (prefijos / Bóveda)
  SÍ  → intent_router.route()
          → direct | confirm: resumen + teclado ✅ Confirmar / ✏️ Corregir / ❌ Cancelar
            → llm_ok → intent_router.execute() → API SGR
          → fallback: continúa flujo Bóveda / prefijos (sin mensaje de error)
          → question: "🔍 Consultando…" → assistant.answer_question() → respuesta texto plano
```

**Desvíos respecto al diseño original:**

| Diseño original | Implementación actual |
|-----------------|----------------------|
| `direct` ejecuta sin preguntar | `direct` y `confirm` usan el mismo teclado de confirmación (UX más segura) |
| Captura Bóveda vía LLM | Módulo `boveda` → siempre `fallback` al selector de categorías existente |

**Checklist:**
- [✅] `route()`, `RouteResult`, `execute()`, `format_summary()`
- [✅] Prompt con 8 módulos + ejemplos
- [✅] Integrado en `bot.py` (después de prefijos, antes de Bóveda)
- [✅] Teclado ✅ Confirmar / ✏️ Corregir / ❌ Cancelar
- [✅] `execute()` → `POST /fin/movimientos`, `POST /agenda/tareas|eventos`, `PUT /habitos/{id}/registro`
- [✅] Detección de consultas → `action="question"` → `assistant.answer_question()`
- [✅] Fallback transparente si Ollama no disponible
- [⏳] Calibración formal con 20+ frases (sin suite automatizada)

---

### Capa 3 — Modo consulta: datos estructurados (`assistant.py`) — ✅

Cuando el usuario hace una **pregunta**, el asistente:
1. Identifica qué datos necesita según el módulo detectado
2. Los busca en la API de SGR y los pre-agrega (no pasa filas crudas al LLM)
3. Llama a `llm_client.chat()` con un prompt de síntesis
4. Devuelve texto plano (sin Markdown de Telegram — evita parse errors con `_` o `[`)

#### Función pública

```python
def answer_question(pregunta: str, modulo: str, api_base: str) -> str
```

Normaliza `finanzas`/`consulta_finanzas` → mismo handler (cubre el caso donde `route()` devuelve `modulo="finanzas"` con `es_pregunta=True`).

#### Contexto por módulo

| Módulo | Datos que reúne |
|--------|----------------|
| `finanzas` | Movimientos del mes (normalizados, sin transferencias), saldos de cuentas, config dólar, objetivos |
| `habitos` | Hábitos activos: racha, estado de hoy (completado/parcial/pendiente), % últimos 7 días |
| `agenda` | Eventos de hoy, tareas pendientes próximos 15 días, eventos próximos 7 días |
| `boveda` | Top-5 hits RAG via `embeddings.search()` → ver Capa 4 |

#### Prompt de síntesis

```
Sos el asistente personal del usuario. Respondé en español, tono directo y amigable.
Máximo 4 oraciones cortas. No uses markdown, asteriscos, guiones bajos ni corchetes.
Basate solo en los datos proporcionados, no inventes cifras.
Si algo no está en los datos, decilo claramente.
Fecha actual: {fecha}.
```

**Checklist:**
- [✅] `answer_question()` con dispatch por módulo
- [✅] `_gather_finanzas` / `_gather_habitos` / `_gather_agenda` / `_gather_boveda`
- [✅] Integrado en `bot.py` con "🔍 Consultando…" + edit del mensaje
- [✅] Prompt calibrado (sin markdown, sin inventar datos, máx 4 oraciones)
- [✅] Fallback a comandos manuales si API no responde o Ollama no disponible
- [✅] Normalización dual módulo (`finanzas` con `es_pregunta` y `consulta_finanzas`)

---

### Capa 4 — RAG sobre Bóveda — ✅ (core)

> Convierte el knowledge vault en algo con lo que podés conversar.

```
"¿qué sé sobre machine learning?"
"¿qué libros tengo guardados sobre hábitos?"
"¿qué decía esa nota sobre el método Zettelkasten?"
```

**Flujo:**
```
Hoja guardada/editada → BackgroundTask → embed (nomic-embed-text) → upsert en ChromaDB
DELETE hoja           → BackgroundTask → delete de ChromaDB

Pregunta del usuario → /pregunta o texto libre
  → embeddings.search() → GET /hojas/buscar-semantico?q=
  → backend: embed query → k-NN ChromaDB → hojas con score
  → assistant._gather_boveda() → top-5 hits → _synthesize() → respuesta LLM
```

**Stack:**
- `nomic-embed-text` vía Ollama para embeddings
- `chromadb` (librería Python, sin servidor separado) en el proceso FastAPI
- Índice en `database/chroma/` (junto a `app.db`, excluido de git)
- Bot llama al backend REST — no accede a ChromaDB directamente

**Archivos:**

| Archivo | Rol |
|---------|-----|
| `app/semantic.py` | `embed_text`, `index_hoja`, `delete_hoja`, `search_hojas`, `backfill_missing` |
| `app/main.py` | Hooks `BackgroundTasks` en POST/PATCH/DELETE `/hojas`; `GET /hojas/buscar-semantico`; `POST /hojas/reindexar`; backfill en lifespan |
| `mybot/embeddings.py` | `search(query, top_k, api_base)` → REST wrapper |
| `mybot/assistant.py` | `_gather_boveda(pregunta, api)` → `emb.search()` → contexto para síntesis |
| `mybot/bot.py` | `/pregunta <texto>` → `assistant.answer_question("consulta_boveda", ...)` |

**Checklist:**
- [✅] `chromadb>=0.6` instalado en el venv del proyecto
- [✅] `app/semantic.py`: colección con vectores explícitos (sin embedding function propia), espacio coseno
- [✅] Hook en POST `/hojas` → `background_tasks.add_task(semantic.index_hoja, ...)`
- [✅] Hook en PATCH `/hojas/{id}` → re-index con contenido actualizado (fetch completo post-update)
- [✅] Hook en DELETE `/hojas/{id}` → `background_tasks.add_task(semantic.delete_hoja, ...)`
- [✅] Backfill en lifespan al arrancar (best-effort; omite si Ollama no disponible)
- [✅] `GET /hojas/buscar-semantico?q=&top_k=` — definido antes de `{hoja_id}` para evitar conflicto de ruta
- [✅] `POST /hojas/reindexar` — re-indexado completo en background
- [✅] `mybot/embeddings.py` — wrapper REST, una sola función `search()`
- [✅] `/pregunta <texto>` en el bot (responde citando título + categoría)
- [✅] `consulta_boveda` en modo conversacional (texto libre → router → `answer_question`)
- [ ] Toggle "búsqueda semántica" en `LeftPanel` (frontend — pendiente)

---

### Capa 5 — Contexto de conversación (memoria de sesión) — ⏳

Para que las preguntas de seguimiento funcionen:

```
Usuario: "¿cuánto gasté en delivery?"
Bot:     "Gastaste $18.400 en delivery este mes."
Usuario: "¿y el mes pasado?"  ← necesita recordar el contexto
Bot:     "El mes pasado fueron $14.200, un 22% menos."
```

**Implementación simple:**
```python
# En memoria (dict por chat_id), no persiste entre reinicios del bot
conversation_context: dict[int, list[dict]] = {}

# Cada respuesta de assistant.py agrega al historial (role: user/assistant)
# Se pasan los últimos 4 turnos como contexto en cada llamada al LLM
# Se limpia si hay silencio > 10 minutos o comando /nuevo
```

**Checklist:**
- [ ] `conversation_context` por `chat_id` en `assistant.py`
- [ ] Pasar últimos 4 turnos en cada `llm_client.chat()`
- [ ] Limpiar contexto por timeout (10 min) o `/nuevo`
- [ ] No incluir comandos de captura (`$:`, `t:`, prefijos) en el historial

---

## Testing — 30 frases de uso real

### Finanzas — captura (Capa 2)
1. "gasté 1500 en el super con la Naranja X"
2. "pagué 8000 de luz con débito"
3. "me transfirieron 50000 de sueldo"
4. "cargué nafta 6000 con efectivo"
5. "pagué Netflix 4500 Mercado Pago"
6. "compré ropa 15000 con Galicia"

### Agenda — captura (Capa 2)
7. "recordame llamar al dentista el viernes"
8. "reunión con Mati mañana a las 18"
9. "tengo que pagar el alquiler el 5 de junio"
10. "clase de guitarra el martes a las 20"

### Hábitos — captura (Capa 2)
11. "corrí 40 minutos hoy"
12. "leí 20 páginas"
13. "hice meditación parcial, solo 5 minutos"
14. "fui al gimnasio"

### Bóveda — captura (Capa 2, fallback al flujo manual)
15. "el libro Atomic Habits habla de identidad y sistemas"
16. "link a ver: https://example.com/articulo"
17. "nota: el método Zettelkasten usa notas atómicas"

### Consultas — Capa 3
18. "¿cuánto gasté esta semana?"
19. "¿cuánto gasté en delivery este mes?"
20. "¿cómo van mis hábitos?"
21. "¿qué tengo pendiente hoy?"
22. "¿cuánto tengo en el banco Galicia?"
23. "¿cuál es mi racha de correr?"
24. "¿qué completé esta semana?"

### Ambiguos (deben pedir confirmación)
25. "fui al super" (sin monto → confianza baja)
26. "mañana hay algo" (sin datos suficientes)
27. "pagué" (incompleto)

### Bóveda RAG — Capa 4
28. "¿qué sé sobre machine learning?"
29. "¿qué decía esa nota sobre productividad?"
30. "¿qué libros tengo guardados?"

---

## Roadmap

```
✅ Implementado:
  Capa 0 — Instalación Ollama + variables .env
  Capa 1 — llm_client.py (classify, chat, embed, is_available)
  Capa 2 — intent_router.py: captura Finanzas/Agenda/Hábitos + detección consultas
  Capa 3 — assistant.py: consultas Finanzas/Hábitos/Agenda/Bóveda con síntesis LLM
  Capa 4 — RAG Bóveda: app/semantic.py + ChromaDB + hooks CRUD + /pregunta

⏳ Pendiente:
  Capa 4 — Toggle búsqueda semántica en LeftPanel (frontend)
  Capa 4 — Calibración formal con frases 1–30
  Capa 5 — Memoria de sesión (contexto conversacional)
```

---

## Decisiones de diseño

| Decisión | Motivo |
|----------|--------|
| Ollama local, no API externa | Offline-first, cero costo, privacidad — datos financieros y personales no salen de la máquina |
| `llama3.2:3b` para clasificación | Rápido en CPU (< 3s), sigue instrucciones JSON bien, suficiente para 8 módulos |
| ChromaDB embebido en el backend | Single-writer (evita corrupción multi-proceso); el backend ya es dueño de las hojas; el bot consume via REST |
| BackgroundTasks para indexado | No bloquea el CRUD; si Ollama tarda, la respuesta al usuario es inmediata |
| Best-effort en toda la capa semántica | Si Ollama no está corriendo, el CRUD y el bot funcionan igual — nada se rompe |
| Datos al LLM como JSON pre-agregado | Respuestas más precisas; menos alucinaciones; reglas de negocio (isTransferencia, Ahorro) aplicadas en Python antes del LLM |
| Síntesis en texto plano (sin Markdown) | Evita `BadRequest` de Telegram por `_` o `[` en respuestas libres del LLM |
| Fallback transparente en router | Si Ollama no responde, el bot sigue con prefijos y flujo Bóveda — el usuario no ve el error |
| Bóveda siempre fallback en captura | El selector de categorías existente es más fiable que guardar sin categoría |
| Contexto de sesión en memoria (no BD) | Conversaciones son efímeras; no vale la complejidad de persistirlas entre reinicios |

---

## Lo que no se implementa aquí

| Idea | Por qué no |
|------|-----------|
| Fine-tuning del modelo | Overkill para clasificación de 8 módulos; prompt engineering es suficiente |
| Streaming de respuestas en Telegram | Telegram no tiene soporte nativo de streaming; no vale la complejidad |
| Multimodalidad (imágenes → LLM) | El bot ya procesa fotos como hojas de Bóveda; no necesita visión del LLM |
| LLM para generar código o análisis financiero complejo | El modelo local no es confiable para esto; mejor mantener la lógica en Python |
| ChromaDB como servicio Docker separado | La librería embebida es suficiente para uso personal; un servicio separado complica el setup sin beneficio real |
