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

**Ruta:** `/agenda` → `AgendaScreen.jsx` (tabs locales con `useState`, no en URL).
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
| UI compartida | `AgendaTabs.jsx`, `MiniCalendar.jsx` |
| Modales | `EventoModal.jsx`, `TareaModal.jsx`, `HorarioFacultadModal.jsx` |
| Estado | `store/useStore.js` (slice `agenda*`) |
| API | `app/main.py` (`/agenda/*`) |
| SQL | `app/db/crud.py` (`agenda_*`) |
| Schema + seed | `app/db/database.py` (`_seed_agenda`) |
| i18n | `utils/i18n.js` (claves `agenda*`) |
| Carga inicial | `App.jsx` — 5 `fetchAgenda*` al montar |

### Patrón offline-first

Toda mutación hace **update optimista** en Zustand y luego `fetch` en `try/catch`. Si falla la red, el UI ya cambió; sin rollback.

### Carga de datos al arranque

`App.jsx` llama `fetchAgendaEventos()` → `GET /agenda/eventos` **sin** `desde`/`hasta` → devuelve todos los eventos históricos. Con muchos años de datos, el store crece y Mes/Revisión filtran en cliente.

---

## 3. Modelo de datos (SQLite)

### Tablas

```sql
agenda_calendarios      (id, nombre, color, activo)
agenda_eventos          (id, titulo, descripcion, fecha_inicio, fecha_fin,
                         todo_el_dia, se_repite, regla_repeticion, calendario_id)
agenda_listas           (id, nombre, color)
agenda_tareas           (id, titulo, descripcion, fecha_opcional, hora_opcional,
                         hora_bloque, duracion_estimada, completada, lista_id)
agenda_horario_facultad (id, dia_semana, hora_inicio, hora_fin, materia, descripcion)
```

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
| `se_repite` / `regla_repeticion` | Toggle guardado; **sin motor de recurrencia** — no genera ocurrencias |
| `activo` (calendario) | Mes filtra eventos de calendarios inactivos |

### API REST

| Método | Ruta | Notas |
|--------|------|-------|
| GET/POST | `/agenda/calendarios` | |
| PATCH/DELETE | `/agenda/calendarios/{id}` | DELETE no tiene CASCADE explícito en eventos |
| GET | `/agenda/eventos?desde=&hasta=` | Filtro opcional por `fecha_inicio` |
| POST/PATCH/DELETE | `/agenda/eventos/{id}` | |
| GET/POST | `/agenda/listas` | |
| PATCH/DELETE | `/agenda/listas/{id}` | DELETE borra tareas de esa lista |
| GET | `/agenda/tareas?lista_id=&pendientes=` | Front casi siempre pide todas |
| POST/PATCH/DELETE | `/agenda/tareas/{id}` | `hora_bloque` solo en PATCH |
| GET/POST/PATCH/DELETE | `/agenda/horario-facultad` | `dia_semana`: Lun=0 … Dom=6 |

Formato fechas eventos: ISO local `YYYY-MM-DDTHH:MM:00` (string en SQLite).

---

## 4. Tabs — comportamiento implementado

### 4.1 HOY (`HoyTab.jsx`)

**Panel izquierdo (260px)**
- Tareas **pendientes** con `fecha_opcional` ≤ hoy+15 días (o sin fecha).
- Checkbox → `updateAgendaTarea({ completada })`.
- ⊕ Agendar → mini `input[type=time]` → `hora_bloque` + `fecha_opcional = hoy`.
- Sección **"Hábitos de hoy"** (sin `hora`): checkbox → `upsertHabitoRegistro` (toggle 0 / 1.0).

**Panel central**
- Grilla **6:00–23:00**, `HOUR_HEIGHT = 56px`.
- Capas: facultad (fondo opacado) → eventos → bloques de tareas → hábitos con hora.
- Línea "ahora" actualiza cada 60 s.
- Bloques de hábitos con hora son clickeables → completa vía `upsertHabitoRegistro`.

**Panel derecho (xl)**
- Cards de eventos y tareas bloqueadas del día (solo lectura).

**Lógica time blocking**
```javascript
// Al montar: si hora_bloque < ahora y no completada → hora_bloque = null
```

### 4.2 Mes (`MesTab.jsx`)

**Izquierda:** `MiniCalendar` + lista calendarios (toggle `activo` al click).
**Centro:** vista Mes (6×7) o Semana (columnas 7–22h). Click en día → `EventoModal` con `defaultFecha`. Click en chip → `selected` en panel derecho.
**Derecha (xl):** detalle evento/tarea o próximos 5 eventos.

