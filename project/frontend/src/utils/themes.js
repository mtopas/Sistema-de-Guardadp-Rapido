// ============================================================
// THEMES — 6 paletas oficiales del sistema SGR
// Cada theme define 12 color vars + 3 font vars + flag `dark`
// ============================================================

const FONT_SERIF_PLAYFAIR = "'Playfair Display', Georgia, serif"
const FONT_SERIF_FRAUNCES = "'Fraunces', 'Playfair Display', Georgia, serif"
const FONT_SANS_SORA      = "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const FONT_SANS_SPACE     = "'Space Grotesk', 'Sora', -apple-system, sans-serif"
const FONT_SANS_PLEX      = "'IBM Plex Sans', 'Sora', -apple-system, sans-serif"
const FONT_MONO_GEIST     = "'Geist Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace"
const FONT_MONO_DEFAULT   = "ui-monospace, 'SFMono-Regular', Menlo, monospace"

export const THEMES = {
  // ---------- 1. DISCO 90s — neón sobre violeta profundo (DEFAULT) ----------
  'disco-90s': {
    name: 'Disco 90s',
    dark: true,
    '--bg':            '#0d0420',
    '--sidebar':       '#0a031a',
    '--surface':       '#1a0a35',
    '--panel-bg':      'rgba(22,8,48,0.82)',
    '--border':        'rgba(190,24,93,0.18)',
    '--accent':        '#ec4899',
    '--accent-light':  '#f9a8d4',
    '--accent-deep':   '#be185d',
    '--text':          '#fbeaff',
    '--text-2':        '#dcc6f0',
    '--subtext':       '#9b7fb8',
    '--mute':          '#6b4d8a',
    '--cta-bg':        'linear-gradient(130deg, #ec4899, #22d3ee)',
    '--cta-text':      '#ffffff',
    '--shadow-accent': '0 6px 18px -6px rgba(236,72,153,0.55)',
    '--shadow-soft':   '0 4px 16px rgba(236,72,153,0.32)',
    '--font-serif':    FONT_SERIF_PLAYFAIR,
    '--font-sans':     FONT_SANS_SPACE,
    '--font-mono':     FONT_MONO_DEFAULT,
  },

  // ---------- 2. ECLIPSE SOLAR — carbón cálido + ámbar y coral ----------
  'eclipse-solar': {
    name: 'Eclipse solar',
    dark: true,
    allowTone: false,
    '--bg':            '#0d0911',
    '--sidebar':       '#120d17',
    '--surface':       '#1a1420',
    '--panel-bg':      'rgba(22,15,27,0.94)',
    '--header-bg':     'rgba(13,9,17,0.96)',
    '--header-cta-bg': 'linear-gradient(135deg, #f6c453, #ff6b6b)',
    '--header-avatar-bg': '#6f3f46',
    '--border':        'rgba(245,238,230,0.12)',
    '--accent':        '#f6c453',
    '--accent-light':  '#ffe08a',
    '--accent-deep':   '#d97706',
    '--accent-alt':    '#ff6b6b',
    '--text':          '#f5eee6',
    '--text-2':        '#d8ccc2',
    '--subtext':       '#a9959c',
    '--mute':          '#6c5b64',
    '--cta-bg':        'linear-gradient(135deg, #f6c453 0%, #ff8a5b 52%, #ff6b6b 100%)',
    '--cta-text':      '#160d10',
    '--shadow-accent': '0 8px 26px -10px rgba(246,196,83,0.48)',
    '--shadow-soft':   '0 10px 30px rgba(5,2,7,0.42)',
    '--font-serif':    FONT_SERIF_FRAUNCES,
    '--font-sans':     FONT_SANS_SORA,
    '--font-mono':     FONT_MONO_DEFAULT,
  },

  // ---------- 3. BLANCO Y NEGRO — minimalista monocromo ----------
  'blanco-negro': {
    name: 'Blanco y negro',
    dark: true,
    '--bg':            '#0a0a0a',
    '--sidebar':       '#050505',
    '--surface':       '#141414',
    '--panel-bg':      'rgba(18,18,18,0.94)',
    '--border':        'rgba(255,255,255,0.10)',
    '--accent':        '#ffffff',
    '--accent-light':  '#f5f5f5',
    '--accent-deep':   '#d4d4d4',
    '--text':          '#fafafa',
    '--text-2':        '#d4d4d4',
    '--subtext':       '#a3a3a3',
    '--mute':          '#737373',
    '--cta-bg':        '#ffffff',
    '--cta-text':      '#0a0a0a',
    '--shadow-accent': '0 6px 18px -8px rgba(255,255,255,0.12)',
    '--shadow-soft':   '0 4px 14px rgba(0,0,0,0.50)',
    '--font-serif':    FONT_SANS_SPACE,
    '--font-sans':     FONT_SANS_PLEX,
    '--font-mono':     FONT_MONO_GEIST,
  },

  // ---------- 4. NEXO NOCTURNO — azul profundo + cian eléctrico ----------
  'nexo-nocturno': {
    name: 'Nexo nocturno',
    dark: true,
    allowTone: false,
    '--bg':            '#050b14',
    '--sidebar':       '#06111e',
    '--surface':       '#0b192a',
    '--panel-bg':      'rgba(7,21,37,0.92)',
    '--header-bg':     'rgba(5,17,31,0.96)',
    '--header-cta-bg': 'linear-gradient(135deg, #22d3ee, #0ea5e9)',
    '--header-avatar-bg': '#174b85',
    '--border':        'rgba(56,189,248,0.20)',
    '--accent':        '#22d3ee',
    '--accent-light':  '#67e8f9',
    '--accent-deep':   '#1478c9',
    '--accent-alt':    '#8b5cf6',
    '--text':          '#eef8ff',
    '--text-2':        '#c8dcef',
    '--subtext':       '#83a4c4',
    '--mute':          '#4e6c89',
    '--cta-bg':        'linear-gradient(135deg, #22d3ee 0%, #0ea5e9 48%, #2563eb 100%)',
    '--cta-text':      '#f8fdff',
    '--shadow-accent': '0 8px 26px -10px rgba(34,211,238,0.58)',
    '--shadow-soft':   '0 10px 30px rgba(0,5,14,0.42)',
    '--font-serif':    FONT_SANS_SPACE,
    '--font-sans':     FONT_SANS_SORA,
    '--font-mono':     FONT_MONO_GEIST,
  },

  // ---------- 5. LIMA Y GRIS — minimalismo high-contrast ----------
  'lima-gris': {
    name: 'Lima y gris',
    dark: true,
    '--bg':            '#0e0f10',
    '--sidebar':       '#08090a',
    '--surface':       '#17191c',
    '--panel-bg':      'rgba(20,21,24,0.85)',
    '--border':        'rgba(132,204,22,0.14)',
    '--accent':        '#bef264',
    '--accent-light':  '#d9f99d',
    '--accent-deep':   '#84cc16',
    '--text':          '#f4f5f7',
    '--text-2':        '#c9cbd0',
    '--subtext':       '#7a7d84',
    '--mute':          '#4d5057',
    '--cta-bg':        'linear-gradient(130deg, #bef264, #84cc16)',
    '--cta-text':      '#0e0f10',
    '--shadow-accent': '0 6px 18px -8px rgba(190,242,100,0.28)',
    '--shadow-soft':   '0 4px 14px rgba(0,0,0,0.40)',
    // Lima y gris: Sora en todo, marca SGR en Geist Mono (via --font-serif override)
    '--font-serif':    FONT_MONO_GEIST,
    '--font-sans':     FONT_SANS_SORA,
    '--font-mono':     FONT_MONO_GEIST,
  },

  // ---------- 6. JARDÍN NOCTURNO — verde profundo + jade y orquídea ----------
  'jardin-nocturno': {
    name: 'Jardín nocturno',
    dark: true,
    allowTone: false,
    '--bg':            '#07110e',
    '--sidebar':       '#06100c',
    '--surface':       '#0d1d17',
    '--panel-bg':      'rgba(8,24,18,0.94)',
    '--header-bg':     'rgba(6,16,12,0.96)',
    '--header-cta-bg': 'linear-gradient(135deg, #2dd4a7, #14b8a6)',
    '--header-avatar-bg': '#176b57',
    '--border':        'rgba(45,212,167,0.17)',
    '--accent':        '#2dd4a7',
    '--accent-light':  '#86efac',
    '--accent-deep':   '#0f9f6e',
    '--accent-alt':    '#c084fc',
    '--text':          '#edf7ef',
    '--text-2':        '#c9ddd1',
    '--subtext':       '#8fb7a2',
    '--mute':          '#536f5f',
    '--cta-bg':        'linear-gradient(135deg, #2dd4a7 0%, #14b8a6 58%, #0f9f6e 100%)',
    '--cta-text':      '#03110d',
    '--shadow-accent': '0 8px 26px -10px rgba(45,212,167,0.48)',
    '--shadow-soft':   '0 10px 30px rgba(1,8,5,0.44)',
    '--font-serif':    FONT_SERIF_FRAUNCES,
    '--font-sans':     FONT_SANS_SORA,
    '--font-mono':     FONT_MONO_DEFAULT,
  },
}

