# SGR — Plan Ollama: Asistente Personal con LLM Local

> Documento de diseño y roadmap. Arrancamos con el bot de Telegram como canal principal; la visión completa es un asistente conversacional que conoce toda tu vida (Bóveda, Finanzas, Agenda, Hábitos) y responde preguntas sobre ella.

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

### Componentes nuevos

| Archivo | Rol |
|---------|-----|
| `mybot/llm_client.py` | Cliente HTTP a Ollama (generate + chat); manejo de timeout y fallback |
| `mybot/intent_router.py` | Clasifica intención + extrae datos estructurados del mensaje |
| `mybot/assistant.py` | Modo consulta: reúne contexto de APIs + llama al LLM + formatea respuesta |
| `mybot/embeddings.py` | (Fase RAG) Genera embeddings via Ollama + interfaz a ChromaDB |

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

### Capa 0 — Instalación Ollama

**Tiempo estimado:** 30 min (incluye descarga del modelo)

```powershell
# 1. Instalar Ollama (Windows)
# Descargar de https://ollama.com/download/windows e instalar



# 2. Verificar que corre
ollama --version

# 3. Bajar el modelo de clasificación (2 GB aprox)
ollama pull llama3.2:3b

# 4. Bajar el modelo de embeddings (270 MB)
ollama pull nomic-embed-text

# 5. Verificar que responde
ollama run llama3.2:3b "Hola, respondé en español"
```

**Variables nuevas en `.env`:**
```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_CLASSIFY=llama3.2:3b
OLLAMA_MODEL_CHAT=llama3.2:3b
OLLAMA_MODEL_EMBED=nomic-embed-text
OLLAMA_TIMEOUT=15
LLM_CONFIDENCE_THRESHOLD=0.75
```

**Checklist:**
- [✅] Instalar Ollama
- [✅] Bajar `llama3.2:3b`
- [✅] Bajar `nomic-embed-text`
- [✅] Agregar variables a `.env` y `.env.example`

---

### Capa 1 — Cliente LLM (`llm_client.py`)

**Tiempo estimado:** 2–3 h

Wrapper liviano sobre la API HTTP de Ollama. Centraliza configuración, timeout y fallback.

```python
# Interface pública
async def classify(prompt: str) -> dict          # → {modulo, accion, datos, confianza}
async def chat(messages: list[dict]) -> str      # → respuesta en texto libre
async def embed(text: str) -> list[float]        # → vector de embeddings
async def is_available() -> bool                 # healthcheck para fallback
```

**Consideraciones:**
- Timeout configurable vía `OLLAMA_TIMEOUT` (default 15s; clasificación puede ser 5s)
- Si `is_available()` falla → el bot cae al sistema de prefijos actual, sin excepción visible al usuario
- Usar `httpx.AsyncClient` (ya puede estar en el proyecto) o `aiohttp`

**Checklist:**
- [✅] Crear `mybot/llm_client.py` con `classify`, `chat`, `embed`, `is_available`
- [✅] Test manual: enviar prompt hardcodeado y verificar respuesta JSON válida
- [✅] Manejo de timeout + fallback sin romper el bot
- [✅] Actualizar el README.md . .

---

### Capa 2 — Router de intención (`intent_router.py`)

**Tiempo estimado:** 1 día

**El corazón del sistema.** Recibe el mensaje crudo del usuario y devuelve intención estructurada.

#### Prompt de clasificación

```
Sos el clasificador de intención de una app personal en español.
Tu única tarea es devolver JSON válido. Sin texto adicional.

Módulos disponibles:
- finanzas: movimientos de dinero, gastos, ingresos, saldos, metas de ahorro
- agenda: eventos, tareas, recordatorios, reuniones, fechas
- habitos: hábitos, rutinas, completar actividades físicas o mentales
- boveda: notas, apuntes, links, ideas, libros, citas, conocimiento
- consulta_finanzas: preguntas sobre gastos, informes, resúmenes financieros
- consulta_habitos: preguntas sobre progreso, rachas, estadísticas de hábitos
- consulta_agenda: preguntas sobre qué tengo hoy, pendientes, semana
- consulta_boveda: búsqueda o preguntas sobre el conocimiento guardado
- desconocido: no encaja en ningún módulo

Mensaje del usuario: "{mensaje}"
Fecha y hora actual: {fecha_hora}

Responde SOLO con este JSON:
{
  "modulo": "<nombre>",
  "accion": "<guardar|consultar|modificar|eliminar>",
  "datos": { ... campos extraídos según módulo ... },
  "confianza": <0.0 a 1.0>,
  "es_pregunta": <true|false>
}

Campos por módulo (incluir solo los presentes en el mensaje):
- finanzas/guardar: monto, descripcion, cuenta, tipo (gasto|ingreso|transferencia), categoria
- agenda/guardar: titulo, fecha, hora, duracion, lista, es_tarea (true|false)
- habitos/guardar: nombre_habito, valor (total|parcial), nota
- boveda/guardar: contenido, url (si es link), categoria
```

