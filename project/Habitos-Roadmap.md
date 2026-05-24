# Hábitos — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Hábitos.
Cuando algo se complete, **mover la descripción actualizada a `Habitos.md`**.

---

## Bugs P0

- [ ] IDs mock offline `h_*`, `reg_*`: sin reconciliación al reconectar API; posibles duplicados si se crearon hábitos offline

---

## Bot — Pendiente menor

- [ ] `/habitos` mostrar también hábitos no programados hoy con estado "no toca hoy" (contexto extra)

---

## Frontend — UX e interacción

- [ ] Agrupar hábitos por categoría en panel izquierdo (headers colapsables)
- [ ] Orden manual de hábitos (drag handle + campo `orden` en BD — requiere migración + DnD)
- [ ] Skeleton loading mientras `fetchHabitos` (requiere `habitosFetchStatus` en store)

## Frontend — Grilla HOY

- [ ] Anillo de progreso SVG circular alrededor del número del día actual en header grilla *(implementado parcialmente — mejorar con animación de entrada)*

## Frontend — Modales

- [ ] `CompletarModal`: propagar animación a celda origen al cerrar

## Frontend — Rendimiento

- [ ] Selectores Zustand finos con `useShallow` en componentes que suscriben a slices completos *(pendiente en tabs individuales; HabitosScreen ya usa useShallow)*
- [ ] Code-split avanzado: preload de ProgresoTab al hover en el tab *(lazy básico ya implementado)*
- [ ] Virtualización vertical de grilla HOY si > 25 hábitos

## Frontend — Accesibilidad

- [ ] Contraste celda parcial (amarillo `--warning` sobre fondo oscuro → verificar WCAG AA)

## Frontend — Integraciones

- [ ] `Ctrl+M` contextual en Hábitos: panel híbrido apariencia + atajos por tab
- [ ] `ContextMenu` en lista izq y celda grilla HOY

---

## Backend

- [ ] Campo `orden INTEGER` en tabla `habitos` para reordenamiento manual
- [ ] Batch `PUT /habitos/registros` — store no lo consume aún; solo existe el endpoint

---

## Notificaciones

- [ ] Tabla `notificaciones_pendientes (modulo, ref_id, fire_at, canal, enviado)`
- [ ] Scheduler (cron o `lifespan` FastAPI cada 1 min)
- [ ] Tipos: recordatorio por `habito.hora` (usa campo `notificar`/`minutos_antes` ya en BD), resumen nocturno, racha en riesgo, momentum negativo
- [ ] UX campana: agrupar "Pendientes hoy", "Esta tarde", "Rachas en riesgo"

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
