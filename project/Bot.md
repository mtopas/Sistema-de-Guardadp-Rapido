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

> **Nota (2026-09-16):** este diagrama no muestra los 3 chequeos de Jarvis
> (`jh.handle_pending_clarification` / `handle_pending_passive_proposal` /
> `handle_pending_audit_proposal`) que en `bot.py::handle_message` corren
> ANTES que todo lo de acá — existen para no confundir la respuesta a una
> aclaración/propuesta pendiente de Jarvis con una hoja nueva de Bóveda.
> Desde el fix de esa fecha, si ya hay un **step explícito de Agenda o
> Finanzas activo** (`_AGENDA_FINANZAS_STEPS` en `bot.py`), esos 3 chequeos
> de Jarvis se saltean y el mensaje va directo al step. Ver "Incidentes
> conocidos" más abajo.

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

---

## Incidentes conocidos

### 2026-09-16 — Jarvis interceptaba respuestas a steps de Agenda/Finanzas (tarea perdida)

**Síntoma real:** `/tarea Entrenar ; 12:00, hoy, 1.5h` mostró el picker de listas ("1. Tareas
diarias..."); el usuario respondió `1`; Jarvis lo interceptó ("✅ Guardé tu aclaración como
información nueva") y la tarea nunca se creó (`/hoy` después: "Sin tareas pendientes"). La
respuesta quedó guardada en `memory_entries` (`jarvis.db`) como entrada `RAW` con contenido
`"Entrenar"` (id `427c287c…`) — **no se borró ni se movió**; recrear la tarea a mano.

**Causa raíz:** en `bot.py::handle_message()`, los 3 chequeos de pendientes de Jarvis
(`jh.handle_pending_clarification`, `handle_pending_passive_proposal`,
`handle_pending_audit_proposal`) corrían **incondicionalmente antes** que
`ah.handle_agenda_step()` / `fh.handle_finanzas_step()`, sin mirar si `context.user_data["step"]`
ya estaba en medio de un flujo explícito y acotado de Agenda/Finanzas (picker de listas, paso de
monto/descripción de un movimiento, etc.). Ninguno de los tres handlers de Jarvis mira el `step`
activo — solo chequean si hay *algo* pendiente para ese chat, en `context.user_data`
(`jarvis_clarification`, con timeout de 180s vía `JobQueue`) o en la DB de Jarvis por canal
(propuestas pasivas y de auditoría, sin relación con el `step` del bot).

**Mecanismo confirmado del pendiente concurrente:** el mensaje que vio el usuario
("Guardé tu aclaración como información nueva") es el de `_resolve_individual_audit_proposal()`
con outcome `resolved_with_new_info` — o sea que interceptó una **propuesta de auditoría
individual** (`jarvis.audit.service`, generada por el auditor proactivo de memoria, 0.2 Slice 4),
no una aclaración de captura (`/j` o pasiva). Estas propuestas viven en la tabla
`jarvis_audit_proposals`, scopeadas por canal, sin relación con `context.user_data`, y solo
expiran vía `expire_stale_proposals()` — corrida periódicamente por `jarvis/worker/main.py`, con
`JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES=1440` (24h) por default (`jarvis/config.py`). Es decir: es
perfectamente normal que una propuesta de auditoría quede pendiente varias horas (p.ej. de una
corrida nocturna del auditor) y siga viva cuando el usuario arranca un flujo de Agenda/Finanzas
sin relación — no hace falta ningún otro bug para que coincidan.

No se encontró en el `jarvis.db` local de este checkout ninguna entrada con `source='telegram'`
ni con el id reportado — es esperable si esa DB es una copia sincronizada más vieja que el
incidente (ver `project/SYNC-WINDOWS.md`), no la DB real donde ocurrió. No se identificaron otras
entradas con el mismo patrón de fuga por no tener acceso a esa DB real.

**Hallazgo colateral (no arreglado, fuera de alcance de este fix):**
`jh._clarification_timeout()` (el callback de `JobQueue` a los 180s de una aclaración de `/j` sin
respuesta) nunca limpia `context.user_data["jarvis_clarification"]` — solo tiene `job.data`
(el job se programa con `chat_id=`, no `user_id=`, así que no puede tocar `user_data`; ver su
propio docstring). Si el usuario no responde a tiempo, la captura se guarda igual sin razón, pero
la bandera de "aclaración pendiente" queda viva en `user_data` indefinidamente y el *próximo*
mensaje de texto de ese usuario —sea lo que sea— se interpreta como la "razón" tardía y genera una
entrada duplicada. Distinto del mecanismo confirmado arriba (que fue vía auditoría, no vía esta
aclaración), pero es la misma familia de bug y vale la pena revisarlo aparte.

**Fix:** `bot.py` ahora salta los 3 chequeos de Jarvis cuando `context.user_data["step"]` es uno
de los pasos explícitos de Agenda/Finanzas (`_AGENDA_FINANZAS_STEPS`: picker de lista/calendario,
nota de hábito, valor de ayer, nueva tarea desde `/planificar`, monto/descripción/categoría de
movimiento). El caso protegido original (texto libre sin ningún step activo respondiendo a una
aclaración de DECISION) sigue funcionando igual — verificado con un harness que carga la versión
pre-fix (HEAD) y la versión con el fix del mismo `handle_message()`, mockeando los entry points de
Jarvis/Agenda/Finanzas (sin tocar `jarvis.db`/`app.db` reales): reproduce el bug en HEAD, confirma
el fix, y confirma que el caso protegido no cambió en ninguna de las dos versiones.