export const DEFAULT_THEME = 'disco-90s'

// Solo algunos temas definen estas vars; hay que limpiarlas al cambiar de tema
// para que no queden colgadas en documentElement (p. ej. header celeste en Disco).
const OPTIONAL_THEME_VARS = [
  '--header-bg',
  '--header-cta-bg',
  '--header-avatar-bg',
  '--accent-alt',
  '--color-orange',
  '--color-celeste',
  '--color-blue',
  '--color-burgundy',
  '--color-sand',
  '--color-cream',
  '--color-blush',
  '--color-rose',
  '--color-mauve',
  '--color-violet',
  '--color-yellow',
  '--color-green',
  '--color-red',
]

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

// ============================================================
// TONO BASE — modificador opcional. Solo aplica a temas oscuros.
// En temas claros lo ignoramos para no
// romper la identidad clara con un overlay oklch oscuro.
// ============================================================
export const TONES = {
  cool: {
    name: 'Frío',
    '--bg':       'oklch(0.145 0.018 280)',
    '--surface':  'oklch(0.185 0.022 280)',
    '--sidebar':  'oklch(0.118 0.018 280)',
    '--panel-bg': 'oklch(0.175 0.022 280)',
  },
  neutral: { name: 'Neutro' },
  warm: {
    name: 'Cálido',
    '--bg':       'oklch(0.148 0.016 60)',
    '--surface':  'oklch(0.188 0.020 60)',
    '--sidebar':  'oklch(0.120 0.014 60)',
    '--panel-bg': 'oklch(0.178 0.018 60)',
  },
}

