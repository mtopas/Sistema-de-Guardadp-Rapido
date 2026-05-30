# Bot Telegram — SGR

Bot de Telegram para el sistema SGR. Canal principal de captura rápida y registro conversacional de todos los módulos (Bóveda, Finanzas, Agenda, Hábitos). Corre en Docker en el homelab; llama a la misma API REST en `:8765`.

---

## Archivos

```
project/mybot/
├── bot.py               # Entry point; handlers de mensajes y callbacks
├── llm_client.py        # Cliente HTTP para Ollama
├── intent_router.py     # Clasificador de intención + ejecución
├── agenda_handlers.py   # Comandos y steps de Agenda / Hábitos
├── finanzas_handlers.py # Comandos y steps de Finanzas
├── chat_id.json         # Persiste el chat_id entre reinicios (generado en runtime)
└── rapido.json          # Estado del modo rápido (generado en runtime)
```

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Token del bot (obligatorio) |
| `API_BASE_URL` | `http://127.0.0.1:8765` | URL de la API SGR |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | URL de Ollama |
| `OLLAMA_MODEL_CLASSIFY` | `llama3.2:3b` | Modelo para clasificar intención |
| `OLLAMA_MODEL_CHAT` | `llama3.2:3b` | Modelo para respuestas conversacionales |
| `OLLAMA_MODEL_EMBED` | `nomic-embed-text` | Modelo para embeddings (RAG futuro) |
| `OLLAMA_TIMEOUT` | `15` | Timeout en segundos para llamadas a Ollama |
| `LLM_CONFIDENCE_THRESHOLD` | `0.75` | Umbral de confianza para acción directa |

En el homelab: `OLLAMA_BASE_URL=http://192.168.137.1:11434` (Ollama corre en el Windows host; el Docker accede vía ICS, IP fija `192.168.137.1`).

---

## Flujo de un mensaje de texto

```
Usuario envía texto
  │
  ├─ ¿Tiene step activo de Agenda?  → agenda_handlers
  ├─ ¿Tiene step activo de Finanzas? → finanzas_handlers
  │
  └─ step == None:
       ├─ Prefijos rápidos (/tarea, /mov, etc.)  → quick_capture handlers
       │
       ├─ LLM Router (texto libre)
       │    ├─ action == "direct" / "confirm"  → muestra resumen + botones [✅ Confirmar | ✏️ Corregir | ❌ Cancelar]
       │    ├─ action == "question"            → "Modo consulta próximamente" (Capa 3 pendiente)
       │    └─ action == "fallback"            → continúa ↓
       │
       └─ Bóveda (flujo por defecto)
            ├─ Modo rápido ON → guarda en última categoría directamente
            └─ Modo rápido OFF → muestra teclado de categorías inline
```

---

## LLM — Capa 2: Router de intención

### `llm_client.py`

Cliente HTTP puro para Ollama. Falla silenciosamente (devuelve tipo vacío) si Ollama no está disponible.

| Función | Endpoint Ollama | Uso |
|---|---|---|
| `is_available()` | `GET /api/tags` | Healthcheck rápido (timeout 3s) |
| `classify(system, mensaje)` | `POST /api/generate` con `format:"json"` | Clasificación de intención → dict |
| `chat(messages, system?)` | `POST /api/chat` | Respuesta conversacional (Capa 3) |
| `embed(text)` | `POST /api/embeddings` | Vectores para RAG (Capa 4) |

### `intent_router.py`

Usa `llm_client.classify` para extraer módulo, datos y confianza del mensaje.

**Módulos reconocidos:**

| Módulo | Acción |
|---|---|
| `finanzas` | Registrar gasto / ingreso / transferencia |
| `agenda` | Crear tarea o evento |
| `habitos` | Registrar completación de un hábito |
| `boveda` | Guardar nota / link → siempre fallback (selector de categoría) |
| `consulta_finanzas` | Pregunta sobre gastos/saldos → `action="question"` |
| `consulta_habitos` | Pregunta sobre progreso/rachas → `action="question"` |
| `consulta_agenda` | Pregunta sobre pendientes → `action="question"` |
| `consulta_boveda` | Búsqueda en notas → `action="question"` |
| `desconocido` | No encaja → fallback |

