# Agenda — documentación técnica

Estado real del módulo Agenda en SGR. Todo lo que está implementado y cómo funciona.
Para roadmap, mejoras y features pendientes: **`Agenda-Roadmap.md`**.

---

## 1. Qué es

Agenda es el módulo de **gestión de tiempo y tareas**: calendarios, eventos, listas/checklists, time blocking en el día, horario de facultad como capa de fondo, y revisión semanal.

| Tab | Default | Rol |
|-----|---------|-----|
| **HOY** | ✅ al entrar | Día actual: pendientes, grilla 6–23h, bloques, hábitos |
| **Mes** | | Calendario mensual + vista semana; toggles de calendarios |
| **Tareas** | | Listas y checklists sin calendario de fondo |
| **Revisión** | | Retrospectiva semanal |

**Ruta:** `/agenda?tab=hoy|mes|tareas|revision` — tab sincronizado en URL via `useLocation`/`useNavigate`.
**CTA TopBar:** "+ Evento" → `openAgendaEvento()` → `EventoModal`.
**Botón extra:** "Facultad" → `HorarioFacultadModal` (no es un tab).
**Accent Arcoíris:** `#2563eb` (azul) — `Layout.jsx` → `ARCOIRIS_ACCENTS['/agenda']`.

---

## 2. Arquitectura

```
AgendaScreen → AgendaTabs + componente de tab activo
     ↓
useStore.js (Zustand) → fetch optimista + try/catch
     ↓
app/main.py → app/db/crud.py → SQLite
```

### Archivos clave

| Capa | Archivos |
|------|----------|
| Pantalla | `frontend/src/screens/AgendaScreen.jsx` |
| Tabs | `components/agenda/HoyTab.jsx`, `MesTab.jsx`, `TareasTab.jsx`, `RevisionTab.jsx` |
| UI compartida | `AgendaTabs.jsx`, `MiniCalendar.jsx`, `AgendaModalShell.jsx`, `AgendaContextMenu.jsx`, `AgendaPanel.jsx` |
| Modales | `EventoModal.jsx`, `TareaModal.jsx`, `HorarioFacultadModal.jsx` |
| Hooks reutilizables | `useAgendaDay.js`, `useAgendaKeyboard.js` |
| Grilla horaria | `HourGrid.jsx` (parametrizable: hours, hourHeight, nowMinutes, blocks, events) |
| Estado | `store/useStore.js` (slice `agenda*` + `agendaActiveTab`) |
| API | `app/main.py` (`/agenda/*`) |
| SQL | `app/db/crud.py` (`agenda_*`, `_expand_recurring`) |
| Schema + seed | `app/db/database.py` (`_seed_agenda`) |
| i18n | `utils/i18n.js` (claves `agenda*`) |
| Carga inicial | `App.jsx` — 5 `fetchAgenda*` al montar |

### Patrón offline-first

Toda mutación hace **update optimista** en Zustand y luego `fetch` en `try/catch`. Si falla la red, el UI ya cambió; sin rollback.

### Carga de datos al arranque

`App.jsx` llama `fetchAgendaEventos()` → `GET /agenda/eventos` con defaults de rango automáticos (mes actual ±2 meses) cuando no se pasan params. El store carga solo el rango relevante.

---

## 3. Modelo de datos (SQLite)

### Tablas

```sql
agenda_calendarios      (id, nombre, color, activo)
agenda_eventos          (id, titulo, descripcion, fecha_inicio, fecha_fin,
                         todo_el_dia, se_repite, regla_repeticion, calendario_id,
                         creado_en, actualizado_en)
agenda_listas           (id, nombre, color)
agenda_tareas           (id, titulo, descripcion, fecha_opcional, hora_opcional,
                         hora_bloque, duracion_estimada, completada, lista_id,
                         creado_en, actualizado_en)
agenda_horario_facultad (id, dia_semana, hora_inicio, hora_fin, materia, descripcion)
```

