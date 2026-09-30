import { create } from 'zustand'
import { applyTheme, routeKey } from '../lib/theme'
import { ApiError } from '../lib/api'

const LS = 'sgr-fcd-prefs'

const DEFAULTS = {
  theme: 'nebula',
  tone: 'normal',
  font: 'sora',
  density: 'normal',
  arcoiris: true,
  motion: true,
  aurora: true,
  railExpanded: false,
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function savePrefs(p) {
  try { localStorage.setItem(LS, JSON.stringify(p)) } catch { /* noop */ }
}

let toastSeq = 0

export const useUI = create((set, g) => ({
  prefs: loadPrefs(),
  route: '/',
  toasts: [],
  palette: false,
  tweaks: false,
  online: null, // null = sin chequear · true/false
  latency: null,

  setPref: (k, v) => {
    const prefs = { ...g().prefs, [k]: v }
    set({ prefs })
    savePrefs(prefs)
    applyTheme({ ...prefs, route: g().route })
  },
  resetPrefs: () => {
    set({ prefs: { ...DEFAULTS } })
    savePrefs(DEFAULTS)
    applyTheme({ ...DEFAULTS, route: g().route })
  },
  setRoute: (route) => {
    if (routeKey(route) === routeKey(g().route)) { set({ route }); return }
    set({ route })
    applyTheme({ ...g().prefs, route })
  },
  bootTheme: () => applyTheme({ ...g().prefs, route: g().route }),

  togglePalette: (v) => set((s) => ({ palette: v ?? !s.palette })),
  toggleTweaks: (v) => set((s) => ({ tweaks: v ?? !s.tweaks })),
  setOnline: (online, latency = null) => set({ online, latency }),

  toast: (msg, kind = 'ok', ttl = 3600) => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }))
    setTimeout(() => g().dropToast(id), ttl)
    return id
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (msg, kind, ttl) => useUI.getState().toast(msg, kind, ttl)

/**
 * Traduce un error de API a un toast. Un fallo de red no es un error del usuario:
 * la app es offline-first, así que se avisa distinto y se marca la conexión caída.
 */
export function reportError(e, fallback = 'No se pudo completar la acción') {
  const ui = useUI.getState()
  if (e instanceof ApiError && e.network) {
    ui.setOnline(false)
    ui.toast('Sin conexión con la API — el cambio quedó solo en pantalla', 'warn', 5000)
    return
  }
  ui.toast(e?.message || fallback, 'error', 6000)
}