Facultad y hábitos **no** aparecen en el mes.

### 4.3 Tareas (`TareasTab.jsx`)

- Mini calendario + listas (crear, renombrar inline, color, eliminar).
- Filtro: Pendientes / Completadas / Todas.
- Orden: por `fecha_opcional` en API; sin toggle "por creación" en UI.
- Panel derecho: detalle editable de tarea seleccionada.

### 4.4 Revisión (`RevisionTab.jsx`)

- Selector de semana (`weekOff`, default -1 = semana pasada).
- Métricas: completadas / incompletas en semana, vencidas +7 días, % tiempo planificado (**solo eventos**, no bloques de tareas).
- Panel derecho: minutos por calendario + estimado facultad (suma de slots semanales, no por día real).

### 4.5 Modales

| Modal | Abre desde | Notas |
|-------|------------|-------|
| `EventoModal` | TopBar CTA, clic en día Mes, mini-cal | Título, descripción, fechas, todo el día, toggle repetición (sin RRULE), calendario, guardar/eliminar |
| `TareaModal` | HOY +, Tareas | |
| `HorarioFacultadModal` | Botón "Facultad" | Lista + form inline; CRUD recurrente por día de semana |

---

## 5. Integraciones actuales

| Módulo | Estado |
|--------|--------|
| **Hábitos** | HOY muestra hábitos programados hoy; completar desde grilla o panel izq (toggle 0/1.0) |
| **Bóveda** | Sin enlace directo |
| **Finanzas** | Sin enlace |
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

`API_BASE` desde `API_BASE_URL` en `.env`; en Docker = `http://backend:8000`.
Al arrancar: healthcheck `GET /habitos`, carga `chat_id.json`, registra job `check_in_noche` a las 21:00.

### Comandos implementados

| Comando | Acción | API |
|---------|--------|-----|
| `/help` / `/start` | Lista todos los comandos | — |
| `/cancel` | Limpia `user_data` y cancela flujo | — |
| `/hoy` | Eventos + tareas + hábitos de hoy; botones completar tareas | `GET /agenda/eventos`, `GET /agenda/tareas`, `GET /habitos`, `GET /habitos/registros` |
| `/dia <fecha>` | Igual a `/hoy` para cualquier día (hoy/mañana/viernes/2026-05-25) | ídem sin hábitos |
| `/tarea <texto>` | Crea tarea; parsea fecha del texto; si hay >1 lista pide selección | `GET /agenda/listas`, `POST /agenda/tareas` |
| `/evento <texto>` | Crea evento; reconoce `HH:MM`, fecha, duración (`2h`); selección de calendario si >1 | `GET /agenda/calendarios`, `POST /agenda/eventos` |
| `/pendientes` | Todas las tareas pendientes con lista y fecha; botones completar | `GET /agenda/tareas?pendientes=true` |
| `/semana` | Resumen 7 días con nombre de lista en cada tarea | `GET /agenda/eventos`, `GET /agenda/tareas` |
| `/bloquear <N> <HH:MM>` | Time blocking: bloquea la tarea #N del último `/hoy` | `PATCH /agenda/tareas/{id}` |
| `/revision` | Resumen semana pasada: tareas, eventos, tiempo por calendario | `GET /agenda/revision` |
| `/habitos` | Hábitos de hoy con botones Total / Parcial / Deshacer | `GET /habitos`, `GET /habitos/registros` |
| `/hecho <nombre>` | Marca hábito como total hoy; fuzzy match por nombre | `PUT /habitos/{id}/registro` |
| `/ayer <nombre> [total\|parcial]` | Marca hábito de ayer | `PUT /habitos/{id}/registro` |
| `/racha` | Rachas de todos los hábitos activos ordenadas de mayor a menor | `GET /habitos`, `GET /habitos/registros` |
| `/nota <nombre> <texto>` | Agrega nota al registro de hoy; crea registro 1.0 si no existe | `PUT /habitos/{id}/registro` |
| Texto libre | Captura a Bóveda | `GET /categorias`, `POST /hojas` |
| `t: <texto>` | Quick-capture tarea (sin flujo multi-turno) | `GET /agenda/listas`, `POST /agenda/tareas` |
| `e: <texto>` | Quick-capture evento (primera lista/calendario) | `GET /agenda/calendarios`, `POST /agenda/eventos` |
| Foto | Captura foto a Bóveda | `POST /upload`, `POST /hojas` |

### UX — Inline keyboards

