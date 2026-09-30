import { create } from 'zustand'
import { get, post, patch, del } from '../lib/api'
import { addDays, addMonths, startOfWeek, toISODate } from '../lib/dates'
import { reportError, toast } from './ui'

let tmp = -1
const arr = (x) => (Array.isArray(x) ? x : [])
const sortEv = (a) => [...a].sort((x, y) => String(x.fecha_inicio || '').localeCompare(String(y.fecha_inicio || '')))

export const useAgenda = create((set, g) => ({
  loaded: false,
  calendarios: [],
  eventos: [],
  rango: null, // { desde, hasta } de eventos ya cargados
  listas: [],
  tareas: [],
  horario: [],

  // UI (vive en el store para no perder posición al remontar la pantalla)
  tab: 'hoy',
  dia: toISODate(),
  refMes: toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  vistaMes: 'mes', // mes | semana
  vistaTareas: 'lista', // lista | canvas
  filtroTareas: 'pendientes', // pendientes | completadas | todas
  listaSel: null,
  tareaSel: null,
  semanaRevision: toISODate(startOfWeek(new Date())),
  eventoModal: null,
  tareaModal: null,
  calendarioModal: null,
  listaModal: null,
  facultadModal: false,

  setTab: (tab) => set({ tab }),
  setDia: (dia) => set({ dia }),
  setRefMes: (refMes) => set({ refMes }),
  setVistaMes: (vistaMes) => set({ vistaMes }),
  setVistaTareas: (vistaTareas) => set({ vistaTareas }),
  setFiltroTareas: (filtroTareas) => set({ filtroTareas }),
  setListaSel: (listaSel) => set({ listaSel }),
  setTareaSel: (tareaSel) => set({ tareaSel }),
  setSemanaRevision: (semanaRevision) => set({ semanaRevision }),
  openEvento: (d = {}) => set({ eventoModal: d }),
  closeEvento: () => set({ eventoModal: null }),
  openTarea: (d = {}) => set({ tareaModal: d }),
  closeTarea: () => set({ tareaModal: null }),
  openCalendario: (d = {}) => set({ calendarioModal: d }),
  closeCalendario: () => set({ calendarioModal: null }),
  openLista: (d = {}) => set({ listaModal: d }),
  closeLista: () => set({ listaModal: null }),
  openFacultad: () => set({ facultadModal: true }),
  closeFacultad: () => set({ facultadModal: false }),

  fetchBase: async () => {
    const safe = (p, fb, q) => get(p, q).catch((e) => { if (e.network) throw e; return fb })
    try {
      const hasta = toISODate(addMonths(new Date(), 6))
      const [calendarios, listas, tareas, horario] = await Promise.all([
        safe('/agenda/calendarios', []),
        safe('/agenda/listas', []),
        safe('/agenda/tareas', [], { hasta }),
        safe('/agenda/horario-facultad', []),
      ])
      set({ calendarios: arr(calendarios), listas: arr(listas), tareas: arr(tareas), horario: arr(horario), loaded: true })
    } catch (e) {
      set({ loaded: true })
    }
  },

  /** Carga eventos solo si el rango pedido no está ya cubierto (y agranda la ventana). */
  ensureRange: async (desde, hasta, force = false) => {
    const r = g().rango
    if (!force && r && desde >= r.desde && hasta <= r.hasta) return
    const d = r && !force ? (desde < r.desde ? desde : r.desde) : desde
    const h = r && !force ? (hasta > r.hasta ? hasta : r.hasta) : hasta
    try {
      const eventos = await get('/agenda/eventos', { desde: d, hasta: h })
      set({ eventos: sortEv(arr(eventos)), rango: { desde: d, hasta: h } })
    } catch { /* offline: conserva lo cargado */ }
  },
  refreshEventos: async () => {
    const r = g().rango
    if (r) await g().ensureRange(r.desde, r.hasta, true)
  },
  refreshTareas: async (hasta) => {
    try {
      const h = hasta || toISODate(addMonths(new Date(), 6))
      set({ tareas: arr(await get('/agenda/tareas', { hasta: h })) })
    } catch { /* offline */ }
  },
  buscar: (q) => get('/agenda/buscar', { q }).catch(() => []),
  revision: (desde, hasta) => get('/agenda/revision', { desde, hasta }).catch(() => null),

  // ── Calendarios ─────────────────────────────────────────────────────
  crearCalendario: async (data) => {
    try {
      const c = await post('/agenda/calendarios', data)
      set((s) => ({ calendarios: [...s.calendarios, c] }))
      toast(`Calendario “${c.nombre}” creado`)
      return c
    } catch (e) { reportError(e); return null }
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
    try { await patch(`/agenda/calendarios/${id}`, data); return true } catch (e) { reportError(e); return false }
  },
  toggleCalendario: (c) => g().editarCalendario(c.id, { activo: !(c.activo !== false) }),
  borrarCalendario: async (id, moverA) => {
    try {
      if (moverA) await patch(`/agenda/calendarios/${id}/reasignar-eventos`, undefined, { destino_id: moverA })
      await del(`/agenda/calendarios/${id}`)
      set((s) => ({ calendarios: s.calendarios.filter((c) => c.id !== id) }))
      await g().refreshEventos()
      toast(moverA ? 'Calendario eliminado — sus eventos se movieron' : 'Calendario y sus eventos eliminados')
      return true
    } catch (e) { reportError(e); return false }
  },

  // ── Eventos ─────────────────────────────────────────────────────────
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
      return null
    }
  },
  editarEvento: async (id, data) => {
    const prev = g().eventos.find((e) => e.id === id)
    const cal = data.calendario_id ? g().calendarios.find((c) => c.id === data.calendario_id) : null
    set((s) => ({
      eventos: sortEv(s.eventos.map((e) =>
        e.id === id ? { ...e, ...data, ...(cal ? { calendario_color: cal.color, calendario_nombre: cal.nombre } : {}) } : e,
      )),
    }))
    try {
      const ev = await patch(`/agenda/eventos/${id}`, data)
      set((s) => ({ eventos: sortEv(s.eventos.map((e) => (e.id === id ? ev : e))) }))
      toast('Evento actualizado')
      return ev
    } catch (e) {
      if (!e.network && prev) set((s) => ({ eventos: sortEv(s.eventos.map((x) => (x.id === id ? prev : x))) }))
      reportError(e)
      return null
    }
  },
  borrarEvento: async (id) => {
    const prev = g().eventos
    set((s) => ({ eventos: s.eventos.filter((e) => e.id !== id) }))
    try { await del(`/agenda/eventos/${id}`); toast('Evento eliminado'); return true }
    catch (e) { if (!e.network) set({ eventos: prev }); reportError(e); return false }
  },
  detenerSerie: async (tipo, serieId) => {
    try {
      await del(`/agenda/series/${tipo}/${serieId}`)
      toast('No se generan más repeticiones')
      if (tipo === 'evento') await g().refreshEventos()
      else await g().refreshTareas()
      return true
    } catch (e) { reportError(e); return false }
  },

  // ── Listas ──────────────────────────────────────────────────────────
  crearLista: async (data) => {
    try {
      const l = await post('/agenda/listas', data)
      set((s) => ({ listas: [...s.listas, l] }))
      toast(`Lista “${l.nombre}” creada`)
      return l
    } catch (e) { reportError(e); return null }
  },
  editarLista: async (id, data) => {
    set((s) => ({
      listas: s.listas.map((l) => (l.id === id ? { ...l, ...data } : l)),
      tareas: s.tareas.map((t) =>
        t.lista_id === id ? { ...t, lista_color: data.color ?? t.lista_color, lista_nombre: data.nombre ?? t.lista_nombre } : t,
      ),
    }))
    try { await patch(`/agenda/listas/${id}`, data); return true } catch (e) { reportError(e); return false }
  },
  togglePin: (l) => g().editarLista(l.id, { pinned: !l.pinned }),
  borrarLista: async (id) => {
    try {
      await del(`/agenda/listas/${id}`)
      set((s) => ({ listas: s.listas.filter((l) => l.id !== id), listaSel: s.listaSel === id ? null : s.listaSel }))
      await g().refreshTareas()
      toast('Lista eliminada')
      return true
    } catch (e) { reportError(e); return false }
  },

  // ── Tareas ──────────────────────────────────────────────────────────
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
      return null
    }
  },
  editarTarea: async (id, data) => {
    const prev = g().tareas.find((t) => t.id === id)
    const lista = data.lista_id ? g().listas.find((l) => l.id === data.lista_id) : null
    set((s) => ({
      tareas: s.tareas.map((t) =>
        t.id === id ? { ...t, ...data, ...(lista ? { lista_color: lista.color, lista_nombre: lista.nombre } : {}) } : t,
      ),
    }))
    try {
      const t = await patch(`/agenda/tareas/${id}`, data)
      set((s) => ({ tareas: s.tareas.map((x) => (x.id === id ? t : x)) }))
      return t
    } catch (e) {
      if (!e.network && prev) set((s) => ({ tareas: s.tareas.map((x) => (x.id === id ? prev : x)) }))
      reportError(e)
      return null
    }
  },
  toggleTarea: (t) => g().editarTarea(t.id, { completada: !t.completada }),
  borrarTarea: async (id) => {
    const prev = g().tareas
    set((s) => ({ tareas: s.tareas.filter((t) => t.id !== id), tareaSel: s.tareaSel === id ? null : s.tareaSel }))
    try { await del(`/agenda/tareas/${id}`); toast('Tarea eliminada'); return true }
    catch (e) { if (!e.network) set({ tareas: prev }); reportError(e); return false }
  },

  // ── Horario Facultad ────────────────────────────────────────────────
  crearHorario: async (data) => {
    try {
      const h = await post('/agenda/horario-facultad', data)
      set((s) => ({ horario: [...s.horario, h] }))
      return h
    } catch (e) { reportError(e); return null }
  },
  editarHorario: async (id, data) => {
    try {
      const h = await patch(`/agenda/horario-facultad/${id}`, data)
      set((s) => ({ horario: s.horario.map((x) => (x.id === id ? { ...x, ...h } : x)) }))
      return true
    } catch (e) { reportError(e); return false }
  },
  borrarHorario: async (id) => {
    const prev = g().horario
    set((s) => ({ horario: s.horario.filter((x) => x.id !== id) }))
    try { await del(`/agenda/horario-facultad/${id}`); return true }
    catch (e) { if (!e.network) set({ horario: prev }); reportError(e); return false }
  },
  excepcionHorario: async (id, fecha) => {
    try {
      await post(`/agenda/horario-facultad/${id}/excepciones`, { fecha })
      set((s) => ({
        horario: s.horario.map((x) => (x.id === id ? { ...x, excepciones: [...(x.excepciones || []), fecha] } : x)),
      }))
      toast('Clase marcada como sin cursada ese día')
      return true
    } catch (e) { reportError(e); return false }
  },
}))