**Índice:** `idx_eventos_inicio ON agenda_eventos(fecha_inicio)` — creado en `_apply_migrations`.

**Seed por defecto:** calendarios Personal / Trabajo / Facultad; listas Personal / Trabajo.

### Distinción visual

| Tipo | Vista calendario |
|------|-----------------|
| Evento | Chip **sólido**, color del calendario |
| Tarea con `fecha_opcional` | Chip **borde punteado**, color de lista + ☐ |
| Facultad | Capa opacada; solo vistas horarias (HOY) |
| Hábitos con hora | Bloque en grilla HOY (color del hábito); **no** en Mes |

### Campos con semántica especial

| Campo | Uso |
|-------|-----|
| `hora_bloque` | Time blocking HOY: tarea en grilla; si pasa sin completar → se limpia al montar `HoyTab` |
| `hora_opcional` | Metadata en listas / chips |
| `duracion_estimada` | Altura del bloque en grilla (default 30 min) |
| `se_repite` / `regla_repeticion` | JSON `{frecuencia, dias, hasta}`; **motor backend** `_expand_recurring()` en `crud.py` expande ocurrencias al servir eventos |
| `activo` (calendario) | Mes filtra eventos de calendarios inactivos |

### API REST

| Método | Ruta | Notas |
|--------|------|-------|
| GET/POST | `/agenda/calendarios` | |
| PATCH/DELETE | `/agenda/calendarios/{id}` | DELETE en cascada a eventos |
| GET | `/agenda/eventos?desde=&hasta=` | Default: mes actual ±2 meses cuando no se pasan params |
| POST/PATCH/DELETE | `/agenda/eventos/{id}` | PATCH actualiza `actualizado_en` |
| GET/POST | `/agenda/listas` | |
| PATCH/DELETE | `/agenda/listas/{id}` | DELETE borra tareas de esa lista |
| GET | `/agenda/tareas?lista_id=&pendientes=` | Front casi siempre pide todas |
| POST | `/agenda/tareas` | Acepta `hora_bloque` en create |
| PATCH/DELETE | `/agenda/tareas/{id}` | PATCH actualiza `actualizado_en` |
| GET/POST/PATCH/DELETE | `/agenda/horario-facultad` | `dia_semana`: Lun=0 … Dom=6 |
| GET | `/agenda/buscar?q=` | Full-text en título/descripción de eventos y tareas; retorna `{eventos, tareas}` (20 c/u) |
| GET | `/agenda/revision?desde=&hasta=` | JSON con completadas, incompletas, vencidas, por_calendario |
| GET | `/agenda/export.ics?desde=&hasta=` | iCalendar RFC-compliant; `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `UID` |
| GET | `/agenda/notificaciones/pending?ventana_min=` | Eventos que empiezan dentro de `ventana_min` (default 15); usado por TopBar polling |

Formato fechas eventos: ISO local `YYYY-MM-DDTHH:MM:00` (string en SQLite).

---

## 4. Tabs — comportamiento implementado

### 4.1 HOY (`HoyTab.jsx`)

**Navegación de día:** `viewDate` state (← / →); botón "Hoy" aparece cuando `viewISO !== todayISO`. Todos los filtros derivan de `viewISO`.

**Refetch automático:** `useRef(lastFetchedMonth)` — refetch `GET /agenda/eventos?desde=&hasta=` cuando `viewISO.slice(0,7)` cambia (navegación fuera del rango cargado).

**Panel izquierdo (260px)**
- Tareas **pendientes** con `fecha_opcional` ≤ hoy+15 días (o sin fecha). Filtrado con `useMemo`.
- **Semáforo de vencimiento:** `fecha_opcional < hoy` → rojo `#ef4444`, `= hoy` → ámbar `#d97706`, `> hoy` → subtext.
- Checkbox → `updateAgendaTarea({ completada })`.
- **Quick-add inline:** input "Nueva tarea..." → `addAgendaTarea` con `fecha_opcional = viewISO`; Enter guarda, Escape cancela.
- ⊕ Agendar → mini `input[type=time]` → `hora_bloque` + `fecha_opcional = viewISO`.
- Sección **"Hábitos de hoy"** (sin `hora`): checkbox → `upsertHabitoRegistro` (toggle 0 / 1.0).

