import { CalendarDays, Flame, Layers, Settings2, Wallet } from 'lucide-react'

export const MODULES = [
  { id: 'boveda', path: '/', label: 'Bóveda', icon: Layers, accent: '#8b5cf6', hint: 'Capturá texto, links y fotos' },
  { id: 'finanzas', path: '/finanzas', label: 'Finanzas', icon: Wallet, accent: '#f59e0b', hint: 'Movimientos, FIRE y ahorro' },
  { id: 'agenda', path: '/agenda', label: 'Agenda', icon: CalendarDays, accent: '#3b82f6', hint: 'Calendario, tareas y revisión' },
  { id: 'habitos', path: '/habitos', label: 'Hábitos', icon: Flame, accent: '#10b981', hint: 'Grilla, progreso e historial' },
  { id: 'ajustes', path: '/ajustes', label: 'Ajustes', icon: Settings2, accent: '#a855f7', hint: 'Tema, conexión y datos' },
]

export const moduleOf = (path) =>
  MODULES.find((m) => m.path !== '/' && path.startsWith(m.path)) || MODULES[0]
