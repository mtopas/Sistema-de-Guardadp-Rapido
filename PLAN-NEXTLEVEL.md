# SGR — Plan: Siguiente Nivel

Decisiones tomadas en mayo 2026. Este archivo es la fuente de verdad del plan de expansión.

---

## Visión

Convertir SGR en un proyecto que demuestre capacidades en AI/ML/LLM, DevOps y producto real.

**Prioridad de audiencia:**
1. AI/ML/LLM — lo que más tiene que brillar
2. Full-stack/DevOps — producción real como base creíble
3. Uso propio — que se note que lo usás todos los días
4. Open source — que otros puedan correrlo

---

## Licencia

**MIT + Commons Clause** (o BSL 1.1 como alternativa).

- El código es público y visible → sirve como portfolio.
- Uso personal y modificación: libre.
- Uso comercial o venta del producto: requiere permiso explícito del autor.
- Agregar `LICENSE` en la raíz antes de cualquier publicación.

---

## Stack tecnológico añadido

| Componente | Tecnología | Rol |
|------------|------------|-----|
| Containerización | Docker + Compose | Distribución y despliegue |
| LLM local | Ollama (`llama3.2` o `mistral`) | Router de intención + RAG + resúmenes |
| Embeddings | `nomic-embed-text` vía Ollama | Indexación semántica de Bóveda |
| Vector store | ChromaDB | Búsqueda k-NN sobre embeddings |
| Web server | nginx | Sirve el build de React |

---

## Fases de implementación

### Fase 0 — Licencia y limpieza previa a publicación

> Antes de hacer público cualquier repositorio.

- [ ] Crear `LICENSE` (MIT + Commons Clause)
- [ ] Revisar `.gitignore`: confirmar que `.env`, `app.db`, `uploads/`, `rapido.json`, `chat_id.json`, `checkin_config.json` no se commiteen
- [ ] Crear `.env.example` con todas las variables necesarias y comentadas

**Por qué primero:** protección legal y seguridad antes de exponer el repo.

---

### Fase 0.5 — Auditoría Frontend

> Antes de modificar el backend o dockerizar: entender el estado real del frontend y documentar qué hay que mejorar. El feedback puede cambiar qué y cómo se toca el back.

**Herramientas por objetivo:**

| Objetivo | Herramienta | Cómo |
|----------|-------------|------|
| Performance real | Lighthouse (Chrome F12 → Lighthouse) | Correr sobre cada pantalla: `/`, `/finanzas`, `/agenda`, `/habitos` |
| Accesibilidad | axe DevTools (extensión Chrome) | Detecta ARIA mal usado, contraste, focus traps, labels, keyboard nav |
| UX visual por pantalla | Screenshots → Claude.ai o ChatGPT con buen prompt | Ver nota sobre prompts abajo |
| Arquitectura React / store / consistencia | Claude Code (tiene todo el código en contexto) | Code review de componentes, re-renders, props drilling, memoización |

**Cómo pedir feedback visual (el prompt importa más que la herramienta):**

Mal prompt:
> "qué opinás de mi frontend"

Buen prompt:
> "Auditá este dashboard de finanzas personales como senior frontend. Priorizá consistencia visual entre los 4 módulos, accesibilidad, y qué genera fricción en el flujo de captura diaria. El usuario target soy yo mismo."

- [ ] Correr Lighthouse en las 4 rutas principales y documentar scores
- [ ] Correr axe DevTools en las 4 rutas y listar issues de accesibilidad
- [ ] Capturar screenshots de cada tab de cada módulo → feedback visual con prompt estructurado
- [ ] Code review de arquitectura React: store, componentes, re-renders, consistencia entre módulos
- [ ] Documentar hallazgos y decidir qué se corrige antes de avanzar

**Por qué antes de Docker y el back:** el feedback puede revelar deuda de UX o arquitectura que cambie decisiones de backend. Mejor auditarlo con el sistema en su estado actual.

---

### Fase 1 — Docker y distribución

> Objetivo: `git clone` → `cp .env.example .env` → editar token → `docker-compose up -d` → sistema funcionando.

- [ ] `Dockerfile` para el backend (FastAPI + uvicorn)
- [ ] `Dockerfile` para el frontend (multi-stage: build Vite → nginx sirviendo `dist/`)
- [ ] `Dockerfile` para el bot de Telegram (Python)
- [ ] `docker-compose.yml` con servicios:
  - `backend` — FastAPI (en Docker suele mapearse a `:8000` interno; en dev local SGR usa **`:8765`** para no chocar con otros proyectos)
  - `frontend` — nginx en puerto 80
  - `bot` — Python Telegram bot
  - `ollama` — LLM local (perfil opcional: `--profile ai`)
- [ ] Volúmenes para `database/` y `uploads/` (datos persistentes fuera de los containers)
- [ ] `README.md` en la raíz orientado al instalador: 3 comandos, screenshot, badge de licencia

