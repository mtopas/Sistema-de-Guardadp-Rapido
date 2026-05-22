# Agenda — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Agenda.
Cuando algo se complete, **mover la descripción actualizada a `Agenda.md`**.

---

## Bot — Pendiente menor

- [ ] Nota conversacional post-marcado: preguntar "¿Nota?" como paso extra tras presionar ✓/½ (hoy existe `/nota` como comando separado)
- [ ] Check-in nocturno configurable: hora y opt-out desde el bot sin tocar código

---

## Frontend — Bugs P0

*(todos resueltos — ver historial en `Agenda.md §7`)*

## Frontend — Interacción y UX

- [ ] Click en bloque de evento/tarea en grilla → seleccionar + mostrar en panel derecho editable
- [ ] Panel derecho HOY: detalle editable del ítem seleccionado (hoy son cards estáticas)
- [ ] Panel derecho Mes: botón "Editar" que abre modal (hoy solo lectura)
- [ ] Duplicar evento
- [ ] Toggle descompletar tarea desde la web (desde bloque en grilla)
- [ ] Confirmación antes de eliminar evento/tarea (hoy es delete directo)
- [ ] Vista Semana: chips de tareas + capa facultad (hoy solo eventos timed en columnas)
- [ ] Layout columnas para eventos solapados en grilla HOY (hoy se superponen con `position: absolute`)
- [ ] Drawer derecho en `< xl`: sheet desde la derecha al seleccionar evento/tarea
- [ ] Colapsar panel izquierdo HOY con ≡; FAB "pendientes" en móvil
- [ ] Modo "focus": ocultar facultad / hábitos / eventos all-day
- [ ] Inbox: lista especial "sin fecha" siempre visible en panel izq

## Frontend — Rendimiento y estado

- [ ] Selectores Zustand sin granularidad: usar `useShallow` o selectores derivados para no re-renderizar Agenda ante cambios de otros módulos
- [ ] `fetchAgendaEventos` acotado al mes visible + refetch al navegar de mes (hoy el backend tiene default ±2 meses pero el frontend no refetchea)

## Frontend — Accesibilidad y i18n

- [ ] `role="tablist"`, `aria-selected`, `tabpanel`, `aria-controls` en `AgendaTabs`
- [ ] `role="grid"` / `gridcell` o `aria-label` por franja horaria en grilla HOY
- [ ] `role="dialog"`, `aria-modal`, focus trap en modales (copiar patrón de `CaptureModal`)
- [ ] `aria-checked` en checkboxes de tareas

Strings hardcodeados a mover a `i18n.js`:
- [ ] `EventoModal`: "Editar evento"
- [ ] `TareaModal`: "Editar tarea"
- [ ] `HoyTab` panel der: "todo el día"
- [ ] `MesTab`: "Evento", "Tarea", "Próximos eventos", "+N más"
- [ ] `TareasTab`: "Seleccioná una lista", "Sin tareas…", "Detalle", "Eliminar tarea", "Hacé clic…"
- [ ] `RevisionTab`: "Semana pasada", "Esta semana", textos de apoyo
- [ ] Emojis en `TareasTab` detalle (📅 ⏱) → reemplazar por iconos Lucide

## Frontend — Ctrl+M contextual (§10 Agenda)

- [ ] Registrar `agendaActiveTab` en store para que el panel lea el contexto sin prop drilling
- [ ] Panel híbrido: fijo (tema/tono/fuentes arriba) + contextual (atajos del tab abajo)
- [ ] Atajos HOY: `N` nueva tarea, `E` nuevo evento, `T` enfocar primer pendiente, `← →` día anterior/siguiente, `B` solo bloques
- [ ] Atajos Mes: `N` evento en día sel., `M`/`S` vista Mes/Semana, `H` ir a hoy, `1–9` toggle calendario por índice
- [ ] Atajos Tareas: `N` nueva tarea, `L` nueva lista, `1`/`2`/`3` filtro, `↑↓` navegar entre tareas
- [ ] Atajos Revisión: `← →` semana anterior/siguiente
- [ ] Global `/agenda`: `1–4` cambiar tab, `F` abrir Facultad
- [ ] Mostrar leyenda dinámica de atajos en el pie del panel

## Frontend — Menú contextual

- [ ] Componente `AgendaContextMenu.jsx`: portal, posición x/y, cierre con Escape / click fuera
- [ ] **Slot vacío HOY/Semana:** Nuevo evento aquí · Nueva tarea bloqueada · Pegar bloque copiado
- [ ] **Evento:** Editar · Duplicar · Mover a calendario ▶ · Eliminar
- [ ] **Tarea (lista):** Completar · Agendar hoy · Asignar fecha · Mover lista ▶ · Eliminar
- [ ] **Bloque grilla:** Completar · Cambiar duración · Quitar bloque · Ir a tarea
- [ ] **Hábito en grilla:** Ir a `/habitos` · Marcar total/parcial (submenú)
- [ ] **Día Mes:** Nuevo evento · Nueva tarea con fecha · Ver en HOY
- [ ] **Lista:** Renombrar · Cambiar color · Vaciar completadas · Eliminar
- [ ] **Calendario:** Activar/desactivar · Solo este · Editar color

## Frontend — Motion y micro-animaciones (CSS, sin librería)

- [ ] Completar tarea en grilla: strike-through 200ms + fade out del bloque
- [ ] Cambio de mes en Mes: crossfade chips con `key={year-month}` en grid