export const DEFAULT_TONE = 'neutral'

// ============================================================
// FONT PAIRS — 6 pares de tipografías, independientes del tema.
// Cada par define la fuente de título (--font-serif) y body (--font-sans).
// ============================================================
export const FONT_PAIRS = {
  sobrio: {
    name: 'Sobrio',
    title: 'Playfair',
    body:  'Sora',
    titleStyle: { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 700 },
    bodyStyle:  { fontFamily: "'Sora', sans-serif", fontWeight: 400 },
    '--font-serif': "'Playfair Display', Georgia, serif",
    '--font-sans':  "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  cuaderno: {
    name: 'Cuaderno',
    title: 'Caveat',
    body:  'Comic Sans',
    titleStyle: { fontFamily: "'Caveat', cursive", fontWeight: 700 },
    bodyStyle:  { fontFamily: "'Comic Sans MS', 'Comic Sans', cursive", fontWeight: 400 },
    '--font-serif': "'Caveat', 'Playfair Display', cursive",
    '--font-sans':  "'Comic Sans MS', 'Comic Sans', system-ui, sans-serif",
  },
  terminal: {
    name: 'Terminal',
    title: 'JetBrains',
    body:  'IBM Plex',
    titleStyle: { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 700, letterSpacing: '-0.02em' },
    bodyStyle:  { fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 400 },
    '--font-serif': "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
    '--font-sans':  "'IBM Plex Sans', 'Sora', -apple-system, sans-serif",
  },
  calido: {
    name: 'Cálido',
    title: 'DM Serif',
    body:  'Manrope',
    titleStyle: { fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400 },
    bodyStyle:  { fontFamily: "'Manrope', sans-serif", fontWeight: 400 },
    '--font-serif': "'DM Serif Display', 'Playfair Display', Georgia, serif",
    '--font-sans':  "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  neogrotesque: {
    name: 'Neo-grotesque',
    title: 'Space Grotesk',
    body:  'DM Sans',
    titleStyle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 },
    bodyStyle:  { fontFamily: "'DM Sans', sans-serif", fontWeight: 400 },
    '--font-serif': "'Space Grotesk', 'Sora', -apple-system, sans-serif",
    '--font-sans':  "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  playful: {
    name: 'Playful',
    title: 'Bricolage',
    body:  'Outfit',
    titleStyle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700 },
    bodyStyle:  { fontFamily: "'Outfit', sans-serif", fontWeight: 400 },
    '--font-serif': "'Bricolage Grotesque', 'Space Grotesk', sans-serif",
    '--font-sans':  "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
  },
}

export const DEFAULT_FONT_PAIR = 'sobrio'