**Panel central**
- Franja **chips all-day** encima de la grilla para eventos `todo_el_dia` del día.
- Grilla **6:00–23:00**, `HOUR_HEIGHT = 56px` (constante en `agendaUtils.js`).
- **Layout de columnas para eventos solapados:** `layoutTimedEvents()` — algoritmo greedy que asigna `_col` y `_totalCols`; posición CSS usa `calc(col% + 56px fijo)` para respetar el label de hora.
- **QuickEventPopover:** click en slot vacío → mini-formulario inline (título + hora prellenada) posicionado en `top = (h-6) * HOUR_HEIGHT`; Escape cierra; "Más detalles" abre `EventoModal` completo.
- Click en bloque de evento/tarea → selecciona ítem en panel derecho; abre drawer en `< xl`.
- Capas: facultad (fondo opacado, `pointer-events: none`) → eventos → bloques de tareas → hábitos con hora.
- Línea "ahora" (`.now-dot` pulso animado) actualiza cada 60 s; solo visible cuando `isToday`.
- Bloques de tareas: animación `.block-new` (scaleY) al aparecer.
- Bloques de hábitos con hora son clickeables → completa vía `upsertHabitoRegistro`.
- Scroll automático a la hora actual al montar (cuando `isToday`).

**Panel derecho (xl) / Drawer (`< xl`)**
- Muestra detalle del ítem seleccionado (evento o tarea) con botón "Editar" que abre `EventoModal`/`TareaModal`.
- En pantallas `< xl`: overlay drawer desde la derecha (300px) con backdrop oscuro al click fuera.

**Lógica time blocking**
```javascript
// Al montar: si hora_bloque < ahora y no completada → hora_bloque = null (solo cuando isToday)
```

**Filtros memoizados:** `pending`, `todayEventos`, `bloqueadas`, `facultadHoy`, `habitosHoy`, `habitosConHora`, `todayEventosAllDay` — todos con `useMemo`.

### 4.2 Mes (`MesTab.jsx`)

**Refetch automático:** `useRef(lastFetchedMonth)` — refetch al cambiar `year/month` fuera del rango cargado.

**Izquierda:** `MiniCalendar` + lista calendarios (toggle `activo` al click).
**Centro:** vista Mes (6×7) o Semana (columnas 7–22h). Click en día → `EventoModal` con `defaultFecha`. Click en chip → `selected` en panel derecho.
**Derecha (xl):** detalle evento/tarea (lectura + botón **Editar** que abre `EventoModal`/`TareaModal`) o próximos 5 eventos.

**Vista Semana (mejoras mayo 2026):**
- Franja all-day entre cabecera de días y grilla horaria: chips sólidos (eventos `todo_el_dia`) + chips punteados (tareas con `fecha_opcional` = ese día, hasta 2 visibles + "+N").
- Capa **facultad** (`agendaHorarioFacultad`) visible en cada columna de día (`dia_semana` 0=Lun…6=Dom) con color verde opacado `#059669 15%`.

### 4.3 Tareas (`TareasTab.jsx`)

- Mini calendario + listas (crear, renombrar inline, color, eliminar).
- Filtro: Pendientes / Completadas / Todas.
- Orden: por `fecha_opcional` en API; sin toggle "por creación" en UI.
- Panel derecho: detalle editable de tarea seleccionada.

### 4.4 Revisión (`RevisionTab.jsx`)

