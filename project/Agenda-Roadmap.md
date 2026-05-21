# Agenda — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Agenda.
Cuando algo se complete, **mover la descripción actualizada a `Agenda.md`**.

---

## Bot — Pendiente menor

- [ ] Reintentos automáticos con backoff si el backend arranca después del bot (hoy imprime advertencia pero sigue)
- [ ] `/pendientes <lista>` — filtro por nombre de lista
- [ ] Nota conversacional post-marcado: preguntar "¿Nota?" como paso extra tras presionar ✓/½ (hoy existe `/nota` como comando separado)
- [ ] Check-in nocturno configurable: hora y opt-out desde el bot sin tocar código

---

## Frontend — Bugs P0

- [ ] `style2={{...}}` en `MesTab.jsx` L306 → cambiar a `style`; bordes de hora en Semana no aplican
- [ ] `toISOString().slice(0,10)` → extraer `toLocalISODate()` en `agendaUtils.js`; TZ Argentina (−3h) puede desfasar un día
- [ ] `useEffect` now-line: deps `[]` cierra sobre `today` del primer render; si la app queda abierta pasada la medianoche la línea usa el día viejo
- [ ] `useEffect` limpiar bloques expirados: deps `[]` puede no limpiar si las tareas llegan async después del fetch
- [ ] Fix desmarcar hábito en Agenda HOY: usar `deleteHabitoRegistro` en lugar de upsert con `valor: 0`
- [ ] `ON DELETE CASCADE` en `agenda_calendarios` → eventos (hoy borra calendario pero deja eventos huérfanos)

## Frontend — Interacción y UX

- [ ] Click en slot vacío HOY → `QuickEventPopover` o `EventoModal` prellenado con esa hora
- [ ] Click en bloque de evento/tarea en grilla → seleccionar + mostrar en panel derecho editable
- [ ] Panel derecho HOY: detalle editable del ítem seleccionado (hoy son cards estáticas)
- [ ] Panel derecho Mes: botón "Editar" que abre modal (hoy solo lectura)
- [ ] Duplicar evento
- [ ] Toggle descompletar tarea desde la web
- [ ] Confirmación antes de eliminar evento/tarea (hoy es delete directo)
- [ ] `Ctrl+Enter` guardar en `EventoModal` / `TareaModal` / `HorarioFacultadModal`
- [ ] `Escape` cierra modales (hoy solo botón X)
- [ ] Toast al guardar en modales de Agenda (`showToast` existe en store, no se usa aquí)
- [ ] Navegación de día (← →) con estado `viewDate` en HOY
- [ ] Tab activo en URL (`/agenda?tab=mes`) — se pierde al F5
- [ ] Vista Semana: chips de tareas + capa facultad (hoy solo eventos timed en columnas)
- [ ] Layout columnas para eventos solapados en grilla HOY (hoy se superponen con `position: absolute`)
- [ ] Drawer derecho en `< xl`: sheet desde la derecha al seleccionar evento/tarea
- [ ] Colapsar panel izquierdo HOY con ≡; FAB "pendientes" en móvil
- [ ] Drag-and-drop de bloques (`hora_bloque` / `fecha_inicio`)
- [ ] Modo "focus": ocultar facultad / hábitos / eventos all-day
- [ ] Inbox: lista especial "sin fecha" siempre visible en panel izq

## Frontend — Rendimiento y estado

- [ ] Selectores Zustand sin granularidad: usar `useShallow` o selectores derivados para no re-renderizar Agenda ante cambios de otros módulos
- [ ] Sin `useMemo` en filtros (`pending`, `byDate`, `tareasLista`) — recalculados en cada render
- [ ] Tabs desmontados al cambiar → perder scroll y selección; reemplazar por `hidden` CSS
- [ ] `fetchAgendaEventos` sin rango: carga todo el histórico; acotar al mes visible + refetch al navegar
- [ ] Extraer `agendaUtils.js` (timeToMinutes, minutesToTop, buildByDate, toLocalISODate) y `agendaConstants.js` (HOURS, HOUR_HEIGHT)