## Frontend — Refactor componentes

- [ ] `HourGrid.jsx`: grilla reutilizable HOY + Semana parametrizable
- [ ] `hooks/useAgendaDay.js` (viewDate, todayISO, filtros del día) y `hooks/useAgendaKeyboard.js`
- [ ] `QuickEventPopover.jsx` (inline sin modal full-screen)
- [ ] `AgendaPanel.jsx` (aside 260px con título + scroll, reutilizable entre tabs)

## Frontend — Revisión (mejoras específicas)

- [ ] Incluir hábitos en % tiempo planificado (duración estimable o configurable)
- [ ] Barra de % con leyenda accesible (no solo color)
- [ ] Comparar semana N vs N-1
- [ ] Export PDF de la semana (el markdown ya está implementado)

---

## Backend

**Alta prioridad**
- [ ] Motor de recurrencia: expandir `se_repite` + `regla_repeticion` (RRULE subset) — hoy el toggle se guarda pero no genera ocurrencias

**Media prioridad**
- [ ] Validación Pydantic: `fecha_inicio < fecha_fin`, formatos `HH:MM`, `dia_semana` 0–6
- [ ] `GET /agenda/buscar?q=` full-text en título/descripción de tareas y eventos
- [ ] `GET /agenda/export.ics?desde=&hasta=` para suscribir desde Google Calendar (solo lectura)

**Baja prioridad**
- [ ] Adjuntos en eventos (ruta `uploads/`)
- [ ] Ubicación / enlace meet en descripción del evento

---

## Notificaciones

- [ ] Tabla `agenda_recordatorios (id, tipo, ref_id, disparar_en, canal, enviado, anticipacion_min)` + índice en `disparar_en`
- [ ] Reglas de disparo: bloque → `hora_bloque - 5 min`; evento → `fecha_inicio - 15 min`; tarea con fecha → 09:00 del día; hábito con hora → mismo slot; revisión → dom 20:00
- [ ] Store: `agendaNotificaciones`, `fetchAgendaNotificaciones()`, `marcarLeida(id)`
- [ ] Badge 🔔 con count real (TopBar ya tiene el visual sin handler)
- [ ] Settings `/settings`: toggles por canal y anticipación global
- [ ] Notification API del browser (permiso; útil si pestaña está en background)
- [ ] Worker scheduler en backend (`lifespan` FastAPI o cron cada 1 min) → SELECT due → enviar por canal

---

## Cross-módulo

- [ ] Búsqueda TopBar: dropdown con resultados de eventos + tareas; highlight en Mes
- [ ] `CaptureModal`: habilitar tab Agenda para crear evento/tarea desde el modal global
- [ ] Enlace Bóveda ↔ Agenda: click derecho en evento → "Vincular nota" (`hoja_id` FK en `agenda_eventos`)
- [ ] Enlace Finanzas ↔ Agenda: tarea "Pagar X" con deep link a movimiento

---

## Producto — largo plazo

- [ ] Export ICS Agenda para suscribir desde Google Calendar (readonly)
- [ ] Plantillas de semana (bloques recurrentes de tareas)
- [ ] Modo focus Agenda: ocultar facultad / hábitos / eventos all-day
- [ ] Variante "alto contraste" de temas para la grilla

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Agenda.md`.*

---

---

# Plan de implementación — Secciones 2 a 14

Orden de ataque recomendado: cada sección desbloquea la siguiente. Los refactors (§5) se hacen *mientras* se implementan las features de §3, no como paso separado.

---

## §2 — Backend: Alta prioridad

### Qué hay y qué falta

- **ON DELETE CASCADE**: ya resuelto en P0. Tachar del backend.
- **Endpoint de revisión**: ya implementado (`GET /agenda/revision?desde=&hasta=` → `crud.py:agenda_resumen_semana`). El roadmap original lo pedía con formato `?semana=YYYY-WNN`; la versión actual acepta fechas ISO directas, lo cual es más flexible. No hace falta rehacerlo; sí hace falta que `RevisionTab` lo llame en lugar de calcular en cliente (mejora de §10).
- **Rango en eventos**: el impacto más grande. Hoy `fetchAgendaEventos()` carga todo el historial; con años de datos el store se infla y Mes/Revisión filtran en cliente.
- **Recurrencia**: el ítem más complejo. El toggle `se_repite` ya persiste pero no genera ocurrencias.
- **`creado_en` / `actualizado_en`**: migración simple; desbloquea "ordenar por creación" en Tareas.

### Orden sugerido

1. **Rango en eventos** (impacto inmediato en rendimiento)
2. **`creado_en` / `actualizado_en`** (migración rápida; desbloquea §3 ordenado)
3. **Validación Pydantic** (evita datos inválidos antes de agregar recurrencia)
4. **Motor de recurrencia** (largo; hacerlo último)
5. **Búsqueda full-text** (`?q=`) y **Export ICS** (media/baja)

### Detalles de implementación

**Rango en eventos**

```python
# main.py — GET /agenda/eventos
@app.get("/agenda/eventos")
def get_eventos(desde: str = None, hasta: str = None):
    # Default: mes actual ± 1 mes
    if not desde:
        desde = (date.today().replace(day=1) - timedelta(days=32)).strftime('%Y-%m-01')
    if not hasta:
        hasta = (date.today().replace(day=1) + timedelta(days=62)).strftime('%Y-%m-28')
    return crud.agenda_get_eventos(desde, hasta)