**Por qué antes del LLM:** Docker es la base sobre la que corre todo lo demás, incluyendo Ollama. Sin esto, nada es reproducible ni demostrable.

---

### Fase 2 — Router LLM en el bot de Telegram

> Objetivo: captura en lenguaje natural sin prefijos. Un mensaje, el modelo entiende la intención y enruta al módulo correcto.

**Ejemplos:**
```
"gasté 1500 en el super con la Naranja X"   → movimiento financiero
"recordame llamar al dentista el viernes"   → tarea en Agenda
"corrí 40 minutos hoy"                      → registro de hábito
"el libro Atomic Habits habla de identidad" → hoja en Bóveda
```

- [ ] Configurar Ollama como cliente HTTP desde el bot (`API_BASE_URL` en `.env`)
- [ ] Prompt de clasificación de intención: devuelve `{ modulo, datos_extraidos, confianza }`
- [ ] Router en `bot.py`: confianza alta → acción directa; confianza baja → confirmar con el usuario
- [ ] Fallback: si Ollama falla o tarda → comportamiento actual con prefijos (`$:`, `t:`, `e:`)
- [ ] Pruebas con 20+ frases reales de uso diario

**Por qué acá:** usa Ollama que ya está en docker-compose. Demuestra integración LLM real con una app existente — no un chatbot demo, sino algo que *hace cosas*. Y se usa todos los días, así que el feedback es inmediato.

---

### Fase 3 — RAG sobre Bóveda

> Objetivo: convertir el knowledge vault en un sistema de Q&A semántico sobre tu propio conocimiento.

**Flujo:**
```
Nueva hoja guardada → embedding → ChromaDB
Pregunta del usuario → embedding → k-NN search → contexto → LLM → respuesta citando hojas
```

- [ ] ChromaDB como servicio en `docker-compose.yml`
- [ ] Modelo de embeddings: `nomic-embed-text` vía Ollama
- [ ] Worker que indexa hojas al crear/editar (`POST /hojas` y `PATCH /hojas/{id}` disparan embedding)
- [ ] `GET /hojas/buscar-semantico?q=` en `main.py` + función en `crud.py`
- [ ] `POST /hojas/pregunta` — recibe query, recupera contexto RAG, llama a LLM, devuelve respuesta
- [ ] UI: toggle "búsqueda semántica" en `LeftPanel` y `TopBar` de Bóveda
- [ ] Comando `/pregunta <texto>` en el bot: responde citando hojas relevantes

**Por qué es el "wow factor":** resuelve un problema real (buscar entre cientos de hojas), demuestra comprensión de embeddings + retrieval + generación, y es el caso de uso más natural para un personal knowledge vault.

---

### Fase 4 — Resumen semanal generado por LLM

> Objetivo: síntesis cross-módulo que cierra el loop entre Bóveda, Finanzas, Agenda y Hábitos.

**Fuentes de datos:**
- `GET /agenda/revision` → completadas, incompletas, tiempo por calendario
- `GET /fin/movimientos/resumen` → ingresos, gastos, tasa ahorro de la semana
- Hábitos: registros de los últimos 7 días + rachas
- Bóveda: hojas creadas en la semana

**Salida esperada (ejemplo):**
> "Semana del 19 al 25 de mayo. Completaste 4 de 5 hábitos — el de correr fue el más consistente.
> En finanzas, gastaste $42.000, un 18% más que tu promedio; el gasto extra fue en delivery.
> Agendaste 14h pero ejecutaste 9h. Guardaste 3 notas nuevas en Bóveda."

- [ ] Endpoint `GET /resumen/semanal?desde=&hasta=` que agrega datos de los 4 módulos
- [ ] Prompt estructurado: pasa los datos al LLM, pide síntesis en español, tono directo
- [ ] Comando `/semana` en el bot muestra el resumen generado (complementa el actual)
- [ ] Sección en `RevisionTab` con el resumen + botón "Regenerar"

**Por qué al final:** es el de menor complejidad técnica una vez que el stack LLM está andando. Demuestra uso de LLM para síntesis, no solo búsqueda. Cierra narrativamente el proyecto.

---

### Fase 5 — Extensión Chrome: Side Panel

> Objetivo: tener SGR visible como panel lateral mientras navegás cualquier sitio externo, sin perder el contexto de la nota que estabas mirando.

**Problema que resuelve:** al hacer clic en un link externo desde una hoja de la Bóveda, hoy el usuario pierde visibilidad de sus apuntes. Quiere poder seguir tomando notas mientras lee la página externa.

**Solución:** extensión Chrome con Side Panel API (estable desde Chrome 114). El panel lateral muestra SGR completo — no hay que replicar estado ni lógica, es la misma sesión React corriendo en `localhost`.

```
[Pestaña principal] → sitio externo, abierto con normalidad
[Side Panel]        → iframe a http://127.0.0.1:5173 (SGR completo)
```

