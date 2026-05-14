import { BRANCH_COLORS as B } from '../utils/themes'

export const fmtARS = n => '$' + Math.round(n).toLocaleString('es-AR')
export const fmtUSD = n => 'US$ ' + Math.round(n).toLocaleString('es-AR')

// Movements that are internal transfers between accounts — excluded from totals
const INTERNAL = new Set(['transferencia'])
export const isTransferencia = (mov) => {
  const cat = (mov.cat ?? mov.categoria_nombre ?? '').toLowerCase().trim()
  return INTERNAL.has(cat)
}

// Mock dataset — port of ClaudeDesign/data.js FINANZAS, mapped to BRANCH_COLORS
// so the palette stays consistent with the rest of SGR.
export const FINANZAS = {
  saldoARS: 1842500,
  saldoUSD: 1480,
  blueRate: 1245,
  ingresosMes: 2350000,
  gastosMes: 1198400,
  tasaAhorro: 49,
  mes: 'Mayo 2026',
  cuentas: [
    {
      group: 'wallets',
      items: [
        { id: 'a1', name: 'Ualá',         initials: 'UA', color: B[8], ars: 284500, usd: 0   },
        { id: 'a2', name: 'Mercado Pago', initials: 'MP', color: B[5], ars: 412000, usd: 0   },
        { id: 'a3', name: 'Brubank',      initials: 'BB', color: B[7], ars: 78000,  usd: 120 },
      ],
    },
    {
      group: 'banks',
      items: [
        { id: 'a4', name: 'Galicia',      initials: 'GA', color: B[3], ars: 920000, usd: 0    },
        { id: 'a5', name: 'Galicia USD',  initials: 'G$', color: B[2], ars: 0,      usd: 1360 },
      ],
    },
    {
      group: 'cash',
      items: [
        { id: 'a6', name: 'En mano',      initials: '$$', color: B[6], ars: 148000, usd: 0 },
      ],
    },
  ],
  categorias: [
    { name: 'Comida',         color: B[6], amount: 286400, pct: 24 },
    { name: 'Alquiler',       color: B[0], amount: 380000, pct: 32 },
    { name: 'Transporte',     color: B[1], amount: 84000,  pct: 7  },
    { name: 'Suscripciones',  color: B[8], amount: 62300,  pct: 5  },
    { name: 'Salud',          color: B[2], amount: 96000,  pct: 8  },
    { name: 'Ocio',           color: B[7], amount: 148500, pct: 12 },
    { name: 'Otros',          color: B[5], amount: 141200, pct: 12 },
  ],
  movimientos: [
    { id: 'm1', date: '13 May', icon: '🍱', cat: 'Comida',        desc: 'Almuerzo La Birra',   method: 'Ualá',     amount: -8400,   type: 'expense' },
    { id: 'm2', date: '13 May', icon: '🚇', cat: 'Transporte',    desc: 'SUBE recarga',        method: 'MP',       amount: -2000,   type: 'expense' },
    { id: 'm3', date: '13 May', icon: '💼', cat: 'Trabajo',       desc: 'Honorarios proyecto', method: 'Galicia',  amount: 480000,  type: 'income', audit: true },
    { id: 'm4', date: '12 May', icon: '🛒', cat: 'Comida',        desc: 'Supermercado Coto',   method: 'Galicia',  amount: -34200,  type: 'expense' },
    { id: 'm5', date: '12 May', icon: '🎬', cat: 'Ocio',          desc: 'Cine + cena',         method: 'Ualá',     amount: -18500,  type: 'expense' },
    { id: 'm6', date: '11 May', icon: '💊', cat: 'Salud',         desc: 'Farmacia',            method: 'MP',       amount: -6300,   type: 'expense' },
    { id: 'm7', date: '11 May', icon: '📡', cat: 'Suscripciones', desc: 'Spotify Familiar',    method: 'Galicia',  amount: -4500,   type: 'expense' },
    { id: 'm8', date: '10 May', icon: '🏠', cat: 'Alquiler',      desc: 'Alquiler Mayo',       method: 'Galicia',  amount: -380000, type: 'expense' },
  ],
  suscripciones: [
    { name: 'Spotify Familiar', next: '02 Jun', amount: 4500  },
    { name: 'iCloud 200GB',     next: '08 Jun', amount: 1900  },
    { name: 'Netflix',          next: '15 Jun', amount: 7800  },
    { name: 'ChatGPT Plus',     next: '22 Jun', amount: 24000 },
    { name: 'Vercel Pro',       next: '01 Jul', amount: 24100 },
  ],
  history: [
    { m: 'Jun', in: 1980, out: 1420 },
    { m: 'Jul', in: 2050, out: 1480 },
    { m: 'Ago', in: 2100, out: 1520 },
    { m: 'Sep', in: 2180, out: 1380 },
    { m: 'Oct', in: 2240, out: 1410 },
    { m: 'Nov', in: 2200, out: 1560 },
    { m: 'Dic', in: 2380, out: 1820 },
    { m: 'Ene', in: 2080, out: 1350 },
    { m: 'Feb', in: 2150, out: 1280 },
    { m: 'Mar', in: 2240, out: 1410 },
    { m: 'Abr', in: 2310, out: 1330 },
    { m: 'May', in: 2350, out: 1198 },
  ],
  ingresosCategorias: [
    { name: 'Trabajo',    color: B[3], amount: 1870000, pct: 80 },
    { name: 'Freelance',  color: B[1], amount: 350000,  pct: 15 },
    { name: 'Dividendos', color: B[8], amount: 130000,  pct: 5  },
  ],
  fire: {
    year: 2041,
    yearsLeft: 15,
    monthlyRetirementUSD: 2400,
  },
}
