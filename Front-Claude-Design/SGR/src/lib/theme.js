// Temas = mapas de CSS vars sobre :root. Mismo enfoque que utils/themes.js del
// proyecto original: cambiar de tema no recompila nada ni remonta componentes.

export const THEMES = {
  nebula: {
    label: 'Nébula',
    mode: 'dark',
    swatch: ['#8b5cf6', '#06b6d4', '#f43f5e'],
    vars: {
      '--bg': '#0b0a12', '--sidebar': '#0e0d16', '--panel-bg': '#161425', '--elev': '#211d36',
      '--accent': '#8b5cf6', '--accent-light': '#c4b5fd', '--accent-deep': '#6d28d9',
      '--text': '#f4f2fb', '--text-2': '#d9d5ea', '--subtext': '#9b95b8', '--mute': '#6b6685',
    },
  },
  cyber: {
    label: 'Cyber',
    mode: 'dark',
    swatch: ['#22d3ee', '#a3e635', '#f472b6'],
    vars: {
      '--bg': '#050b12', '--sidebar': '#060e17', '--panel-bg': '#0b1622', '--elev': '#122435',
      '--accent': '#22d3ee', '--accent-light': '#a5f3fc', '--accent-deep': '#0e7490',
      '--text': '#eafcff', '--text-2': '#c3e9f2', '--subtext': '#7fa6b5', '--mute': '#557284',
      '--success': '#a3e635', '--warning': '#fcd34d', '--danger': '#fb7185', '--income': '#a3e635', '--expense': '#fb7185',
    },
  },
  magma: {
    label: 'Magma',
    mode: 'dark',
    swatch: ['#fb923c', '#f43f5e', '#fbbf24'],
    vars: {
      '--bg': '#120806', '--sidebar': '#170a07', '--panel-bg': '#1f100c', '--elev': '#2e1811',
      '--accent': '#fb923c', '--accent-light': '#fed7aa', '--accent-deep': '#c2410c',
      '--text': '#fff5ee', '--text-2': '#f0d9cb', '--subtext': '#bd9482', '--mute': '#8a6a5b',
      '--success': '#4ade80', '--warning': '#fbbf24', '--danger': '#f43f5e',
    },
  },
  bosque: {
    label: 'Bosque',
    mode: 'dark',
    swatch: ['#34d399', '#a3e635', '#22d3ee'],
    vars: {
      '--bg': '#05110d', '--sidebar': '#061611', '--panel-bg': '#0a1e18', '--elev': '#123027',
      '--accent': '#34d399', '--accent-light': '#a7f3d0', '--accent-deep': '#047857',
      '--text': '#effdf6', '--text-2': '#cbe9dc', '--subtext': '#7fab98', '--mute': '#547a6b',
    },
  },
  cobalto: {
    label: 'Cobalto',
    mode: 'dark',
    swatch: ['#3b82f6', '#8b5cf6', '#22d3ee'],
    vars: {
      '--bg': '#070c18', '--sidebar': '#08101f', '--panel-bg': '#0d1629', '--elev': '#16233f',
      '--accent': '#3b82f6', '--accent-light': '#bfdbfe', '--accent-deep': '#1d4ed8',
      '--text': '#f0f5ff', '--text-2': '#cdd9f0', '--subtext': '#8b9cc0', '--mute': '#5e6d8d',
    },
  },
  papel: {
    label: 'Papel',
    mode: 'light',
    swatch: ['#7c3aed', '#0891b2', '#e11d48'],
    vars: {
      '--bg': '#f6f4fc', '--sidebar': '#ffffff', '--panel-bg': '#ffffff', '--elev': '#efeafb',
      '--accent': '#7c3aed', '--accent-light': '#6d28d9', '--accent-deep': '#5b21b6',
      '--text': '#191727', '--text-2': '#3a3654', '--subtext': '#6b6685', '--mute': '#9a94b3',
      '--border': 'rgb(20 16 40 / 10%)', '--border-2': 'rgb(20 16 40 / 18%)',
      '--success': '#059669', '--warning': '#d97706', '--danger': '#e11d48', '--info': '#2563eb',
      '--income': '#059669', '--expense': '#e11d48',
    },
  },
}