// Eclipse solar accent colors per route (exported so store can apply them inline)
export const ECLIPSE_ACCENTS = {
  '/finanzas': { accent: '#f6c453', light: '#ffe08a', deep: '#d97706' },
  '/agenda':   { accent: '#60a5fa', light: '#93c5fd', deep: '#2563eb' },
  '/habitos':  { accent: '#34d399', light: '#6ee7b7', deep: '#059669' },
  '/jarvis':   { accent: '#22d3ee', light: '#67e8f9', deep: '#0891b2' },
  '/':         { accent: '#a78bfa', light: '#c4b5fd', deep: '#7c3aed' },
}

export const SECTION_NAMES = {
  boveda:   'Bóveda',
  finanzas: 'Finanzas',
  agenda:   'Agenda',
  habitos:  'Hábitos',
  jarvis:   'Jarvis',
}

/** Orden canónico al ciclar módulos: Bóveda → Finanzas → Agenda → Hábitos → Jarvis → … */
export const SECTION_ORDER = ['boveda', 'finanzas', 'agenda', 'habitos', 'jarvis']

export const APP_MODULES = [
  {
    id:       'boveda',
    match:    (p) => p === '/' || p.startsWith('/hoja') || p === '/capture' || p === '/settings',
    path:     '/',
    titleKey: 'brandName',
    ctaKey:   'capture',
    ctaStore: 'openCapture',
  },
  {
    id:       'finanzas',
    match:    (p) => p.startsWith('/finanzas'),
    path:     '/finanzas',
    titleKey: 'finanzas',
    ctaKey:   'addMovement',
    ctaStore: 'openMovement',
  },
  {
    id:       'agenda',
    match:    (p) => p.startsWith('/agenda'),
    path:     '/agenda',
    titleKey: 'agenda',
    ctaKey:   'addEvento',
    ctaStore: 'openAgendaEvento',
  },
  {
    id:       'habitos',
    match:    (p) => p.startsWith('/habitos'),
    path:     '/habitos',
    titleKey: 'habitos',
    ctaKey:   'addHabito',
    ctaStore: 'openHabitoModal',
  },
  {
    id:       'jarvis',
    match:    (p) => p.startsWith('/jarvis'),
    path:     '/jarvis',
    titleKey: 'jarvis',
    ctaKey:   'jarvisCapturar',
    ctaStore: 'openJarvisCapture',
  },
]

export function moduleIndexForPath(path) {
  const i = APP_MODULES.findIndex(m => m.match(path))
  return i < 0 ? 0 : i
}

/** delta +1 = siguiente módulo, -1 = anterior (con vuelta circular). */
export function adjacentModule(path, delta) {
  const len = APP_MODULES.length
  const i = moduleIndexForPath(path)
  return APP_MODULES[(i + delta + len) % len]
}

export function pathToSection(path) {
  return APP_MODULES.find(m => m.match(path))?.id ?? 'boveda'
}

export function applyFonts(fontKey) {
  const pair = FONT_PAIRS[fontKey] || FONT_PAIRS[DEFAULT_FONT_PAIR]
  const root = document.documentElement
  root.style.setProperty('--font-serif', pair['--font-serif'])
  root.style.setProperty('--font-sans',  pair['--font-sans'])
  root.dataset.fontPair = fontKey
}

export function applyTheme(themeKey, toneKey = null, fontKey = null) {
  const theme = THEMES[themeKey] || THEMES[DEFAULT_THEME]
  const root = document.documentElement

  OPTIONAL_THEME_VARS.forEach(key => {
    if (theme[key] == null) root.style.removeProperty(key)
  })

  // Apply all CSS vars from the theme — but skip --font-* so the user's font
  // pair (chosen independently of theme) wins.
  Object.entries(theme).forEach(([key, value]) => {
    if (!key.startsWith('--')) return
    if (key === '--font-serif' || key === '--font-sans') return
    root.style.setProperty(key, value)
  })

  // Mark dark/light on the html element so CSS can branch (e.g. shadow inversion)
  root.dataset.themeMode = theme.dark ? 'dark' : 'light'
  root.dataset.theme = themeKey

  // Tono base — sólo aplica a temas oscuros que no fijan su identidad cromática.
  if (toneKey && theme.dark && theme.allowTone !== false) {
    const tone = TONES[toneKey] || TONES[DEFAULT_TONE]
    Object.entries(tone).forEach(([key, value]) => {
      if (key.startsWith('--') && value != null) root.style.setProperty(key, value)
    })
  }

  // Always enforce the chosen font pair (or default).
  applyFonts(fontKey || root.dataset.fontPair || DEFAULT_FONT_PAIR)
}
