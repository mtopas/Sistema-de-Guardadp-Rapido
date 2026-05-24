import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { toLocalISODate } from './agendaUtils'

/**
 * Returns events and tasks scheduled for a given Date object.
 * Only events from active calendars are included.
 *
 * Usage:
 *   const { eventos, tareas, bloques } = useAgendaDay(new Date())
 */
export function useAgendaDay(date) {
  const agendaEventos     = useStore(s => s.agendaEventos)
  const agendaTareas      = useStore(s => s.agendaTareas)
  const agendaCalendarios = useStore(s => s.agendaCalendarios)

  const iso = toLocalISODate(date)

  const activeCalIds = useMemo(
    () => new Set(agendaCalendarios.filter(c => c.activo).map(c => c.id)),
    [agendaCalendarios],
  )

  const eventos = useMemo(
    () => agendaEventos.filter(e => {
      if (e.calendario_id && !activeCalIds.has(e.calendario_id)) return false
      return e.fecha_inicio?.slice(0, 10) === iso
    }),
    [agendaEventos, activeCalIds, iso],
  )

  const tareas = useMemo(
    () => agendaTareas.filter(t => t.fecha_opcional === iso),
    [agendaTareas, iso],
  )

  const bloques = useMemo(
    () => agendaTareas.filter(t => t.hora_bloque && t.fecha_opcional === iso),
    [agendaTareas, iso],
  )

  return { iso, eventos, tareas, bloques }
}