/** Tonos: ajustan el contraste del fondo sin cambiar el tema. */
export const TONES = {
  suave: { label: 'Suave', bgMix: 6, panelMix: 8 },
  normal: { label: 'Normal', bgMix: 0, panelMix: 0 },
  profundo: { label: 'Profundo', bgMix: -6, panelMix: -5 },
}

export const FONT_PAIRS = {
  sora: { label: 'Sora · Playfair', sans: "'Sora', system-ui, sans-serif", serif: "'Playfair Display', serif" },
  system: { label: 'Sistema', sans: 'system-ui, -apple-system, sans-serif', serif: 'Georgia, serif' },
  mono: { label: 'Mono total', sans: "'JetBrains Mono', ui-monospace, monospace", serif: "'JetBrains Mono', monospace" },
}

/** Accents por ruta (tema Arcoíris del proyecto original). */
export const ARCOIRIS = {
  '/': { accent: '#8b5cf6', light: '#c4b5fd', deep: '#6d28d9' },
  '/finanzas': { accent: '#f59e0b', light: '#fcd34d', deep: '#b45309' },
  '/agenda': { accent: '#3b82f6', light: '#93c5fd', deep: '#1d4ed8' },
  '/habitos': { accent: '#10b981', light: '#6ee7b7', deep: '#047857' },
  '/ajustes': { accent: '#a855f7', light: '#d8b4fe', deep: '#7e22ce' },
}

const DENSITY = { compacta: '0.92', normal: '1', amplia: '1.08' }

export function applyTheme({ theme = 'nebula', tone = 'normal', font = 'sora', density = 'normal', arcoiris = true, route = '/', motion = true } = {}) {
  const t = THEMES[theme] || THEMES.nebula
  const root = document.documentElement

  // Reset de las vars que los temas sobrescriben, para no arrastrar restos.
  for (const k of ['--border', '--border-2', '--success', '--warning', '--danger', '--info', '--income', '--expense']) {
    root.style.removeProperty(k)
  }
  root.dataset.mode = t.mode
  root.dataset.theme = theme
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v)

  const tn = TONES[tone] || TONES.normal
  if (tn.bgMix) {
    root.style.setProperty('--bg', mix(t.vars['--bg'], t.mode === 'dark' ? '#ffffff' : '#000000', Math.abs(tn.bgMix)))
    root.style.setProperty('--panel-bg', mix(t.vars['--panel-bg'], t.mode === 'dark' ? '#ffffff' : '#000000', Math.abs(tn.panelMix)))
  }

  const f = FONT_PAIRS[font] || FONT_PAIRS.sora
  root.style.setProperty('--font-sans', f.sans)
  root.style.setProperty('--font-serif', f.serif)
  document.body.style.fontFamily = f.sans

  root.style.setProperty('--scale', DENSITY[density] || '1')
  root.style.setProperty('--dur', motion ? '240ms' : '1ms')

  if (arcoiris) {
    const a = ARCOIRIS[routeKey(route)]
    if (a) {
      // En claro se usa el tono profundo como acento: el brillante no tiene
      // contraste suficiente sobre blanco (ámbar y verde se vuelven ilegibles).
      const claro = t.mode === 'light'
      root.style.setProperty('--accent', claro ? a.deep : a.accent)
      root.style.setProperty('--accent-light', claro ? a.accent : a.light)
      root.style.setProperty('--accent-deep', a.deep)
    }
  }
}

export function routeKey(path) {
  if (!path || path === '/') return '/'
  for (const k of ['/finanzas', '/agenda', '/habitos', '/ajustes']) if (path.startsWith(k)) return k
  return '/'
}

/** Mezcla hex simple (no soportamos oklch acá porque necesitamos el valor calculado). */
function mix(hex, other, pct) {
  const a = hexToRgb(hex)
  const b = hexToRgb(other)
  if (!a || !b) return hex
  const p = pct / 100
  const c = [0, 1, 2].map((i) => Math.round(a[i] * (1 - p) + b[i] * p))
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