- Selector de semana (`weekOff`, default -1 = semana pasada).
- Métricas: completadas / incompletas en semana, vencidas +7 días.
- **Sparkline SVG** de tareas completadas por día (L–D) con puntos `var(--accent)`.
- **% tiempo planificado:** denominador = 16h despierto × 7 días = 6720 min. Numerador incluye **eventos** + **bloques de tareas** (`hora_bloque + duracion_estimada`). Muestra desglose "(Xh eventos + Yh bloques)" cuando hay bloques.
- **Botón Exportar Markdown:** genera `.md` con resumen de completadas, incompletas, vencidas y tiempo por calendario vía `URL.createObjectURL`.
- Panel derecho: minutos por calendario + estimado facultad (suma de slots semanales, no por día real).

### 4.5 Modales

**`AgendaModalShell.jsx`** — shell reutilizable que provee:
- Header serif + botón X, footer Cancelar/Guardar, scroll interno (`panel-scroll`).
- `Escape` cierra el modal; `Ctrl+Enter` / `Cmd+Enter` guarda.
- Overlay con `backdrop-filter: blur(4px)` + animación `.modal-overlay` (fade-in 100ms).
- Click fuera del panel cierra.
- Prop `wide` expande a `max-w-lg`.

| Modal | Abre desde | Notas |
|-------|------------|-------|
| `EventoModal` | TopBar CTA, clic en día Mes, mini-cal, click slot HOY, panel derecho | Usa `AgendaModalShell`. Acepta `defaultHora`. `showToast` i18n al guardar. **Confirmación doble** antes de eliminar (primer click = confirmar; segundo = DELETE). **UI de recurrencia:** toggle `seRepite` → selector frecuencia (Diario/Semanal/Mensual) + días de semana (solo Semanal) + fecha límite; serializa a `regla_repeticion` JSON. |
| `TareaModal` | HOY +, Tareas, panel derecho | Usa `AgendaModalShell`. `showToast` i18n al guardar. **Confirmación doble** antes de eliminar. |
| `HorarioFacultadModal` | Botón "Facultad" | Lista + form inline; CRUD recurrente por día de semana. `Escape` cierra, backdrop blur. |

---

## 5. Integraciones actuales

| Módulo | Estado |
|--------|--------|
| **Hábitos** | HOY muestra hábitos programados hoy; completar desde grilla o panel izq (toggle 0/1.0) |
| **Bóveda** | Sin enlace directo |
| **Finanzas** | Soft-link por keywords (`FIN_KEYWORDS` regex): `HoyTab` muestra 💰 en tareas con palabras financieras (pagar, cuota, factura…) → click navega a `/finanzas`; `FinanzasLeftPanel` muestra hasta 6 tareas pendientes con keyword financiero y enlace "Ver todas →" en `/agenda?tab=tareas` |
| **TopBar búsqueda** | En `/agenda`: debounce 300ms → `GET /agenda/buscar?q=` → dropdown con eventos (📅) y tareas (☑) |
| **CaptureModal** | Tab "Agenda" habilitado: toggle Evento/Tarea, título, fecha, hora; tareas asocian lista |
| **TopBar campana** | Badge visual; sin handler (decorativo) |
| **TweaksPanel Ctrl+M** | Global: temas/tonos/fuentes; igual en todos los módulos |

---

## 6. Bot de Telegram — Agenda e Hábitos

### Arquitectura

```
mybot/
├── bot.py              ← entry point, Bóveda, registro de handlers, healthcheck, chat_id, job_queue
├── agenda_handlers.py  ← Agenda + Hábitos: comandos, formateo, callbacks, lógica de racha
└── chat_id.json        ← chat_id persistido entre reinicios (auto-generado)
```