#### Lógica del router

```python
async def route(message: str, context: dict) -> RouteResult:
    result = await llm_client.classify(prompt)
    
    if result.confianza >= THRESHOLD:
        return RouteResult(action="direct", **result)
    elif result.confianza >= 0.5:
        return RouteResult(action="confirm", **result)  # pide confirmación
    else:
        return RouteResult(action="fallback")  # sistema de prefijos
```

#### Flujo en `bot.py`

```
Mensaje llega → is_available()?
  NO  → handler actual (prefijos)
  SÍ  → intent_router.route()
          → direct (confianza alta): ejecuta sin preguntar
          → confirm (confianza media): muestra resumen y pide ✅/❌
          → fallback: "No entendí bien. Podés usar $: para gastos, t: para tareas..."
          → es_pregunta: → assistant.py (modo consulta)
```

**Checklist:**
- [ ] Crear `mybot/intent_router.py` con `route()` y `RouteResult`
- [ ] Prompt de clasificación calibrado (testeado con 20+ frases)
- [ ] Integrar en el handler `handle_message` de `bot.py`
- [ ] Flujo de confirmación: inline keyboard ✅ Confirmar / ✏️ Corregir / ❌ Cancelar
- [ ] Fallback transparente si Ollama no está disponible
- [ ] Log de clasificaciones (módulo, confianza, acción) para debugging

---

### Capa 3 — Modo consulta: datos estructurados (`assistant.py`)

**Tiempo estimado:** 2–3 días

Cuando el usuario hace una **pregunta** (no quiere guardar nada, quiere saber algo), el asistente:
1. Identifica qué datos necesita
2. Los busca en la API de SGR
3. Los pasa como contexto al LLM
4. El LLM genera una respuesta en lenguaje natural

#### Consultas por módulo

**Finanzas:**
```
"¿cuánto gasté en delivery este mes?"
"¿cómo va mi ahorro?"
"¿cuánto gasté en total?"
"comparame este mes con el anterior"
"¿cuánto tengo en la Naranja X?"
```

Flujo:
```python
# 1. Obtener movimientos del mes
movimientos = await api.get("/fin/movimientos?mes=YYYY-MM")
# 2. Filtrar/agregar si la pregunta es específica (delivery, categoría X)
# 3. Pasar contexto al LLM con prompt de síntesis
```

**Hábitos:**
```
"¿cómo van mis hábitos esta semana?"
"¿cuál es mi racha de correr?"
"¿qué hábitos cumplí hoy?"
```

**Agenda:**
```
"¿qué tengo pendiente hoy?"
"¿cuándo tengo libre esta semana?"
"¿qué completé esta semana?"
```

#### Prompt de síntesis

```
Sos el asistente personal de {nombre}. Respondé en español, tono directo y amigable.
Máximo 4 oraciones. Sin markdown innecesario en Telegram (usá negrita con *).
Usá los datos reales, no inventes cifras.

Pregunta del usuario: "{pregunta}"
Fecha actual: {fecha}

Datos disponibles:
{datos_json}

Respondé la pregunta basándote SOLO en los datos proporcionados.
Si algo no está en los datos, decilo claramente.
```

**Checklist:**
- [ ] Crear `mybot/assistant.py` con `answer_question(pregunta, modulo, context)`
- [ ] Handler para `consulta_finanzas`: pull de `/fin/movimientos` + síntesis LLM
- [ ] Handler para `consulta_habitos`: pull de `/habitos/registros` + stats + síntesis LLM
- [ ] Handler para `consulta_agenda`: pull de `/agenda/eventos` + `/agenda/tareas` + síntesis LLM
- [ ] Prompt de síntesis calibrado (respuestas cortas, sin inventar datos)
- [ ] Manejo de preguntas sin datos suficientes ("No tenés movimientos registrados este mes")

---

### Capa 4 — RAG sobre Bóveda (`embeddings.py`)

**Tiempo estimado:** 2–3 días

> Convierte tu knowledge vault en algo con lo que podés conversar.

```
"¿qué sé sobre machine learning?"
"¿qué libros tengo guardados sobre hábitos?"
"¿qué decía esa nota sobre el método Zettelkasten?"
```

**Flujo:**
```
Hoja guardada/editada → generate embedding → almacenar en ChromaDB
                              (nomic-embed-text)

Pregunta del usuario → generate embedding → k-NN search ChromaDB
                     → recuperar top-K hojas relevantes
                     → LLM genera respuesta citando hojas
```

**Stack:**
- `nomic-embed-text` vía Ollama para embeddings
- ChromaDB como vector store (ligero, sin servidor separado, funciona como librería Python)
- Índice almacenado en `database/chroma/` (mismo directorio que `app.db`)

**Integración con la API de SGR:**
- `POST /hojas` y `PATCH /hojas/{id}` disparan indexado asíncrono
- `GET /hojas/buscar-semantico?q=` → busca en ChromaDB + devuelve hojas con score
- El bot tiene `/pregunta <texto>` que usa este endpoint

