# Agenda — referencia para agentes y producto

Documento maestro del módulo **Agenda** de SGR. Complementa `Prompt.md` (spec de producto) y `project/README.md` (estado implementado). Úsalo antes de tocar código en `/agenda`.

**Accent Arcoíris:** `#2563eb` (azul) — `Layout.jsx` → `ARCOIRIS_ACCENTS['/agenda']`.

---

## 1. Qué es y para qué sirve

Agenda es el módulo de **gestión de tiempo y tareas**: calendarios, eventos, listas/checklists, time blocking en el día, horario de facultad como capa de fondo, y revisión semanal de productividad.

| Tab | Default | Rol |
|-----|---------|-----|
| **HOY** | ✅ al entrar | Día actual: pendientes, grilla 6–23h, bloques, hábitos |
| **Mes** | | Calendario mensual + vista semana; toggles de calendarios |
| **Tareas** | | Listas y checklists sin calendario de fondo |
| **Revisión** | | Retrospectiva semanal (estilo “Anual” de Finanzas) |

**Ruta:** `/agenda` → `AgendaScreen.jsx` (tabs locales con `useState`, no en URL).

**CTA TopBar:** “+ Evento” → `openAgendaEvento()` → `EventoModal` global en `AgendaScreen`.

**Botón extra:** “Facultad” → `HorarioFacultadModal` (no es un tab).

---

## 2. Arquitectura

