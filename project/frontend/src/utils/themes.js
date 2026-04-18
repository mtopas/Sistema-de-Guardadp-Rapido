export const THEMES = {
  'violet-dark': {
    name: 'Violet Dark',
    '--bg':           '#060210',
    '--surface':      '#170f32',
    '--sidebar':      '#0e0720',
    '--accent':       '#8b5cf6',
    '--accent-light': '#ec4899',
    '--text':         '#f0e6ff',
    '--subtext':      '#c4b5fd',
    '--border':       'rgba(139,92,246,0.22)',
    '--panel-bg':     'rgba(6,2,16,0.82)',
  },
  'sand-black': {
    name: 'Sand & Black',
    '--bg':           '#0d0c0a',
    '--surface':      '#1c1a14',
    '--sidebar':      '#141210',
    '--accent':       '#c9a86c',
    '--accent-light': '#e8d5a3',
    '--text':         '#f5f0e8',
    '--subtext':      '#b8a88a',
    '--border':       '#3a3020',
    '--panel-bg':     'rgba(13,12,10,0.82)',
  },
  'pastel': {
    name: 'Pastel',
    '--bg':           '#fdf4ff',
    '--surface':      '#f0e6ff',
    '--sidebar':      '#e8d5f5',
    '--accent':       '#9333ea',
    '--accent-light': '#a855f7',
    '--text':         '#2d1b69',
    '--subtext':      '#6b4c9a',
    '--border':       '#d8b4fe',
    '--panel-bg':     'rgba(232,213,245,0.88)',
  },
  'lime-grey': {
    name: 'Lime & Grey',
    '--bg':           '#111210',
    '--surface':      '#1a1c18',
    '--sidebar':      '#141510',
    '--accent':       '#84cc16',
    '--accent-light': '#bef264',
    '--text':         '#f0f4e8',
    '--subtext':      '#a3b08a',
    '--border':       '#2a3020',
    '--panel-bg':     'rgba(17,18,16,0.82)',
  },
  'teal-white': {
    name: 'Teal & White',
    '--bg':           '#f0fafa',
    '--surface':      '#ffffff',
    '--sidebar':      '#e0f5f5',
    '--accent':       '#0d9488',
    '--accent-light': '#14b8a6',
    '--text':         '#0f2726',
    '--subtext':      '#4a7c79',
    '--border':       '#b2dfdb',
    '--panel-bg':     'rgba(224,245,245,0.90)',
  },
  'gold-black': {
    name: 'Matte Gold & Black',
    '--bg':           '#0a0800',
    '--surface':      '#1a1500',
    '--sidebar':      '#120f00',
    '--accent':       '#b8962e',
    '--accent-light': '#d4b45a',
    '--text':         '#f5f0e0',
    '--subtext':      '#c8a84a',
    '--border':       '#3a2e00',
    '--panel-bg':     'rgba(10,8,0,0.84)',
  },
  'earth': {
    name: 'Earth Tones',
    '--bg':           '#2c1a0e',
    '--surface':      '#3d2510',
    '--sidebar':      '#251508',
    '--accent':       '#d2691e',
    '--accent-light': '#e8935a',
    '--text':         '#f5e8d0',
    '--subtext':      '#c8a882',
    '--border':       '#6b3a1f',
    '--panel-bg':     'rgba(37,21,8,0.85)',
  },
  'retro-80s': {
    name: '80s Retro',
    '--bg':           '#0d001a',
    '--surface':      '#1a0030',
    '--sidebar':      '#0a0015',
    '--accent':       '#ff00ff',
    '--accent-light': '#00ffff',
    '--text':         '#ffffff',
    '--subtext':      '#ff77ff',
    '--border':       '#660066',
    '--panel-bg':     'rgba(13,0,26,0.85)',
  },
  'rainbow': {
    name: 'Rainbow',
    '--bg':           '#0a0a1a',
    '--surface':      '#141428',
    '--sidebar':      '#0a0a14',
    '--accent':       '#ff6b6b',
    '--accent-light': '#ffd93d',
    '--text':         '#ffffff',
    '--subtext':      '#a8d8ea',
    '--border':       '#2d2d5e',
    '--panel-bg':     'rgba(10,10,26,0.84)',
  },
}

export const DEFAULT_THEME = 'violet-dark'

// Distinct saturated colors for category branches — independent of theme
export const BRANCH_COLORS = [
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // purple
  '#f43f5e', // rose
]

export function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES[DEFAULT_THEME]
  const root = document.documentElement
  Object.entries(theme).forEach(([key, value]) => {
    if (key.startsWith('--')) root.style.setProperty(key, value)
  })
}
