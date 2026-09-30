import { Network, Wallet, CalendarDays, Sprout, Sparkles, Settings } from 'lucide-react'

export const MODULES = [
  { id: 'boveda', path: '/', label: 'Bóveda', short: 'Bóveda', sub: 'Segundo cerebro', icon: Network, colors: ['#9d4bff', '#ff2e97', '#00f0ff'] },
  { id: 'finanzas', path: '/finanzas', label: 'Finanzas', short: 'Fin', sub: 'Flujo · Ahorro · FIRE', icon: Wallet, colors: ['#ffb800', '#ff6b2c', '#ff2e97'] },
  { id: 'agenda', path: '/agenda', label: 'Agenda', short: 'Agenda', sub: 'Tiempo · Tareas', icon: CalendarDays, colors: ['#00c2ff', '#4d7cff', '#2effa8'] },
  { id: 'habitos', path: '/habitos', label: 'Hábitos', short: 'Hábitos', sub: 'Constancia diaria', icon: Sprout, colors: ['#b4ff39', '#2effa8', '#00f0ff'], onAccent: '#06140a' },
  { id: 'jarvis', path: '/jarvis', label: 'Jarvis', short: 'Jarvis', sub: 'Memoria asistida', icon: Sparkles, colors: ['#00f0ff', '#9d4bff', '#ff8af2'] },
]

export const SETTINGS_MODULE = { id: 'settings', path: '/settings', label: 'Ajustes', short: 'Ajustes', sub: 'Sistema', icon: Settings, colors: ['#8fa2ff', '#c38bff', '#00f0ff'] }

export function moduleFor(pathname) {
  if (pathname.startsWith('/settings')) return SETTINGS_MODULE
  if (pathname.startsWith('/hoja')) return MODULES[0]
  const m = MODULES.slice(1).find((x) => pathname.startsWith(x.path))
  return m || MODULES[0]
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}