- **Tareas:** `[✓ Título]` → `PATCH /agenda/tareas/{id}` `completada=true`; el mensaje `/hoy` se refresca.
- **Hábitos completados:** `[↩ Nombre]` → `DELETE /habitos/registros/{id}` (deshacer).
- **Hábitos pendientes:** `[✓ Nombre]` (1.0) y `[½ Nombre]` (0.5) → `PUT /habitos/{id}/registro`; íconos actualizan en el mismo mensaje (✅/⚡/⬜). Muestra 📝 si tiene nota.
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

### Parsers

**`parse_fecha_hora(text)`** — extrae fecha, hora y duración:
- **Hora:** patrón `HH:MM` — default `09:00`.
- **Fecha:** `hoy`, `mañana`, nombre de día de semana → próxima ocurrencia. Default: hoy.
- **Duración:** patrón `Nh`/`Nhoras` — default 1h.

```
/evento Dentista 10:30         → hoy, 10:30–11:30
/evento Reunión mañana 15:00 2h → mañana, 15:00–17:00
/evento Cumpleaños viernes     → próx. viernes, 09:00–10:00
/tarea Estudiar para mañana    → tarea con fecha_opcional = mañana
```

**`_fuzzy_match_habito(nombre, habitos)`** — match exacto → contiene → por palabras.

**`_calc_racha(habito, registros_map)`** — port Python de `calcStreak` en `habitosUtils.js`: respeta `isScheduled`, días no programados no rompen racha.

### Cache de hábitos

`bot_data["habitos_cache"] = { "ts": timestamp, "data": [...] }` — TTL 60 s. Se invalida al marcar/deshacer hábitos desde callbacks.

### Chat_id y check-in nocturno

- El `chat_id` se guarda automáticamente en `chat_id.json` al primer mensaje del usuario y se carga al arrancar.
- `job_queue.run_daily(check_in_noche, time=21:00)` — si hay hábitos pendientes del día, envía un mensaje proactivo con botones ✓/½.

### Estado conversacional

| Step | Cuándo |
|------|--------|
| `agenda_choose_lista` | `/tarea` con >1 lista: espera número |
| `agenda_choose_calendario` | (vía inline keyboard, no texto) |

`/cancel` limpia `user_data` en cualquier momento desde cualquier flujo (Bóveda o Agenda).

### Backend — endpoint de revisión

`GET /agenda/revision?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` → `{ completadas, incompletas, vencidas, total_eventos, por_calendario: [{nombre, color, minutos}] }`. Implementado en `crud.py:agenda_resumen_semana`.

---

## 7. Bugs conocidos

| Bug | Dónde | Impacto |
|-----|-------|---------|
| `style2={{...}}` | `MesTab.jsx` L306 | Prop JSX inválido → bordes de hora en vista Semana no aplican |
| `toISOString().slice(0,10)` | Varios tabs | TZ Argentina (−3h) puede desfasar un día |
| Now-line deps `[]` | `HoyTab.jsx` useEffect | Si la app queda abierta pasada la medianoche, la línea usa el día viejo |
| Limpiar bloques expirados deps `[]` | `HoyTab.jsx` useEffect | Puede no limpiar si las tareas llegan async después del fetch |
| `valor: 0` al desmarcar hábito | Agenda `HoyTab` | Debería ser DELETE del registro; deja registros fantasma |
| Tab activo no en URL | `AgendaScreen` | Se pierde al F5 |
| No hay ON DELETE CASCADE | `agenda_calendarios` → eventos | Borrar calendario deja eventos huérfanos |

---

## 8. Mapa de archivos

```
project/
├── app/
│   ├── main.py              # Rutas /agenda/*
│   └── db/
│       ├── database.py      # Schema + _seed_agenda
│       └── crud.py          # agenda_* SQL
├── frontend/src/
│   ├── App.jsx              # fetchAgenda* al montar
│   ├── store/useStore.js    # Slice agenda*
│   ├── screens/AgendaScreen.jsx
│   └── components/agenda/
│       ├── AgendaTabs.jsx
│       ├── MiniCalendar.jsx
│       ├── HoyTab.jsx       # Grilla 6–23h + integración hábitos
│       ├── MesTab.jsx
│       ├── TareasTab.jsx
│       ├── RevisionTab.jsx
│       ├── EventoModal.jsx
│       ├── TareaModal.jsx
│       └── HorarioFacultadModal.jsx
└── mybot/
    ├── bot.py               # Entry point + Bóveda
    └── agenda_handlers.py   # Agenda + Hábitos
```

---

*Actualizar este archivo cuando se complete algo del roadmap. Referencia de pendientes: `Agenda-Roadmap.md`.*