`API_BASE` desde `API_BASE_URL` en `.env` (local por defecto `http://127.0.0.1:8765`, ver `app/config.py`). En Docker Compose el servicio interno suele exponerse como `http://backend:8000` — configurar `API_BASE_URL` según el entorno.
Al arrancar: healthcheck `GET /habitos` con backoff exponencial (1→2→4→8 s, 4 intentos); si el backend no responde el bot arranca igualmente. Carga `chat_id.json`. Lee `checkin_config.json` (crea si no existe, default 21:00) y registra job `check_in_noche` a la hora configurada.

### Comandos implementados

| Comando | Acción | API |
|---------|--------|-----|
| `/help` / `/start` | Lista todos los comandos | — |
| `/cancel` | Limpia `user_data` y cancela flujo | — |
| `/hoy` | Eventos + tareas + hábitos de hoy; botones completar tareas | `GET /agenda/eventos`, `GET /agenda/tareas`, `GET /habitos`, `GET /habitos/registros` |
| `/dia <fecha>` | Igual a `/hoy` para cualquier día (hoy/mañana/viernes/2026-05-25) | ídem sin hábitos |
| `/tarea <texto>` | Crea tarea; texto libre (parsea fecha) o formato con guiones (ver abajo); si hay >1 lista pide selección; sin argumentos pide el formato y espera el próximo mensaje | `GET /agenda/listas`, `POST /agenda/tareas` |
| `/evento <texto>` | Crea evento; texto libre (reconoce `HH:MM`, fecha, duración `2h` en cualquier parte) o formato con guiones (ver abajo); selección de calendario si >1; sin argumentos pide el formato y espera el próximo mensaje | `GET /agenda/calendarios`, `POST /agenda/eventos` |
| `/pendientes [lista]` | Todas las tareas pendientes con lista y fecha; botones completar. Filtro opcional por nombre de lista (case-insensitive, substring). | `GET /agenda/tareas?pendientes=true` |
| `/semana` | Resumen 7 días con nombre de lista en cada tarea | `GET /agenda/eventos`, `GET /agenda/tareas` |
| `/bloquear <N> <HH:MM>` | Time blocking: bloquea la tarea #N del último `/hoy` | `PATCH /agenda/tareas/{id}` |
| `/planificar` | Vista del día: ocupado + slots libres + tareas sin hora; botones para asignar | `GET /agenda/eventos`, `GET /agenda/tareas` |
| `/asignar <A\|N\|nombre> <HH:MM>` | Asigna tarea del último `/planificar` (letra), `/hoy` (número) o por nombre (fuzzy) | `PATCH /agenda/tareas/{id}` |
| `/revision` | Resumen semana pasada: tareas, eventos, tiempo por calendario | `GET /agenda/revision` |
| `/habitos` | Hábitos de hoy con botones Total / Parcial / Deshacer | `GET /habitos`, `GET /habitos/registros` |
| `/hecho <nombre>` | Marca hábito como total hoy; fuzzy match por nombre | `PUT /habitos/{id}/registro` |
| `/ayer <nombre> [total\|parcial]` | Marca hábito de ayer | `PUT /habitos/{id}/registro` |
| `/racha` | Rachas de todos los hábitos activos ordenadas de mayor a menor | `GET /habitos`, `GET /habitos/registros` |
| `/nota <nombre> <texto>` | Agrega nota al registro de hoy; crea registro 1.0 si no existe | `PUT /habitos/{id}/registro` |
| `/checkin [HH:MM]` | Sin args: muestra hora actual. Con args: reprograma el check-in nocturno (guarda en `checkin_config.json`, reagenda `job_queue` sin reiniciar) | — |
| Texto libre | Captura a Bóveda | `GET /categorias`, `POST /hojas` |
| `t: <texto>` | Quick-capture tarea (sin flujo multi-turno) | `GET /agenda/listas`, `POST /agenda/tareas` |
| `e: <texto>` | Quick-capture evento (primera lista/calendario) | `GET /agenda/calendarios`, `POST /agenda/eventos` |
| Foto | Captura foto a Bóveda | `POST /upload`, `POST /hojas` |

### UX — Inline keyboards

