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

  // ---------- 2. ARCOÍRIS — gris neutro + violeta Bóveda ----------
  'arcoiris': {
    name: 'Arcoíris',
    dark: false,
    '--bg':            '#f7f6f4',
    '--sidebar':       '#ffffff',
    '--surface':       '#efedea',
    '--panel-bg':      'rgba(255,255,255,0.92)',
    '--border':        'rgba(109,40,217,0.13)',
    '--accent':        '#7c3aed',
    '--accent-light':  '#a78bfa',
    '--accent-deep':   '#6d28d9',
    '--text':          '#1a1714',
    '--text-2':        '#3f3a36',
    '--subtext':       '#7a736c',
    '--mute':          '#a8a29a',
    '--cta-bg':        'linear-gradient(130deg, #7c3aed, #ec4899, #f59e0b)',
    '--cta-text':      '#ffffff',
    '--shadow-accent': '0 8px 22px -10px rgba(20,20,20,0.28)',
    '--shadow-soft':   '0 4px 14px rgba(20,20,20,0.10)',
    '--font-serif':    FONT_SERIF_PLAYFAIR,
    '--font-sans':     FONT_SANS_SORA,
    '--font-mono':     FONT_MONO_DEFAULT,
  },

  // ---------- 3. COLORES TIERRA — terracota sobre arcilla ----------
  'tierra': {
    name: 'Colores tierra',
    dark: true,
    '--bg':            '#1c1410',
    '--sidebar':       '#15100c',
    '--surface':       '#2a1f18',
    '--panel-bg':      'rgba(36,26,20,0.86)',
    '--border':        'rgba(156,94,38,0.22)',
    '--accent':        '#c87f3e',
    '--accent-light':  '#e0a878',
    '--accent-deep':   '#9c5e26',
    '--text':          '#f5ead8',
    '--text-2':        '#d9c5a8',
    '--subtext':       '#9a8770',
    '--mute':          '#6b5d4d',
    '--cta-bg':        'linear-gradient(130deg, #c87f3e, #e0a878)',
    '--cta-text':      '#1c1410',
    '--shadow-accent': '0 6px 18px -6px rgba(200,127,62,0.45)',
    '--shadow-soft':   '0 4px 16px rgba(156,94,38,0.30)',
    '--font-serif':    FONT_SERIF_PLAYFAIR,
    '--font-sans':     FONT_SANS_PLEX,
    '--font-mono':     FONT_MONO_DEFAULT,
  },

  // ---------- 4. COLORES PASTELES — light lavanda ----------
  'pasteles': {
    name: 'Colores pasteles',
    dark: false,
    '--bg':            '#fbf7ff',
    '--sidebar':       '#f4edff',
    '--surface':       '#eee5ff',
    '--panel-bg':      'rgba(255,255,255,0.92)',
    '--border':        'rgba(124,58,237,0.14)',
    '--accent':        '#a78bfa',
    '--accent-light':  '#c4b5fd',
    '--accent-deep':   '#7c3aed',
    '--text':          '#2a1f4a',
    '--text-2':        '#4a3e6e',
    '--subtext':       '#7c7194',
    '--mute':          '#a59cba',
    // CTAs en este theme usan accent-deep porque el accent es muy claro (WCAG)
    '--cta-bg':        'linear-gradient(130deg, #7c3aed, #a78bfa)',
    '--cta-text':      '#ffffff',
    '--shadow-accent': '0 8px 22px -10px rgba(42,31,74,0.25)',
    '--shadow-soft':   '0 4px 14px rgba(91,70,145,0.12)',
    '--font-serif':    FONT_SERIF_PLAYFAIR,
    '--font-sans':     FONT_SANS_SORA,
    '--font-mono':     FONT_MONO_DEFAULT,
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

  // ---------- 6. ARENA Y NEGRO — desértico, contraste cálido ----------
  'arena-negro': {
    name: 'Arena y negro',
    dark: true,
    '--bg':            '#0c0a08',
    '--sidebar':       '#070605',
    '--surface':       '#1c1814',
    '--panel-bg':      'rgba(23,20,16,0.85)',
    '--border':        'rgba(194,168,125,0.20)',
    '--accent':        '#e8d3b2',
    '--accent-light':  '#f5e9d2',
    '--accent-deep':   '#c2a87d',
    '--text':          '#e8d3b2',
    '--text-2':        '#c4b394',
    '--subtext':       '#8a7d65',
    '--mute':          '#5a5142',
    '--cta-bg':        'linear-gradient(130deg, #e8d3b2, #c2a87d)',
    '--cta-text':      '#0c0a08',
    '--shadow-accent': '0 6px 18px -8px rgba(232,211,178,0.28)',
    '--shadow-soft':   '0 4px 14px rgba(0,0,0,0.55)',
    '--font-serif':    FONT_SERIF_FRAUNCES,
    '--font-sans':     FONT_SANS_SORA,
    '--font-mono':     FONT_MONO_DEFAULT,
  },
}

export const DEFAULT_THEME = 'disco-90s'

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
// En temas claros (Arcoíris, Pasteles) lo ignoramos para no
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

  // Tono base — sólo aplica a temas oscuros. En light temas lo ignoramos.
  if (toneKey && theme.dark) {
    const tone = TONES[toneKey] || TONES[DEFAULT_TONE]
    Object.entries(tone).forEach(([key, value]) => {
      if (key.startsWith('--') && value != null) root.style.setProperty(key, value)
    })
  }

  // Always enforce the chosen font pair (or default).
  applyFonts(fontKey || root.dataset.fontPair || DEFAULT_FONT_PAIR)
}