```
AgendaScreen → AgendaTabs + tab component
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
| Estado | `store/useStore.js` (slice `agenda*`, líneas ~449–662) |
| API | `app/main.py` (`/agenda/*`, ~800–961) |
| SQL | `app/db/crud.py` (`agenda_*`, ~830–1262) |
| Schema + seed | `app/db/database.py` (`_seed_agenda`) |
| i18n | `utils/i18n.js` (claves `agenda*`) |
| Carga inicial | `App.jsx` — 5 `fetchAgenda*` al montar |

### Patrón offline-first

Toda mutación hace **update optimista** en Zustand y luego `fetch` en `try/catch`. Si falla la red, el UI ya cambió; no hay rollback ni React Query.

### Carga de datos al arranque

`App.jsx` llama sin rango de fechas:

- `fetchAgendaEventos()` → `GET /agenda/eventos` **sin** `desde`/`hasta` → devuelve **todos** los eventos históricos.

Implicación: con muchos años de datos, el store crece y Mes/Revisión filtran en cliente. Mejora natural: pedir ventana ±3 meses y refetch al cambiar mes (ver §8).

---

## 3. Modelo de datos (SQLite)

### Tablas

```sql
agenda_calendarios   (id, nombre, color, activo)
agenda_eventos       (id, titulo, descripcion, fecha_inicio, fecha_fin,
                      todo_el_dia, se_repite, regla_repeticion, calendario_id)
agenda_listas        (id, nombre, color)
agenda_tareas        (id, titulo, descripcion, fecha_opcional, hora_opcional,
                      hora_bloque, duracion_estimada, completada, lista_id)
agenda_horario_facultad (id, dia_semana, hora_inicio, hora_fin, materia, descripcion)
```

**Seed por defecto:** calendarios Personal / Trabajo / Facultad; listas Personal / Trabajo.

### Distinción visual (spec)

| Tipo | Vista calendario |
|------|------------------|
| Evento | Chip **sólido**, color del calendario |
| Tarea con `fecha_opcional` | Chip **borde punteado**, color de lista + ☐ |
| Facultad | Capa opacada; solo vistas horarias (HOY, Semana) |
| Hábitos con hora | Bloque en grilla HOY (color del hábito); **no** en Mes |

### Campos con semántica especial

| Campo | Uso real en código |
|-------|-------------------|
| `hora_bloque` | Time blocking en HOY: tarea aparece en grilla; si pasa la hora sin completar → se limpia al montar `HoyTab` |
| `hora_opcional` | Metadata en listas / chips; no siempre sincronizada con bloque |
| `duracion_estimada` | Altura del bloque en grilla (default 30 min) |
| `se_repite` / `regla_repeticion` | UI en `EventoModal`; **no hay expansión de ocurrencias** en front ni back |
| `activo` (calendario) | Mes filtra eventos de calendarios inactivos |

### API REST

| Método | Ruta | Notas |
|--------|------|-------|
| GET/POST | `/agenda/calendarios` | |
| PATCH/DELETE | `/agenda/calendarios/{id}` | DELETE no borra eventos huérfanos en cascada explícita |
| GET | `/agenda/eventos?desde=&hasta=` | Filtro opcional por `fecha_inicio` |
| POST/PATCH/DELETE | `/agenda/eventos/{id}` | |
| GET/POST | `/agenda/listas` | |
| PATCH/DELETE | `/agenda/listas/{id}` | DELETE borra tareas de esa lista |
| GET | `/agenda/tareas?lista_id=&pendientes=` | Front casi siempre pide todas |
| POST/PATCH/DELETE | `/agenda/tareas/{id}` | `hora_bloque` solo en PATCH |
| GET/POST/PATCH/DELETE | `/agenda/horario-facultad` | `dia_semana`: Lun=0 … Dom=6 |

Formato fechas eventos: ISO local tipo `YYYY-MM-DDTHH:MM:00` (string en SQLite).

---

## 4. Tabs — comportamiento implementado

### 4.1 HOY (`HoyTab.jsx`)

**Panel izquierdo (260px)**

- Tareas **pendientes** con `fecha_opcional` ≤ hoy+15 días (o sin fecha).
- Checkbox → `updateAgendaTarea({ completada })`.
- ⊕ Agendar → mini `input[type=time]` → `hora_bloque` + `fecha_opcional = hoy`.
- Sección **“Hábitos de hoy”** (sin `hora`): checkbox → `upsertHabitoRegistro` (toggle 0 / 1.0).

**Panel central**

- Grilla **6:00–23:00**, `HOUR_HEIGHT = 56px`.
- Capas: facultad (fondo) → eventos → bloques de tareas → hábitos con hora.
- Línea “ahora” (actualiza cada 60s).
- **No implementado (spec Prompt):** click en slot vacío → evento rápido.
- **No implementado:** click en bloque de evento → editar / panel derecho.

**Panel derecho (xl)**

- Cards de eventos y tareas bloqueadas del día (solo lectura).

**Lógica time blocking**

```javascript
// Al montar: si hora_bloque < ahora y no completada → hora_bloque = null
```

**Integración hábitos**

- Con `hora`: bloque clickeable en grilla (completa vía `upsertHabitoRegistro`).
- Spec dice “solo lectura desde Agenda”; en código **sí se puede marcar** desde HOY (atajo rápido). Editar definición del hábito sigue en `/habitos`.

### 4.2 Mes (`MesTab.jsx`)

**Izquierda:** `MiniCalendar` + lista calendarios (toggle `activo` al click).

**Centro:** vista Mes (6×7) o Semana (columnas 7–22h). Click en día → `EventoModal` con `defaultFecha`. Click en chip → `selected` en panel derecho.

**Derecha (xl):** detalle evento/tarea o próximos 5 eventos.

Facultad y hábitos **no** aparecen en el mes (correcto vs spec).

### 4.3 Tareas (`TareasTab.jsx`)

- Mini calendario + listas (crear, renombrar inline, color, eliminar).
- Filtro: Pendientes / Completadas / Todas.
- Panel derecho: detalle editable de tarea seleccionada.
- Ordenar por fecha o creación: **parcial** — orden por `fecha_opcional` en API; no hay toggle “por creación” en UI.

### 4.4 Revisión (`RevisionTab.jsx`)

- Selector de semana (`weekOff`, default -1 = semana pasada).
- Métricas: completadas / incompletas en semana, vencidas +7 días, % tiempo planificado (solo **eventos**, no bloques de tareas).
- Panel derecho: minutos por calendario + estimado facultad (suma de slots semanales, no por día real).

### 4.5 Modales

| Modal | Abre desde | Store |
|-------|------------|-------|
| `EventoModal` | TopBar, Mes, día en mini-cal | `agendaEventoOpen` o props locales |
| `TareaModal` | HOY +, Tareas | local state |
| `HorarioFacultadModal` | botón Facultad | `facultadOpen` en `AgendaScreen` |

`EventoModal`: título, descripción, fechas, todo el día, toggle repetición (sin RRULE), calendario, guardar/eliminar.

---

## 5. Integraciones con otros módulos

| Módulo | Integración actual |
|--------|-------------------|
| **Hábitos** | HOY muestra hábitos programados hoy; completar desde grilla o panel izq |
| **Bóveda** | Sin enlace directo (captura no crea tareas/eventos) |
| **Finanzas** | Sin enlace (ej. “pagar factura” como tarea sería feature nueva) |
| **Telegram Bot** | **Solo Bóveda** (`mybot/bot.py` → `/hojas`, `/categorias`) |
| **TopBar** | Campana 🔔 con badge; **sin handler** — placeholder para notificaciones |
| **TweaksPanel (Ctrl+M)** | Global: temas/tonos/fuentes; **igual en todos los módulos** |

---

## 6. Brechas spec vs código (deuda conocida)

| Spec (`Prompt.md`) | Estado |
|--------------------|--------|
| Click slot vacío HOY → evento rápido | ❌ |
| Panel derecho HOY: editar al seleccionar bloque | ❌ |
| Repetición de eventos | Toggle guardado; sin motor de recurrencia |
| Calendario “Hábitos” auto en Mes | N/A — hábitos no van a Mes (OK) |
| Completación hábitos solo desde Hábitos | ⚠️ Parcial — HOY permite toggle |
| Recordar en captura | UI deshabilitada globalmente |
| Tab activo en URL (`/agenda?tab=mes`) | ❌ — se pierde al F5 |
| `fetchAgendaEventos` acotado por mes visible | ❌ — carga todo |
| Eliminar calendario y eventos asociados | Comportamiento ambiguo (FK sin ON DELETE CASCADE en eventos) |

---

## 7. Optimizar funcionamiento con el Bot

Hoy el bot es **captura rápida a Bóveda**. Agenda no tiene superficie Telegram. Propuesta por fases:

### Fase A — Comandos mínimos (mismo `API_BASE`, sin auth extra)

| Comando / flujo | API | UX Telegram |
|-----------------|-----|-------------|
| `hoy` o `/agenda` | `GET /agenda/tareas?pendientes=true` + eventos `desde=hasta=hoy` | Lista numerada: eventos + tareas del día |
| Texto `tarea: Comprar leche` | `POST /agenda/tareas` | Preguntar lista (1..N) o default lista 1 |
| Texto `evento: Reunión 15:00` | `POST /agenda/eventos` | Parser simple de hora; calendario default Personal |
| `done 3` | `PATCH /agenda/tareas/{id}` | Marcar completada la #3 del último listado |
| Foto | — | Opcional: igual que Bóveda, no Agenda |

**Estado conversacional** (como Bóveda): `user_data["agenda_step"]` = `choose_lista` | `choose_calendario`.

### Fase B — Time blocking desde el móvil

- `bloquear 2 14:30` → tarea #2 de la lista `hoy` con `hora_bloque` y `fecha_opcional` hoy.
- Confirmación: “Bloque 14:30–15:00 · Comprar leche”.

### Fase C — Recordatorios vía Bot (puente a notificaciones)

- Al crear evento/tarea con hora, opcional: “¿Aviso 15 min antes por Telegram?”
- Tabla `agenda_recordatorios` + job que consulta cada minuto y `send_message` (ver §8).

### Fase D — Voz / NLP liviano

- “Mañana dentista 10” → `fecha_opcional` + `hora_opcional` sin abrir la web.

### Implementación técnica recomendada

1. Extraer en `mybot/agenda_handlers.py` funciones `_get_listas()`, `_post_tarea()`, etc. (espejo de `_post_hoja`).
2. Reutilizar **los mismos endpoints** que el front (una sola fuente de verdad).
3. En Docker, `API_BASE_URL=http://backend:8000` ya documentado en `bot.py`.
4. Invalidación: el front no escucha push; al volver a la pestaña conviene `fetchAgendaTareas()` manual o polling suave (opcional).

---

## 8. Notificaciones (Agenda)

La campana en `TopBar.jsx` está preparada visualmente (`badge`) pero **no hace nada**. Oportunidades alineadas con app **local / offline-first**:

### 8.1 Capas posibles

| Capa | Tecnología | Casos |
|------|------------|-------|
| **In-app** | Panel al click en 🔔 | Tareas vencidas, bloque en 15 min, hábitos sin marcar hoy |
| **SO (desktop)** | [Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) + permiso | Mismo contenido si la pestaña está en background |
| **Telegram** | Bot Fase C | Avisos cuando el PC está apagado |
| **Servicio local** | Script Windows / cron en Homelab | `sqlite3` + `requests` al bot |

### 8.2 Modelo de datos sugerido

```sql
agenda_recordatorios (
  id, tipo TEXT,           -- 'evento' | 'tarea' | 'habito' | 'bloque'
  ref_id INTEGER,
  disparar_en TEXT,        -- ISO datetime
  canal TEXT,              -- 'in_app' | 'telegram' | 'os'
  enviado INTEGER DEFAULT 0,
  anticipacion_min INTEGER
)
```

Índice en `disparar_en` para el worker.

### 8.3 Reglas de negocio útiles

- **Bloque de tarea:** notificar `hora_bloque - 5 min` si no `completada`.
- **Evento:** `fecha_inicio - anticipación` (default 15 min); todo el día → 08:00 del día.
- **Tarea con fecha sin hora:** 09:00 del `fecha_opcional` si sigue pendiente.
- **Hábito con hora:** mismo slot que en grilla HOY.
- **Revisión:** domingo 20:00 “Revisión semanal” (link a tab Revisión).

### 8.4 Frontend

- Store: `agendaNotificaciones: []`, `fetchAgendaNotificaciones()`, `marcarLeida(id)`.
- Badge en 🔔 = `count` no leídas.
- Settings (`/settings`): toggles por canal y anticipación global.

### 8.5 Limitaciones honestas

- Sin backend siempre encendido, Telegram es el canal más fiable para “recordatorio real”.
- Notification API en browser puede estar bloqueada; no sustituye al bot.

---

## 9. Mejoras del backend

Priorizadas por impacto / esfuerzo.

### Alta prioridad

1. **GET eventos con rango obligatorio recomendado**  
   - Default: mes actual ±1 si no pasan params.  
   - Índice: `CREATE INDEX idx_eventos_inicio ON agenda_eventos(fecha_inicio);`

2. **Recurrencia**  
   - Opción A: expandir al leer (`se_repite` + `regla_repeticion` estilo RRULE subset).  
   - Opción B: tabla `agenda_eventos_ocurrencias` materializada al guardar.

3. **Cascadas FK**  
   - `ON DELETE CASCADE` calendario → eventos.  
   - Documentar que borrar lista borra tareas (ya en `agenda_eliminar_lista`).

4. **Endpoint agregado para Revisión**  
   - `GET /agenda/revision?semana=2026-W20` → JSON con completadas, vencidas, minutos por calendario (mover lógica de `RevisionTab` al servidor para bot y exports).

5. **Timestamps**  
   - `creado_en`, `actualizado_en` en tareas/eventos (útil para orden “por creación” y auditoría).

### Media prioridad

6. **POST tarea con `hora_bloque`** en create (hoy solo PATCH).

7. **Validación Pydantic**  
   - `fecha_inicio < fecha_fin`, formatos `HH:MM`, `dia_semana` 0–6.

8. **Búsqueda**  
   - `GET /agenda/buscar?q=` full-text en título/descripción de tareas y eventos (TopBar search hoy no filtra Agenda).

9. **Export ICS**  
   - `GET /agenda/export.ics?desde=&hasta=` para suscribir desde Google Calendar (solo lectura).

### Baja prioridad / futuro

10. **Adjuntos** en eventos (ruta en `uploads/`).  
11. **Ubicación / enlace meet** en `descripcion`.  
12. **Webhooks** internos para Homelab (POST al crear evento).

---

## 10. Ctrl+M contextual (Tweaks + atajos de Agenda)

Hoy `TweaksPanel.jsx` es **global**: temas, tonos, tipografías. `Ctrl+M` no sabe si estás en HOY, Mes o Tareas.

### Propuesta: panel híbrido

`Ctrl+M` abre un panel con **dos zonas**:

1. **Fijo (arriba):** tema / tono / fuente (como ahora).  
2. **Contextual (abajo):** depende de `pathname` + tab Agenda en store o context.

Detectar contexto:

```javascript
// En App o AgendaScreen — registrar tab activo en store
agendaActiveTab: 'hoy' | 'mes' | 'tareas' | 'revision'
setAgendaActiveTab: (tab) => set({ agendaActiveTab: tab })
```

O leer desde `AgendaScreen` vía React context `AgendaUIContext`.

### Atajos sugeridos por contexto

| Contexto | Atajo | Acción |
|----------|-------|--------|
| **Agenda · HOY** | `N` | Nueva tarea (`TareaModal`) |
| | `E` | Nuevo evento (`EventoModal`) |
| | `T` | Enfocar primera tarea pendiente |
| | `←` / `→` | Día anterior / siguiente (navegación de fecha — requiere estado `viewDate`) |
| | `B` | Modo “solo bloques” (ocultar eventos en grilla) |
| **Agenda · Mes** | `N` | Evento en día seleccionado / hoy |
| | `M` / `S` | Vista Mes / Semana |
| | `H` | Ir a hoy |
| | `1`–`9` | Toggle calendario por índice en panel izq |
| **Agenda · Tareas** | `N` | Tarea en lista activa |
| | `L` | Nueva lista |
| | `1` / `2` / `3` | Filtro Pendientes / Completadas / Todas |
| | `↑` `↓` | Mover selección entre tareas |
| **Agenda · Revisión** | `←` `→` | Semana anterior / siguiente |
| | `E` | Exportar resumen (clipboard markdown) |
| **Global en /agenda** | `1`–`4` | Cambiar tab HOY / Mes / Tareas / Revisión |
| | `F` | Abrir Facultad |
| | `Ctrl+Enter` en modal | Guardar (patrón CaptureModal) |

### Implementación

- Nuevo `components/agenda/AgendaShortcutsPanel.jsx` embebido en `TweaksPanel` cuando `location.pathname.startsWith('/agenda')`.
- Registrar listeners solo con panel abierto **o** siempre con `preventDefault` solo cuando no hay input focused.
- Mostrar leyenda dinámica en el pie del panel (reemplazar el hint genérico “Ctrl+M para abrir”).

### Alternativa: long-press M

- `Ctrl+M` → tweaks visuales.  
- `Ctrl+Shift+M` → solo cheatsheet de atajos del módulo actual (más rápido de implementar).

---

## 11. Click derecho (y izquierdo) en Agenda

Hoy casi no hay `onContextMenu` en Agenda (sí en título TopBar: izq/der cambia módulo). Clic izquierdo en grilla HOY no crea eventos.

### 11.1 Menú contextual — diseño

Componente único: `AgendaContextMenu.jsx` con props `{ x, y, target }`.

`target` tipos:

- `slot` — celda horaria vacía  
- `evento` | `tarea` | `bloque` | `habito` | `facultad`  
- `dia` — celda Mes  
- `lista` — fila en Tareas  
- `calendario` — fila toggle Mes  

### 11.2 Acciones por target

| Target | Click derecho |
|--------|----------------|
| **slot (HOY/Semana)** | Nuevo evento aquí · Nueva tarea bloqueada · Pegar bloque copiado |
| **evento** | Editar · Duplicar · Mover a calendario ▶ · Eliminar |
| **tarea (lista)** | Completar · Agendar hoy · Asignar fecha · Mover lista ▶ · Eliminar |
| **bloque grilla** | Completar · Cambiar duración · Quitar bloque · Ir a tarea |
| **hábito en grilla** | Ir a `/habitos` · Marcar total/parcial (submenú) |
| **día Mes** | Nuevo evento · Nueva tarea con fecha · Ver en HOY |
| **lista** | Renombrar · Cambiar color · Vaciar completadas · Eliminar |
| **calendario** | Activar/desactivar · Solo este · Editar color |

### 11.3 Click izquierdo — refinamientos

| Gesto | Comportamiento propuesto |
|-------|-------------------------|
| Click slot vacío | Crear evento 1h desde esa hora (spec) |
| Click evento/bloque | Seleccionar + panel derecho editable |
| Doble click slot | Evento con título inline (QuickAdd) |
| Arrastrar bloque | Cambiar `hora_bloque` / `fecha_inicio` (drag-drop) |
| Shift+click tarea pendiente | Agendar en próximo hueco libre de la grilla |

### 11.4 Persistencia de preferencias

Tabla o `localStorage`:

```javascript
agendaContextPrefs: {
  doubleClickSlot: 'evento' | 'tarea',
  defaultCalendarioId: 1,
  defaultListaId: 1,
  showFacultadLayer: true,
}
```

Configurable desde Tweaks contextual o `/settings`.

### 11.5 Implementación técnica

- `preventDefault` en `contextmenu` + portal fixed menu.  
- Cerrar con Escape / click fuera.  
- Accesibilidad: menú también vía tecla Menu o `Shift+F10`.

---

## 12. Frontend — diseño, estado actual y roadmap

Análisis del UI de Agenda en `project/frontend/src/components/agenda/` y pantalla contenedora. Alineado con el design system global de SGR (`index.css`, `themes.js`, convenciones de Finanzas/Hábitos).

### 12.1 Dirección estética (Agenda)

**Rol del módulo:** herramienta de **planificación diaria** — el usuario mira la grilla y decide en segundos qué hacer ahora. No es marketing ni dashboard de KPIs.

**Dirección recomendada:** *planificador editorial-utilitario*

| Pilar | Aplicación en Agenda |
|-------|----------------------|
| **Tipografía** | Ya correcto: `serif italic` para fechas/títulos de día (`HoyTab` header, `MesTab` mes); `mono` + `tnum` para horas y fechas; `label` uppercase para secciones. Mantener; no introducir fuentes nuevas solo en Agenda. |
| **Color** | Accent azul `#2563eb` vía `--accent` (Arcoíris). Eventos = borde sólido + fill `color-mix`; tareas = **borde dashed** (lenguaje visual claro). Facultad = verde fijo `#059669` (coherente con Hábitos, distinguible de “Personal”). |
| **Espacio** | Layout 3 columnas 260px \| flex \| 260–280px (xl). Densidad media-alta en HOY; Mes más aire en celdas. |
| **Profundidad** | `panel-strong`, gradientes suaves en cards del panel derecho HOY. Evitar glassmorphism extra (ya está en TopBar). |
| **Motion** | Pocas animaciones de alto impacto: línea “ahora” (ya), transición al agendar bloque, stagger al cargar chips del mes. No micro-bounce en cada checkbox. |
| **Memorable** | La **grilla horaria con capas** (facultad → eventos → tareas punteadas → hábitos) es la firma visual; potenciarla con interacción (click slot, drag) más que con decoración. |

**Evitar:** gradientes violeta genéricos, layouts tipo Google Calendar clone, fuentes Inter/Roboto añadidas solo aquí.

### 12.2 Inventario UI actual

```
AgendaScreen
├── TopBar (global) — CTA "+ Evento", búsqueda sin wire a Agenda
├── AgendaTabs — pill switcher (hoy | mes | tareas | revision)
├── [tab activo — los demás se desmontan]
├── EventoModal (store agendaEventoOpen)
└── HorarioFacultadModal
```

| Componente | Responsabilidad | Tokens / clases |
|------------|-----------------|-----------------|
| `HoyTab` | Grilla 18h × 56px, paneles laterales | `panel-scroll`, `panel-strong`, inline `color-mix` |
| `MesTab` | Grid 6×7 + semana 7–22h | `grad-bg` día actual, chips en celda |
| `TareasTab` | Listas + filas + detalle xl | `ListaItem`, `TareaRow` locales |
| `RevisionTab` | Cards métricas + barras % | `panel-strong`, `tnum` |
| `MiniCalendar` | Compartido Mes/Tareas | dots de color por evento/tarea |
| `EventoModal` / `TareaModal` | Overlay `z-50`, `max-w-md/sm` | `inputStyle` duplicado en cada modal |
| `HorarioFacultadModal` | Lista + form inline | `max-h 80vh` scroll |

**Patrones compartidos con Finanzas:** barra de tabs en panel, `label`, paneles `w-[260px]`, `hidden xl:flex` en columna derecha, modales centrados con overlay `rgba(0,0,0,0.4)`.

**Patrones NO reutilizados aún:** `CaptureModal` (4 módulos en header, Ctrl+Enter, blur backdrop), `MovementModal` (validación), scrollbars `.panel-scroll` tematizados (sí usados), paneles derechos editables de Finanzas (`DatosRightPanel`).

### 12.3 Layout y responsive

| Breakpoint | Comportamiento |
|------------|----------------|
| `< xl` (1280px) | Panel derecho **oculto** en HOY, Mes, Tareas, Revisión — pierde detalle/edición sin modal alternativo |
| `< lg` | TopBar oculta nombre usuario; Agenda sigue con 2 columnas (izq + centro) en HOY |
| Móvil (no optimizado) | `w-[260px]` fijo en aside — en viewport estrecho el centro queda ~100px; **no hay drawer ni tabs inferiores** |

**Mejoras responsive (prioridad alta):**

1. **Drawer derecho** en `< xl`: sheet desde la derecha al seleccionar evento/tarea (mismo contenido que panel xl).
2. **Colapsar panel izquierdo** HOY con icono ≡; en móvil mostrar solo grilla + FAB “pendientes”.
3. **`min-w-0`** ya presente en centro; revisar overflow de chips Mes en pantallas chicas (`truncate` OK).

### 12.4 Estado React y rendimiento

#### Problemas detectados

| Issue | Ubicación | Impacto |
|-------|-----------|---------|
| **Re-render global** | Tabs usan `useStore(s => s.agendaTareas)` sin selector fino | Cualquier cambio en Finanzas/Hábitos re-renderiza Agenda si el componente está montado; dentro de Agenda, cambiar una tarea re-renderiza todo el tab |
| **Sin `useMemo`** | Filtros `pending`, `byDate`, `tareasLista` recalculados cada render | O(n) en cada frame con listas grandes |
| **Tabs desmontados** | `AgendaScreen` `{tab === 'hoy' && <HoyTab />}` | Al cambiar tab se pierde scroll, `schedulingId`, selección Mes |
| **Fecha “congelada” en now-line** | `HoyTab` L42–50: `useEffect(..., [])` cierra sobre `today` del primer render | Si la app queda abierta pasada la medianoche, la línea “ahora” usa día viejo hasta remount |
| **Limpieza bloques expirados** | `useEffect` L104–112 deps `[]`; `bloqueadas` del primer paint | Puede no limpiar bloques si las tareas llegan async después del fetch |
| **Overlap en grilla** | Eventos/tareas/hábitos `position: absolute` sin columnas | Dos eventos a la misma hora se superponen; no hay layout tipo “columnas” |
| **Bug JSX** | `MesTab.jsx` L306: `style2={{...}}` | Prop inválido → bordes de hora en vista Semana pueden no aplicarse |
| **ISO timezone** | `toISOString().slice(0,10)` en varios tabs | En TZ Argentina puede desfasar un día vs fecha local |
| **Carga total eventos** | `App.jsx` fetch sin rango | Mes/Revisión iteran arrays enormes en cliente |

#### Optimizaciones recomendadas

```javascript
// 1. Selectores Zustand
const agendaTareas = useStore(s => s.agendaTareas)
// →
const pending = useStore(useCallback(s =>
  s.agendaTareas.filter(...), [])) // mejor: createSelector o slice derivado en store

// 2. Mantener tabs montados, ocultar con CSS
<div hidden={tab !== 'hoy'}><HoyTab /></motion.div>

// 3. agendaUtils.js + useMemo
const todayISO = useMemo(() => toLocalISODate(viewDate), [viewDate])

// 4. Virtualización (solo si >200 ítems en lista pendiente)
// @tanstack/react-virtual en panel izq HOY

// 5. Fetch acotado al cambiar mes en MesTab
useEffect(() => {
  const desde = `${year}-${pad(month+1)}-01`
  const hasta = lastDayOfMonth(year, month)
  fetchAgendaEventos(desde, hasta)
}, [year, month])
```

**Prioridad:** (1) bug `style2`, (2) fecha local + now-line, (3) memo en `byDate`, (4) tabs persistentes, (5) fetch por ventana.

### 12.5 Accesibilidad (a11y)

| Área | Estado | Acción |
|------|--------|--------|
| Tabs | `role="tab"` + `aria-selected` en `AgendaTabs` | Falta `tablist`, `tabpanel`, `aria-controls` |
| Grilla horaria | Divs absolutos sin roles | `role="grid"` / `gridcell` o al menos `aria-label` por franja horaria |
| Modales | Sin `role="dialog"`, `aria-modal`, focus trap | Copiar patrón de `CaptureModal` / añadir `useFocusTrap` |
| Checkbox tareas | `<button>` sin `aria-pressed` / `aria-checked` | Usar `aria-checked={completada}` |
| Contraste | `opacity: 0.55` facultad, texto 10px | Verificar WCAG AA en tema claro |
| Teclado | Sin navegación en grilla | §10 atajos + foco visible en bloques |
| i18n | Varios strings hardcodeados | Ver §12.7 |

### 12.6 Interacción y UX — brechas vs spec

| Interacción | Spec / expectativa | Código actual |
|-------------|-------------------|---------------|
| Click slot vacío HOY | Crear evento rápido | ❌ Solo líneas horarias decorativas |
| Click bloque evento | Editar / panel derecho | ❌ Bloques no son clickables |
| Panel derecho HOY | Detalle editable | ❌ Solo cards estáticas |
| Panel derecho Mes | Editar seleccionado | ⚠️ Solo lectura; sin botón “Editar” → modal |
| Agendar tarea | Timepicker inline | ✅ Hover revela “Agendar” |
| Vista Semana | Facultad + tareas | ⚠️ Solo eventos timed en columnas |
| Duplicar evento | — | ❌ |
| Undo completar | — | ❌ |
| Confirmación eliminar | — | ❌ Delete directo (como Finanzas Datos) |
| Ctrl+Enter en modales | Como Capture | ❌ |
| Escape cierra modales | — | ⚠️ Solo botón X |
| Toast al guardar | `showToast` en store | ❌ En modales Agenda |

### 12.7 i18n y copy

Claves en `i18n.js` bajo `agenda*` (~30). **Hardcodeado en componentes** (mover a i18n):

- `EventoModal`: “Editar evento”
- `TareaModal`: “Editar tarea”, “Guardando…”
- `HoyTab` panel derecho: “todo el día”
- `MesTab`: “Evento”, “Tarea”, “Próximos eventos”, “+N más”
- `TareasTab`: “Seleccioná una lista”, “Sin tareas…”, “Detalle”, “Eliminar tarea”, “Hacé clic…”
- `RevisionTab`: “Semana pasada”, “Esta semana”, textos de apoyo en cards

**Emojis** en `TareasTab` detalle (📅 ⏱): sustituir por iconos Lucide para coherencia con el resto de SGR.

### 12.8 Sistema de componentes — refactor propuesto

```
components/agenda/
├── agendaUtils.js          # timeToMinutes, minutesToTop, buildByDate, toLocalISODate
├── agendaConstants.js      # HOURS, HOUR_HEIGHT, COLORS_LISTA
├── AgendaContextMenu.jsx   # §11
├── HourGrid.jsx            # grilla reutilizable HOY + Semana
├── TimeBlock.jsx           # evento | tarea | habito | facultad — variant prop
├── AgendaPanel.jsx         # aside 260px con título + scroll
├── AgendaModalShell.jsx    # overlay + focus trap + Ctrl+Enter
├── QuickEventPopover.jsx   # inline en slot (sin modal full)
├── hooks/
│   ├── useAgendaDay.js     # viewDate, todayISO, filtros del día
│   └── useAgendaKeyboard.js
└── [tabs existentes más delgados]
```

**`AgendaModalShell`:** unificar `inputStyle`, header serif, footer Guardar/Cancelar, `onKeyDown` Escape + Ctrl+Enter — hoy duplicado 3 veces.

**`HourGrid`:** una sola implementación para HOY (`HOUR_HEIGHT=56`) y Semana (`48`), parametrizable; corrige bug `style2` y añade click en celdas.

### 12.9 Motion y micro-interacciones

| Momento | Propuesta | Implementación |
|---------|-----------|----------------|
| Cambio de tab | Fade 120ms + ligero `translateY(4px)` | CSS `@keyframes` o clase en `AgendaScreen` |
| Aparece bloque agendado | `scaleY(0.95)→1` + borde dashed draw | `animation` en `TimeBlock` al crear |
| Completar tarea | Strike-through 200ms + fade out del bloque en grilla | `transition` en título + remove block |
| Línea “ahora” | Pulso suave cada 2s en el dot | `box-shadow` keyframes con `--accent` |
| Mes: cambio de mes | Crossfade chips en celdas | `key={year-month}` en grid |
| Modal | Backdrop blur 8px (como Tweaks) | `backdrop-filter` en overlay |

No añadir Motion library hasta que Bóveda/Finanzas la adopten; **CSS first**.

### 12.10 Visualización de datos (Revisión)

- Barras de %: correctas con `panel-strong`; mejorar con **leyenda accesible** (no solo color).
- Considerar **mini sparkline** de “tareas completadas por día” en la semana (SVG inline, sin chart lib).
- Card “tiempo planificado”: el denominador `7×24×60` es poco intuitivo — mostrar “X h de Y h despierto” con supuesto configurable (ej. 16h/día).

### 12.11 Integración visual con otros módulos

| Integración | UI posible |
|-------------|------------|
| **CaptureModal → Agenda** | Activar tab `agenda` en `SECTIONS`; form corto evento/tarea (spec futuro) |
| **TopBar búsqueda** | Dropdown resultados: eventos + tareas; highlight en Mes |
| **Hábitos** | Badge “parcial” amarillo en grilla (hoy solo total); link “ir a hábito” |
| **Tweaks Ctrl+M** | Sección atajos Agenda (§10) debajo de tipografías |

### 12.12 Roadmap frontend priorizado

#### P0 — bugs y consistencia (1–2 días)

- [ ] Corregir `style2` → `style` en `MesTab.jsx` L306.
- [ ] `toLocalISODate()` en `agendaUtils.js`; reemplazar `toISOString().slice(0,10)`.
- [ ] Arreglar `useEffect` now-line y expired blocks (deps + `viewDate`).
- [ ] Strings hardcodeados → `i18n.js`.
- [ ] `Ctrl+Enter` + `Escape` en `EventoModal` / `TareaModal` / `HorarioFacultadModal`.

#### P1 — interacción core (3–5 días)

- [ ] `HourGrid` con click en slot → `QuickEventPopover` o `EventoModal` con hora prellenada.
- [ ] Bloques clickables → selección + panel derecho / drawer con editar.
- [ ] `AgendaContextMenu` mínimo (slot, evento, tarea) — §11.
- [ ] Drawer xl para `< xl` en detalle Mes/Tareas/HOY.
- [ ] Layout columnas para eventos solapados en grilla.

#### P2 — rendimiento y estado (2–3 días)

- [ ] Tabs montados con `hidden` / `display:none`.
- [ ] `useMemo` + `agendaUtils.js`.
- [ ] `fetchAgendaEventos(desde, hasta)` al navegar Mes.
- [ ] Selectores Zustand más finos o `useShallow`.

#### P3 — polish diseño (3–4 días)

- [ ] `AgendaModalShell` compartido.
- [ ] Animaciones P1 de §12.9.
- [ ] Vista Semana: chips tareas + capa facultad.
- [ ] Navegación de día en HOY (← →) con estado `viewDate`.
- [ ] FAB móvil pendientes + bottom sheet.

#### P4 — avanzado

- [ ] Drag-and-drop bloques (`@dnd-kit/core` o HTML5 DnD).
- [ ] Inbox lista sin fecha (panel izq dedicado).
- [ ] Modo “focus”: ocultar facultad / hábitos / eventos all-day.
- [ ] Temas: variante “alto contraste” solo para grilla Agenda.

### 12.13 Checklist de calidad antes de merge (Agenda UI)

- [ ] Funciona en tema claro y oscuro + Arcoíris azul.
- [ ] Panel derecho o drawer disponible en 1024px y 1440px.
- [ ] Ningún string visible solo en español sin clave i18n.
- [ ] Modales: focus trap, Escape, Ctrl+Enter.
- [ ] Grilla: scroll hasta 23:00 visible; línea “ahora” en rango correcto.
- [ ] No regresión offline: optimista sigue funcionando sin API.
- [ ] Lighthouse a11y en `/agenda` sin errores críticos en tabs y modales.

### 12.14 Referencia rápida de archivos a tocar

| Objetivo | Archivo(s) |
|----------|------------|
| Grilla / slots | `HoyTab.jsx` → extraer `HourGrid.jsx` |
| Mes / Semana | `MesTab.jsx` |
| Modales | `EventoModal.jsx`, `TareaModal.jsx`, `HorarioFacultadModal.jsx` |
| Tabs / persistencia | `AgendaScreen.jsx` |
| Estilos globales | `index.css` (`.agenda-grid`, `.time-block`) |
| Store / fetch | `useStore.js`, `App.jsx` |
| Copy | `i18n.js` |
| Atajos | `TweaksPanel.jsx` + `useAgendaKeyboard.js` |
| Menú contextual | nuevo `AgendaContextMenu.jsx` |

---

## 13. Otras mejoras de producto

### UX / UI

- Detalle en **§12** (frontend). Resumen: URL con tab/fecha, drag & drop Mes, búsqueda TopBar, sync `hora_opcional` ↔ `hora_bloque`.

### Productividad

- **Plantillas de semana** (aplicar bloques recurrentes de tareas).  
- **Inbox** lista especial “sin fecha” siempre visible.  
- **Enlace Bóveda:** click derecho en evento → “Vincular nota” (`hoja_id` en evento).  
- **Enlace Finanzas:** tarea “Pagar X” con deep link a movimiento.

### Revisión

- Incluir **bloques de tareas** y hábitos en % planificado.  
- Export PDF/markdown de la semana.  
- Comparar semana N vs N-1.

### Calidad de código

- Ver **§12.8** (`agendaUtils.js`, `HourGrid`, tests). Tipos JSDoc o TypeScript gradual en slice Agenda.

---

## 14. Mapa rápido para agentes

| Quiero… | Ir a… |
|---------|--------|
| Cambiar tab default | `AgendaScreen.jsx` `useState('hoy')` |
| Nuevo evento global | `useStore` → `openAgendaEvento` |
| API nueva | `main.py` + `crud.py` + quizá `database.py` |
| Strings UI | `i18n.js` claves `agenda*` |
| Lógica hábitos en HOY | `HoyTab.jsx` + `habitosUtils.js` |
| Bot Agenda | `mybot/bot.py` (hoy no existe — §7) |
| Notificaciones | TopBar + nueva tabla §8 |
| Atajos contextuales | `TweaksPanel.jsx` + §10 |
| Menú contextual | nuevo `AgendaContextMenu.jsx` §11 |
| Grilla / rendimiento UI | §12 — `HourGrid`, `agendaUtils`, P0–P4 |
| i18n / modales | §12.7, `AgendaModalShell` |

---

## 15. Referencias cruzadas

- Spec producto: `../Prompt.md` → § Agenda, § Integración con Agenda, § Ideas Agenda (líneas ~806–816).  
- Estado implementado: `README.md` → Agenda hecho / no implementado.  
- Bot actual: `mybot/bot.py` (solo Bóveda).  
- Hábitos en grilla: `Prompt.md` § Integración con Agenda vs implementación real en `HoyTab.jsx`.

---

*Última revisión de código: mayo 2026 — alineado con `project/frontend` y `project/app` en el repo local.*
