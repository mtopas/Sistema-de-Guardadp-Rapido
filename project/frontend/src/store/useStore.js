import { create } from 'zustand'
import { API_URL, DEBUG } from '../config'
import { applyTheme, DEFAULT_THEME, DEFAULT_TONE, DEFAULT_FONT_PAIR, FONT_PAIRS, THEMES, TONES } from '../utils/themes'
import { FINANZAS } from '../data/finanzas'

function currentMes() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Apply saved theme + tone + font pair immediately before first render
// Migrate: if localStorage holds a key from an old set, fall back to default.
const rawTheme    = localStorage.getItem('sgr-theme')
const rawTone     = localStorage.getItem('sgr-tone')
const rawFontPair = localStorage.getItem('sgr-font-pair')
const savedTheme    = (rawTheme    && THEMES[rawTheme])         ? rawTheme    : DEFAULT_THEME
const savedTone     = (rawTone     && TONES[rawTone])           ? rawTone     : DEFAULT_TONE
const savedFontPair = (rawFontPair && FONT_PAIRS[rawFontPair])  ? rawFontPair : DEFAULT_FONT_PAIR
if (rawTheme    && !THEMES[rawTheme])         localStorage.setItem('sgr-theme',     savedTheme)
if (rawTone     && !TONES[rawTone])           localStorage.setItem('sgr-tone',      savedTone)
if (rawFontPair && !FONT_PAIRS[rawFontPair])  localStorage.setItem('sgr-font-pair', savedFontPair)
applyTheme(savedTheme, savedTone, savedFontPair)

const savedLang     = localStorage.getItem('sgr-lang')     || 'es'
const savedUserName = localStorage.getItem('sgr-username')  || ''