> **Nota sobre X-Frame-Options:** el bloqueo por seguridad aplica cuando intentás embeber sitios externos dentro de un iframe. Acá es al revés: SGR (tu app, tus headers) está en el iframe, y los sitios externos abren normalmente en la pestaña. No hay bloqueador. El único caso problemático sería si en el futuro servís SGR por HTTPS y el iframe usa HTTP — mixed content error — pero no aplica en uso local puro.

**MVP (trivial):**

```javascript
// background.js
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// panel.html
<iframe src="http://127.0.0.1:5173" style="width:100%;height:100%;border:none"/>
```

- [ ] `manifest.json` con permisos `sidePanel` y host `127.0.0.1:5173`
- [ ] `background.js` con `setPanelBehavior`
- [ ] `panel.html` con iframe a SGR
- [ ] Instrucciones de instalación en `README.md` (cargar extensión sin publicar en Chrome Web Store)

**V2 — sincronización de contexto:**

Cuando el usuario hace clic en un link externo desde una hoja de SGR, el panel salta automáticamente a esa hoja.

- [ ] SGR emite `chrome.storage.local.set({ activeNoteId })` al navegar a un link externo
- [ ] El panel escucha `chrome.storage.onChanged` y hace scroll/focus a la hoja activa
- [ ] Requiere que la extensión y SGR compartan el mismo `extension ID` o mensaje vía `postMessage`

**Dependencia:** Fase 1 (Docker) — el backend tiene que arrancar siempre en el mismo puerto para que el iframe apunte a algo. Sin Docker, si el usuario no levantó el backend manualmente, el panel muestra nada.

---

## Notificaciones — en qué fase implementar

Los 4 módulos tienen ideas de notificaciones en sus roadmaps. El sistema requiere tres piezas independientes con dependencias distintas:

### Pieza 1 — Scheduler backend → **Fase 1 (Docker)**

El scheduler (worker que cada 1 min lee registros `fire_at <= now` y dispara) necesita correr como proceso persistente. Docker es el lugar natural: se agrega como servicio `scheduler` en `docker-compose.yml` o como `lifespan` de FastAPI. Sin Docker, gestionar un proceso background en Windows es frágil.

Conviene usar **una tabla unificada** en lugar de tablas por módulo:

```sql
notificaciones_pendientes (
  id, modulo TEXT, ref_id, tipo TEXT,
  fire_at DATETIME, canal TEXT,  -- 'telegram' | 'web'
  enviado BOOLEAN, payload_json
)
```

Esto cubre los tipos de todos los módulos: recordatorios de hojas (Bóveda), alertas financieras (Finanzas), eventos/tareas/revisión (Agenda), hábito con hora + racha en riesgo (Hábitos).

- [ ] Tabla `notificaciones_pendientes` + índice en `fire_at`
- [ ] `POST /notificaciones/evaluar` — regenera alertas de Finanzas, inserta recordatorios de hábitos/agenda
- [ ] Worker scheduler (servicio Docker o `lifespan` FastAPI con `asyncio.sleep(60)`)

### Pieza 2 — Entrega por Telegram → **Fase 2 (Router LLM bot)**

Ya que Fase 2 toca `bot.py` para agregar el router de intención, es el momento natural para agregar la entrega de notificaciones vía Telegram. El scheduler llama al bot o el bot tiene un job que consume `notificaciones_pendientes`. El comando `/alertas` de Finanzas entra acá.

- [ ] Job en bot que cada 1 min consulta `GET /notificaciones/pendientes?canal=telegram` y envía
- [ ] Inline keyboards: ✅ Hecho · 🕐 Posponer · 📖 Abrir en web

### Pieza 3 — UI campana web → **Fase 0.5 o después de Fase 1**

La campana en TopBar para Agenda ya existe (polling cada 60s + Notification API). Extenderla a los otros módulos es trabajo de frontend puro, sin dependencia de Docker ni LLM. Se puede hacer antes de Fase 1 si la auditoría de Fase 0.5 lo prioriza, o como parte del trabajo de Fase 1.

- [ ] `GET /notificaciones/pendientes?canal=web` — agrega campana unificada en TopBar
- [ ] Store: `notificaciones[]`, `fetchNotificaciones()`, `marcarLeida(id)`
- [ ] Settings `/settings`: toggles por canal (web / Telegram) y anticipación global

---

## Lo que no se implementa (y por qué)

| Idea | Motivo |
|------|--------|
| **n8n** | El proyecto tiene su propia API coherente. n8n agrega complejidad sin resolver nada que no resuelva un endpoint + job. Reconsiderar solo si aparece integración externa real (Gmail, banco, Notion). |
| **Migración a PostgreSQL** | SQLite es suficiente para uso personal offline-first. La complejidad no aporta. |
| **Obfuscación de código** | Barrera baja, reversible, y contradice el objetivo de portfolio. La licencia resuelve el problema. |

---

*Actualizar este archivo al completar cada ítem. El orden de fases es una dependencia técnica, no solo preferencia.*
