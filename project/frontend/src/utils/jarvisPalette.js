// Fuente de verdad de tokens visuales de Jarvis (paleta fija, independiente de los
// 6 temas de SGR) — ver Cerebro/jarvis-design-system.md. Ningún componente de
// jarvis/ debe hardcodear un color, ancho, cantidad o duración: todo vive acá.

export const MEMORY_TYPE_COLORS = {
  RAW: '#7dd3fc',
  SEMANTIC: '#4ade80',
  DECISION: '#fbbf24',
  PROJECT: '#a78bfa',
  PEOPLE: '#f472b6',
}
export const QUERY_COLOR = '#c4b5fd'

export const MEMORY_TYPE_DESC = {
  RAW: 'captura bruta, sin digerir',
  SEMANTIC: 'hechos verificables',
  DECISION: 'con su razonamiento',
  PROJECT: 'contexto de un proyecto',
  PEOPLE: 'quién es quién',
}
export const MEMORY_TYPE_ORDER = ['RAW', 'SEMANTIC', 'DECISION', 'PROJECT', 'PEOPLE']

export const INBOX_STATUS_COLORS = {
  PENDING: '#7dd3fc',
  PROCESSING: '#fbbf24',
  DONE: '#4ade80',
  ERROR: '#f472b6',
}
export const INBOX_STATUS_ORDER = ['PENDING', 'PROCESSING', 'DONE', 'ERROR']

export const BUDGET_LEVEL_COLORS = {
  ACTIVE: '#4ade80',
  LOW: '#fbbf24',
  EXHAUSTED: '#f472b6',
}
export const BUDGET_LEVEL_NOTES = {
  ACTIVE: 'Todo con el modelo grande.',
  LOW: 'Queda poco. Las consultas largas van a modelo chico.',
  EXHAUSTED: 'Presupuesto agotado — Jarvis cayó a modo local. Clasifica igual, con menos matiz.',
}

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ── Layout ────────────────────────────────────────────────────────────────────
export const JARVIS_LEFT_WIDTH = 246
export const JARVIS_RIGHT_WIDTH = 322
export const JARVIS_SUBHEADER_HEIGHT = 66
export const JARVIS_BUDGET_BARS = 12
export const JARVIS_INBOX_GRID_COLS = '104px 1fr 120px 74px'
export const JARVIS_ENTITY_CARD_MIN = 232
export const JARVIS_CONTEXT_RECENT_COUNT = 3
export const JARVIS_CONTEXT_ENTITY_LIMIT = 8

// ── Duraciones de animación ───────────────────────────────────────────────────
export const JV_BLINK_MS = {
  processing: 1000,
  error: 700,
  thinking: 1000,
  ask: 1400,
}
export const JV_BREATHE_MS = 2600
export const JV_SPIN_MS = 9000
export const JV_SWEEP_MS = 14000
export const JV_RISE_MS = 350

// ── Canvas neuronal ────────────────────────────────────────────────────────────
export const JARVIS_CANVAS_DENSITY_DEFAULT = 76
export const JARVIS_CANVAS_PULSE_SPEED_DEFAULT = 1

// ── Polling ────────────────────────────────────────────────────────────────────
export const JARVIS_POLL_MS = 15000

// ── Tab Debug — paginación del log de eventos (GET /jarvis/events) ──────────────
// JARVIS_EVENTS_MAX_LIMIT coincide con el tope real que acepta el backend
// (Query(..., le=200) en jarvis/api/router.py) — "cargar más" nunca pide de más.
export const JARVIS_EVENTS_PAGE_SIZE = 40
export const JARVIS_EVENTS_MAX_LIMIT = 200
