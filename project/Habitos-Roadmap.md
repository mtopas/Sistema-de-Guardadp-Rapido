# Hábitos — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Hábitos.
Cuando algo se complete, **mover la descripción actualizada a `Habitos.md`**.

---

## Bugs P0

- [ ] Desmarcar hábito en Agenda HOY: usar `deleteHabitoRegistro` en lugar de upsert `valor: 0` — deja registros fantasma
- [ ] `maxStreak` en `HabitosRightPanel` y `ProgresoTab`: agregar `calcMaxStreak(habito, map)` en `habitosUtils.js` que respete `isScheduled`; reemplazar el algoritmo calendar-day simple actual
- [ ] `window.confirm` en eliminar hábito → modal estilizado + toast undo 5s
- [ ] IDs mock offline `h_*`, `reg_*`: sin reconciliación al reconectar API; posibles duplicados

---

## Bot — Pendiente menor

- [ ] Nota conversacional post-marcado: después de presionar ✓/½ en hábito, preguntar "¿Nota?" como paso extra (hoy existe `/nota` como comando separado)
- [ ] Check-in nocturno configurable: hora y opt-out sin tocar código
- [ ] `/habitos` mostrar también hábitos no programados hoy con estado "no toca hoy" (contexto extra)

---

## Frontend — UX e interacción

- [ ] Check rápido en `HabitosLeftPanel`: checkbox en fila sin abrir grilla (como Agenda HOY)
- [ ] UI para archivar/desactivar hábito: campo `activo` existe en BD y API, sin UI dedicada
- [ ] Filtro "Solo pendientes hoy" en panel izquierdo
- [ ] Agrupar hábitos por categoría en panel izquierdo (headers colapsables)
- [ ] Orden manual de hábitos (drag handle + campo `orden` en BD — requiere migración)
- [ ] Empty state con ilustración ligera + CTA en panel izquierdo
- [ ] Skeleton loading mientras `fetchHabitos`

## Frontend — Grilla HOY

- [ ] Columna del día actual con borde vertical accent en toda la columna
- [ ] Leyenda bajo grilla: guión / vacío / parcial / total
- [ ] Hover en celda: preview fecha + nota en tooltip unificado
- [ ] Navegación por teclado en grilla (flechas + Enter, `1`/`2` total/parcial)
- [ ] Al cambiar mes: scroll automático a columna 1 o a hoy
- [ ] Anillo de progreso SVG circular alrededor del número del día actual en header
- [ ] Micro-animación al completar: celda "pulsa" y rellena (parcial = medio fill); respetar `prefers-reduced-motion`

## Frontend — Modales

- [ ] `CompletarModal`: flip arriba si no hay espacio abajo; atajos `1` total, `2` parcial, `Enter` repite último; propagar animación a celda origen
- [ ] `NuevoHabitoModal`: `Ctrl+Enter` guardar; preview "Toca: Lun, Mié, Vie · 07:00" en vivo; plantillas (Meditación, Ejercicio, Lectura); toggle "Activo" en modo edición; autocomplete categoría con valores ya usados

## Frontend — Tabs restantes

**ProgresoTab**
- [ ] Filtro por categoría (chips derivados de `habitos.map(c => c.categoria)`)
- [ ] Afirmaciones de identidad con stats reales ("Meditaste 22 de 30 días programados")
- [ ] Click en celda del heatmap → salta a HOY de ese mes
- [ ] Lazy mount (no calcular heatmap hasta que el tab sea visible)
- [ ] Cards "Mejor hábito del mes" / "Más fallas"

**HistorialTab**
- [ ] Ocultar `HabitosLeftPanel` en Historial o fusionar sidebars (hoy ocupa 480px de ancho en laptop)
- [ ] Selector trimestre / año
- [ ] Marca "racha rota acá" (⚡ en el día donde `calcStreak` reinicia)
- [ ] Click en día → modal "Detalle del 12/05" con lista de estados de todos los hábitos
- [ ] Tooltip notas: hoy `pointer-events-none` impide copiar; permitir hover sticky