// ── Derivados ─────────────────────────────────────────────────────────
export const calendariosActivos = (calendarios) =>
  new Set(calendarios.filter((c) => c.activo !== false && c.activo !== 0).map((c) => c.id))

export function eventosDelDia(eventos, calendarios, iso) {
  const activos = calendariosActivos(calendarios)
  return eventos.filter((e) => {
    if (e.calendario_id && calendarios.length && !activos.has(e.calendario_id)) return false
    const ini = String(e.fecha_inicio || '').slice(0, 10)
    const finRaw = String(e.fecha_fin || e.fecha_inicio || '').slice(0, 10)
    const fin = finRaw < ini ? ini : finRaw
    return iso >= ini && iso <= fin
  })
}

export function tareasDelDia(tareas, iso) {
  return tareas.filter((t) => String(t.fecha || '').slice(0, 10) === iso)
}

/** `dia_semana` del horario de facultad: 0 = Lunes. */
export function clasesDelDia(horario, date) {
  const idx = (date.getDay() + 6) % 7
  const iso = toISODate(date)
  return horario
    .filter((h) => Number(h.dia_semana) === idx && !(h.excepciones || []).includes(iso))
    .sort((a, b) => String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || '')))
}

export const weekRange = (date) => {
  const ini = startOfWeek(date)
  return [ini, addDays(ini, 6)]
}

export const CAL_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#f97316', '#ec4899']
