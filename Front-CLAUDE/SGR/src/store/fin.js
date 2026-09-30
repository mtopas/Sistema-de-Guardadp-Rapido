import { create } from 'zustand'
import { get, post, put, patch, del, api } from '../lib/api'
import { normalizeMov } from '../lib/fin'
import { toISOMonth } from '../lib/dates'
import { reportError, toast } from './ui'

let tmp = -1

const sortMovs = (arr) => [...arr].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id)

export const useFin = create((set, g) => ({
  loaded: false,
  mes: toISOMonth(),
  setMes: (mes) => set({ mes }),
  tab: 'dashboard',
  setTab: (tab) => set({ tab }),
  movModal: null, // { mov?, preset? }
  openMov: (data = {}) => set({ movModal: data }),
  closeMov: () => set({ movModal: null }),

  cuentas: [],
  categorias: [],
  movs: [],
  config: {},
  notas: [],
  objetivos: [],
  instrumentos: [],
  transacciones: [],
  fireFilas: {},
  inflacion: {},

  fetchAll: async () => {
    const safe = (p, fb, q) => get(p, q).catch((e) => { if (e.network) throw e; return fb })
    try {
      const [cuentas, categorias, movs, config, notas, objetivos, instrumentos, transacciones, fireFilas, inflacion] =
        await Promise.all([
          safe('/fin/cuentas', []),
          safe('/fin/categorias', [], { include_ocultas: true }),
          safe('/fin/movimientos', []),
          safe('/fin/config', {}),
          safe('/fin/notas', []),
          safe('/fin/objetivos', []),
          safe('/fin/instrumentos', []),
          safe('/fin/transacciones', []),
          safe('/fin/fire-filas', {}),
          safe('/fin/inflacion', {}),
        ])
      set({
        cuentas, categorias, movs: sortMovs(movs.map(normalizeMov)), config, notas, objetivos,
        instrumentos, transacciones, fireFilas, inflacion, loaded: true,
      })
    } catch (e) {
      set({ loaded: true })
    }
  },
  refreshCuentas: async () => {
    try { set({ cuentas: await get('/fin/cuentas') }) } catch { /* offline */ }
  },
  refreshCategorias: async () => {
    try { set({ categorias: await get('/fin/categorias', { include_ocultas: true }) }) } catch { /* offline */ }
  },
  refreshMovs: async () => {
    try { set({ movs: sortMovs((await get('/fin/movimientos')).map(normalizeMov)) }) } catch { /* offline */ }
  },

  // ── Dólar ──
  actualizarDolar: async () => {
    try {
      const cfg = await get('/fin/dolar/cotizacion')
      set({ config: cfg })
      toast(`Dólar MEP actualizado: $${cfg.dolar_mep}`)
    } catch (e) {
      reportError(e, 'No se pudo obtener la cotización')
    }
  },
  guardarConfig: async (patchCfg) => {
    set((s) => ({ config: { ...s.config, ...patchCfg } }))
    try {
      const cfg = await put('/fin/config', patchCfg)
      set({ config: cfg })
      return true
    } catch (e) {
      reportError(e)
      return false
    }
  },

  // ── Movimientos ──
  crearMov: async (data) => {
    const cuenta = g().cuentas.find((c) => c.id === data.cuenta_id)
    const temp = normalizeMov({ id: tmp--, ...data, cuenta_nombre: cuenta?.name, _pending: true })
    set((s) => ({ movs: sortMovs([temp, ...s.movs]) }))
    try {
      const m = normalizeMov(await post('/fin/movimientos', data))
      set((s) => ({ movs: sortMovs(s.movs.map((x) => (x.id === temp.id ? m : x))) }))
      g().refreshCuentas()
      if (data.categoria_nombre && !g().categorias.some((c) => c.name.toLowerCase() === data.categoria_nombre.toLowerCase())) {
        g().refreshCategorias()
      }
      return m
    } catch (e) {
      if (!e.network) set((s) => ({ movs: s.movs.filter((x) => x.id !== temp.id) }))
      reportError(e)
      return null
    }
  },
  transferir: async ({ origen, destino, monto, moneda, fecha, descripcion }) => {
    const desc = descripcion || 'Transferencia'
    const a = await g().crearMov({ tipo: 'transfer', monto, moneda, fecha, descripcion: desc, cuenta_id: origen })
    if (!a) return false
    const b = await g().crearMov({ tipo: 'transfer', monto: -Math.abs(monto), moneda, fecha, descripcion: desc, cuenta_id: destino })
    return !!b
  },
  editarMov: async (id, data) => {
    const prev = g().movs.find((m) => m.id === id)
    set((s) => ({ movs: sortMovs(s.movs.map((m) => (m.id === id ? normalizeMov({ ...m, ...data }) : m))) }))
    try {
      const m = normalizeMov(await patch(`/fin/movimientos/${id}`, data))
      set((s) => ({ movs: sortMovs(s.movs.map((x) => (x.id === id ? m : x))) }))
      g().refreshCuentas()
      if (data.categoria_nombre) g().refreshCategorias()
      return true
    } catch (e) {
      if (!e.network && prev) set((s) => ({ movs: sortMovs(s.movs.map((x) => (x.id === id ? prev : x))) }))
      reportError(e)
      return false
    }
  },
  borrarMov: async (id) => {
    const prev = g().movs
    set((s) => ({ movs: s.movs.filter((m) => m.id !== id) }))
    try {
      await del(`/fin/movimientos/${id}`)
      g().refreshCuentas()
      toast('Movimiento eliminado')
    } catch (e) {
      if (!e.network) set({ movs: prev })
      reportError(e)
    }
  },
  borrarMovsBulk: async (ids) => {
    try {
      await api('/fin/movimientos/bulk', { method: 'DELETE', body: { ids } })
      set((s) => ({ movs: s.movs.filter((m) => !ids.includes(m.id)) }))
      g().refreshCuentas()
      toast(`${ids.length} movimientos eliminados`)
    } catch (e) {
      reportError(e)
    }
  },
  editarMovsBulk: async (updates) => {
    try {
      const r = await patch('/fin/movimientos/bulk', { updates })
      const byId = new Map((r.movimientos || []).map((m) => [m.id, normalizeMov(m)]))
      set((s) => ({ movs: sortMovs(s.movs.map((m) => byId.get(m.id) || m)) }))
      g().refreshCuentas()
      g().refreshCategorias()
      toast(`${r.actualizados ?? updates.length} movimientos actualizados`)
    } catch (e) {
      reportError(e)
    }
  },
  importarCSV: async (filas) => {
    try {
      const r = await post('/fin/import/csv', { filas })
      await g().fetchAll()
      toast(`Importación completa (${filas.length} filas)`)
      return r
    } catch (e) {
      reportError(e)
      return null
    }
  },
  duplicados: async () => get('/fin/movimientos/duplicados'),
  recalcularSaldos: async () => {
    try {
      await post('/fin/recalcular-saldos')
      await g().refreshCuentas()
      toast('Saldos recalculados desde movimientos')
    } catch (e) {
      reportError(e)
    }
  },

  // ── Cuentas ──
  crearCuenta: async (data) => {
    try {
      const c = await post('/fin/cuentas', data)
      set((s) => ({ cuentas: [...s.cuentas, c] }))
      if (data.saldo_ars || data.saldo_usd) g().refreshMovs()
      toast(`Cuenta “${c.name}” creada`)
      return c
    } catch (e) {
      reportError(e)
    }
  },
  editarCuenta: async (id, data) => {
    try {
      const c = await patch(`/fin/cuentas/${id}`, data)
      set((s) => ({ cuentas: s.cuentas.map((x) => (x.id === id ? { ...x, ...c } : x)) }))
      g().refreshMovs()
      return true
    } catch (e) {
      reportError(e)
    }
  },
  borrarCuenta: async (id) => {
    try {
      await del(`/fin/cuentas/${id}`)
      set((s) => ({ cuentas: s.cuentas.filter((c) => c.id !== id) }))
      toast('Cuenta eliminada')
    } catch (e) {
      reportError(e)
    }
  },
  ajustarSaldo: async (cuenta, objetivoARS, objetivoUSD) => {
    // Los saldos son derivados: se crea un movimiento de categoría Ajuste por la diferencia.
    const hoy = new Date().toISOString().slice(0, 10)
    const ops = []
    const dA = Number(objetivoARS) - Number(cuenta.ars || 0)
    const dU = Number(objetivoUSD) - Number(cuenta.usd || 0)
    if (Math.abs(dA) > 0.004) ops.push({ tipo: dA > 0 ? 'income' : 'expense', monto: Math.abs(dA), moneda: 'ARS' })
    if (Math.abs(dU) > 0.004) ops.push({ tipo: dU > 0 ? 'income' : 'expense', monto: Math.abs(dU), moneda: 'USD' })
    for (const o of ops) {
      await g().crearMov({ ...o, fecha: hoy, descripcion: 'Ajuste de saldo', cuenta_id: cuenta.id, categoria_nombre: 'Ajuste' })
    }
    if (ops.length) toast('Saldo ajustado')
  },

  // ── Categorías ──
  crearCategoria: async (data) => {
    try {
      const c = await post('/fin/categorias', data)
      set((s) => ({ categorias: [...s.categorias, c] }))
      return c
    } catch (e) {
      reportError(e)
    }
  },
  editarCategoria: async (id, data) => {
    try {
      const c = await patch(`/fin/categorias/${id}`, data)
      set((s) => ({ categorias: s.categorias.map((x) => (x.id === id ? c : x)) }))
      if (data.nombre) g().refreshMovs()
      return true
    } catch (e) {
      reportError(e)
    }
  },
  borrarCategoria: async (id) => {
    try {
      await del(`/fin/categorias/${id}`)
      set((s) => ({ categorias: s.categorias.filter((x) => x.id !== id) }))
      toast('Categoría eliminada')
      g().refreshMovs()
    } catch (e) {
      reportError(e)
    }
  },

  // ── Notas ──
  crearNota: async (contenido) => {
    try {
      const n = await post('/fin/notas', { contenido })
      set((s) => ({ notas: [n, ...s.notas] }))
    } catch (e) {
      reportError(e)
    }
  },
  borrarNota: async (id) => {
    set((s) => ({ notas: s.notas.filter((n) => n.id !== id) }))
    try { await del(`/fin/notas/${id}`) } catch (e) { reportError(e) }
  },

  // ── Objetivos ──
  crearObjetivo: async (data) => {
    try {
      const o = await post('/fin/objetivos', data)
      set((s) => ({ objetivos: [...s.objetivos, o] }))
      g().refreshCategorias()
      toast(`Objetivo “${o.nombre}” creado`)
      return o
    } catch (e) {
      reportError(e)
    }
  },
  editarObjetivo: async (id, data) => {
    try {
      const o = await patch(`/fin/objetivos/${id}`, data)
      set((s) => ({ objetivos: s.objetivos.map((x) => (x.id === id ? o : x)) }))
      return true
    } catch (e) {
      reportError(e)
    }
  },
  borrarObjetivo: async (id) => {
    try {
      await del(`/fin/objetivos/${id}`)
      set((s) => ({ objetivos: s.objetivos.filter((x) => x.id !== id) }))
      g().refreshCategorias()
      toast('Objetivo eliminado (su categoría queda oculta)')
    } catch (e) {
      reportError(e)
    }
  },

  // ── Instrumentos / ledger ──
  refreshInversiones: async () => {
    try {
      const [instrumentos, transacciones] = await Promise.all([get('/fin/instrumentos'), get('/fin/transacciones')])
      set({ instrumentos, transacciones })
    } catch { /* offline */ }
  },
  crearInstrumento: async (data) => {
    try {
      await post('/fin/instrumentos', data)
      await g().refreshInversiones()
      toast('Instrumento creado')
      return true
    } catch (e) {
      reportError(e)
    }
  },
  editarInstrumento: async (id, data) => {
    try {
      await patch(`/fin/instrumentos/${id}`, data)
      await g().refreshInversiones()
      return true
    } catch (e) {
      reportError(e)
    }
  },
  borrarInstrumento: async (id) => {
    try {
      await del(`/fin/instrumentos/${id}`)
      await g().refreshInversiones()
      toast('Instrumento eliminado')
    } catch (e) {
      reportError(e)
    }
  },
  crearTransaccion: async (data) => {
    try {
      await post('/fin/transacciones', data)
      await g().refreshInversiones()
      toast('Operación registrada')
      return true
    } catch (e) {
      reportError(e)
    }
  },
  editarTransaccion: async (id, data) => {
    try {
      await patch(`/fin/transacciones/${id}`, data)
      await g().refreshInversiones()
      return true
    } catch (e) {
      reportError(e)
    }
  },
  borrarTransaccion: async (id) => {
    try {
      await del(`/fin/transacciones/${id}`)
      await g().refreshInversiones()
      toast('Operación eliminada')
    } catch (e) {
      reportError(e)
    }
  },

  // ── FIRE / inflación ──
  setFireOverride: async (mes, valor) => {
    set((s) => {
      const f = { ...s.fireFilas }
      if (valor === null || valor === '') delete f[mes]
      else f[mes] = Number(valor)
      return { fireFilas: f }
    })
    try {
      await put(`/fin/fire-filas/${mes}`, { ahorrado_override: valor === '' ? null : valor })
    } catch (e) {
      reportError(e)
    }
  },
  setInflacion: async (mes, valor) => {
    set((s) => {
      const f = { ...s.inflacion }
      if (valor === null || valor === '') delete f[mes]
      else f[mes] = Number(valor)
      return { inflacion: f }
    })
    try {
      await put(`/fin/inflacion/${mes}`, { inflacion: valor === '' ? null : Number(valor) })
    } catch (e) {
      reportError(e)
    }
  },
}))
