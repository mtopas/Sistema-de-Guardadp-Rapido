import { create } from 'zustand'
import { API_URL, DEBUG } from '../config'
import { categoriaDescendantIds } from '../utils/categoriaColors'
import { applyTheme, DEFAULT_THEME, DEFAULT_TONE, DEFAULT_FONT_PAIR, FONT_PAIRS, THEMES, TONES, ARCOIRIS_ACCENTS, pathToSection } from '../utils/themes'

function currentMes() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Evita re-render si el poll trae los mismos datos (parpadeo en Datos). */
function finPayloadEqual(a, b) {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

// Per-section themes — each module has its own independent theme + tone.
// Migration: if no per-section key exists yet, fall back to the old global key.
const _lgTheme   = localStorage.getItem('sgr-theme')
const _lgTone    = localStorage.getItem('sgr-tone')
const legacyTheme = (_lgTheme && THEMES[_lgTheme]) ? _lgTheme : DEFAULT_THEME
const legacyTone  = (_lgTone  && TONES[_lgTone])   ? _lgTone  : DEFAULT_TONE

const SECTION_KEYS = ['boveda', 'finanzas', 'agenda', 'habitos']
function _readSectionTheme(s) { const v = localStorage.getItem(`sgr-theme-${s}`); return (v && THEMES[v]) ? v : legacyTheme }
function _readSectionTone(s)  { const v = localStorage.getItem(`sgr-tone-${s}`);  return (v && TONES[v])  ? v : legacyTone  }

const initialSectionThemes = Object.fromEntries(SECTION_KEYS.map(s => [s, _readSectionTheme(s)]))
const initialSectionTones  = Object.fromEntries(SECTION_KEYS.map(s => [s, _readSectionTone(s)]))

const rawFontPair = localStorage.getItem('sgr-font-pair')
const savedFontPair = (rawFontPair && FONT_PAIRS[rawFontPair]) ? rawFontPair : DEFAULT_FONT_PAIR
if (rawFontPair && !FONT_PAIRS[rawFontPair]) localStorage.setItem('sgr-font-pair', savedFontPair)

// Apply arcoíris accent override inline (used in actions below)
function _applyArcoirisAccent(theme) {
  if (theme !== 'arcoiris') return
  const path = window.location.pathname
  const key  = Object.keys(ARCOIRIS_ACCENTS).find(k => path.startsWith(k)) || '/'
  const { accent, light, deep } = ARCOIRIS_ACCENTS[key]
  const root = document.documentElement
  root.style.setProperty('--accent',       accent)
  root.style.setProperty('--accent-light', light)
  root.style.setProperty('--accent-deep',  deep)
}

// Apply the starting section's theme immediately before first render
const startSection = pathToSection(window.location.pathname)
const startTheme   = initialSectionThemes[startSection]
const startTone    = initialSectionTones[startSection]
applyTheme(startTheme, startTone, savedFontPair)
_applyArcoirisAccent(startTheme)

const savedLang     = localStorage.getItem('sgr-lang')     || 'es'
const savedUserName = localStorage.getItem('sgr-username')  || ''

export const useStore = create((set, get) => ({
  hojas:      [],
  categorias: [],
  theme:          startTheme,
  tone:           startTone,
  fontPair:       savedFontPair,
  sectionThemes:  initialSectionThemes,
  sectionTones:   initialSectionTones,
  currentSection: startSection,
  lang:       savedLang,
  userName:   savedUserName,
  toast:      null,

  // --- Capture modal (floating, replaces /capture screen) ---
  captureOpen: false,
  captureDefaultCategoriaId: null,
  openCapture:     () => set({ captureOpen: true, captureDefaultCategoriaId: null }),
  openCaptureWith: (categoriaId) => set({ captureOpen: true, captureDefaultCategoriaId: categoriaId }),
  closeCapture:    () => set({ captureOpen: false, captureDefaultCategoriaId: null }),

  // --- Finanzas: movement modal + persistent state ---
  movementOpen:  false,
  openMovement:  () => set({ movementOpen: true }),
  closeMovement: () => set({ movementOpen: false }),

  // --- Agenda: evento modal ---
  agendaEventoOpen:  false,
  openAgendaEvento:  () => set({ agendaEventoOpen: true }),
  closeAgendaEvento: () => set({ agendaEventoOpen: false }),

  // --- Hábitos: nuevo hábito modal (triggered from TopBar CTA) ---
  habitoModalOpen:  false,
  openHabitoModal:  () => set({ habitoModalOpen: true }),
  closeHabitoModal: () => set({ habitoModalOpen: false }),

  // Finanzas state
  selectedMes:        currentMes(),
  finActiveTab:       'dashboard',
  setFinActiveTab:    (tab) => set({ finActiveTab: tab }),
  finMovimientos:     [],
  finMovimientosAll:  [],
  finCuentas:         [],
  finCategorias:      [],
  finConfig:          {},
  /** Vista previa del form FIRE (panel derecho) antes/después de guardar */
  finFirePreview:     null,
  setFinFirePreview:  (preview) => set({ finFirePreview: preview }),
  clearFinFirePreview: () => set({ finFirePreview: null }),
  finNotas:           [],
  finEmergenciaSaldo: 0,
  /** Pausa sync (poll) mientras se edita en Datos / modal movimiento */
  finSyncPaused:      false,
  setFinSyncPaused:     (paused) => {
    const prev = get().finSyncPaused
    set({ finSyncPaused: paused })
    if (prev && !paused) {
      const m = get().selectedMes
      get().fetchFinMovimientos(m)
      get().fetchFinMovimientosAll()
      get().fetchFinCuentas()
    }
  },

  fetchFinMovimientos: async (mes) => {
    try {
      const m = mes || currentMes()
      const res = await fetch(`${API_URL}/fin/movimientos?mes=${m}`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      if (finPayloadEqual(get().finMovimientos, data)) return
      set({ finMovimientos: data })
      if (DEBUG) console.log('fetchFinMovimientos:', data.length)
    } catch {
      if (DEBUG) console.log('fetchFinMovimientos: API error, keeping current state')
    }
  },

  setSelectedMes: async (mes) => {
    set({ selectedMes: mes })
    await get().fetchFinMovimientos(mes)
  },

  fetchFinEmergencia: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/emergencia`)
      if (!res.ok) throw new Error('not ok')
      const { saldo } = await res.json()
      set({ finEmergenciaSaldo: saldo ?? 0 })
    } catch {
      set({ finEmergenciaSaldo: 0 })
    }
  },

  fetchFinMovimientosAll: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/movimientos`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      if (finPayloadEqual(get().finMovimientosAll, data)) return
      set({ finMovimientosAll: data })
      if (DEBUG) console.log('fetchFinMovimientosAll:', data.length)
    } catch {
      if (DEBUG) console.log('fetchFinMovimientosAll: API error, keeping current state')
    }
  },

  addFinMovimiento: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/fin/movimientos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      const row = {
        ...data,
        desc: data.descripcion ?? '',
        cat: data.categoria_nombre ?? '',
      }
      set(state => ({
        finMovimientos:    [row, ...state.finMovimientos],
        finMovimientosAll: [row, ...state.finMovimientosAll],
      }))
      if (DEBUG) console.log('addFinMovimiento (API):', data)
      get().fetchFinMovimientosAll()
      get().fetchFinMovimientos(get().selectedMes)
      get().fetchFinCuentas()
      get().fetchFinCategorias()
    } catch {
      const id = `m_${Date.now()}`
      const full = { id, ...payload }
      set(state => ({
        finMovimientos:    [full, ...state.finMovimientos],
        finMovimientosAll: [full, ...state.finMovimientosAll],
      }))
      if (DEBUG) console.log('addFinMovimiento (mock):', full)
    }
  },

  deleteFinMovimiento: async (id) => {
    try {
      await fetch(`${API_URL}/fin/movimientos/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
    set(state => ({
      finMovimientos:    state.finMovimientos.filter(m => m.id !== id),
      finMovimientosAll: state.finMovimientosAll.filter(m => m.id !== id),
    }))
    get().fetchFinCuentas()
    if (DEBUG) console.log('deleteFinMovimiento:', id)
  },

  updateFinMovimiento: async (id, patch) => {
    const merged = { ...patch }
    if (merged.descripcion !== undefined) merged.desc = merged.descripcion
    if (merged.categoria_nombre !== undefined) merged.cat = merged.categoria_nombre
    set(state => ({
      finMovimientos:    state.finMovimientos.map(m    => m.id === id ? { ...m, ...merged } : m),
      finMovimientosAll: state.finMovimientosAll.map(m => m.id === id ? { ...m, ...merged } : m),
    }))
    try {
      await fetch(`${API_URL}/fin/movimientos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      get().fetchFinMovimientosAll()
    } catch { /* offline ok */ }
    get().fetchFinCuentas()
    if (DEBUG) console.log('updateFinMovimiento:', id, patch)
  },

  recalcularFinSaldos: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/recalcular-saldos`, { method: 'POST' })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finCuentas: data })
      if (DEBUG) console.log('recalcularFinSaldos:', data.length, 'cuentas')
      return true
    } catch (e) {
      if (DEBUG) console.error('recalcularFinSaldos:', e)
      return false
    }
  },

  createFinCuenta: async (nombre, tipo, color, initials, saldo_ars = 0, saldo_usd = 0) => {
    const optimistic = { id: Date.now(), name: nombre, tipo, color, initials, ars: saldo_ars, usd: saldo_usd }
    set(state => ({ finCuentas: [...state.finCuentas, optimistic] }))
    try {
      const res = await fetch(`${API_URL}/fin/cuentas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, tipo, color, initials, saldo_ars, saldo_usd }),
      })
      if (!res.ok) throw new Error('not ok')
      const created = await res.json()
      set(state => ({ finCuentas: state.finCuentas.map(c => c.id === optimistic.id ? created : c) }))
      if (saldo_ars > 0 || saldo_usd > 0) {
        await get().fetchFinMovimientos(get().selectedMes)
        await get().fetchFinMovimientosAll()
      }
    } catch {
      // keep optimistic
    }
    if (DEBUG) console.log('createFinCuenta:', nombre, tipo)
  },

  editFinCuentaMeta: async (id, nombre, tipo, color, initials) => {
    set(state => ({
      finCuentas: state.finCuentas.map(c => c.id === id ? { ...c, name: nombre, tipo, color, initials } : c),
    }))
    try {
      const res = await fetch(`${API_URL}/fin/cuentas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, tipo, color, initials }),
      })
      if (!res.ok) throw new Error('not ok')
      const updated = await res.json()
      set(state => ({ finCuentas: state.finCuentas.map(c => c.id === id ? { ...c, ...updated } : c) }))
    } catch {
      // keep optimistic
    }
    if (DEBUG) console.log('editFinCuentaMeta:', id, nombre)
  },

  deleteFinCuenta: async (id) => {
    set(state => ({ finCuentas: state.finCuentas.filter(c => c.id !== id) }))
    try {
      await fetch(`${API_URL}/fin/cuentas/${id}`, { method: 'DELETE' })
    } catch {
      // offline: optimistic delete stands
    }
    if (DEBUG) console.log('deleteFinCuenta:', id)
  },

  fetchFinCuentas: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/cuentas`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      if (finPayloadEqual(get().finCuentas, data)) return
      set({ finCuentas: data })
      if (DEBUG) console.log('fetchFinCuentas:', data)
    } catch {
      if (DEBUG) console.log('fetchFinCuentas: API error, keeping current state')
    }
  },

  fetchFinCategorias: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/categorias`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finCategorias: data })
      if (DEBUG) console.log('fetchFinCategorias:', data)
      return data
    } catch {
      if (DEBUG) console.log('fetchFinCategorias: API error, keeping current state')
      return null
    }
  },

  createFinCategoria: async (nombre, tipo = 'expense', color = null) => {
    try {
      const res = await fetch(`${API_URL}/fin/categorias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), tipo, color }),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))).detail || 'Error al crear categoría'
        get().showToast(typeof detail === 'string' ? detail : 'Error al crear categoría', 'error')
        return null
      }
      const created = await res.json()
      await get().fetchFinCategorias()
      get().showToast('Categoría creada', 'success')
      if (DEBUG) console.log('createFinCategoria:', created)
      return created
    } catch (e) {
      if (DEBUG) console.error('createFinCategoria:', e)
      get().showToast('Error al crear categoría', 'error')
      return null
    }
  },

  updateFinCategoria: async (id, { nombre, tipo, color }) => {
    try {
      const body = {}
      if (nombre !== undefined) body.nombre = nombre
      if (tipo !== undefined) body.tipo = tipo
      if (color !== undefined) body.color = color
      const res = await fetch(`${API_URL}/fin/categorias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))).detail || 'Error al actualizar'
        get().showToast(typeof detail === 'string' ? detail : 'Error al actualizar categoría', 'error')
        return false
      }
      await get().fetchFinCategorias()
      get().showToast('Categoría actualizada', 'success')
      if (DEBUG) console.log('updateFinCategoria:', id, body)
      return true
    } catch (e) {
      if (DEBUG) console.error('updateFinCategoria:', e)
      get().showToast('Error al actualizar categoría', 'error')
      return false
    }
  },

  deleteFinCategoria: async (id) => {
    try {
      const res = await fetch(`${API_URL}/fin/categorias/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))).detail || 'No se pudo eliminar'
        get().showToast(typeof detail === 'string' ? detail : 'Error al eliminar categoría', 'error')
        return false
      }
      await get().fetchFinCategorias()
      get().showToast('Categoría eliminada', 'success')
      if (DEBUG) console.log('deleteFinCategoria:', id)
      return true
    } catch (e) {
      if (DEBUG) console.error('deleteFinCategoria:', e)
      get().showToast('Error al eliminar categoría', 'error')
      return false
    }
  },

  fetchFinConfig: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/config`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finConfig: data })
      if (DEBUG) console.log('fetchFinConfig:', data)
    } catch {
      if (DEBUG) console.log('fetchFinConfig: API error, keeping current state')
    }
  },

  updateFinConfig: async (clave, valor) => {
    try {
      const res = await fetch(`${API_URL}/fin/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [clave]: valor }),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finConfig: data })
    } catch {
      set(state => ({ finConfig: { ...state.finConfig, [clave]: valor } }))
    }
    if (DEBUG) console.log('updateFinConfig:', clave, valor)
  },

  saveFinConfigBulk: async (updates) => {
    try {
      const res = await fetch(`${API_URL}/fin/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finConfig: data, finFirePreview: null })
    } catch {
      set(state => ({ finConfig: { ...state.finConfig, ...updates }, finFirePreview: null }))
    }
    if (DEBUG) console.log('saveFinConfigBulk:', Object.keys(updates))
  },

  fetchDolarCotizacion: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/dolar/cotizacion`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finConfig: data })
      if (DEBUG) console.log('fetchDolarCotizacion: ok')
    } catch {
      if (DEBUG) console.log('fetchDolarCotizacion: API error, keeping current state')
    }
  },

  fetchFinNotas: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/notas`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finNotas: data })
      if (DEBUG) console.log('fetchFinNotas:', data)
    } catch {
      set({ finNotas: [] })
      if (DEBUG) console.log('fetchFinNotas: using empty fallback')
    }
  },

  addFinNota: async (contenido) => {
    try {
      const res = await fetch(`${API_URL}/fin/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido }),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({ finNotas: [...state.finNotas, data] }))
    } catch {
      const nota = { id: `n_${Date.now()}`, contenido, fecha: new Date().toISOString() }
      set(state => ({ finNotas: [...state.finNotas, nota] }))
    }
    if (DEBUG) console.log('addFinNota:', contenido)
  },

  deleteFinNota: async (id) => {
    try {
      await fetch(`${API_URL}/fin/notas/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
    set(state => ({ finNotas: state.finNotas.filter(n => n.id !== id) }))
    if (DEBUG) console.log('deleteFinNota:', id)
  },

  // ---------------------------------------------------------------------------
  // Finanzas — Instrumentos
  // ---------------------------------------------------------------------------
  finInstrumentos: [],

  fetchFinInstrumentos: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finInstrumentos: data })
    } catch {
      if (DEBUG) console.log('fetchFinInstrumentos: API error, keeping current state')
    }
  },

  addFinInstrumento: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({ finInstrumentos: [...state.finInstrumentos, data] }))
      return data
    } catch {
      const mock = { id: `i_${Date.now()}`, ...payload }
      set(state => ({ finInstrumentos: [...state.finInstrumentos, mock] }))
      return mock
    }
  },

  updateFinInstrumento: async (id, patch) => {
    set(state => ({
      finInstrumentos: state.finInstrumentos.map(i => i.id === id ? { ...i, ...patch } : i),
    }))
    try {
      await fetch(`${API_URL}/fin/instrumentos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteFinInstrumento: async (id) => {
    set(state => ({ finInstrumentos: state.finInstrumentos.filter(i => i.id !== id) }))
    try {
      await fetch(`${API_URL}/fin/instrumentos/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
  },

  // ---------------------------------------------------------------------------
  // Finanzas — Ledger transacciones
  // ---------------------------------------------------------------------------
  finTransacciones: [],

  fetchFinTransacciones: async (params = {}) => {
    try {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
      ).toString()
      const res = await fetch(`${API_URL}/fin/transacciones${qs ? '?' + qs : ''}`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finTransacciones: data })
    } catch {
      if (DEBUG) console.log('fetchFinTransacciones: API error')
    }
  },

  addFinTransaccion: async (instrumento_id, payload) => {
    const mock = { id: `t_${Date.now()}`, instrumento_id, ...payload }
    set(state => ({ finTransacciones: [mock, ...state.finTransacciones] }))
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos/${instrumento_id}/transacciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'error')
      }
      const data = await res.json()
      set(state => ({
        finTransacciones: state.finTransacciones.map(t => t.id === mock.id ? data : t),
      }))
      await get().fetchFinInstrumentos()
      return data
    } catch (err) {
      set(state => ({ finTransacciones: state.finTransacciones.filter(t => t.id !== mock.id) }))
      throw err
    }
  },

  updateFinTransaccion: async (id, patch) => {
    const prev = get().finTransacciones
    set(state => ({
      finTransacciones: state.finTransacciones.map(t => t.id === id ? { ...t, ...patch } : t),
    }))
    try {
      const res = await fetch(`${API_URL}/fin/transacciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({
        finTransacciones: state.finTransacciones.map(t => t.id === id ? data : t),
      }))
      await get().fetchFinInstrumentos()
      return data
    } catch {
      set({ finTransacciones: prev })
    }
  },

  deleteFinTransaccion: async (id) => {
    const prev = get().finTransacciones
    set(state => ({ finTransacciones: state.finTransacciones.filter(t => t.id !== id) }))
    try {
      const res = await fetch(`${API_URL}/fin/transacciones/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('not ok')
      await get().fetchFinInstrumentos()
    } catch {
      set({ finTransacciones: prev })
    }
  },

  // ---------------------------------------------------------------------------
  // Finanzas — Objetivos de ahorro
  // ---------------------------------------------------------------------------
  finObjetivos: [],

  fetchFinObjetivos: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/objetivos`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finObjetivos: data })
    } catch {
      set({ finObjetivos: [] })
    }
  },

  addFinObjetivo: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/fin/objetivos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({ finObjetivos: [...state.finObjetivos, data] }))
      await get().fetchFinCategorias()
      return data
    } catch {
      const mock = { id: `o_${Date.now()}`, fecha_creacion: new Date().toISOString(), ...payload }
      set(state => ({ finObjetivos: [...state.finObjetivos, mock] }))
      return mock
    }
  },

  updateFinObjetivo: async (id, patch) => {
    set(state => ({
      finObjetivos: state.finObjetivos.map(o => o.id === id ? { ...o, ...patch } : o),
    }))
    try {
      await fetch(`${API_URL}/fin/objetivos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteFinObjetivo: async (id) => {
    const prev = get().finObjetivos
    const sid = String(id)
    set(state => ({
      finObjetivos: state.finObjetivos.filter(o => String(o.id) !== sid),
    }))
    try {
      const res = await fetch(`${API_URL}/fin/objetivos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('not ok')
      await get().fetchFinCategorias()
    } catch {
      set({ finObjetivos: prev })
      get().showToast('No se pudo eliminar el objetivo', 'error')
    }
  },

  // ---------------------------------------------------------------------------
  // Finanzas — FIRE filas (ahorrado override por mes)
  // ---------------------------------------------------------------------------
  finFireFilas: {},

  fetchFinFireFilas: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/fire-filas`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finFireFilas: data })
    } catch {
      set({ finFireFilas: {} })
    }
  },

  upsertFinFireFila: async (mes, ahorrado_override) => {
    set(state => ({
      finFireFilas: ahorrado_override == null
        ? Object.fromEntries(Object.entries(state.finFireFilas).filter(([k]) => k !== mes))
        : { ...state.finFireFilas, [mes]: ahorrado_override },
    }))
    try {
      await fetch(`${API_URL}/fin/fire-filas/${mes}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ahorrado_override }),
      })
    } catch { /* offline ok */ }
  },

  // ---------------------------------------------------------------------------
  // Finanzas — Inflación mensual
  // ---------------------------------------------------------------------------
  finInflacion: {},

  fetchFinInflacion: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/inflacion`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finInflacion: data })
    } catch {
      set({ finInflacion: {} })
    }
  },

  upsertFinInflacion: async (mes, inflacion) => {
    set(state => ({
      finInflacion: inflacion == null
        ? Object.fromEntries(Object.entries(state.finInflacion).filter(([k]) => k !== mes))
        : { ...state.finInflacion, [mes]: inflacion },
    }))
    try {
      await fetch(`${API_URL}/fin/inflacion/${mes}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inflacion }),
      })
    } catch { /* offline ok */ }
    if (DEBUG) console.log('upsertFinInflacion:', mes, inflacion)
  },

  // ---------------------------------------------------------------------------
  // Agenda
  // ---------------------------------------------------------------------------
  agendaCalendarios:     [],
  agendaEventos:         [],
  agendaListas:          [],
  agendaTareas:          [],
  agendaHorarioFacultad: [],
  agendaActiveTab:       'hoy',
  setAgendaActiveTab:    (tab) => set({ agendaActiveTab: tab }),
  // Navigation state — persisted in store so tabs can unmount/remount without losing position
  agendaHoyViewISO:      null,
  agendaMesYear:         null,
  agendaMesMonth:        null,
  setAgendaHoyViewISO:   (iso) => set({ agendaHoyViewISO: iso }),
  setAgendaMesPosition:  (year, month) => set({ agendaMesYear: year, agendaMesMonth: month }),

  fetchAgendaCalendarios: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/calendarios`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaCalendarios: await res.json() })
    } catch {
      if (DEBUG) console.log('fetchAgendaCalendarios: API error, keeping current state')
    }
  },

  addAgendaCalendario: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/calendarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaCalendarios: [...s.agendaCalendarios, data] }))
      return data
    } catch {
      const mock = { id: `cal_${Date.now()}`, activo: true, ...payload }
      set(s => ({ agendaCalendarios: [...s.agendaCalendarios, mock] }))
      return mock
    }
  },

  updateAgendaCalendario: async (id, patch) => {
    set(s => ({ agendaCalendarios: s.agendaCalendarios.map(c => c.id === id ? { ...c, ...patch } : c) }))
    try {
      await fetch(`${API_URL}/agenda/calendarios/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaCalendario: async (id) => {
    set(s => ({ agendaCalendarios: s.agendaCalendarios.filter(c => c.id !== id) }))
    try { await fetch(`${API_URL}/agenda/calendarios/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaEventos: async (desde, hasta) => {
    try {
      const params = new URLSearchParams()
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      const res = await fetch(`${API_URL}/agenda/eventos?${params}`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaEventos: await res.json() })
    } catch { set({ agendaEventos: [] }) }
  },

  addAgendaEvento: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/eventos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaEventos: [...s.agendaEventos, data] }))
      return data
    } catch {
      const mock = { id: `evt_${Date.now()}`, calendario_color: '#2563eb', calendario_nombre: '', ...payload }
      set(s => ({ agendaEventos: [...s.agendaEventos, mock] }))
      return mock
    }
  },

  updateAgendaEvento: async (id, patch) => {
    set(s => ({ agendaEventos: s.agendaEventos.map(e => e.id === id ? { ...e, ...patch } : e) }))
    try {
      await fetch(`${API_URL}/agenda/eventos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaEvento: async (id) => {
    set(s => ({ agendaEventos: s.agendaEventos.filter(e => e.id !== id) }))
    try { await fetch(`${API_URL}/agenda/eventos/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaListas: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/listas`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaListas: await res.json() })
    } catch { set({ agendaListas: [] }) }
  },

  addAgendaLista: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/listas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaListas: [...s.agendaListas, data] }))
      return data
    } catch {
      const mock = { id: `lst_${Date.now()}`, ...payload }
      set(s => ({ agendaListas: [...s.agendaListas, mock] }))
      return mock
    }
  },

  updateAgendaLista: async (id, patch) => {
    set(s => ({ agendaListas: s.agendaListas.map(l => l.id === id ? { ...l, ...patch } : l) }))
    try {
      await fetch(`${API_URL}/agenda/listas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaLista: async (id) => {
    set(s => ({
      agendaListas:  s.agendaListas.filter(l => l.id !== id),
      agendaTareas:  s.agendaTareas.filter(t => t.lista_id !== id),
    }))
    try { await fetch(`${API_URL}/agenda/listas/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaTareas: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/tareas`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaTareas: await res.json() })
    } catch { set({ agendaTareas: [] }) }
  },

  addAgendaTarea: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/tareas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaTareas: [...s.agendaTareas, data] }))
      return data
    } catch {
      const mock = { id: `tarea_${Date.now()}`, completada: false, lista_color: '#7c3aed', lista_nombre: '', ...payload }
      set(s => ({ agendaTareas: [...s.agendaTareas, mock] }))
      return mock
    }
  },

  updateAgendaTarea: async (id, patch) => {
    set(s => ({ agendaTareas: s.agendaTareas.map(t => t.id === id ? { ...t, ...patch } : t) }))
    try {
      await fetch(`${API_URL}/agenda/tareas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaTarea: async (id) => {
    set(s => ({ agendaTareas: s.agendaTareas.filter(t => t.id !== id) }))
    try { await fetch(`${API_URL}/agenda/tareas/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaHorarioFacultad: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/horario-facultad`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaHorarioFacultad: await res.json() })
    } catch { set({ agendaHorarioFacultad: [] }) }
  },

  addAgendaHorarioFacultad: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/horario-facultad`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaHorarioFacultad: [...s.agendaHorarioFacultad, data] }))
      return data
    } catch {
      const mock = { id: `hf_${Date.now()}`, ...payload }
      set(s => ({ agendaHorarioFacultad: [...s.agendaHorarioFacultad, mock] }))
      return mock
    }
  },

  updateAgendaHorarioFacultad: async (id, patch) => {
    set(s => ({ agendaHorarioFacultad: s.agendaHorarioFacultad.map(h => h.id === id ? { ...h, ...patch } : h) }))
    try {
      await fetch(`${API_URL}/agenda/horario-facultad/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaHorarioFacultad: async (id) => {
    set(s => ({ agendaHorarioFacultad: s.agendaHorarioFacultad.filter(h => h.id !== id) }))
    try { await fetch(`${API_URL}/agenda/horario-facultad/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  // ---------------------------------------------------------------------------
  // Hábitos
  // ---------------------------------------------------------------------------
  habitos:          [],
  habitosRegistros: [],

  fetchHabitos: async () => {
    try {
      const res = await fetch(`${API_URL}/habitos`)
      if (!res.ok) throw new Error('not ok')
      set({ habitos: await res.json() })
    } catch {
      if (DEBUG) console.log('fetchHabitos: API error, keeping current state')
    }
  },

  fetchHabitosRegistros: async (fechaDesde, fechaHasta) => {
    try {
      const params = new URLSearchParams()
      if (fechaDesde) params.set('fecha_desde', fechaDesde)
      if (fechaHasta) params.set('fecha_hasta', fechaHasta)
      const res = await fetch(`${API_URL}/habitos/registros?${params}`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      if (fechaDesde || fechaHasta) {
        // merge: replace registros in the fetched range, keep the rest
        set(s => {
          const fuera = s.habitosRegistros.filter(r =>
            (fechaDesde && r.fecha < fechaDesde) || (fechaHasta && r.fecha > fechaHasta)
          )
          return { habitosRegistros: [...fuera, ...data] }
        })
      } else {
        set({ habitosRegistros: data })
      }
    } catch { /* keep existing */ }
  },

  addHabito: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/habitos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ habitos: [...s.habitos, data] }))
      return data
    } catch {
      const mock = { id: `h_${Date.now()}`, activo: true, creado_en: new Date().toISOString(), ...payload }
      set(s => ({ habitos: [...s.habitos, mock] }))
      return mock
    }
  },

  updateHabito: async (id, patch) => {
    set(s => ({ habitos: s.habitos.map(h => h.id === id ? { ...h, ...patch } : h) }))
    try {
      await fetch(`${API_URL}/habitos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteHabito: async (id) => {
    set(s => ({
      habitos:          s.habitos.filter(h => h.id !== id),
      habitosRegistros: s.habitosRegistros.filter(r => r.habito_id !== id),
    }))
    try { await fetch(`${API_URL}/habitos/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  upsertHabitoRegistro: async (habitoId, fecha, valor, nota) => {
    const key = `${habitoId}-${fecha}`
    // optimistic: update or insert in local slice
    set(s => {
      const existing = s.habitosRegistros.find(r => r.habito_id === habitoId && r.fecha === fecha)
      if (existing) {
        return { habitosRegistros: s.habitosRegistros.map(r =>
          r.habito_id === habitoId && r.fecha === fecha ? { ...r, valor, nota } : r
        )}
      }
      const mock = { id: `reg_${Date.now()}`, habito_id: habitoId, fecha, valor, nota, creado_en: new Date().toISOString() }
      return { habitosRegistros: [...s.habitosRegistros, mock] }
    })
    try {
      const res = await fetch(`${API_URL}/habitos/${habitoId}/registro`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, valor, nota }),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ habitosRegistros: s.habitosRegistros.map(r =>
        r.habito_id === habitoId && r.fecha === fecha ? data : r
      )}))
    } catch { /* offline ok — optimistic update stays */ }
    if (DEBUG) console.log('upsertHabitoRegistro:', key, valor)
  },

  deleteHabitoRegistro: async (registroId, habitoId, fecha) => {
    set(s => ({ habitosRegistros: s.habitosRegistros.filter(r => !(r.habito_id === habitoId && r.fecha === fecha)) }))
    try { await fetch(`${API_URL}/habitos/registros/${registroId}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  // --- User name ---
  setUserName: (name) => {
    localStorage.setItem('sgr-username', name)
    set({ userName: name })
  },

  // --- Language ---
  setLang: (l) => {
    localStorage.setItem('sgr-lang', l)
    set({ lang: l })
    if (DEBUG) console.log('lang set:', l)
  },

  // --- Theme (per-section) ---
  setTheme: (key) => {
    const { currentSection, sectionTones, fontPair } = get()
    applyTheme(key, sectionTones[currentSection], fontPair)
    _applyArcoirisAccent(key)
    localStorage.setItem(`sgr-theme-${currentSection}`, key)
    set({ theme: key, sectionThemes: { ...get().sectionThemes, [currentSection]: key } })
    if (DEBUG) console.log('theme set:', key, 'for', currentSection)
  },

  // --- Tone (per-section, modificador del theme) ---
  setTone: (key) => {
    const { currentSection, sectionThemes, fontPair } = get()
    const theme = sectionThemes[currentSection]
    applyTheme(theme, key, fontPair)
    _applyArcoirisAccent(theme)
    localStorage.setItem(`sgr-tone-${currentSection}`, key)
    set({ tone: key, sectionTones: { ...get().sectionTones, [currentSection]: key } })
    if (DEBUG) console.log('tone set:', key, 'for', currentSection)
  },

  // --- Font pair (global — tipografía independiente de la sección) ---
  setFontPair: (key) => {
    const { currentSection, sectionThemes, sectionTones } = get()
    const theme = sectionThemes[currentSection]
    applyTheme(theme, sectionTones[currentSection], key)
    _applyArcoirisAccent(theme)
    localStorage.setItem('sgr-font-pair', key)
    set({ fontPair: key })
    if (DEBUG) console.log('fontPair set:', key)
  },

  // --- Switch active section (called by Layout on route change) ---
  setCurrentSection: (section) => {
    const { sectionThemes, sectionTones, fontPair } = get()
    const theme = sectionThemes[section]
    const tone  = sectionTones[section]
    applyTheme(theme, tone, fontPair)
    _applyArcoirisAccent(theme)
    set({ currentSection: section, theme, tone })
  },

  // --- Set theme for a specific section (used by SettingsScreen) ---
  setThemeForSection: (section, key) => {
    const { currentSection, sectionTones, fontPair } = get()
    localStorage.setItem(`sgr-theme-${section}`, key)
    const newSectionThemes = { ...get().sectionThemes, [section]: key }
    set({ sectionThemes: newSectionThemes })
    if (section === currentSection) {
      applyTheme(key, sectionTones[section], fontPair)
      _applyArcoirisAccent(key)
      set({ theme: key })
    }
    if (DEBUG) console.log('themeForSection set:', key, 'for', section)
  },

  // --- Toast ---
  _toastTimer: null,
  showToast: (message, type = 'success') => {
    const s = get()
    if (s._toastTimer) clearTimeout(s._toastTimer)
    const id = setTimeout(() => set({ toast: null, _toastTimer: null }), 2500)
    set({ toast: { message, type }, _toastTimer: id })
  },

  // --- Categorias ---
  fetchCategorias: async () => {
    try {
      const res = await fetch(`${API_URL}/categorias`)
      const data = await res.json()
      set({ categorias: data })
      if (DEBUG) console.log('fetchCategorias:', data.length)
    } catch (e) {
      if (DEBUG) console.error('fetchCategorias:', e)
    }
  },

  crearCategoria: async (nombre, padre_id = null) => {
    try {
      const res = await fetch(`${API_URL}/categorias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, padre_id }),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))).detail || 'Error al crear categoría'
        get().showToast(detail, 'error')
        return null
      }
      const data = await res.json()
      await get().fetchCategorias()
      if (DEBUG) console.log('crearCategoria:', data)
      return data
    } catch (e) {
      if (DEBUG) console.error('crearCategoria:', e)
      get().showToast('Error al crear categoría', 'error')
      return null
    }
  },

  actualizarCategoria: async (id, { nombre, icono, color }) => {
    try {
      const body = {}
      if (nombre !== undefined) body.nombre = nombre
      if (icono !== undefined) body.icono = icono
      if (color !== undefined) body.color = color
      const res = await fetch(`${API_URL}/categorias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))).detail || 'Error al actualizar categoría'
        get().showToast(detail, 'error')
        return false
      }
      const updated = await res.json()
      const desc = color !== undefined ? categoriaDescendantIds(get().categorias, id) : []
      set({
        categorias: get().categorias.map(c => {
          if (c.id === id) {
            return {
              ...c,
              ...updated,
              ...(nombre !== undefined ? { nombre } : {}),
              ...(icono !== undefined ? { icono } : {}),
              ...(color !== undefined ? { color } : {}),
            }
          }
          if (color !== undefined && desc.includes(c.id)) {
            return { ...c, color }
          }
          return c
        }),
      })
      await get().fetchCategorias()
      get().showToast('Categoría actualizada', 'success')
      if (DEBUG) console.log('actualizarCategoria:', id, body, updated)
      return true
    } catch (e) {
      if (DEBUG) console.error('actualizarCategoria:', e)
      get().showToast('Error al actualizar categoría', 'error')
      return false
    }
  },

  // --- Hojas ---
  fetchHojas: async () => {
    try {
      const res = await fetch(`${API_URL}/hojas`)
      const data = await res.json()
      set({ hojas: data })
      if (DEBUG) console.log('fetchHojas:', data.length)
    } catch (e) {
      if (DEBUG) console.error('fetchHojas:', e)
    }
  },

  crearHoja: async (payload) => {
    // Optimistic: add a temporary entry immediately so the graph/list updates
    const tempId = `tmp_${Date.now()}`
    const optimistic = {
      id: tempId,
      contenido: payload.contenido ?? '',
      tipo: payload.tipo ?? 'texto',
      categoria_id: payload.categoria_id,
      categoria_nombre: payload.categoria_nombre ?? '',
      fecha: new Date().toISOString(),
      apuntes: null, icono: null, fecha_actualizado: new Date().toISOString(),
    }
    set(state => ({ hojas: [optimistic, ...state.hojas] }))
    try {
      const res = await fetch(`${API_URL}/hojas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).detail)
      await get().fetchHojas()  // replace temp with real data
      if (DEBUG) console.log('crearHoja:', payload.tipo)
    } catch (e) {
      // Rollback optimistic entry
      set(state => ({ hojas: state.hojas.filter(h => h.id !== tempId) }))
      throw e
    }
  },

  eliminarHoja: async (id) => {
    // Optimistic remove
    set(state => ({ hojas: state.hojas.filter(h => h.id !== id) }))
    try {
      await fetch(`${API_URL}/hojas/${id}`, { method: 'DELETE' })
    } catch {
      // Restore on failure — refetch to get correct state
      get().fetchHojas()
    }
    if (DEBUG) console.log('eliminarHoja:', id)
  },

  /** Generic PATCH for a hoja — updates contenido, categoria_id, tipo, apuntes, icono */
  updateHoja: async (id, patch) => {
    const extra = {}
    if (patch.categoria_id != null) {
      const cat = get().categorias.find(c => c.id === patch.categoria_id)
      if (cat) extra.categoria_nombre = cat.nombre
    }
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, ...patch, ...extra } : h),
    }))
    try {
      const res = await fetch(`${API_URL}/hojas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Error al actualizar hoja')
      const { fecha_actualizado } = await res.json().catch(() => ({}))
      if (fecha_actualizado) {
        set(state => ({
          hojas: state.hojas.map(h => h.id === id ? { ...h, fecha_actualizado } : h),
        }))
      }
    } catch (e) {
      get().fetchHojas()
      throw e
    }
    if (DEBUG) console.log('updateHoja:', id, patch)
  },

  updateIcono: async (id, icono) => {
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, icono } : h),
    }))
    try {
      const res = await fetch(`${API_URL}/hojas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icono }),
      })
      if (!res.ok) throw new Error('Error al guardar icono')
      const { fecha_actualizado } = await res.json().catch(() => ({}))
      if (fecha_actualizado) {
        set(state => ({
          hojas: state.hojas.map(h => h.id === id ? { ...h, fecha_actualizado } : h),
        }))
      }
    } catch { /* noop — optimistic already applied */ }
    if (DEBUG) console.log('updateIcono:', id, icono)
  },

  updateApuntes: async (id, apuntes) => {
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, apuntes } : h),
    }))
    try {
      const res = await fetch(`${API_URL}/hojas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apuntes }),
      })
      if (!res.ok) throw new Error('Error al guardar apuntes')
      const { fecha_actualizado } = await res.json().catch(() => ({}))
      if (fecha_actualizado) {
        set(state => ({
          hojas: state.hojas.map(h => h.id === id ? { ...h, apuntes, fecha_actualizado } : h),
        }))
      }
    } catch { /* noop — autosave will retry */ }
    if (DEBUG) console.log('updateApuntes:', id)
  },
}))