```

```sql
-- database.py: en _apply_migrations
CREATE INDEX IF NOT EXISTS idx_eventos_inicio ON agenda_eventos(fecha_inicio);
```

El store debe refetchear al cambiar de mes en `MesTab` (`useEffect` sobre `[year, month]`).

**`creado_en` / `actualizado_en`**

Migración `ALTER TABLE` en `_apply_migrations`:
```python
for tabla in ('agenda_tareas', 'agenda_eventos'):
    cols = _get_columns(cursor, tabla)
    if 'creado_en' not in cols:
        cursor.execute(f"ALTER TABLE {tabla} ADD COLUMN creado_en TEXT")
        cursor.execute(f"UPDATE {tabla} SET creado_en = datetime('now') WHERE creado_en IS NULL")
    if 'actualizado_en' not in cols:
        cursor.execute(f"ALTER TABLE {tabla} ADD COLUMN actualizado_en TEXT")
        cursor.execute(f"UPDATE {tabla} SET actualizado_en = datetime('now') WHERE actualizado_en IS NULL")
```

El PATCH de tareas/eventos debe actualizar `actualizado_en = datetime('now')` en cada escritura.

**Motor de recurrencia**

Subset RRULE a implementar: `DAILY`, `WEEKLY` (con `BYDAY`), `MONTHLY` (por día del mes). Sin `YEARLY` por ahora.

Estrategia: **expansión en lectura**, no en escritura. El endpoint `GET /agenda/eventos?desde=&hasta=` expande las ocurrencias del evento padre dentro del rango solicitado. No se crean filas en BD por cada ocurrencia.

```python
# crud.py
def _expand_recurrente(evento, desde, hasta):
    """Genera ocurrencias de un evento recurrente dentro del rango."""
    # parsear regla_repeticion como JSON: { freq, interval, byday, until, count }
    # yield dicts con fechas ajustadas; id = f"{evento.id}_r{n}"