**Checklist:**
- [ ] Instalar `chromadb` en el venv del proyecto
- [ ] Crear `mybot/embeddings.py` con `index_hoja()` y `search(query, top_k=5)`
- [ ] Script de indexado inicial: indexar todas las hojas existentes
- [ ] Hook en `POST /hojas` y `PATCH /hojas/{id}` para indexado automático
- [ ] `GET /hojas/buscar-semantico?q=` en `main.py` + función en `crud.py`
- [ ] Comando `/pregunta <texto>` en bot: responde citando hojas con título + categoría
- [ ] Toggle "búsqueda semántica" en `LeftPanel` (frontend)

---

### Capa 5 — Contexto de conversación (memoria de sesión)

**Tiempo estimado:** 1 día

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

# Cada mensaje agrega al historial (role: user/assistant)
# Se pasan los últimos N turnos como contexto al LLM
# Se limpia si hay silencio > 10 minutos o si el usuario cambia de tema
```

**Checklist:**
- [ ] `conversation_context` por `chat_id` en `assistant.py`
- [ ] Pasar últimos 4 turnos como contexto en cada llamada al LLM
- [ ] Limpiar contexto por timeout (10 min) o comando `/nuevo`
- [ ] No incluir comandos de captura (`$:`, `t:`) en el historial conversacional

---

## Testing — 30 frases de uso real

Antes de considerar cada capa completa, testar con frases reales. Para la Capa 2:

### Finanzas (comandos de captura)
1. "gasté 1500 en el super con la Naranja X"
2. "pagué 8000 de luz con débito"
3. "me transfirieron 50000 de sueldo"
4. "cargué nafta 6000 con efectivo"
5. "pagué Netflix 4500 Mercado Pago"
6. "compré ropa 15000 con Galicia"

### Agenda (comandos de captura)
7. "recordame llamar al dentista el viernes"
8. "reunión con Mati mañana a las 18"
9. "tengo que pagar el alquiler el 5 de junio"
10. "clase de guitarra el martes a las 20"

### Hábitos (comandos de captura)
11. "corrí 40 minutos hoy"
12. "leí 20 páginas"
13. "hice meditación parcial, solo 5 minutos"
14. "fui al gimnasio"

### Bóveda (comandos de captura)
15. "el libro Atomic Habits habla de identidad y sistemas"
16. "link a ver: https://example.com/articulo"
17. "nota: el método Zettelkasten usa notas atómicas"

### Consultas (Capa 3)
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

### Bóveda RAG (Capa 4)
28. "¿qué sé sobre machine learning?"
29. "¿qué decía esa nota sobre productividad?"
30. "¿qué libros tengo guardados?"

---

## Roadmap de implementación

```
Semana 1:
  Capa 0 — Instalación Ollama (30 min)
  Capa 1 — llm_client.py (1 día)
  Capa 2 — intent_router.py para COMANDOS (2–3 días)
    → testar con frases 1–17

Semana 2:
  Capa 2 — router para CONSULTAS + flujo de confirmación
  Capa 3 — assistant.py consultas Finanzas (1–2 días)
  Capa 3 — consultas Hábitos + Agenda (1 día)
    → testar con frases 18–27

Semana 3:
  Capa 4 — RAG Bóveda (2–3 días)
  Capa 5 — Contexto de conversación (1 día)
    → testar con frases 28–30 + seguimiento
```

---

## Decisiones de diseño

| Decisión | Motivo |
|----------|--------|
| Ollama local, no API externa | Offline-first, cero costo, privacidad — datos financieros y personales no salen de la máquina |
| llama3.2:3b para clasificación | Rápido en CPU (< 3s), sigue instrucciones JSON bien, suficiente para 4 módulos |
| ChromaDB como librería (no servidor) | Sin proceso extra; `chromadb` embeddido en el proceso Python del bot |
| Fallback transparente | Si Ollama no está corriendo, el bot funciona igual con prefijos — no se rompe |
| Confianza threshold 0.75 | Por encima → acción directa; 0.5–0.75 → confirmación; < 0.5 → fallback |
| Contexto de sesión en memoria (no BD) | Conversaciones son efímeras; no vale la complejidad de persistirlas |
| Datos al LLM como JSON, no en texto libre | Respuestas más precisas; menos alucinaciones; fácil de validar |

---

## Lo que no se implementa aquí

| Idea | Por qué no |
|------|-----------|
| Fine-tuning del modelo | Overkill para clasificación de 4 módulos; prompt engineering es suficiente |
| Streaming de respuestas en Telegram | Telegram no tiene soporte nativo de streaming; no vale la complejidad |
| Multimodalidad (imágenes → LLM) | El bot ya procesa fotos como hojas de Bóveda; no necesita visión del LLM |
| LLM para generar código o análisis financiero complejo | El modelo local no es confiable para esto; mejor mantener la lógica en Python |
