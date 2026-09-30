import { create } from 'zustand'
import { get, post, put, patch, del } from '../lib/api'
import { addDays, toISODate } from '../lib/dates'
import { reportError, toast } from './ui'

let tmp = -1
const arr = (x) => (Array.isArray(x) ? x : [])

export const useHabitos = create((set, g) => ({
  loaded: false,
  habitos: [],
  registros: [],

  // UI
  tab: 'hoy',
  selectedId: null,
  refMes: toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  filtroHistorial: null,
  modal: null, // { habito }
  completar: null, // { habito, fecha }

  setTab: (tab) => set({ tab }),
  select: (id) => set({ selectedId: id }),
  setRefMes: (refMes) => set({ refMes }),
  setFiltroHistorial: (id) => set({ filtroHistorial: id }),
  openModal: (habito = null) => set({ modal: { habito } }),
  closeModal: () => set({ modal: null }),
  openCompletar: (habito, fecha) => set({ completar: { habito, fecha } }),
  closeCompletar: () => set({ completar: null }),

  fetchAll: async () => {
    const safe = (p, fb, q) => get(p, q).catch((e) => { if (e.network) throw e; return fb })
    try {
      const desde = toISODate(addDays(new Date(), -800))
      const [habitos, registros] = await Promise.all([
        safe('/habitos', []),
        safe('/habitos/registros', [], { fecha_desde: desde }),
      ])
      set({ habitos: arr(habitos), registros: arr(registros), loaded: true })
    } catch (e) {
      set({ loaded: true })
    }
  },

  crear: async (data) => {
    const temp = { id: tmp--, activo: true, creado_en: new Date().toISOString(), ...data, _pending: true }
    set((s) => ({ habitos: [...s.habitos, temp] }))
    try {
      const h = await post('/habitos', data)
      set((s) => ({ habitos: s.habitos.map((x) => (x.id === temp.id ? h : x)), selectedId: h.id }))
      toast(`Hábito “${h.nombre}” creado`)
      return h
    } catch (e) {
      if (!e.network) set((s) => ({ habitos: s.habitos.filter((x) => x.id !== temp.id) }))
      reportError(e)
      return null
    }
  },
  editar: async (id, data) => {
    const prev = g().habitos.find((h) => h.id === id)
    set((s) => ({ habitos: s.habitos.map((h) => (h.id === id ? { ...h, ...data } : h)) }))
    try {
      const h = await patch(`/habitos/${id}`, data)
      set((s) => ({ habitos: s.habitos.map((x) => (x.id === id ? h : x)) }))
      return h
    } catch (e) {
      if (!e.network && prev) set((s) => ({ habitos: s.habitos.map((x) => (x.id === id ? prev : x)) }))
      reportError(e)
      return null
    }
  },
  archivar: (h) => g().editar(h.id, { activo: !(h.activo !== false) }),
  borrar: async (id) => {
    const prev = { habitos: g().habitos, registros: g().registros }
    set((s) => ({
      habitos: s.habitos.filter((h) => h.id !== id),
      registros: s.registros.filter((r) => r.habito_id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
    try { await del(`/habitos/${id}`); toast('Hábito eliminado'); return true }
    catch (e) { if (!e.network) set(prev); reportError(e); return false }
  },

  /** Upsert de un registro (valor 1.0 total / 0.5 parcial). */
  registrar: async (habitoId, fecha, valor, nota) => {
    const prev = g().registros
    const existente = prev.find((r) => r.habito_id === habitoId && r.fecha === fecha)
    const optimista = {
      id: existente?.id ?? tmp--,
      habito_id: habitoId,
      fecha,
      valor,
      nota: nota !== undefined ? nota : existente?.nota ?? null,
    }
    set((s) => ({
      registros: existente
        ? s.registros.map((r) => (r.habito_id === habitoId && r.fecha === fecha ? optimista : r))
        : [...s.registros, optimista],
    }))
    if (habitoId < 0) return optimista // hábito todavía sin id real
    try {
      const body = { fecha, valor }
      if (nota !== undefined) body.nota = nota
      const r = await put(`/habitos/${habitoId}/registro`, body)
      set((s) => ({ registros: s.registros.map((x) => (x.habito_id === habitoId && x.fecha === fecha ? r : x)) }))
      return r
    } catch (e) {
      if (!e.network) set({ registros: prev })
      reportError(e)
      return null
    }
  },
  desmarcar: async (habitoId, fecha) => {
    const prev = g().registros
    const r = prev.find((x) => x.habito_id === habitoId && x.fecha === fecha)
    if (!r) return true
    set((s) => ({ registros: s.registros.filter((x) => x !== r) }))
    if (r.id < 0) return true
    try { await del(`/habitos/registros/${r.id}`); return true }
    catch (e) { if (!e.network) set({ registros: prev }); reportError(e); return false }
  },
  /** Click rápido: pendiente → total → parcial → pendiente. */
  ciclar: async (habito, fecha) => {
    const r = g().registros.find((x) => x.habito_id === habito.id && x.fecha === fecha)
    const v = Number(r?.valor || 0)
    if (!v) return g().registrar(habito.id, fecha, 1)
    if (v >= 1) return g().registrar(habito.id, fecha, 0.5)
    return g().desmarcar(habito.id, fecha)
  },
}))

export const HABITO_COLORS = ['#8b5cf6', '#10b981', '#06b6d4', '#f59e0b', '#ef4444', '#f97316', '#a855f7', '#84cc16']