- **Tareas:** `[✓ Título]` → `PATCH /agenda/tareas/{id}` `completada=true`; el mensaje `/hoy` se refresca.
- **Hábitos completados:** `[↩ Nombre]` → `DELETE /habitos/registros/{id}` (deshacer).
- **Hábitos pendientes:** `[✓ Nombre]` (1.0) y `[½ Nombre]` (0.5) → `PUT /habitos/{id}/registro`; íconos actualizan en el mismo mensaje (✅/⚡/⬜). Muestra 📝 si tiene nota. Tras marcar, el bot pregunta "¿Querés agregar una nota?" → respuesta de texto libre la guarda en el registro; responder "no"/"skip" omite.
- **Calendarios:** al crear evento con >1 calendario, botones inline uno por calendario → `POST /agenda/eventos` en el seleccionado.

`callback_data` usa prefijos cortos (límite 64 bytes de Telegram):

| Prefijo | Acción |
|---------|--------|
| `ta:{id}` | Completar tarea |
| `tu:{id}` | Descompletar tarea |
| `hc:{id}` | Hábito total (1.0) |
| `hp:{id}` | Hábito parcial (0.5) |
| `hd:{id}` | Deshacer hábito (DELETE registro) |
| `ce:{id}` | Crear evento en calendario {id} |
| `pl:{HH:MM}` | Planificar: slot libre seleccionado → muestra tareas para asignar |
| `pa:{tarea_id}:{HH:MM}` | Planificar: asignar tarea existente al slot |
| `pn:{HH:MM}` | Planificar: crear nueva tarea en el slot (abre paso conversacional) |

### Parsers

**`parse_fecha_hora(text)`** — extrae fecha, hora y duración de texto libre (modo histórico, sigue vigente cuando el texto no tiene `" - "`):
- **Hora:** patrón `HH:MM` — default `09:00`.
- **Fecha:** `hoy`, `mañana`, nombre de día de semana → próxima ocurrencia. Default: hoy.
- **Duración:** patrón `Nh`/`Nhoras` — default 1h.

```
/evento Dentista 10:30         → hoy, 10:30–11:30
/evento Reunión mañana 15:00 2h → mañana, 15:00–17:00
/evento Cumpleaños viernes     → próx. viernes, 09:00–10:00
/tarea Estudiar para mañana    → tarea con fecha_opcional = mañana
```

**Formato compartido con guiones (`/tarea` y `/evento`, septiembre 2026)** — `parse_formato_guion(text)`:

```
<nombre> - <descripción> - <fecha> - <hora> - <duración>
```

- Separador exacto `" - "` (espacio-guion-espacio) — no rompe con guiones que sean parte del texto (p. ej. "Auto-evaluación").
- Solo `nombre` es obligatorio. El resto se reconoce **por contenido**, no por posición estricta: hora → patrón `HH:MM`; duración → patrón `Nh`/`N.Nh` (mismo vocabulario que `parse_duracion`); fecha → mismo vocabulario que `_parse_fecha_simple` (hoy/mañana/día de semana/`YYYY-MM-DD`, vía `_es_token_fecha`). El primer segmento que no matchea ninguno de esos tres patrones se toma como **descripción**; nunca hace falta un guion vacío para saltear un campo.
- `/evento` usa este formato solo si el texto contiene `" - "`; si no, cae al `parse_fecha_hora` de texto libre de siempre (no se rompió nada del comportamiento previo). `/tarea` antes solo aceptaba fecha simple sin guiones — con guiones es la única forma de darle hora/duración a una tarea en una sola línea.
- Ejemplos:
  ```
  /tarea Entrenar - hoy - 12:00                              → nombre, fecha, hora (sin descripción/duración)
  /tarea Entrenar - Rutina de piernas - hoy - 12:00 - 1.5h    → los 5 campos
  /evento Física 3 - hoy - 15:00 - 3h                         → nombre, fecha, hora, duración (sin descripción)
  ```
