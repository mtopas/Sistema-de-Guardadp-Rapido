import { create } from 'zustand'
import { get, post, patch, del } from '../lib/api'
import { addDays, addMonths, toISODate } from '../lib/dates'
import { reportError, toast } from './ui'

let tmp = -1

const sortEv = (arr) => [...arr].sort((a, b) => (a.fecha_inicio || '').localeCompare(b.fecha_inicio || ''))

export const useAgenda = create((set, g) => ({
  loaded: false,
  calendarios: [],
  eventos: [],
  rango: null, // { desde, hasta } ya cargado
  listas: [],
  tareas: [],
  horario: [],
  // UI persistente entre montajes
  tab: 'hoy',
  setTab: (tab) => set({ tab }),
  dia: toISODate(),
  setDia: (dia) => set({ dia }),
  refMes: toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  setRefMes: (refMes) => set({ refMes }),
  eventoModal: null,
  openEvento: (data = {}) => set({ eventoModal: data }),
  closeEvento: () => set({ eventoModal: null }),
  tareaModal: null,
  openTarea: (data = {}) => set({ tareaModal: data }),
  closeTarea: () => set({ tareaModal: null }),

  fetchBase: async () => {
    try {
      const hasta = toISODate(addMonths(new Date(), 3))
      const [calendarios, listas, tareas, horario] = await Promise.all([
        get('/agenda/calendarios'),
        get('/agenda/listas'),
        get('/agenda/tareas', { hasta }),
        get('/agenda/horario-facultad'),
      ])
      set({ calendarios, listas, tareas, horario, loaded: true })
    } catch (e) {
      set({ loaded: true })
    }
  },
  ensureRange: async (desde, hasta, force = false) => {
    const r = g().rango
    if (!force && r && desde >= r.desde && hasta <= r.hasta) return
    const d = r && !force ? (desde < r.desde ? desde : r.desde) : desde
    const h = r && !force ? (hasta > r.hasta ? hasta : r.hasta) : hasta
    try {
      const eventos = await get('/agenda/eventos', { desde: d, hasta: h })
      set({ eventos: sortEv(eventos), rango: { desde: d, hasta: h } })
    } catch { /* offline: conserva lo cargado */ }
  },
  refreshEventos: async () => {
    const r = g().rango
    if (r) await g().ensureRange(r.desde, r.hasta, true)
  },
  refreshTareas: async (hasta) => {
    try {
      const h = hasta || toISODate(addMonths(new Date(), 3))
      set({ tareas: await get('/agenda/tareas', { hasta: h }) })
    } catch { /* offline */ }
  },
  buscar: (q) => get('/agenda/buscar', { q }),

  // ── Calendarios ──
  crearCalendario: async (data) => {
    try {
      const c = await post('/agenda/calendarios', data)
      set((s) => ({ calendarios: [...s.calendarios, c] }))
      return c
    } catch (e) { reportError(e) }
  },
  editarCalendario: async (id, data) => {
    set((s) => ({
      calendarios: s.calendarios.map((c) => (c.id === id ? { ...c, ...data } : c)),
      eventos: s.eventos.map((e) =>
        e.calendario_id === id
          ? { ...e, calendario_color: data.color ?? e.calendario_color, calendario_nombre: data.nombre ?? e.calendario_nombre }
          : e,
      ),
    }))
    try { await patch(`/agenda/calendarios/${id}`, data) } catch (e) { reportError(e) }
  },
  borrarCalendario: async (id, moverA) => {
    try {
      if (moverA) await patch(`/agenda/calendarios/${id}/reasignar-eventos`, undefined, { destino_id: moverA })
      await del(`/agenda/calendarios/${id}`)
      set((s) => ({ calendarios: s.calendarios.filter((c) => c.id !== id) }))
      await g().refreshEventos()
      toast('Calendario eliminado')
    } catch (e) { reportError(e) }
  },

  // ── Eventos ──
  crearEvento: async (data) => {
    const cal = g().calendarios.find((c) => c.id === data.calendario_id)
    const temp = { id: tmp--, ...data, calendario_color: cal?.color, calendario_nombre: cal?.nombre, _pending: true }
    set((s) => ({ eventos: sortEv([...s.eventos, temp]) }))
    try {
      const ev = await post('/agenda/eventos', data)
      set((s) => ({ eventos: sortEv(s.eventos.map((e) => (e.id === temp.id ? ev : e))) }))
      if (data.se_repite) await g().refreshEventos()
      toast('Evento guardado')
      return ev
    } catch (e) {
      if (!e.network) set((s) => ({ eventos: s.eventos.filter((x) => x.id !== temp.id) }))
      reportError(e)
    }
  },
  editarEvento: async (id, data) => {
    const prev = g().eventos.find((e) => e.id === id)
    const cal = data.calendario_id ? g().calendarios.find((c) => c.id === data.calendario_id) : null
    set((s) => ({
      eventos: sortEv(s.eventos.map((e) => (e.id === id ? { ...e, ...data, ...(cal ? { calendario_color: cal.color, calendario_nombre: cal.nombre } : {}) } : e))),
    }))
    try {
      const ev = await patch(`/agenda/eventos/${id}`, data)
      set((s) => ({ eventos: sortEv(s.eventos.map((e) => (e.id === id ? ev : e))) }))
      toast('Evento actualizado')
      return ev
    } catch (e) {
      if (!e.network && prev) set((s) => ({ eventos: sortEv(s.eventos.map((x) => (x.id === id ? prev : x))) }))
      reportError(e)
    }
  },
  borrarEvento: async (id) => {
    const prev = g().eventos
    set((s) => ({ eventos: s.eventos.filter((e) => e.id !== id) }))
    try {
      await del(`/agenda/eventos/${id}`)
      toast('Evento eliminado')
    } catch (e) {
      if (!e.network) set({ eventos: prev })
      reportError(e)
    }
  },
  detenerSerie: async (tipo, serieId) => {
    try {
      await del(`/agenda/series/${tipo}/${serieId}`)
      toast('No se generarán más repeticiones')
      if (tipo === 'evento') await g().refreshEventos()
      else await g().refreshTareas()
    } catch (e) { reportError(e) }
  },

  // ── Listas ──
  crearLista: async (data) => {
    try {
      const l = await post('/agenda/listas', data)
      set((s) => ({ listas: [...s.listas, l] }))
      return l
    } catch (e) { reportError(e) }
  },
  editarLista: async (id, data) => {
    set((s) => ({
      listas: s.listas.map((l) => (l.id === id ? { ...l, ...data } : l)),
      tareas: s.tareas.map((t) =>
        t.lista_id === id ? { ...t, lista_color: data.color ?? t.lista_color, lista_nombre: data.nombre ?? t.lista_nombre } : t,
      ),
    }))
    try { await patch(`/agenda/listas/${id}`, data) } catch (e) { reportError(e) }
  },
  borrarLista: async (id) => {
    try {
      await del(`/agenda/listas/${id}`)
      set((s) => ({ listas: s.listas.filter((l) => l.id !== id) }))
      await g().refreshTareas()
      toast('Lista eliminada')
    } catch (e) { reportError(e) }
  },

  // ── Tareas ──
  crearTarea: async (data) => {
    const lista = g().listas.find((l) => l.id === data.lista_id)
    const temp = { id: tmp--, completada: false, ...data, lista_color: lista?.color, lista_nombre: lista?.nombre, _pending: true }
    set((s) => ({ tareas: [...s.tareas, temp] }))
    try {
      const t = await post('/agenda/tareas', data)
      set((s) => ({ tareas: s.tareas.map((x) => (x.id === temp.id ? t : x)) }))
      if (data.se_repite) await g().refreshTareas()
      return t
    } catch (e) {
      if (!e.network) set((s) => ({ tareas: s.tareas.filter((x) => x.id !== temp.id) }))
      reportError(e)
    }
  },
  editarTarea: async (id, data) => {
    const prev = g().tareas.find((t) => t.id === id)
    const lista = data.lista_id ? g().listas.find((l) => l.id === data.lista_id) : null
    set((s) => ({
      tareas: s.tareas.map((t) => (t.id === id ? { ...t, ...data, ...(lista ? { lista_color: lista.color, lista_nombre: lista.nombre } : {}) } : t)),
    }))
    try {
      const t = await patch(`/agenda/tareas/${id}`, data)
      set((s) => ({ tareas: s.tareas.map((x) => (x.id === id ? t : x)) }))
      return t
    } catch (e) {
      if (!e.network && prev) set((s) => ({ tareas: s.tareas.map((x) => (x.id === id ? prev : x)) }))
      reportError(e)
    }
  },
  toggleTarea: async (t) => g().editarTarea(t.id, { completada: !t.completada }),
  borrarTarea: async (id) => {
    const prev = g().tareas
    set((s) => ({ tareas: s.tareas.filter((t) => t.id !== id) }))
    try {
      await del(`/agenda/tareas/${id}`)
      toast('Tarea eliminada')
    } catch (e) {
      if (!e.network) set({ tareas: prev })
      reportError(e)
    }
  },

  // ── Horario facultad ──
  crearHorario: async (data) => {
    try {
      const h = await post('/agenda/horario-facultad', data)
      set((s) => ({ horario: [...s.horario, h] }))
      return h
    } catch (e) { reportError(e) }
  },
  editarHorario: async (id, data) => {
    try {
      const h = await patch(`/agenda/horario-facultad/${id}`, data)
      set((s) => ({ horario: s.horario.map((x) => (x.id === id ? { ...x, ...h } : x)) }))
    } catch (e) { reportError(e) }
  },
  borrarHorario: async (id) => {
    try {
      await del(`/agenda/horario-facultad/${id}`)
      set((s) => ({ horario: s.horario.filter((x) => x.id !== id) }))
    } catch (e) { reportError(e) }
  },
  excepcionHorario: async (id, fecha) => {
    try {
      await post(`/agenda/horario-facultad/${id}/excepciones`, { fecha })
      set((s) => ({ horario: s.horario.map((x) => (x.id === id ? { ...x, excepciones: [...(x.excepciones || []), fecha] } : x)) }))
      toast('Clase marcada como sin cursada ese día')
    } catch (e) { reportError(e) }
  },

  revision: (desde, hasta) => get('/agenda/revision', { desde, hasta }),
}))

export function eventosDelDia(eventos, calendarios, iso) {
  const activos = new Set(calendarios.filter((c) => c.activo !== false).map((c) => c.id))
  return eventos.filter((e) => {
    if (e.calendario_id && calendarios.length && !activos.has(e.calendario_id)) return false
    const ini = (e.fecha_inicio || '').slice(0, 10)
    const fin = (e.fecha_fin || e.fecha_inicio || '').slice(0, 10)
    return iso >= ini && iso <= (fin < ini ? ini : fin)
  })
}

// dia_semana de horario facultad: 0 = Lunes (convención de la API de Agenda).
export function clasesDelDia(horario, date) {
  const idx = (date.getDay() + 6) % 7
  const iso = toISODate(date)
  return horario.filter((h) => h.dia_semana === idx && !(h.excepciones || []).includes(iso))
}

export function weekRange(date) {
  const d = new Date(date)
  const idx = (d.getDay() + 6) % 7
  const ini = addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -idx)
  return [ini, addDays(ini, 6)]
}