**HabitosRightPanel**
- [ ] Drawer deslizable en `< xl` al seleccionar hábito
- [ ] Sparkline mini últimos 30 días por hábito
- [ ] Eliminar con modal estilizado + toast undo 5s

## Frontend — Rendimiento

- [ ] `useMemo` en `buildRegistrosMap` (hoy se recalcula en cada render de todos los tabs)
- [ ] Selectores Zustand finos con `useShallow`
- [ ] `fetchHabitosRegistros` con rango al montar `/habitos` (últimos 120 días); hoy carga todos sin rango
- [ ] Code-split: `React.lazy(() => import('./ProgresoTab'))` y `HistorialTab`
- [ ] Virtualización vertical de grilla HOY si > 25 hábitos
- [ ] Mover `habitosTab`, `habitosSelectedId` al store (hoy solo local state en `HabitosScreen`)
- [ ] `habitosFetchStatus: 'idle' | 'loading' | 'error'` en store para UI skeleton

## Frontend — Accesibilidad

- [ ] `role="grid"` + `aria-selected` en grilla HOY
- [ ] `aria-live="polite"` al completar: "Meditar completado, racha 5"
- [ ] `focus-visible` en celdas de la grilla
- [ ] `prefers-reduced-motion`: desactivar animación de completado
- [ ] `aria-label` en navegación de mes y botón cerrar modal
- [ ] Contraste celda parcial (amarillo `--warning` sobre fondo oscuro → verificar WCAG AA)

## Frontend — Integraciones

- [ ] `CaptureModal`: habilitar tab Hábitos (hoy `enabled: false`)
- [ ] TopBar campana: lista de pendientes hoy; click → `/habitos` con hábito seleccionado
- [ ] Bottom nav móvil: cuarto icono (Target) → `/habitos` (hoy solo Home y Settings)
- [ ] `Ctrl+M` contextual en Hábitos: panel híbrido apariencia + atajos por tab (ver §11 del Habitos.md original)
- [ ] `ContextMenu` en lista izq y celda grilla HOY (ver §12 del Habitos.md original)

---

## Backend

- [ ] Validar `valor` ∈ {0.5, 1.0} — hoy acepta cualquier float; rechazar `0`
- [ ] `GET /habitos/pendientes-hoy` → lista filtrada por día + registros del día (bot + campana)
- [ ] `GET /habitos/resumen?fecha=` → hábitos + estado hoy + racha (menos lógica en bot/front)
- [ ] `GET /habitos/{id}/stats` → racha_actual, racha_max_programada, pct_mes, pct_mes_anterior
- [ ] Soft delete / campo `archivado_en` (pausar sin perder historial)
- [ ] Campo `orden INTEGER` en tabla `habitos` para reordenamiento manual
- [ ] Campos `notificar INTEGER DEFAULT 0` y `minutos_antes INTEGER` para recordatorios futuros
- [ ] Batch `PUT /habitos/registros` (marcar varios días o importar)

---

## Notificaciones

- [ ] Tabla `notificaciones_pendientes (modulo, ref_id, fire_at, canal, enviado)`
- [ ] Scheduler (cron o `lifespan` FastAPI cada 1 min)
- [ ] Tipos: recordatorio por `habito.hora`, resumen nocturno, racha en riesgo, momentum negativo
- [ ] UX campana: agrupar "Pendientes hoy", "Esta tarde", "Rachas en riesgo"
- [ ] Opción: recordatorio solo para hábitos **sin** hora (los con hora ya aparecen en Agenda HOY)

---

## Producto — ideas de largo plazo

- [ ] Export CSV / JSON de registros por rango
- [ ] Import desde Loop, Habitica, CSV genérico
- [ ] Vista anual tipo "GitHub contributions" (52×7)
- [ ] Pausar vacaciones: rango de fechas donde `isScheduled` → false
- [ ] Meta semanal ("3 de 5 días" como nuevo `frecuencia_tipo`)
- [ ] Widget PWA / pantalla de inicio con % del día
- [ ] Hábito ancla: pin en top de lista izquierda
- [ ] Modo focus: solo hábitos pendientes hoy, pantalla limpia
- [ ] Dashboard: hábito más consistente del trimestre, día de la semana más débil

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Habitos.md`.*