- Tarea con `hora` (vía guiones) mapea a `hora_bloque` + `duracion_estimada` (minutos) de una vez en el `POST /agenda/tareas` de creación (sin fecha explícita, se asume hoy si hay hora); `descripcion` va al campo homónimo. Evento con guiones también pasa `descripcion` en el `POST /agenda/eventos`.
- **`/tarea` o `/evento` sin argumentos:** responde con las dos formas de uso (texto libre + formato con guiones) y guarda un paso conversacional (`STEP_AGENDA_TAREA_PENDING` / `STEP_AGENDA_EVENTO_PENDING`, resuelto en `handle_agenda_step`) — el próximo mensaje de texto del usuario se toma como el argumento del comando, sin repetir `/tarea`/`/evento`. Estos dos pasos están en `_AGENDA_FINANZAS_STEPS` (`mybot/bot.py`) para que un pendiente de Jarvis abierto en paralelo no se coma la respuesta.

**`_fuzzy_match_habito(nombre, habitos)`** — match exacto → contiene → por palabras.

**`_calc_racha(habito, registros_map)`** — port Python de `calcStreak` en `habitosUtils.js`: respeta `isScheduled`, días no programados no rompen racha.

### Cache de hábitos

`bot_data["habitos_cache"] = { "ts": timestamp, "data": [...] }` — TTL 60 s. Se invalida al marcar/deshacer hábitos desde callbacks.

### Chat_id y check-in nocturno

- El `chat_id` se guarda automáticamente en `chat_id.json` al primer mensaje del usuario y se carga al arrancar.
- `job_queue.run_daily(check_in_noche, time=<configurado>)` — si hay hábitos pendientes del día, envía un mensaje proactivo con botones ✓/½. La hora se persiste en `checkin_config.json` y se puede cambiar con `/checkin HH:MM` en caliente sin reiniciar el bot.

### Estado conversacional

| Step | Cuándo |
|------|--------|
| `agenda_choose_lista` | `/tarea` con >1 lista: espera número |
| `agenda_choose_calendario` | (vía inline keyboard, no texto) |
| `STEP_HABITO_NOTA` | Tras marcar hábito ✓/½: espera texto de nota o "no"/"skip" para omitir |
| `STEP_AGENDA_TAREA_PENDING` | `/tarea` sin argumentos: espera el próximo mensaje como texto de la tarea (libre o con guiones) |
| `STEP_AGENDA_EVENTO_PENDING` | `/evento` sin argumentos: espera el próximo mensaje como texto del evento (libre o con guiones) |

`/cancel` limpia `user_data` en cualquier momento desde cualquier flujo (Bóveda o Agenda).

### Backend — endpoint de revisión

`GET /agenda/revision?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` → `{ completadas, incompletas, vencidas, total_eventos, por_calendario: [{nombre, color, minutos}] }`. Implementado en `crud.py:agenda_resumen_semana`.

---

## 7. Bugs conocidos

### Bugs P0 conocidos

Sin bugs P0 abiertos.

### Bugs resueltos (septiembre 2026)

| Bug | Fix |
|-----|-----|
| `/hoy`, `/dia`, `/semana`, `/revision` no mostraban eventos con hora del día pedido (comparación de texto: `"...T15:00:00" <= "2026-09-16"` da falso) | `agenda_obtener_eventos()`/`agenda_resumen_semana()` (`crud.py`) normalizan `fecha_hasta`/`hasta` a fin de día (`T23:59:59.999999`) cuando llega sin hora — mismo fix ya aplicado antes en `jarvis/browse/service.py` (`date_to`), reaparecido acá sin portar |

### Bugs resueltos (mayo 2026)

