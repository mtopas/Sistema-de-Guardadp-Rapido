import { create } from 'zustand'
import { API_URL, DEBUG } from '../config'
import { applyTheme, DEFAULT_THEME, DEFAULT_TONE, DEFAULT_FONT_PAIR, FONT_PAIRS, THEMES, TONES } from '../utils/themes'

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
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, icono } : h),
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
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, apuntes } : h),
    }))
    if (DEBUG) console.log('updateApuntes:', id)
  },
}))
