import { create } from 'zustand'
import { api, get, post, put, patch, del } from '../lib/api'
import { normalizeCategoria, normalizeCuenta, normalizeMov, nameOf } from '../lib/fin'
import { toISODate, toISOMonth } from '../lib/dates'
import { reportError, toast } from './ui'

let tmp = -1

const sortMovs = (arr) =>
  [...arr].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.id || 0) - (a.id || 0))

/** `fin/fire-filas` y `fin/inflacion` pueden venir como dict {mes: valor} o como lista. */
function toMesMap(data, key) {
  if (!data) return {}
  if (Array.isArray(data)) {
    const out = {}
    for (const r of data) {
      const mes = r.mes || r.periodo
      if (!mes) continue
      const v = r[key] ?? r.valor ?? r.value
      if (v !== null && v !== undefined) out[mes] = Number(v)
    }
    return out
  }
  const out = {}
  for (const [k, v] of Object.entries(data)) {
    if (!/^\d{4}-\d{2}$/.test(k)) continue
    out[k] = Number(typeof v === 'object' ? (v?.[key] ?? v?.valor ?? 0) : v)
  }
  return out
}

export const useFin = create((set, g) => ({
  loaded: false,
  busy: false,
  mes: toISOMonth(),
  anio: new Date().getFullYear(),
  tab: 'dashboard',
  movModal: null, // { mov?, preset? }
  cuentaModal: null,
  objetivoModal: null,
  instrumentoModal: null,
  txModal: null,

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

  setMes: (mes) => set({ mes }),
  setAnio: (anio) => set({ anio }),
  setTab: (tab) => set({ tab }),
  openMov: (data = {}) => set({ movModal: data }),
  closeMov: () => set({ movModal: null }),
  openCuenta: (data = {}) => set({ cuentaModal: data }),
  closeCuenta: () => set({ cuentaModal: null }),
  openObjetivo: (data = {}) => set({ objetivoModal: data }),
  closeObjetivo: () => set({ objetivoModal: null }),
  openInstrumento: (data = {}) => set({ instrumentoModal: data }),
  closeInstrumento: () => set({ instrumentoModal: null }),
  openTx: (data = {}) => set({ txModal: data }),
  closeTx: () => set({ txModal: null }),

  fetchAll: async () => {
    set({ busy: true })
    // `safe` deja que un endpoint faltante (404/410) no tire toda la carga.
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
        cuentas: arr(cuentas).map(normalizeCuenta),
        categorias: arr(categorias).map(normalizeCategoria),
        movs: sortMovs(arr(movs).map(normalizeMov)),
        config: config && typeof config === 'object' ? config : {},
        notas: arr(notas),
        objetivos: arr(objetivos),
        instrumentos: arr(instrumentos),
        transacciones: arr(transacciones),
        fireFilas: toMesMap(fireFilas, 'ahorrado'),
        inflacion: toMesMap(inflacion, 'inflacion'),
        loaded: true,
        busy: false,
      })
    } catch (e) {
      set({ loaded: true, busy: false })
    }
  },

  refreshCuentas: async () => {
    try { set({ cuentas: arr(await get('/fin/cuentas')).map(normalizeCuenta) }) } catch { /* offline */ }
  },
  refreshCategorias: async () => {
    try {
      set({ categorias: arr(await get('/fin/categorias', { include_ocultas: true })).map(normalizeCategoria) })
    } catch { /* offline */ }
  },
  refreshMovs: async () => {
    try { set({ movs: sortMovs(arr(await get('/fin/movimientos')).map(normalizeMov)) }) } catch { /* offline */ }
  },
  refreshInversiones: async () => {
    try {
      const [instrumentos, transacciones] = await Promise.all([get('/fin/instrumentos'), get('/fin/transacciones')])
      set({ instrumentos: arr(instrumentos), transacciones: arr(transacciones) })
    } catch { /* offline */ }
  },

  // ── Dólar y config ──────────────────────────────────────────────────
  actualizarDolar: async () => {
    set({ busy: true })
    try {
      const cfg = await get('/fin/dolar/cotizacion')
      set({ config: { ...g().config, ...cfg }, busy: false })
      toast(`Dólar MEP actualizado: $${cfg?.dolar_mep ?? '—'}`)
      return true
    } catch (e) {
      set({ busy: false })
      reportError(e, 'No se pudo obtener la cotización')
      return false
    }
  },
  guardarConfig: async (parcial) => {
    const prev = g().config
    set({ config: { ...prev, ...parcial } })
    try {
      const cfg = await put('/fin/config', parcial)
      if (cfg && typeof cfg === 'object') set({ config: { ...prev, ...parcial, ...cfg } })
      return true
    } catch (e) {
      if (!e.network) set({ config: prev })
      reportError(e)
      return false
    }
  },

  // ── Movimientos ─────────────────────────────────────────────────────
  crearMov: async (data) => {
    const cuenta = g().cuentas.find((c) => c.id === data.cuenta_id)
    const temp = normalizeMov({ id: tmp--, ...data, cuenta_nombre: cuenta?.nombre, _pending: true })
    set((s) => ({ movs: sortMovs([temp, ...s.movs]) }))
    try {
      const m = normalizeMov(await post('/fin/movimientos', data))
      set((s) => ({ movs: sortMovs(s.movs.map((x) => (x.id === temp.id ? m : x))) }))
      g().refreshCuentas()
      const nueva = data.categoria_nombre &&
        !g().categorias.some((c) => nameOf(c).toLowerCase() === String(data.categoria_nombre).toLowerCase())
      if (nueva) g().refreshCategorias()
      return m
    } catch (e) {
      if (!e.network) set((s) => ({ movs: s.movs.filter((x) => x.id !== temp.id) }))
      reportError(e)
      return null
    }
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
      return true
    } catch (e) {
      if (!e.network) set({ movs: prev })
      reportError(e)
      return false
    }
  },
  borrarMovsBulk: async (ids) => {
    try {
      await api('/fin/movimientos/bulk', { method: 'DELETE', body: { ids } })
      set((s) => ({ movs: s.movs.filter((m) => !ids.includes(m.id)) }))
      g().refreshCuentas()
      toast(`${ids.length} movimiento${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}`)
      return true
    } catch (e) { reportError(e); return false }
  },
  editarMovsBulk: async (updates) => {
    try {
      const r = await patch('/fin/movimientos/bulk', { updates })
      const byId = new Map(arr(r?.movimientos).map((m) => [m.id, normalizeMov(m)]))
      if (byId.size) set((s) => ({ movs: sortMovs(s.movs.map((m) => byId.get(m.id) || m)) }))
      else await g().refreshMovs()
      g().refreshCuentas()
      g().refreshCategorias()
      toast(`${r?.actualizados ?? updates.length} movimientos actualizados`)
      return true
    } catch (e) { reportError(e); return false }
  },
  /** Una transferencia son dos movimientos `transfer`: sale de origen, entra a destino. */
  transferir: async ({ origen, destino, monto, moneda, fecha, descripcion }) => {
    const desc = descripcion || 'Transferencia'
    const a = await g().crearMov({ tipo: 'transfer', monto: Math.abs(monto), moneda, fecha, descripcion: desc, cuenta_id: origen })
    if (!a) return false
    const b = await g().crearMov({ tipo: 'transfer', monto: -Math.abs(monto), moneda, fecha, descripcion: desc, cuenta_id: destino })
    if (b) toast('Transferencia registrada')
    return !!b
  },
  duplicados: () => get('/fin/movimientos/duplicados').catch(() => []),
  importarCSV: async (filas) => {
    set({ busy: true })
    try {
      const r = await post('/fin/import/csv', { filas })
      await g().fetchAll()
      toast(`Importación completa · ${filas.length} filas`)
      return r
    } catch (e) {
      set({ busy: false })
      reportError(e)
      return null
    }
  },
  recalcularSaldos: async () => {
    try {
      await post('/fin/recalcular-saldos')
      await g().refreshCuentas()
      toast('Saldos recalculados desde los movimientos')
    } catch (e) { reportError(e) }
  },

  // ── Cuentas ─────────────────────────────────────────────────────────
  crearCuenta: async (data) => {
    try {
      const c = normalizeCuenta(await post('/fin/cuentas', data))
      set((s) => ({ cuentas: [...s.cuentas, c] }))
      if (data.saldo_ars || data.saldo_usd) g().refreshMovs()
      toast(`Cuenta “${c.nombre}” creada`)
      return c
    } catch (e) { reportError(e); return null }
  },
  editarCuenta: async (id, data) => {
    try {
      const c = normalizeCuenta(await patch(`/fin/cuentas/${id}`, data))
      set((s) => ({ cuentas: s.cuentas.map((x) => (x.id === id ? { ...x, ...c } : x)) }))
      return true
    } catch (e) { reportError(e); return false }
  },
  borrarCuenta: async (id) => {
    try {
      await del(`/fin/cuentas/${id}`)
      set((s) => ({ cuentas: s.cuentas.filter((c) => c.id !== id) }))
      toast('Cuenta eliminada')
      return true
    } catch (e) {
      // 409 = tiene movimientos: el backend la conserva a propósito.
      reportError(e, 'No se pudo eliminar la cuenta')
      return false
    }
  },
  /** Los saldos son derivados: para fijarlos se crea un movimiento de categoría Ajuste. */
  ajustarSaldo: async (cuenta, objetivoARS, objetivoUSD) => {
    const hoy = toISODate()
    const ops = []
    const dA = Number(objetivoARS) - Number(cuenta.ars || 0)
    const dU = Number(objetivoUSD) - Number(cuenta.usd || 0)
    if (Math.abs(dA) > 0.004) ops.push({ tipo: dA > 0 ? 'income' : 'expense', monto: Math.abs(dA), moneda: 'ARS' })
    if (Math.abs(dU) > 0.004) ops.push({ tipo: dU > 0 ? 'income' : 'expense', monto: Math.abs(dU), moneda: 'USD' })
    for (const o of ops) {
      await g().crearMov({ ...o, fecha: hoy, descripcion: 'Ajuste de saldo', cuenta_id: cuenta.id, categoria_nombre: 'Ajuste' })
    }
    if (ops.length) toast('Saldo ajustado con un movimiento de Ajuste')
    return ops.length > 0
  },

  // ── Categorías ──────────────────────────────────────────────────────
  crearCategoria: async (data) => {
    try {
      const c = normalizeCategoria(await post('/fin/categorias', data))
      set((s) => ({ categorias: [...s.categorias, c] }))
      toast(`Categoría “${c.nombre}” creada`)
      return c
    } catch (e) { reportError(e); return null }
  },
  editarCategoria: async (id, data) => {
    try {
      const c = normalizeCategoria(await patch(`/fin/categorias/${id}`, data))
      set((s) => ({ categorias: s.categorias.map((x) => (x.id === id ? { ...x, ...c } : x)) }))
      if (data.nombre) g().refreshMovs()
      return true
    } catch (e) { reportError(e); return false }
  },
  borrarCategoria: async (id) => {
    try {
      await del(`/fin/categorias/${id}`)
      set((s) => ({ categorias: s.categorias.filter((x) => x.id !== id) }))
      toast('Categoría eliminada')
      g().refreshMovs()
      return true
    } catch (e) { reportError(e); return false }
  },

  // ── Notas ───────────────────────────────────────────────────────────
  crearNota: async (contenido) => {
    try {
      const n = await post('/fin/notas', { contenido })
      set((s) => ({ notas: [n, ...s.notas] }))
      return n
    } catch (e) { reportError(e); return null }
  },
  borrarNota: async (id) => {
    const prev = g().notas
    set((s) => ({ notas: s.notas.filter((n) => n.id !== id) }))
    try { await del(`/fin/notas/${id}`) } catch (e) { if (!e.network) set({ notas: prev }); reportError(e) }
  },

  // ── Objetivos ───────────────────────────────────────────────────────
  crearObjetivo: async (data) => {
    try {
      const o = await post('/fin/objetivos', data)
      set((s) => ({ objetivos: [...s.objetivos, o] }))
      g().refreshCategorias()
      toast(`Objetivo “${o.nombre}” creado — ya tiene su categoría`)
      return o
    } catch (e) { reportError(e); return null }
  },
  /** Ojo: la API no acepta PATCH de `nombre` en objetivos (la categoría homónima lo fija). */
  editarObjetivo: async (id, data) => {
    const { nombre, ...resto } = data
    try {
      const o = await patch(`/fin/objetivos/${id}`, resto)
      set((s) => ({ objetivos: s.objetivos.map((x) => (x.id === id ? { ...x, ...o } : x)) }))
      return true
    } catch (e) { reportError(e); return false }
  },
  borrarObjetivo: async (id) => {
    try {
      await del(`/fin/objetivos/${id}`)
      set((s) => ({ objetivos: s.objetivos.filter((x) => x.id !== id) }))
      g().refreshCategorias()
      toast('Objetivo eliminado — su categoría queda oculta')
      return true
    } catch (e) { reportError(e); return false }
  },

  // ── Instrumentos y ledger ───────────────────────────────────────────
  crearInstrumento: async (data) => {
    try {
      await post('/fin/instrumentos', data)
      await g().refreshInversiones()
      toast('Instrumento creado')
      return true
    } catch (e) { reportError(e); return false }
  },
  editarInstrumento: async (id, data) => {
    try {
      await patch(`/fin/instrumentos/${id}`, data)
      await g().refreshInversiones()
      return true
    } catch (e) {
      // 409 = intentó editar cantidad/costo/ticker con transacciones existentes.
      reportError(e, 'Con operaciones cargadas, cantidad y costo se recalculan desde el ledger')
      return false
    }
  },
  borrarInstrumento: async (id) => {
    try {
      await del(`/fin/instrumentos/${id}`)
      await g().refreshInversiones()
      toast('Instrumento eliminado')
      return true
    } catch (e) { reportError(e); return false }
  },
  crearTransaccion: async (data) => {
    try {
      await post('/fin/transacciones', data)
      await g().refreshInversiones()
      toast('Operación registrada')
      return true
    } catch (e) { reportError(e); return false }
  },
  editarTransaccion: async (id, data) => {
    try {
      await patch(`/fin/transacciones/${id}`, data)
      await g().refreshInversiones()
      return true
    } catch (e) { reportError(e); return false }
  },
  borrarTransaccion: async (id) => {
    try {
      await del(`/fin/transacciones/${id}`)
      await g().refreshInversiones()
      toast('Operación eliminada')
      return true
    } catch (e) { reportError(e); return false }
  },

  // ── FIRE e inflación ────────────────────────────────────────────────
  setFireOverride: async (mes, valor) => {
    const prev = g().fireFilas
    const vacio = valor === null || valor === '' || valor === undefined
    set((s) => {
      const f = { ...s.fireFilas }
      if (vacio) delete f[mes]
      else f[mes] = Number(valor)
      return { fireFilas: f }
    })
    try {
      await put(`/fin/fire-filas/${mes}`, { ahorrado_override: vacio ? null : Number(valor) })
      return true
    } catch (e) {
      if (!e.network) set({ fireFilas: prev })
      reportError(e)
      return false
    }
  },
  setInflacion: async (mes, valor) => {
    const prev = g().inflacion
    const vacio = valor === null || valor === '' || valor === undefined
    set((s) => {
      const f = { ...s.inflacion }
      if (vacio) delete f[mes]
      else f[mes] = Number(valor)
      return { inflacion: f }
    })
    try {
      await put(`/fin/inflacion/${mes}`, { inflacion: vacio ? null : Number(valor) })
      return true
    } catch (e) {
      if (!e.network) set({ inflacion: prev })
      reportError(e)
      return false
    }
  },
}))

const arr = (x) => (Array.isArray(x) ? x : [])