## Frontend — Accesibilidad y i18n

- [ ] `role="tablist"`, `aria-selected`, `tabpanel`, `aria-controls` en `AgendaTabs`
- [ ] `role="grid"` / `gridcell` o `aria-label` por franja horaria en grilla HOY
- [ ] `role="dialog"`, `aria-modal`, focus trap en modales (copiar patrón de `CaptureModal`)
- [ ] `aria-checked` en checkboxes de tareas

Strings hardcodeados a mover a `i18n.js`:
- [ ] `EventoModal`: "Editar evento"
- [ ] `TareaModal`: "Editar tarea", "Guardando…"
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
- [ ] Atajos Revisión: `← →` semana anterior/siguiente, `E` exportar resumen como markdown
- [ ] Global `/agenda`: `1–4` cambiar tab, `F` abrir Facultad, `Ctrl+Enter` en modal
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

- [ ] Cambio de tab: fade 120ms + `translateY(4px)` ligero
- [ ] Agendar bloque: `scaleY(0.95→1)` + borde dashed draw
- [ ] Completar tarea en grilla: strike-through 200ms + fade out del bloque
- [ ] Línea "ahora": pulso suave cada 2s en el dot con keyframes `--accent`
- [ ] Cambio de mes en Mes: crossfade chips con `key={year-month}` en grid
- [ ] Overlay modales Agenda: backdrop blur (como `TweaksPanel`)

## Frontend — Refactor componentes

- [ ] `AgendaModalShell`: unificar `inputStyle`, header serif, footer Guardar/Cancelar, `Escape` + `Ctrl+Enter` — hoy duplicado en los 3 modales
- [ ] `HourGrid.jsx`: grilla reutilizable HOY + Semana parametrizable; corrige bug `style2` y agrega click en celdas
- [ ] `hooks/useAgendaDay.js` (viewDate, todayISO, filtros del día) y `hooks/useAgendaKeyboard.js`
- [ ] `QuickEventPopover.jsx` (inline sin modal full-screen)
- [ ] `AgendaPanel.jsx` (aside 260px con título + scroll, reutilizable entre tabs)

## Frontend — Revisión (mejoras específicas)

- [ ] Incluir bloques de tareas en % tiempo planificado (hoy solo eventos)
- [ ] Incluir hábitos en % tiempo planificado
- [ ] Denominador de tiempo planificado: mostrar "X h de Y h despierto" con supuesto configurable (hoy usa 7×24×60)
- [ ] Barra de % con leyenda accesible (no solo color)
- [ ] Mini sparkline SVG "tareas completadas por día" en la semana
- [ ] Export PDF/markdown de la semana
- [ ] Comparar semana N vs N-1

---

## Backend

**Alta prioridad**
- [ ] `GET /agenda/eventos` con rango acotado por defecto (mes actual ±1 si no pasan params); índice `CREATE INDEX idx_eventos_inicio ON agenda_eventos(fecha_inicio)`
- [ ] Motor de recurrencia: expandir `se_repite` + `regla_repeticion` (RRULE subset) — hoy el toggle se guarda pero no genera ocurrencias
- [ ] `ON DELETE CASCADE` en calendario → eventos (ver bug conocido)
- [ ] `GET /agenda/revision?semana=YYYY-WNN` → JSON con completadas, vencidas, minutos por calendario (mover lógica de `RevisionTab` al servidor; necesario para bot `/revision`)
- [ ] `creado_en`, `actualizado_en` en tareas/eventos (para orden por creación y auditoría)

**Media prioridad**
- [ ] `POST /agenda/tareas` aceptar `hora_bloque` en create (hoy solo PATCH)
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
- [ ] Drag-and-drop de bloques entre días en vista Semana
- [ ] Modo focus Agenda: ocultar facultad / hábitos / eventos all-day
- [ ] Variante "alto contraste" de temas para la grilla

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Agenda.md`.*