export const useStore = create((set, get) => ({
  hojas:      [],
  categorias: [],
  theme:      savedTheme,
  tone:       savedTone,
  fontPair:   savedFontPair,
  lang:       savedLang,
  userName:   savedUserName,
  toast:      null,

  // --- Capture modal (floating, replaces /capture screen) ---
  captureOpen: false,
  openCapture:  () => set({ captureOpen: true }),
  closeCapture: () => set({ captureOpen: false }),

  // --- Finanzas: movement modal + persistent state ---
  movementOpen:  false,
  openMovement:  () => set({ movementOpen: true }),
  closeMovement: () => set({ movementOpen: false }),

  // Finanzas state
  selectedMes:     currentMes(),
  finMovimientos:  FINANZAS.movimientos.slice(),
  finCuentas:      FINANZAS.cuentas,
  finCategorias:   FINANZAS.categorias,
  finConfig:       { dolar_oficial: 1245, fire_meta_usd: 500000 },
  finNotas:        [],
  finEmergenciaSaldo: 0,

  fetchFinMovimientos: async (mes) => {
    try {
      const m = mes || currentMes()
      const res = await fetch(`${API_URL}/fin/movimientos?mes=${m}`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finMovimientos: data })
      if (DEBUG) console.log('fetchFinMovimientos:', data.length)
    } catch {
      set({ finMovimientos: FINANZAS.movimientos.slice() })
      if (DEBUG) console.log('fetchFinMovimientos: using mock data')
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

  addFinMovimiento: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/fin/movimientos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({ finMovimientos: [data, ...state.finMovimientos] }))
      if (DEBUG) console.log('addFinMovimiento (API):', data)
    } catch {
      const id = `m_${Date.now()}`
      const full = { id, ...payload }
      set(state => ({ finMovimientos: [full, ...state.finMovimientos] }))
      if (DEBUG) console.log('addFinMovimiento (mock):', full)
    }
  },

  deleteFinMovimiento: async (id) => {
    try {
      await fetch(`${API_URL}/fin/movimientos/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
    set(state => ({ finMovimientos: state.finMovimientos.filter(m => m.id !== id) }))
    if (DEBUG) console.log('deleteFinMovimiento:', id)
  },

  updateFinCuenta: async (id, saldo_ars, saldo_usd) => {
    try {
      const res = await fetch(`${API_URL}/fin/cuentas/${id}/saldo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saldo_ars, saldo_usd }),
      })
      if (!res.ok) throw new Error('not ok')
      const updated = await res.json()
      set(state => ({
        finCuentas: state.finCuentas.map(c => (c.id === id ? { ...c, ...updated } : c)),
      }))
    } catch {
      set(state => ({
        finCuentas: state.finCuentas.map(c =>
          c.id === id ? { ...c, ars: saldo_ars, usd: saldo_usd } : c
        ),
      }))
    }
    if (DEBUG) console.log('updateFinCuenta:', id, saldo_ars, saldo_usd)
  },

  fetchFinCuentas: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/cuentas`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finCuentas: data })
      if (DEBUG) console.log('fetchFinCuentas:', data)
    } catch {
      set({ finCuentas: FINANZAS.cuentas })
      if (DEBUG) console.log('fetchFinCuentas: using mock data')
    }
  },

  fetchFinCategorias: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/categorias`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finCategorias: data })
      if (DEBUG) console.log('fetchFinCategorias:', data)
    } catch {
      set({ finCategorias: FINANZAS.categorias })
      if (DEBUG) console.log('fetchFinCategorias: using mock data')
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
      set({ finConfig: { dolar_oficial: FINANZAS.blueRate, fire_meta_usd: 500000 } })
      if (DEBUG) console.log('fetchFinConfig: using mock data')
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

  // Legacy alias — kept for backward compat
  movimientos: FINANZAS.movimientos.slice(),
  addMovimiento: (mov) => {
    const id = `m_${Date.now()}`
    const full = { id, ...mov }
    set(state => ({ movimientos: [full, ...state.movimientos] }))
    if (DEBUG) console.log('addMovimiento (legacy):', full)
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

  // --- Theme ---
  setTheme: (key) => {
    applyTheme(key, get().tone, get().fontPair)
    localStorage.setItem('sgr-theme', key)
    set({ theme: key })
    if (DEBUG) console.log('theme set:', key)
  },

  // --- Tone (modificador del theme) ---
  setTone: (key) => {
    applyTheme(get().theme, key, get().fontPair)
    localStorage.setItem('sgr-tone', key)
    set({ tone: key })
    if (DEBUG) console.log('tone set:', key)
  },

  // --- Font pair (independiente del tema) ---
  setFontPair: (key) => {
    applyTheme(get().theme, get().tone, key)
    localStorage.setItem('sgr-font-pair', key)
    set({ fontPair: key })
    if (DEBUG) console.log('fontPair set:', key)
  },

  // --- Toast ---
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 2500)
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
    const res = await fetch(`${API_URL}/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, padre_id }),
    })
    if (!res.ok) throw new Error((await res.json()).detail)
    const data = await res.json()
    await get().fetchCategorias()
    if (DEBUG) console.log('crearCategoria:', data)
    return data
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
    const res = await fetch(`${API_URL}/hojas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json()).detail)
    await get().fetchHojas()
    if (DEBUG) console.log('crearHoja:', payload.tipo)
  },

  eliminarHoja: async (id) => {
    await fetch(`${API_URL}/hojas/${id}`, { method: 'DELETE' })
    set(state => ({ hojas: state.hojas.filter(h => h.id !== id) }))
    if (DEBUG) console.log('eliminarHoja:', id)
  },

  updateIcono: async (id, icono) => {
    const res = await fetch(`${API_URL}/hojas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icono }),
    })
    if (!res.ok) throw new Error('Error al guardar icono')
    const { fecha_actualizado } = await res.json().catch(() => ({}))
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, icono, fecha_actualizado: fecha_actualizado ?? h.fecha_actualizado } : h),
    }))
    if (DEBUG) console.log('updateIcono:', id, icono)
  },

  updateApuntes: async (id, apuntes) => {
    const res = await fetch(`${API_URL}/hojas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apuntes }),
    })
    if (!res.ok) throw new Error('Error al guardar apuntes')
    const { fecha_actualizado } = await res.json().catch(() => ({}))
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, apuntes, fecha_actualizado: fecha_actualizado ?? h.fecha_actualizado } : h),
    }))
    if (DEBUG) console.log('updateApuntes:', id)
  },
}))
