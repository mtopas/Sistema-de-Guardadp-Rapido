import { create } from 'zustand'
import { get, post, put, patch, del } from '../lib/api'
import { addDays, toISODate } from '../lib/dates'
import { reportError, toast } from './ui'

let tmp = -1

export const useHabitos = create((set, g) => ({
  loaded: false,
  habitos: [],
  registros: [],
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  tab: 'hoy',
  setTab: (tab) => set({ tab }),
  modal: null, // { habito? }
  openModal: (habito = null) => set({ modal: { habito } }),
  closeModal: () => set({ modal: null }),

  fetchAll: async () => {
    try {
      const desde = toISODate(addDays(new Date(), -800))
      const [habitos, registros] = await Promise.all([get('/habitos'), get('/habitos/registros', { fecha_desde: desde })])
      set({ habitos, registros, loaded: true })
    } catch (e) {
      set({ loaded: true })
    }
  },

  crear: async (data) => {
    const cliente_id = `nx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const temp = { id: tmp--, activo: true, creado_en: new Date().toISOString(), ...data, cliente_id, _pending: true }
    set((s) => ({ habitos: [...s.habitos, temp] }))
    try {
      const h = await post('/habitos', { ...data, cliente_id })
      set((s) => ({ habitos: s.habitos.map((x) => (x.id === temp.id ? h : x)) }))
      toast(`Hábito “${h.nombre}” creado`)
      return h
    } catch (e) {
      if (!e.network) set((s) => ({ habitos: s.habitos.filter((x) => x.id !== temp.id) }))
      reportError(e)
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
      if (prev) set((s) => ({ habitos: s.habitos.map((x) => (x.id === id ? prev : x)) }))
      reportError(e)
    }
  },
  borrar: async (id) => {
    const prev = g()
    set((s) => ({
      habitos: s.habitos.filter((h) => h.id !== id),
      registros: s.registros.filter((r) => r.habito_id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
    try {
      await del(`/habitos/${id}`)
      toast('Hábito eliminado')
    } catch (e) {
      set({ habitos: prev.habitos, registros: prev.registros })
      reportError(e)
    }
  },

  registrar: async (habitoId, fecha, valor, nota) => {
    const prev = g().registros
    const existing = prev.find((r) => r.habito_id === habitoId && r.fecha === fecha)
    const optimistic = { id: existing?.id ?? tmp--, habito_id: habitoId, fecha, valor, nota: nota ?? existing?.nota ?? null }
    set((s) => ({
      registros: existing ? s.registros.map((r) => (r === existing ? optimistic : r)) : [...s.registros, optimistic],
    }))
    try {
      const body = { fecha, valor }
      if (nota !== undefined) body.nota = nota
      const r = await put(`/habitos/${habitoId}/registro`, body)
      set((s) => ({ registros: s.registros.map((x) => (x.habito_id === habitoId && x.fecha === fecha ? r : x)) }))
      return r
    } catch (e) {
      if (!e.network) set({ registros: prev })
      reportError(e)
    }
  },
  desmarcar: async (habitoId, fecha) => {
    const prev = g().registros
    const r = prev.find((x) => x.habito_id === habitoId && x.fecha === fecha)
    if (!r) return
    set((s) => ({ registros: s.registros.filter((x) => x !== r) }))
    if (r.id < 0) return
    try {
      await del(`/habitos/registros/${r.id}`)
    } catch (e) {
      if (!e.network) set({ registros: prev })
      reportError(e)
    }
  },
  stats: (id) => get(`/habitos/${id}/stats`),
}))
