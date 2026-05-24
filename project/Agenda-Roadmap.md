# Agenda — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Agenda.
Cuando algo se complete, **mover la descripción actualizada a `Agenda.md`**.

---

## Bot — Pendiente menor

- [ ] `/habitos` mostrar también hábitos no programados hoy con estado "no toca hoy" (contexto extra)

---

## Frontend — Interacción y UX

**Baja prioridad**
- [ ] Colapsar panel izquierdo HOY con ≡; FAB "pendientes" en móvil

---

## Frontend — Menú contextual (parcialmente hecho)

`AgendaContextMenu.jsx` existe y está integrado en chips de **Mes** (Editar / Duplicar / Eliminar). Pendientes:

- [ ] **Slot vacío HOY/Semana:** Nuevo evento aquí · Nueva tarea bloqueada · Pegar bloque copiado
- [ ] **Bloque grilla HOY:** Completar · Cambiar duración · Quitar bloque · Ir a tarea
- [ ] **Hábito en grilla HOY:** Ir a `/habitos` · Marcar total/parcial (submenú)
- [ ] **Día Mes:** Nuevo evento · Nueva tarea con fecha · Ver en HOY
- [ ] **Lista (TareasTab):** Renombrar · Cambiar color · Vaciar completadas · Eliminar
- [ ] **Calendario (MesTab):** Activar/desactivar · Solo este · Editar color

---

## Backend

- [ ] Validación Pydantic: `fecha_inicio < fecha_fin` (model_validator cross-field)
- [ ] Adjuntos en eventos (ruta `uploads/`)
- [ ] Ubicación / enlace meet en descripción del evento

---

## Notificaciones (sin implementar)

- [ ] Tabla `agenda_recordatorios (id, tipo, ref_id, disparar_en, canal, enviado, anticipacion_min)` + índice en `disparar_en`
- [ ] Reglas de disparo: bloque → `hora_bloque - 5 min`; evento → `fecha_inicio - 15 min`; tarea con fecha → 09:00 del día; hábito con hora → mismo slot; revisión → dom 20:00
- [ ] Store: `agendaNotificaciones`, `fetchAgendaNotificaciones()`, `marcarLeida(id)`
- [ ] Settings `/settings`: toggles por canal y anticipación global
- [ ] Worker scheduler en backend (`lifespan` FastAPI o cron cada 1 min) → SELECT due → enviar por canal

---

## Cross-módulo — pendiente profundo

- [ ] **Bóveda ↔ Agenda FK:** click derecho en evento → "Vincular nota" (`hoja_id` FK en `agenda_eventos`); actualmente solo hay widget de display en `RightPanel`
- [ ] **Finanzas ↔ Agenda deep-link:** campo `movimiento_id` FK en `agenda_tareas` para vincular tarea "Pagar X" a un movimiento específico; actualmente solo hay matching por keyword

---

## Producto — largo plazo

- [ ] Plantillas de semana (bloques recurrentes de tareas)
- [ ] Modo focus: ocultar facultad / hábitos / eventos all-day
- [ ] Variante "alto contraste" de temas para la grilla
- [ ] Semana como tab independiente (actualmente está embebida en `MesTab`)

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Agenda.md`.*
