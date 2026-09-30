import { create } from 'zustand'
import { get as apiGet, put as apiPut } from '../lib/api'

const LS = 'sgr-nexus-prefs'

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LS) || '{}')
  } catch {
    return {}
  }
}

function savePrefs(p) {
  try {
    localStorage.setItem(LS, JSON.stringify(p))
  } catch { /* noop */ }
}

const defaults = {
  effects: 'full', // full | lite | off
  palette: 'nebula', // nebula | synthwave | artico | toxic
  particles: true,
  cursorGlow: true,
  notifyBrowser: false,
  notifyMinutes: 15,
}

let toastId = 0

export const useUI = create((set, get) => ({
  prefs: { ...defaults, ...loadPrefs() },
  setPref: (k, v) => {
    const prefs = { ...get().prefs, [k]: v }
    savePrefs(prefs)
    set({ prefs })
  },

  toasts: [],
  toast: (msg, kind = 'ok', ms = 3200) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // Modales globales
  capture: null, // { tab, categoriaId, ... }
  openCapture: (opts = {}) => set({ capture: { tab: 'nota', ...opts } }),
  closeCapture: () => set({ capture: null }),
  palette: false,
  setPalette: (v) => set({ palette: v }),

  online: true,
  setOnline: (v) => set({ online: v }),

  profile: { nombre: '' },
  fetchProfile: async () => {
    try {
      const p = await apiGet('/settings/profile')
      set({ profile: p, online: true })
    } catch (e) {
      if (e.network) set({ online: false })
    }
  },
  saveProfile: async (nombre) => {
    set({ profile: { nombre } })
    try {
      await apiPut('/settings/profile', { nombre })
      get().toast('Perfil guardado')
    } catch (e) {
      get().toast(e.message, 'error')
    }
  },
}))

export const toast = (...a) => useUI.getState().toast(...a)

// Reporta un error de API: si es de red, lo marca como offline sin ruido extra.
export function reportError(e, fallback = 'Error') {
  const ui = useUI.getState()
  if (e?.network) {
    ui.setOnline(false)
    ui.toast('Sin conexión — cambio guardado localmente', 'warn')
  } else {
    ui.toast(e?.message || fallback, 'error', 5000)
  }
}