**Umbrales de confianza:**

| Confianza | Acción | Comportamiento |
|---|---|---|
| ≥ 0.75 (configurable) | `direct` | Muestra resumen; confirmar ejecuta de una |
| 0.50 – 0.74 | `confirm` | Igual que `direct` (mismo flujo de botones) |
| < 0.50 | `fallback` | Pasa al flujo de Bóveda / prefijos |

**Cache de disponibilidad:** 30 segundos entre healthchecks para no penalizar cada mensaje.

**Campos mínimos requeridos por módulo:**

| Módulo | Campo requerido |
|---|---|
| `finanzas` | `monto` |
| `agenda` | `titulo` |
| `habitos` | `nombre_habito` |

Si faltan → `fallback`, aunque la confianza sea alta.

### `RouteResult`

```python
@dataclass
class RouteResult:
    action:      str    # "direct" | "confirm" | "question" | "fallback"
    modulo:      str
    datos:       dict
    confianza:   float
    es_pregunta: bool
```

### Ejecución (`execute`)

`intent_router.execute(result)` → `(bool, str)` llama directamente a la API SGR:

| Módulo | Endpoint |
|---|---|
| `finanzas` | `POST /fin/movimientos` |
| `agenda` (tarea) | `POST /agenda/tareas` |
| `agenda` (evento) | `POST /agenda/eventos` |
| `habitos` | `GET /habitos` + fuzzy match + `PUT /habitos/{id}/registro` |

---

## Comandos disponibles

### Generales
| Comando | Descripción |
|---|---|
| `/help` | Lista de comandos |
| `/cancel` | Cancela la acción en curso |
| `/rapido [on\|off]` | Activa/desactiva modo rápido (guarda en última categoría sin preguntar) |
| `/ultimas` | Últimas 5 hojas guardadas con botón de eliminar |
| `/buscar <texto>` | Busca en la Bóveda |

### Finanzas
| Comando | Descripción |
|---|---|
| `/mov` | Registrar movimiento (gasto/ingreso/transferencia) |
| `/saldo` | Saldo actual por cuenta |
| `/mes` | Resumen del mes en curso |
| `/ahorro` | Estado de objetivos de ahorro |
| `/ultimo` | Último movimiento registrado |
| `/dolar` | Cotización del dólar |
| `/objetivo` | Progreso de objetivo de ahorro |

### Agenda
| Comando | Descripción |
|---|---|
| `/hoy` | Eventos y tareas de hoy |
| `/dia [fecha]` | Agenda de un día específico |
| `/semana` | Resumen semanal |
| `/pendientes` | Tareas pendientes |
| `/tarea <titulo>` | Crear tarea rápida |
| `/evento <titulo>` | Crear evento |
| `/planificar` | Iniciar sesión de planificación |
| `/asignar` | Asignar bloque de tiempo |
| `/bloquear` | Bloquear horario |
| `/revision` | Revisión semanal |
| `/checkin` | Check-in del día |

### Hábitos
| Comando | Descripción |
|---|---|
| `/habitos` | Estado de hábitos de hoy |
| `/hecho <nombre>` | Marcar hábito como completado |
| `/ayer <nombre>` | Marcar hábito de ayer |
| `/racha <nombre>` | Ver racha actual de un hábito |
| `/nota <nombre> <texto>` | Agregar nota a un hábito |

---

## Tipos de mensaje (sin comando)

| Tipo | Comportamiento |
|---|---|
| Texto libre | LLM router → si fallback, Bóveda |
| URL | Detectado automáticamente como `tipo=link` → Bóveda |
| Foto | Sube imagen; pide título → Bóveda |
| Ubicación | Guarda coordenadas como `tipo=texto` → Bóveda |
| Forward | Extrae texto/caption → mismo flujo que texto |