| Bug | Fix |
|-----|-----|
| Eventos solapados en grilla HOY | `layoutTimedEvents()` — greedy column assignment con `_col`/`_totalCols`; CSS `calc()` mixto % + px |
| `fetchAgendaEventos` sin refetch al navegar | `useRef(lastFetchedMonth)` en `HoyTab` y `MesTab`; refetch al cambiar mes |
| `style2={{...}}` en `MesTab.jsx` | Fusionado en `style={{ height, borderColor }}` |
| `toISOString().slice(0,10)` TZ | `toLocalISODate()` en `agendaUtils.js`; importado en `HoyTab` y `MesTab` |
| Now-line stale tras medianoche | `useEffect` crea `new Date()` fresco en cada tick |
| Bloques expirados no limpiados async | `useEffect` con deps `[bloqueadas]` en lugar de `[]` |
| `valor: 0` al desmarcar hábito | Usa `deleteHabitoRegistro(reg.id, …)` → DELETE real en BD |
| Sin `ON DELETE CASCADE` calendario→eventos | Migración en `_apply_migrations()` + `PRAGMA foreign_keys = ON` en `get_connection()` |
| Tab activo perdido al F5 | `AgendaScreen` lee/escribe `?tab=` en URL via `useLocation`/`useNavigate` |
| Modales sin Escape ni Ctrl+Enter | `AgendaModalShell` unifica ambos shortcuts en todos los modales |
| Denominador de % tiempo planificado incorrecto | Cambiado a 16h × 7 días = 6720 min; incluye bloques de tareas |

---

## 8. Mapa de archivos

```
project/
├── app/
│   ├── main.py              # Rutas /agenda/*
│   └── db/
│       ├── database.py      # Schema + _seed_agenda + _apply_migrations
│       └── crud.py          # agenda_* SQL
├── frontend/src/
│   ├── App.jsx              # fetchAgenda* al montar
│   ├── store/useStore.js    # Slice agenda*
│   ├── screens/AgendaScreen.jsx  # Tab en URL (?tab=)
│   └── components/agenda/
│       ├── agendaUtils.js        # toLocalISODate, HOURS, HOUR_HEIGHT, timeToMinutes, minutesToTop, layoutTimedEvents
│       ├── AgendaModalShell.jsx  # Shell reutilizable: Escape, Ctrl+Enter, backdrop blur
│       ├── AgendaTabs.jsx
│       ├── AgendaPanel.jsx       # Panel derecho reutilizable (detalle evento/tarea)
│       ├── AgendaContextMenu.jsx # Menú contextual (integrado en chips Mes: Editar/Duplicar/Eliminar)
│       ├── HourGrid.jsx          # Grilla horaria parametrizable (hours, hourHeight, nowMinutes, blocks, events)
│       ├── MiniCalendar.jsx
│       ├── HoyTab.jsx            # Grilla 6–23h + navegación día + integración hábitos + 💰 FIN_KEYWORDS
│       ├── MesTab.jsx
│       ├── TareasTab.jsx
│       ├── RevisionTab.jsx       # Sparkline + export MD + bloques en % tiempo
│       ├── EventoModal.jsx       # Usa AgendaModalShell; recurrencia UI
│       ├── TareaModal.jsx        # Usa AgendaModalShell
│       ├── HorarioFacultadModal.jsx
│       ├── useAgendaDay.js       # Hook: lógica de navegación de día (viewDate, viewISO, isToday)
│       └── useAgendaKeyboard.js  # Hook: atajos de teclado globales en AgendaScreen
└── mybot/
    ├── bot.py               # Entry point + Bóveda + backoff healthcheck + /checkin handler
    ├── agenda_handlers.py   # Agenda + Hábitos; nota conversacional; /checkin configurable
    ├── chat_id.json         # Auto-generado al primer mensaje
    └── checkin_config.json  # Hora del check-in nocturno; default {"hour":21,"minute":0}
```

---

*Actualizar este archivo cuando se complete algo del roadmap. Referencia de pendientes: `Agenda-Roadmap.md`.*