```

La UI identifica ocurrencias por el prefijo `_r` en el id y las trata como read-only (editar = "editar solo esta" o "editar todas").

**Ideas adicionales**
- Agregar `color` editable en `agenda_calendarios` desde el frontend (hoy solo se setea en seed).
- `PATCH /agenda/tareas/{id}` debería aceptar `lista_id` para mover tareas entre listas (hoy no está).
- `POST /agenda/tareas` debería aceptar `hora_bloque` en create (hoy solo PATCH lo admite).

---

## §3 — Interacción y UX

### Qué hay y qué falta

El estado actual es funcional pero pasivo: los modales solo abren desde CTAs específicos, no hay feedback al guardar, y la grilla HOY muestra solo el día de hoy sin forma de navegar.

### Orden sugerido (de menor a mayor esfuerzo)

1. **`Escape` cierra modales** — una línea por modal (`useEffect` + `keydown`)
2. **`Ctrl+Enter` guarda en modales** — mismo efecto, mismo pattern
3. **Toast al guardar** — `showToast` ya existe en store; solo hay que llamarlo
4. **Tab activo en URL** — `URLSearchParams` en `AgendaScreen`; sin deps externas
5. **Navegación día (← →) con `viewDate`** — estado local en HOY; cambia `todayISO` y `dayLabel`
6. **Click en slot vacío → EventoModal prellenado**
7. **Toggle descompletar tarea** — `PATCH completada=false`; ya existe la acción
8. **Confirmación antes de eliminar**
9. **Panel derecho HOY editable**
10. **Layout de eventos solapados**

### Detalles de implementación

**Escape + Ctrl+Enter en modales**

Patrón unificado (extraer a `AgendaModalShell` en §5):
```javascript
useEffect(() => {
  const handler = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGuardar()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, []) // deps: onClose, handleGuardar via refs
```

**Navegación de día en HOY**

```javascript
// HoyTab: viewDate como estado; todayISO derivado de viewDate
const [viewDate, setViewDate] = useState(new Date())
const viewISO = toLocalISODate(viewDate)
const isToday = viewISO === toLocalISODate(new Date())
// Header: ← [fecha] → + botón "Hoy" (visible solo si !isToday)
```

Impacto: `todayEventos`, `bloqueadas`, `facultadHoy` se filtran por `viewISO` en lugar de `todayISO`. El panel izquierdo muestra "Pendientes para este día".

**Click en slot vacío → EventoModal**

Agregar `onClick` en cada franja horaria de la grilla:
```jsx
<div
  key={h}
  className="absolute left-0 right-0 cursor-pointer hover:bg-[var(--surface)]"
  style={{ top: (h - 6) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
  onClick={() => openEventoModal({ defaultFecha: viewISO, defaultHora: `${h}:00` })}
/>
```
Mostrar `QuickEventPopover` (§5) en lugar de modal full-screen para ediciones rápidas.

**Layout eventos solapados**

Algoritmo de columnas (Google Calendar style):
1. Agrupar eventos que se solapan en intervalos de tiempo.
2. Asignar `column` y `totalColumns` a cada evento.
3. `width = (rightEdge - left) / totalColumns`, `left = left + column * width`.

```javascript
function assignColumns(events) {
  // Sort by startMin; greedy column assignment
  const cols = []
  return events.map(e => {
    const col = cols.findIndex(endMin => endMin <= e.startMin)
    if (col === -1) { cols.push(e.endMin); return { ...e, col: cols.length - 1 } }
    cols[col] = e.endMin
    return { ...e, col }
  }).map(e => ({ ...e, totalCols: cols.length }))
}
```

**Ideas adicionales**
- **Botón "Duplicar evento"** en panel derecho y menú contextual: POST con mismos campos + " (copia)" en título.
- **"Inbox" de tareas sin fecha** en panel izquierdo HOY como sección colapsable al fondo — capturar ideas sin compromiso de fecha.
- **Chips all-day en HOY** encima de la grilla (franja horizontal de ~32px) para eventos `todo_el_dia`.
- **Scroll automático** al abrir HOY para centrar la hora actual visible.

---

## §4 — Rendimiento y estado

### Qué hay y qué falta

Cada vez que *cualquier* parte del store cambia (Finanzas, Hábitos, Bóveda), todos los componentes de Agenda se re-renderizan porque suscriben a slices completos. Con los datos actuales no es perceptible, pero crece con el uso.

### Orden sugerido

1. **Expandir `agendaUtils.js`** — mover `timeToMinutes`, `minutesToTop`, `HOURS`, `HOUR_HEIGHT` (evita duplicación)
2. **`agendaConstants.js`** — `HOURS`, `HOUR_HEIGHT`, `HOUR_HEIGHT_SEMANA` como única fuente de verdad
3. **`useShallow`** — en todos los componentes que suscriben a arrays del store
4. **`useMemo`** en filtros — `pending`, `byDate`, `bloqueadas`, `tareasSemana`
5. **Tabs con `hidden`** — `AgendaScreen` renderiza todos los tabs, muestra el activo con CSS
6. **`fetchAgendaEventos` acotado** — después de §2 backend

### Detalles de implementación

**`useShallow` pattern**
```javascript
import { useShallow } from 'zustand/react/shallow'

// Antes:
const agendaTareas = useStore(s => s.agendaTareas)
const agendaEventos = useStore(s => s.agendaEventos)

// Después (un solo useStore con useShallow):
const { agendaTareas, agendaEventos, updateAgendaTarea } = useStore(
  useShallow(s => ({
    agendaTareas: s.agendaTareas,
    agendaEventos: s.agendaEventos,
    updateAgendaTarea: s.updateAgendaTarea,
  }))
)
```

**Tabs con `hidden` CSS**
```jsx
// AgendaScreen: renderizar todos; ocultar inactivos con clase
{TABS.map(tabKey => (
  <div key={tabKey} hidden={activeTab !== tabKey} className="flex flex-1 min-h-0">
    {tabKey === 'hoy'     && <HoyTab />}
    {tabKey === 'mes'     && <MesTab />}
    {tabKey === 'tareas'  && <TareasTab />}
    {tabKey === 'revision' && <RevisionTab />}
  </div>
))}
```

Preserva scroll position y estado local de cada tab entre cambios.

**`useMemo` en filtros costosos**
```javascript
const pending = useMemo(() =>
  agendaTareas.filter(t => !t.completada && (!t.fecha_opcional || t.fecha_opcional <= cutoffISO))
    .sort((a, b) => (a.fecha_opcional || 'zzz').localeCompare(b.fecha_opcional || 'zzz')),
  [agendaTareas, cutoffISO]
)
```

**Ideas adicionales**
- `React.memo` en `MiniCalendar`, `AgendaTabs` — no dependen de estado dinámico.
- Lazy import de `RevisionTab` con `React.lazy` — es el tab menos usado y tiene la mayor cantidad de cálculos.

---

## §5 — Refactor de componentes

### Qué hay y qué falta

Hay duplicación significativa entre los 3 modales (`EventoModal`, `TareaModal`, `HorarioFacultadModal`): mismo `inputStyle`, mismo patrón header serif + footer Guardar/Cancelar, mismo `overlay`. `HoyTab` y `MesTab` duplican la lógica de grilla horaria. Los paneles laterales tienen el mismo ancho 260px + scroll + border.

### Nuevo archivo: `agendaUtils.js` (expandir el creado en P0)

```javascript
// Agregar a agendaUtils.js:
export const HOURS = Array.from({ length: 18 }, (_, i) => i + 6)  // 6–23
export const HOUR_HEIGHT = 56

export const timeToMinutes = (s) => {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  return h * 60 + (m || 0)
}

export const minutesToTop = (minutes, startHour = 6) =>
  ((minutes - startHour * 60) / 60) * HOUR_HEIGHT

export const buildByDate = (eventos, tareas, activeCalIds) => { /* ... */ }
```

Importar en `HoyTab`, `MesTab`, `RevisionTab` en lugar de redefinir.

### `AgendaModalShell.jsx`

```jsx
export default function AgendaModalShell({ title, onClose, onSave, saving, children }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSave?.()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, onSave])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="panel-strong rounded-2xl w-[480px] max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="serif italic text-[18px]">{title}</h2>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto panel-scroll px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### `HourGrid.jsx`

Parametrizable: recibe `startHour`, `endHour`, `hourHeight`, `items`, `onSlotClick`. Usado por `HoyTab` y vista Semana de `MesTab`.

### `hooks/useAgendaDay.js`

```javascript
export function useAgendaDay(initialDate = new Date()) {
  const [viewDate, setViewDate] = useState(initialDate)
  const viewISO = toLocalISODate(viewDate)
  const isToday = viewISO === toLocalISODate(new Date())
  const todayDow = (viewDate.getDay() + 6) % 7

  const prevDay = () => setViewDate(d => { const n = new Date(d); n.setDate(n.getDate()-1); return n })
  const nextDay = () => setViewDate(d => { const n = new Date(d); n.setDate(n.getDate()+1); return n })
  const goToday = () => setViewDate(new Date())

  return { viewDate, viewISO, isToday, todayDow, prevDay, nextDay, goToday }
}
```

### `AgendaPanel.jsx`

```jsx
export default function AgendaPanel({ title, children, side = 'left', className = '' }) {
  return (
    <aside className={`w-[260px] shrink-0 flex flex-col h-full overflow-y-auto panel-scroll border-${side} ${className}`}
      style={{ borderColor: 'var(--border)' }}>
      {title && <div className="label px-4 pt-4 pb-2">{title}</div>}
      {children}
    </aside>
  )
}
```

**Ideas adicionales**
- `QuickEventPopover.jsx`: popover inline de ~280px ancho, sin modal full-screen. Solo título + hora + calendario. Click fuera cierra. Aparece al lado del slot clickeado con `position: absolute` calculado desde el evento del mouse.
- Mover `HOURS_SEMANA` de `MesTab` a `agendaUtils.js` (hoy es `Array.from({length:16}, (_,i)=>i+7)` duplicado).

---

## §6 — Ctrl+M contextual (TweaksPanel por tab)

### Qué hay y qué falta

`TweaksPanel` (Ctrl+M) es global y muestra solo temas/tonos/fuentes. El roadmap pide un panel híbrido: fijo arriba + atajos contextuales del tab activo abajo.

### Implementación

**Paso 1: `agendaActiveTab` en store**
```javascript
// useStore.js
agendaActiveTab: 'hoy', // 'hoy' | 'mes' | 'tareas' | 'revision'
setAgendaActiveTab: (tab) => set({ agendaActiveTab: tab }),
```

`AgendaScreen` llama `setAgendaActiveTab(tab)` en cada cambio de tab.

**Paso 2: TweaksPanel lee el contexto**
```javascript
// TweaksPanel.jsx
const agendaActiveTab = useStore(s => s.agendaActiveTab)
const isAgenda = location.pathname === '/agenda'
// Si isAgenda: mostrar sección "Atajos Agenda" debajo de temas
```

**Paso 3: Definir atajos por tab**
```javascript
const AGENDA_SHORTCUTS = {
  hoy:     [['N','Nueva tarea'],['E','Nuevo evento'],['←/→','Día ant/sig'],['T','Ir a pendientes'],['B','Solo bloques']],
  mes:     [['N','Evento en día sel.'],['M/S','Mes / Semana'],['H','Ir a hoy'],['1–9','Toggle calendario']],
  tareas:  [['N','Nueva tarea'],['L','Nueva lista'],['1/2/3','Filtro estado'],['↑↓','Navegar tareas']],
  revision:[['←/→','Semana ant/sig'],['E','Exportar markdown']],
}
```

**Paso 4: `useAgendaKeyboard.js`**
Registra los atajos del tab activo. Ignorar cuando el foco está en un `input`, `textarea` o `[contenteditable]`.

```javascript
export function useAgendaKeyboard(tab, handlers) {
  useEffect(() => {
    const h = (e) => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return
      handlers[e.key]?.(e)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [tab, handlers])
}
```

**Ideas adicionales**
- Shortcut `1`–`4` global en `/agenda` para cambiar de tab (ya listado); implementar en `AgendaScreen` antes que los atajos por tab.
- Indicador visual en la grilla cuando se activa modo "solo bloques" (B): ocultar eventos y facultad, resaltar solo bloques de tareas.

---

## §7 — Accesibilidad y i18n

### Qué hay y qué falta

Los strings visible de la UI están mezclados: algunos en `i18n.js`, muchos hardcodeados en español en JSX. Los roles ARIA son inexistentes en la grilla y modales.

### Estrategia

Hacer i18n *antes* de ARIA — los strings son la base de los `aria-label`.

**i18n: strings faltantes a agregar en `i18n.js`**

| Clave | ES | EN |
|-------|----|----|
| `agendaTodoElDia` | "todo el día" | "all day" |
| `agendaEvento` | "Evento" | "Event" |
| `agendaTarea` | "Tarea" | "Task" |
| `agendaProximosEventos` | "Próximos eventos" | "Upcoming events" |
| `agendaMas` | "+{n} más" | "+{n} more" |
| `agendaSeleccionaLista` | "Seleccioná una lista" | "Select a list" |
| `agendaSinTareasLista` | "Sin tareas…" | "No tasks…" |
| `agendaDetalle` | "Detalle" | "Detail" |
| `agendaEliminarTarea` | "Eliminar tarea" | "Delete task" |
| `agendaHazClicTarea` | "Hacé clic en una tarea" | "Click on a task" |
| `agendaEditarEvento` | "Editar evento" | "Edit event" |
| `agendaEditarTarea` | "Editar tarea" | "Edit task" |
| `agendaGuardando` | "Guardando…" | "Saving…" |
| `agendaSemanaPasada` | "Semana pasada" | "Last week" |
| `agendaEstaSemana` | "Esta semana" | "This week" |

**ARIA en `AgendaTabs`**
```jsx
<div role="tablist" aria-label={t(lang, 'agendaTabs')}>
  {TABS.map(tab => (
    <button role="tab" aria-selected={activeTab === tab} aria-controls={`tabpanel-${tab}`} ...>
```

**ARIA en grilla HOY**
```jsx
<div role="grid" aria-label={t(lang, 'agendaGrillaHoraria')}>
  {HOURS.map(h => (
    <div role="row">
      <div role="rowheader">{h}:00</div>
      <div role="gridcell" aria-label={`${h}:00`} onClick={...} />
    </div>
  ))}
```

**Focus trap en modales** — copiar patrón de `CaptureModal.jsx`:
1. Al abrir, foco en primer input.
2. Tab/Shift+Tab ciclan dentro del modal.
3. Escape cierra (ya cubierto en §3).

**Ideas adicionales**
- `aria-live="polite"` en la zona de toast para que lectores de pantalla anuncien el éxito al guardar.
- `aria-label` en los chips de eventos/tareas del Mes con el título del ítem.
- Reemplazar los emojis 📅 ⏱ en `TareasTab` por iconos Lucide `CalendarDays` y `Timer` con `aria-label`.

---

## §8 — Menú contextual

### Qué hay y qué falta

No existe ningún menú contextual. Todo se hace desde CTAs en la topbar o botones dentro de panels.

### Implementación

**`AgendaContextMenu.jsx`** — componente base con portal:

```jsx
import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'

export default function AgendaContextMenu({ x, y, items, onClose }) {
  const ref = useRef()

  useEffect(() => {
    const h = (e) => {
      if (!ref.current?.contains(e.target)) onClose()
    }
    const k = (e) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => { document.addEventListener('mousedown', h) }, 0) // defer to skip trigger click
    window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k) }
  }, [onClose])

  // Adjust position to stay in viewport
  const style = { position: 'fixed', top: y, left: x, zIndex: 9999 }

  return createPortal(
    <div ref={ref} className="panel-strong rounded-xl shadow-xl border py-1 min-w-[180px]"
      style={{ ...style, borderColor: 'var(--border)', background: 'var(--bg)' }}>
      {items.map((item, i) => item === '---'
        ? <div key={i} className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
        : <button key={i} className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[var(--surface)] flex items-center gap-2"
            style={{ color: item.danger ? 'var(--danger)' : 'var(--text)' }}
            onClick={() => { item.action(); onClose() }}>
            {item.icon && <item.icon size={13} />}
            {item.label}
          </button>
      )}
    </div>,
    document.body
  )
}
```

**Hook `useContextMenu`**:
```javascript
function useContextMenu() {
  const [menu, setMenu] = useState(null) // { x, y, items }
  const open = (e, items) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items }) }
  const close = () => setMenu(null)
  return { menu, open, close }
}
```

Cada elemento interactivo (slot, evento, bloque, tarea, día) llama `open(e, items)` en `onContextMenu`.

**Dependencias**: §3 (panel derecho editable) y §5 (`AgendaModalShell`) deben estar antes para que "Editar" del menú contextual tenga a dónde navegar.

**Ideas adicionales**
- Submenús para "Mover a calendario ▶" y "Mover lista ▶": implementar como un segundo `AgendaContextMenu` anidado, posicionado a la derecha del ítem padre.
- "Copiar enlace al evento" — URL con `?evento=ID` que abre directamente el modal al cargar.
- Separar items destructivos (Eliminar) visualmente con color rojo + icono `Trash2`.

---

## §9 — Motion y micro-animaciones

### Principios

Sin librerías externas. Solo CSS: `transition`, `@keyframes`, `animation`. Todos los tiempos ≤ 200ms para no ralentizar el uso.

### Implementación por elemento

**Cambio de tab** — agregar clase con animación en el contenedor del tab:
```css
@keyframes tab-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tab-enter { animation: tab-in 120ms ease-out forwards; }
```
Aplicar `className="tab-enter"` con `key={activeTab}` en el contenedor del tab activo.

**Línea "ahora"** — pulso en el dot:
```css
@keyframes now-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.4); }
}
.now-dot { animation: now-pulse 2s ease-in-out infinite; }
```

**Agendar bloque** — el div del bloque aparece con scale:
```css
@keyframes block-appear {
  from { transform: scaleY(0.85); opacity: 0; }
  to   { transform: scaleY(1);    opacity: 1; }
}
.block-new { animation: block-appear 180ms cubic-bezier(0.34,1.56,0.64,1) forwards; }
```
Agregar `className="block-new"` con `key={tarea.hora_bloque}` en el bloque.

**Completar tarea en grilla** — strike + fade:
```css
@keyframes block-done {
  0%   { opacity: 1; }
  50%  { text-decoration: line-through; }
  100% { opacity: 0; height: 0; margin: 0; padding: 0; }
}
```
Aplicar solo cuando `tarea.completada` cambia a `true`; después de 200ms remover el bloque del DOM.

**Overlay modales** — `backdrop-filter: blur(4px)` ya funciona. Agregar fade-in al overlay:
```css
.modal-overlay { animation: fade-in 100ms ease-out; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
```

**Cambio de mes** — `key={`${year}-${month}`}` en el grid de celdas fuerza re-mount con animación CSS:
```css
.month-grid { animation: tab-in 120ms ease-out; }
```

**Ideas adicionales**
- Hover en chips del mes: `transform: scale(1.02)` + sombra ligera con `transition: 80ms`.
- Número del día "hoy" en HOY: border glow pulsante con `--accent`.
- Loading state en `fetchAgendaEventos`: shimmer skeleton en las celdas del mes mientras carga.

---

## §10 — Revisión: mejoras específicas

### Qué hay y qué falta

`RevisionTab` calcula todo en cliente. El endpoint `/agenda/revision` ya existe pero el frontend no lo usa — calcula la misma lógica con `agendaTareas` y `agendaEventos` del store. El % de tiempo planificado cuenta solo eventos timed, no bloques de tareas ni hábitos.

### Orden sugerido

1. **Conectar RevisionTab al endpoint** `/agenda/revision` — eliminar cálculos duplicados en cliente
2. **Incluir bloques de tareas en el %** — `hora_bloque + duracion_estimada` como minutos planificados
3. **Incluir hábitos en el %** — hábitos con `hora` del día, duración estimada (configurable, default 30 min)
4. **Denominador correcto** — "X h de Y h despierto" donde Y es configurable (default 16h)
5. **Mini sparkline SVG** — tareas completadas por día de la semana
6. **Comparar vs semana anterior** — llamar al endpoint dos veces
7. **Export markdown** — `Ctrl+E` o botón

### Detalles de implementación

**Sparkline SVG de completadas por día**
```jsx
function Sparkline({ data, width = 120, height = 32 }) {
  const max = Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / max) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      {data.map((v, i) => (
        <circle key={i} cx={(i/(data.length-1))*width} cy={height-(v/max)*height}
          r="2.5" fill="var(--accent)" opacity={v > 0 ? 1 : 0.2} />
      ))}
    </svg>
  )
}
```

**Export markdown**
```javascript
function exportMarkdown(semana, completadas, incompletas, porCalendario) {
  const lines = [
    `# Revisión semanal — ${semana}`,
    ``,
    `## Tareas`,
    `- ✅ Completadas: ${completadas.length}`,
    `- ⏳ Incompletas: ${incompletas.length}`,
    ``,
    `## Tiempo por calendario`,
    ...porCalendario.map(c => `- **${c.nombre}:** ${Math.round(c.minutos/60)}h`),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `revision-${semana}.md`; a.click()
  URL.revokeObjectURL(url)
}
```

**Ideas adicionales**
- **Racha de semanas productivas**: si el % de tiempo planificado supera un umbral (configurable, default 60%) X semanas seguidas, mostrar un badge de racha.
- **Resumen de hábitos en Revisión**: integrar datos de `habitosRegistros` para la semana — cuántos hábitos se cumplieron, cuál fue la racha más larga.
- **Semana más productiva del mes**: calculable con los datos del store, mostrar en panel derecho.

---

## §11 — Notificaciones

### Qué hay y qué falta

El badge 🔔 en TopBar es decorativo. No existe ningún sistema de notificaciones. Este es el subsistema más complejo del módulo — requiere nueva tabla, scheduler en backend, integración con browser Notification API y toggles en Settings.

### Arquitectura propuesta

```
agenda_recordatorios (tabla)
    ↓
scheduler FastAPI (lifespan, cada 60s)
    ↓ canal: 'browser'
Notification API del browser
    ↓ canal: 'telegram'
Bot (mensaje proactivo)
```

### Implementación por capa

**Base de datos**
```sql
CREATE TABLE IF NOT EXISTS agenda_recordatorios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo          TEXT NOT NULL,        -- 'evento' | 'tarea' | 'bloque' | 'habito' | 'revision'
    ref_id        INTEGER,              -- id del evento/tarea/habito
    disparar_en   TEXT NOT NULL,        -- ISO datetime local YYYY-MM-DDTHH:MM:00
    canal         TEXT NOT NULL DEFAULT 'browser',  -- 'browser' | 'telegram' | 'ambos'
    enviado       INTEGER NOT NULL DEFAULT 0,
    anticipacion_min INTEGER NOT NULL DEFAULT 15,
    creado_en     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recordatorios_disparar ON agenda_recordatorios(disparar_en, enviado);
```

**Reglas de disparo (backend)**

Al crear/modificar un evento → `disparar_en = fecha_inicio - anticipacion_min`.
Al crear un bloque → `disparar_en = hora_bloque - 5min`.
Al crear tarea con fecha → `disparar_en = fecha_opcional + T09:00`.
Revisión semanal → domingo 20:00 (fija, no por ref_id).

**Scheduler FastAPI**
```python
# main.py — lifespan
from contextlib import asynccontextmanager
import asyncio

async def _scheduler_loop():
    while True:
        await asyncio.sleep(60)
        due = crud.get_recordatorios_due()
        for r in due:
            if r['canal'] in ('browser', 'ambos'):
                # guardar en cola para que el frontend la consuma via GET
                crud.marcar_recordatorio_listo(r['id'])
            if r['canal'] in ('telegram', 'ambos'):
                # llamar al bot (webhook o shared queue)
                pass

@asynccontextmanager
async def lifespan(app):
    asyncio.create_task(_scheduler_loop())
    yield

app = FastAPI(lifespan=lifespan)
```

**Frontend: polling o SSE**

Opción A (simple): `setInterval` cada 30s → `GET /agenda/recordatorios/pending` → si hay items, mostrar notificación browser y actualizar badge.

Opción B (mejor): Server-Sent Events `GET /agenda/recordatorios/stream` — evita polling.

Empezar con opción A.

**Badge count**
```javascript
// store: agendaNotificacionesPending (número)
// TopBar: mostrar count si > 0
```

**Ideas adicionales**
- **"Snooze" de notificación**: botón en la notificación del browser que retrasa 10 min (PATCH `disparar_en += 10min`).
- **Resumen matutino automático**: a las 08:00, enviar al bot el plan del día (eventos + tareas bloqueadas + hábitos con hora). Configurable.
- **Silenciar horario**: rango "no molestar" (p.ej. 23:00–08:00) configurable en Settings.

---

## §12 — Bot: pendiente menor

### Qué hay y qué falta

El bot está muy completo. Los ítems pendientes son mejoras de UX conversacional, no features nuevas.

### Implementación

**Reintentos con backoff exponencial**
```python
# bot.py: al arrancar, en lugar de un solo healthcheck
import asyncio

async def _wait_for_backend(max_attempts=10):
    for attempt in range(max_attempts):
        try:
            async with aiohttp.ClientSession() as s:
                await s.get(f"{API_BASE}/habitos", timeout=aiohttp.ClientTimeout(total=3))
            return True
        except Exception:
            wait = min(2 ** attempt, 60)
            logger.warning(f"Backend no disponible, reintentando en {wait}s...")
            await asyncio.sleep(wait)
    logger.error("Backend no disponible después de varios intentos. El bot arranca sin API.")
    return False
```

**`/pendientes <lista>`**
```python
# agenda_handlers.py
async def pendientes(update, context):
    lista_filter = ' '.join(context.args).lower() if context.args else None
    tareas = await _get_tareas_pendientes()
    if lista_filter:
        tareas = [t for t in tareas if lista_filter in (t.get('lista_nombre') or '').lower()]
    # ... formato existente
```

**Nota conversacional post-marcado**

Al presionar ✓ o ½ en `/habitos`, responder con un InlineKeyboard de dos botones: `[📝 Agregar nota]` `[✖ Saltar]`. Si elige agregar nota, entrar en `ConversationHandler` step `esperando_nota_habito`.

**Check-in nocturno configurable**

Guardar hora y opt-out en `fin_config` (tabla ya existente):
```python
# GET /fin/config → { "checkin_hora": "21:00", "checkin_activo": "1" }
# /config_checkin HH:MM — actualiza hora
# /checkin off | on — toggle
```

El `job_queue` reschedule usando los valores de config al arrancar y al recibir el comando.

**Ideas adicionales**
- **`/hoy --compact`**: versión condensada del resumen sin detalles (solo conteos).
- **`/stats`**: resumen de la semana desde el bot (llama al endpoint de revisión).
- **Detectar hora en `/tarea`**: si el texto incluye "a las 10:30", setear `hora_opcional` además de la fecha.

---

## §13 — Cross-módulo

### Qué hay y qué falta

Los módulos son silos. La TopBar tiene un input de búsqueda visual pero sin handler. `CaptureModal` (Bóveda) no tiene tab Agenda. No hay vínculos entre entidades de distintos módulos.

### Orden sugerido

1. **Búsqueda TopBar** — mayor impacto; base para todo lo demás
2. **Tab Agenda en CaptureModal** — reutiliza `EventoModal` / `TareaModal`
3. **`hoja_id` FK en eventos** — vínculo Bóveda ↔ Agenda
4. **Deep link Finanzas ↔ Agenda** — menor prioridad

### Implementación

**Búsqueda TopBar**

```javascript
// App.jsx o TopBar.jsx: estado global de búsqueda
const [query, setQuery] = useState('')
const [searchResults, setSearchResults] = useState(null)

// Debounce 300ms → llamar al endpoint nuevo GET /agenda/buscar?q=
// Mostrar dropdown con secciones: "Eventos" / "Tareas" / resultado vacío
// Click en resultado: navegar a /agenda?tab=mes&evento=ID o /agenda?tab=tareas&tarea=ID
```

El endpoint `GET /agenda/buscar?q=` hace `LIKE '%q%'` en `titulo` y `descripcion` de eventos y tareas. SQLite FTS5 puede agregarse después si el rendimiento lo requiere.

**Tab Agenda en `CaptureModal`**

Agregar tab "Agenda" con dos botones (Evento / Tarea) que renderizan `EventoModal` / `TareaModal` inline dentro del CaptureModal. Requiere que ambos modales sean componentes sin su propio overlay (recibir `embedded=true`).

**`hoja_id` en `agenda_eventos`**

```python
# database.py _apply_migrations:
ev_cols = _get_columns(cursor, 'agenda_eventos')
if 'hoja_id' not in ev_cols:
    cursor.execute("ALTER TABLE agenda_eventos ADD COLUMN hoja_id INTEGER REFERENCES hojas(id)")
```

UI: en `EventoModal`, campo opcional "Vincular nota" con selector de hojas recientes. En panel derecho del evento, mostrar link a `/hoja/{id}`.

**Ideas adicionales**
- **Tarea desde Bóveda**: prefix `t:` en `CaptureModal` ya crea tarea; agregar soporte para `e:` también (hoy solo bot).
- **Hábito → Agenda HOY**: los hábitos con hora ya aparecen en la grilla. Agregar link "Ver en Hábitos" en el bloque del hábito.
- **Finanzas → Agenda**: en `MovementModal`, campo "¿Asociar recordatorio?" que crea tarea tipo "Pagar {descripción}" con fecha del movimiento.

---