---

## Bóveda — flujo de captura

1. Bot detecta texto sin prefijo / LLM devuelve fallback
2. Si **modo rápido ON** y hay última categoría → guarda directo
3. Si no → muestra teclado inline con categorías del árbol
   - Categorías con hijos: `📂 Nombre` → abre subcategorías
   - Categorías hoja: guarda directo
   - `➕ Nueva categoría` → pide nombre y crea
   - `⬅ Volver` → sube al nivel anterior
4. Caché de categorías: 60 segundos en `bot_data`

---

## Despliegue (homelab)

```
Ubuntu Server 22.04 — 192.168.137.10
└── Docker Compose
    ├── backend  (FastAPI :8765)  → SQLite en ./database/app.db (volume)
    └── bot      (python-telegram-bot)  → API_BASE_URL=http://backend:8765

Windows PC (host)
└── Ollama :11434  (OLLAMA_HOST=0.0.0.0)
    ├── llama3.2:3b       — clasificación + chat
    └── nomic-embed-text  — embeddings (pendiente)
```

Red: ICS (Internet Connection Sharing) — `Ethernet 2` en Windows, IP fija `192.168.137.1`. Perfil de red: **Private** (requerido para que el firewall permita inbound desde el homelab).

### Bot y app muestran datos distintos

El bot **no abre SQLite**; llama a `API_BASE_URL`. Si abrís SGR en Windows (`project/database/app.db`) pero el bot en Docker usa el backend del homelab (`~/project/database/app.db`), verás notas/movimientos diferentes.

Al arrancar, el bot imprime la ruta de DB que devuelve `GET /meta` del backend al que está conectado.

**Opciones (elegí una):**

| Objetivo | Qué hacer |
|----------|-----------|
| Todo en el homelab | UI en `http://192.168.137.10:8765`; `docker compose up -d`; una sola carpeta `database/` en el gabinete |
| Todo en Windows | `python mybot/bot.py` en la PC con `API_BASE_URL=http://127.0.0.1:8765` (no uses backend Docker) |
| App en Windows, bot en Docker | En `.env` del homelab: `API_BASE_URL=http://192.168.137.1:8765` y en Windows `SGR_HOST=0.0.0.0` |
| Copiar datos al homelab | `scp database/app.db mtopas@192.168.137.10:~/project/database/` y reiniciar backend |

Verificar desde la PC: `curl http://127.0.0.1:8765/meta` vs `curl http://192.168.137.10:8765/meta` — deben mostrar el mismo `db_path` y `counts` que esperás.

Rebuild y deploy:
```bash
# En el homelab
cd ~/project
sudo docker compose up -d --build
sudo docker compose logs -f bot
```

---

## Capas implementadas y pendientes

| Capa | Estado | Descripción |
|---|---|---|
| 0 | ✅ | Ollama instalado (`llama3.2:3b`, `nomic-embed-text`) |
| 1 | ✅ | `llm_client.py` — cliente HTTP para Ollama |
| 2 | ✅ | `intent_router.py` — clasificación de intención + ejecución en API |
| 3 | ⏳ | `assistant.py` — consultas conversacionales (`consulta_*`) |
| 4 | ⏳ | RAG sobre Bóveda con ChromaDB + `nomic-embed-text` |
| 5 | ⏳ | Contexto conversacional (memoria de la sesión) |

### Capa 3 — Consultas (pendiente)

Cuando `action == "question"` el router lo detecta y actualmente responde con un mensaje placeholder. La Capa 3 (`assistant.py`) deberá:
- Consultar los endpoints de resumen de la API (`/fin/resumen`, `/habitos`, etc.)
- Construir un contexto y pasárselo a `llm_client.chat()`
- Devolver la respuesta al usuario en lenguaje natural

### Capa 4 — RAG Bóveda (pendiente)

- Indexar hojas de la Bóveda con `nomic-embed-text` en ChromaDB
- Al recibir `consulta_boveda`, buscar chunks relevantes y pasarlos como contexto a `chat()`
