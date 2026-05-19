import { create } from 'zustand'
import { API_URL, DEBUG } from '../config'
import { applyTheme, DEFAULT_THEME, DEFAULT_TONE, DEFAULT_FONT_PAIR, FONT_PAIRS, THEMES, TONES } from '../utils/themes'
import { FINANZAS } from '../data/finanzas'

function currentMes() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Apply saved theme + tone + font pair immediately before first render
// Migrate: if localStorage holds a key from an old set, fall back to default.
const rawTheme    = localStorage.getItem('sgr-theme')
const rawTone     = localStorage.getItem('sgr-tone')
const rawFontPair = localStorage.getItem('sgr-font-pair')
const savedTheme    = (rawTheme    && THEMES[rawTheme])         ? rawTheme    : DEFAULT_THEME
const savedTone     = (rawTone     && TONES[rawTone])           ? rawTone     : DEFAULT_TONE
const savedFontPair = (rawFontPair && FONT_PAIRS[rawFontPair])  ? rawFontPair : DEFAULT_FONT_PAIR
if (rawTheme    && !THEMES[rawTheme])         localStorage.setItem('sgr-theme',     savedTheme)
if (rawTone     && !TONES[rawTone])           localStorage.setItem('sgr-tone',      savedTone)
if (rawFontPair && !FONT_PAIRS[rawFontPair])  localStorage.setItem('sgr-font-pair', savedFontPair)
applyTheme(savedTheme, savedTone, savedFontPair)

const savedLang     = localStorage.getItem('sgr-lang')     || 'es'
const savedUserName = localStorage.getItem('sgr-username')  || ''

export const useStore = create((set, get) => ({
  hojas:      [],
  categorias: [],
  theme:      savedTheme,
  tone:       savedTone,
  fontPair:   savedFontPair,
  lang:       savedLang,
  userName:   savedUserName,
  toast:      null,

  // --- Capture modal (floating, replaces /capture screen) ---
  captureOpen: false,
  openCapture:  () => set({ captureOpen: true }),
  closeCapture: () => set({ captureOpen: false }),

  // --- Finanzas: movement modal + persistent state ---
  movementOpen:  false,
  openMovement:  () => set({ movementOpen: true }),
  closeMovement: () => set({ movementOpen: false }),

  // --- Agenda: evento modal ---
  agendaEventoOpen:  false,
  openAgendaEvento:  () => set({ agendaEventoOpen: true }),
  closeAgendaEvento: () => set({ agendaEventoOpen: false }),

  // --- Hábitos: nuevo hábito modal (triggered from TopBar CTA) ---
  habitoModalOpen:  false,
  openHabitoModal:  () => set({ habitoModalOpen: true }),
  closeHabitoModal: () => set({ habitoModalOpen: false }),

  // Finanzas state
  selectedMes:        currentMes(),
  finMovimientos:     FINANZAS.movimientos.slice(),
  finMovimientosAll:  FINANZAS.movimientos.slice(),
  finCuentas:         FINANZAS.cuentas,
  finCategorias:      FINANZAS.categorias,
  finConfig:          { dolar_oficial: 1245, fire_meta_usd: 500000 },
  finNotas:           [],
  finEmergenciaSaldo: 0,

  fetchFinMovimientos: async (mes) => {
    try {
      const m = mes || currentMes()
      const res = await fetch(`${API_URL}/fin/movimientos?mes=${m}`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finMovimientos: data })
      if (DEBUG) console.log('fetchFinMovimientos:', data.length)
    } catch {
      set({ finMovimientos: FINANZAS.movimientos.slice() })
      if (DEBUG) console.log('fetchFinMovimientos: using mock data')
    }
  },

  setSelectedMes: async (mes) => {
    set({ selectedMes: mes })
    await get().fetchFinMovimientos(mes)
  },

  fetchFinEmergencia: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/emergencia`)
      if (!res.ok) throw new Error('not ok')
      const { saldo } = await res.json()
      set({ finEmergenciaSaldo: saldo ?? 0 })
    } catch {
      set({ finEmergenciaSaldo: 0 })
    }
  },

  fetchFinMovimientosAll: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/movimientos`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finMovimientosAll: data })
      if (DEBUG) console.log('fetchFinMovimientosAll:', data.length)
    } catch {
      set({ finMovimientosAll: FINANZAS.movimientos.slice() })
      if (DEBUG) console.log('fetchFinMovimientosAll: using mock data')
    }
  },

  addFinMovimiento: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/fin/movimientos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({
        finMovimientos:    [data, ...state.finMovimientos],
        finMovimientosAll: [data, ...state.finMovimientosAll],
      }))
      if (DEBUG) console.log('addFinMovimiento (API):', data)
    } catch {
      const id = `m_${Date.now()}`
      const full = { id, ...payload }
      set(state => ({
        finMovimientos:    [full, ...state.finMovimientos],
        finMovimientosAll: [full, ...state.finMovimientosAll],
      }))
      if (DEBUG) console.log('addFinMovimiento (mock):', full)
    }
  },

  deleteFinMovimiento: async (id) => {
    try {
      await fetch(`${API_URL}/fin/movimientos/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
    set(state => ({
      finMovimientos:    state.finMovimientos.filter(m => m.id !== id),
      finMovimientosAll: state.finMovimientosAll.filter(m => m.id !== id),
    }))
    if (DEBUG) console.log('deleteFinMovimiento:', id)
  },

  updateFinMovimiento: async (id, patch) => {
    set(state => ({
      finMovimientos:    state.finMovimientos.map(m    => m.id === id ? { ...m, ...patch } : m),
      finMovimientosAll: state.finMovimientosAll.map(m => m.id === id ? { ...m, ...patch } : m),
    }))
    try {
      await fetch(`${API_URL}/fin/movimientos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
    if (DEBUG) console.log('updateFinMovimiento:', id, patch)
  },

  updateFinCuenta: async (id, saldo_ars, saldo_usd) => {
    try {
      const res = await fetch(`${API_URL}/fin/cuentas/${id}/saldo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saldo_ars, saldo_usd }),
      })
      if (!res.ok) throw new Error('not ok')
      const updated = await res.json()
      set(state => ({
        finCuentas: state.finCuentas.map(c => (c.id === id ? { ...c, ...updated } : c)),
      }))
    } catch {
      set(state => ({
        finCuentas: state.finCuentas.map(c =>
          c.id === id ? { ...c, ars: saldo_ars, usd: saldo_usd } : c
        ),
      }))
    }
    if (DEBUG) console.log('updateFinCuenta:', id, saldo_ars, saldo_usd)
  },

  fetchFinCuentas: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/cuentas`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finCuentas: data })
      if (DEBUG) console.log('fetchFinCuentas:', data)
    } catch {
      set({ finCuentas: FINANZAS.cuentas })
      if (DEBUG) console.log('fetchFinCuentas: using mock data')
    }
  },

  fetchFinCategorias: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/categorias`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finCategorias: data })
      if (DEBUG) console.log('fetchFinCategorias:', data)
    } catch {
      set({ finCategorias: FINANZAS.categorias })
      if (DEBUG) console.log('fetchFinCategorias: using mock data')
    }
  },

  fetchFinConfig: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/config`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finConfig: data })
      if (DEBUG) console.log('fetchFinConfig:', data)
    } catch {
      set({ finConfig: { dolar_oficial: FINANZAS.blueRate, fire_meta_usd: 500000 } })
      if (DEBUG) console.log('fetchFinConfig: using mock data')
    }
  },

  updateFinConfig: async (clave, valor) => {
    try {
      const res = await fetch(`${API_URL}/fin/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [clave]: valor }),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finConfig: data })
    } catch {
      set(state => ({ finConfig: { ...state.finConfig, [clave]: valor } }))
    }
    if (DEBUG) console.log('updateFinConfig:', clave, valor)
  },

  fetchFinNotas: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/notas`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finNotas: data })
      if (DEBUG) console.log('fetchFinNotas:', data)
    } catch {
      set({ finNotas: [] })
      if (DEBUG) console.log('fetchFinNotas: using empty fallback')
    }
  },

  addFinNota: async (contenido) => {
    try {
      const res = await fetch(`${API_URL}/fin/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido }),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({ finNotas: [...state.finNotas, data] }))
    } catch {
      const nota = { id: `n_${Date.now()}`, contenido, fecha: new Date().toISOString() }
      set(state => ({ finNotas: [...state.finNotas, nota] }))
    }
    if (DEBUG) console.log('addFinNota:', contenido)
  },

  deleteFinNota: async (id) => {
    try {
      await fetch(`${API_URL}/fin/notas/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
    set(state => ({ finNotas: state.finNotas.filter(n => n.id !== id) }))
    if (DEBUG) console.log('deleteFinNota:', id)
  },

  // ---------------------------------------------------------------------------
  // Finanzas — Instrumentos
  // ---------------------------------------------------------------------------
  finInstrumentos: [],

  fetchFinInstrumentos: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finInstrumentos: data })
    } catch {
      set({ finInstrumentos: [] })
    }
  },

  addFinInstrumento: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({ finInstrumentos: [...state.finInstrumentos, data] }))
      return data
    } catch {
      const mock = { id: `i_${Date.now()}`, ...payload }
      set(state => ({ finInstrumentos: [...state.finInstrumentos, mock] }))
      return mock
    }
  },

  updateFinInstrumento: async (id, patch) => {
    set(state => ({
      finInstrumentos: state.finInstrumentos.map(i => i.id === id ? { ...i, ...patch } : i),
    }))
    try {
      await fetch(`${API_URL}/fin/instrumentos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteFinInstrumento: async (id) => {
    set(state => ({ finInstrumentos: state.finInstrumentos.filter(i => i.id !== id) }))
    try {
      await fetch(`${API_URL}/fin/instrumentos/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
  },

  // ---------------------------------------------------------------------------
  // Finanzas — Objetivos de ahorro
  // ---------------------------------------------------------------------------
  finObjetivos: [],

  fetchFinObjetivos: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/objetivos`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finObjetivos: data })
    } catch {
      set({ finObjetivos: [] })
    }
  },

  addFinObjetivo: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/fin/objetivos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(state => ({ finObjetivos: [...state.finObjetivos, data] }))
      return data
    } catch {
      const mock = { id: `o_${Date.now()}`, fecha_creacion: new Date().toISOString(), ...payload }
      set(state => ({ finObjetivos: [...state.finObjetivos, mock] }))
      return mock
    }
  },

  updateFinObjetivo: async (id, patch) => {
    set(state => ({
      finObjetivos: state.finObjetivos.map(o => o.id === id ? { ...o, ...patch } : o),
    }))
    try {
      await fetch(`${API_URL}/fin/objetivos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteFinObjetivo: async (id) => {
    set(state => ({ finObjetivos: state.finObjetivos.filter(o => o.id !== id) }))
    try {
      await fetch(`${API_URL}/fin/objetivos/${id}`, { method: 'DELETE' })
    } catch { /* noop */ }
  },

  // ---------------------------------------------------------------------------
  // Finanzas — FIRE filas (ahorrado override por mes)
  // ---------------------------------------------------------------------------
  finFireFilas: {},

  fetchFinFireFilas: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/fire-filas`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finFireFilas: data })
    } catch {
      set({ finFireFilas: {} })
    }
  },

  upsertFinFireFila: async (mes, ahorrado_override) => {
    set(state => ({
      finFireFilas: ahorrado_override == null
        ? Object.fromEntries(Object.entries(state.finFireFilas).filter(([k]) => k !== mes))
        : { ...state.finFireFilas, [mes]: ahorrado_override },
    }))
    try {
      await fetch(`${API_URL}/fin/fire-filas/${mes}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ahorrado_override }),
      })
    } catch { /* offline ok */ }
  },

  // ---------------------------------------------------------------------------
  // Finanzas — Inflación mensual
  // ---------------------------------------------------------------------------
  finInflacion: {},

  fetchFinInflacion: async () => {
    try {
      const res = await fetch(`${API_URL}/fin/inflacion`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set({ finInflacion: data })
    } catch {
      set({ finInflacion: {} })
    }
  },

  upsertFinInflacion: async (mes, inflacion) => {
    set(state => ({
      finInflacion: inflacion == null
        ? Object.fromEntries(Object.entries(state.finInflacion).filter(([k]) => k !== mes))
        : { ...state.finInflacion, [mes]: inflacion },
    }))
    try {
      await fetch(`${API_URL}/fin/inflacion/${mes}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inflacion }),
      })
    } catch { /* offline ok */ }
    if (DEBUG) console.log('upsertFinInflacion:', mes, inflacion)
  },

  // ---------------------------------------------------------------------------
  // Agenda
  // ---------------------------------------------------------------------------
  agendaCalendarios:     [],
  agendaEventos:         [],
  agendaListas:          [],
  agendaTareas:          [],
  agendaHorarioFacultad: [],

  fetchAgendaCalendarios: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/calendarios`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaCalendarios: await res.json() })
    } catch { set({ agendaCalendarios: [] }) }
  },

  addAgendaCalendario: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/calendarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaCalendarios: [...s.agendaCalendarios, data] }))
      return data
    } catch {
      const mock = { id: `cal_${Date.now()}`, activo: true, ...payload }
      set(s => ({ agendaCalendarios: [...s.agendaCalendarios, mock] }))
      return mock
    }
  },

  updateAgendaCalendario: async (id, patch) => {
    set(s => ({ agendaCalendarios: s.agendaCalendarios.map(c => c.id === id ? { ...c, ...patch } : c) }))
    try {
      await fetch(`${API_URL}/agenda/calendarios/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaCalendario: async (id) => {
    set(s => ({ agendaCalendarios: s.agendaCalendarios.filter(c => c.id !== id) }))
    try { await fetch(`${API_URL}/agenda/calendarios/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaEventos: async (desde, hasta) => {
    try {
      const params = new URLSearchParams()
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      const res = await fetch(`${API_URL}/agenda/eventos?${params}`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaEventos: await res.json() })
    } catch { set({ agendaEventos: [] }) }
  },

  addAgendaEvento: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/eventos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaEventos: [...s.agendaEventos, data] }))
      return data
    } catch {
      const mock = { id: `evt_${Date.now()}`, calendario_color: '#2563eb', calendario_nombre: '', ...payload }
      set(s => ({ agendaEventos: [...s.agendaEventos, mock] }))
      return mock
    }
  },

  updateAgendaEvento: async (id, patch) => {
    set(s => ({ agendaEventos: s.agendaEventos.map(e => e.id === id ? { ...e, ...patch } : e) }))
    try {
      await fetch(`${API_URL}/agenda/eventos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaEvento: async (id) => {
    set(s => ({ agendaEventos: s.agendaEventos.filter(e => e.id !== id) }))
    try { await fetch(`${API_URL}/agenda/eventos/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaListas: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/listas`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaListas: await res.json() })
    } catch { set({ agendaListas: [] }) }
  },

  addAgendaLista: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/listas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaListas: [...s.agendaListas, data] }))
      return data
    } catch {
      const mock = { id: `lst_${Date.now()}`, ...payload }
      set(s => ({ agendaListas: [...s.agendaListas, mock] }))
      return mock
    }
  },

  updateAgendaLista: async (id, patch) => {
    set(s => ({ agendaListas: s.agendaListas.map(l => l.id === id ? { ...l, ...patch } : l) }))
    try {
      await fetch(`${API_URL}/agenda/listas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaLista: async (id) => {
    set(s => ({
      agendaListas:  s.agendaListas.filter(l => l.id !== id),
      agendaTareas:  s.agendaTareas.filter(t => t.lista_id !== id),
    }))
    try { await fetch(`${API_URL}/agenda/listas/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaTareas: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/tareas`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaTareas: await res.json() })
    } catch { set({ agendaTareas: [] }) }
  },

  addAgendaTarea: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/tareas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaTareas: [...s.agendaTareas, data] }))
      return data
    } catch {
      const mock = { id: `tarea_${Date.now()}`, completada: false, lista_color: '#7c3aed', lista_nombre: '', ...payload }
      set(s => ({ agendaTareas: [...s.agendaTareas, mock] }))
      return mock
    }
  },

  updateAgendaTarea: async (id, patch) => {
    set(s => ({ agendaTareas: s.agendaTareas.map(t => t.id === id ? { ...t, ...patch } : t) }))
    try {
      await fetch(`${API_URL}/agenda/tareas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaTarea: async (id) => {
    set(s => ({ agendaTareas: s.agendaTareas.filter(t => t.id !== id) }))
    try { await fetch(`${API_URL}/agenda/tareas/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  fetchAgendaHorarioFacultad: async () => {
    try {
      const res = await fetch(`${API_URL}/agenda/horario-facultad`)
      if (!res.ok) throw new Error('not ok')
      set({ agendaHorarioFacultad: await res.json() })
    } catch { set({ agendaHorarioFacultad: [] }) }
  },

  addAgendaHorarioFacultad: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/agenda/horario-facultad`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ agendaHorarioFacultad: [...s.agendaHorarioFacultad, data] }))
      return data
    } catch {
      const mock = { id: `hf_${Date.now()}`, ...payload }
      set(s => ({ agendaHorarioFacultad: [...s.agendaHorarioFacultad, mock] }))
      return mock
    }
  },

  updateAgendaHorarioFacultad: async (id, patch) => {
    set(s => ({ agendaHorarioFacultad: s.agendaHorarioFacultad.map(h => h.id === id ? { ...h, ...patch } : h) }))
    try {
      await fetch(`${API_URL}/agenda/horario-facultad/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteAgendaHorarioFacultad: async (id) => {
    set(s => ({ agendaHorarioFacultad: s.agendaHorarioFacultad.filter(h => h.id !== id) }))
    try { await fetch(`${API_URL}/agenda/horario-facultad/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  // ---------------------------------------------------------------------------
  // Hábitos
  // ---------------------------------------------------------------------------
  habitos:          [],
  habitosRegistros: [],

  fetchHabitos: async () => {
    try {
      const res = await fetch(`${API_URL}/habitos`)
      if (!res.ok) throw new Error('not ok')
      set({ habitos: await res.json() })
    } catch { set({ habitos: [] }) }
  },

  fetchHabitosRegistros: async (fechaDesde, fechaHasta) => {
    try {
      const params = new URLSearchParams()
      if (fechaDesde) params.set('fecha_desde', fechaDesde)
      if (fechaHasta) params.set('fecha_hasta', fechaHasta)
      const res = await fetch(`${API_URL}/habitos/registros?${params}`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      if (fechaDesde || fechaHasta) {
        // merge: replace registros in the fetched range, keep the rest
        set(s => {
          const fuera = s.habitosRegistros.filter(r =>
            (fechaDesde && r.fecha < fechaDesde) || (fechaHasta && r.fecha > fechaHasta)
          )
          return { habitosRegistros: [...fuera, ...data] }
        })
      } else {
        set({ habitosRegistros: data })
      }
    } catch { /* keep existing */ }
  },

  addHabito: async (payload) => {
    try {
      const res = await fetch(`${API_URL}/habitos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ habitos: [...s.habitos, data] }))
      return data
    } catch {
      const mock = { id: `h_${Date.now()}`, activo: true, creado_en: new Date().toISOString(), ...payload }
      set(s => ({ habitos: [...s.habitos, mock] }))
      return mock
    }
  },

  updateHabito: async (id, patch) => {
    set(s => ({ habitos: s.habitos.map(h => h.id === id ? { ...h, ...patch } : h) }))
    try {
      await fetch(`${API_URL}/habitos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* offline ok */ }
  },

  deleteHabito: async (id) => {
    set(s => ({
      habitos:          s.habitos.filter(h => h.id !== id),
      habitosRegistros: s.habitosRegistros.filter(r => r.habito_id !== id),
    }))
    try { await fetch(`${API_URL}/habitos/${id}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  upsertHabitoRegistro: async (habitoId, fecha, valor, nota) => {
    const key = `${habitoId}-${fecha}`
    // optimistic: update or insert in local slice
    set(s => {
      const existing = s.habitosRegistros.find(r => r.habito_id === habitoId && r.fecha === fecha)
      if (existing) {
        return { habitosRegistros: s.habitosRegistros.map(r =>
          r.habito_id === habitoId && r.fecha === fecha ? { ...r, valor, nota } : r
        )}
      }
      const mock = { id: `reg_${Date.now()}`, habito_id: habitoId, fecha, valor, nota, creado_en: new Date().toISOString() }
      return { habitosRegistros: [...s.habitosRegistros, mock] }
    })
    try {
      const res = await fetch(`${API_URL}/habitos/${habitoId}/registro`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, valor, nota }),
      })
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      set(s => ({ habitosRegistros: s.habitosRegistros.map(r =>
        r.habito_id === habitoId && r.fecha === fecha ? data : r
      )}))
    } catch { /* offline ok — optimistic update stays */ }
    if (DEBUG) console.log('upsertHabitoRegistro:', key, valor)
  },

  deleteHabitoRegistro: async (registroId, habitoId, fecha) => {
    set(s => ({ habitosRegistros: s.habitosRegistros.filter(r => !(r.habito_id === habitoId && r.fecha === fecha)) }))
    try { await fetch(`${API_URL}/habitos/registros/${registroId}`, { method: 'DELETE' }) } catch { /* noop */ }
  },

  // Legacy alias — kept for backward compat
  movimientos: FINANZAS.movimientos.slice(),
  addMovimiento: (mov) => {
    const id = `m_${Date.now()}`
    const full = { id, ...mov }
    set(state => ({ movimientos: [full, ...state.movimientos] }))
    if (DEBUG) console.log('addMovimiento (legacy):', full)
  },

  // --- User name ---
  setUserName: (name) => {
    localStorage.setItem('sgr-username', name)
    set({ userName: name })
  },

  // --- Language ---
  setLang: (l) => {
    localStorage.setItem('sgr-lang', l)
    set({ lang: l })
    if (DEBUG) console.log('lang set:', l)
  },

  // --- Theme ---
  setTheme: (key) => {
    applyTheme(key, get().tone, get().fontPair)
    localStorage.setItem('sgr-theme', key)
    set({ theme: key })
    if (DEBUG) console.log('theme set:', key)
  },

  // --- Tone (modificador del theme) ---
  setTone: (key) => {
    applyTheme(get().theme, key, get().fontPair)
    localStorage.setItem('sgr-tone', key)
    set({ tone: key })
    if (DEBUG) console.log('tone set:', key)
  },

  // --- Font pair (independiente del tema) ---
  setFontPair: (key) => {
    applyTheme(get().theme, get().tone, key)
    localStorage.setItem('sgr-font-pair', key)
    set({ fontPair: key })
    if (DEBUG) console.log('fontPair set:', key)
  },

  // --- Toast ---
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 2500)
  },

  // --- Categorias ---
  fetchCategorias: async () => {
    try {
      const res = await fetch(`${API_URL}/categorias`)
      const data = await res.json()
      set({ categorias: data })
      if (DEBUG) console.log('fetchCategorias:', data.length)
    } catch (e) {
      if (DEBUG) console.error('fetchCategorias:', e)
    }
  },

  crearCategoria: async (nombre, padre_id = null) => {
    const res = await fetch(`${API_URL}/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, padre_id }),
    })
    if (!res.ok) throw new Error((await res.json()).detail)
    const data = await res.json()
    await get().fetchCategorias()
    if (DEBUG) console.log('crearCategoria:', data)
    return data
  },

  // --- Hojas ---
  fetchHojas: async () => {
    try {
      const res = await fetch(`${API_URL}/hojas`)
      const data = await res.json()
      set({ hojas: data })
      if (DEBUG) console.log('fetchHojas:', data.length)
    } catch (e) {
      if (DEBUG) console.error('fetchHojas:', e)
    }
  },

  crearHoja: async (payload) => {
    const res = await fetch(`${API_URL}/hojas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json()).detail)
    await get().fetchHojas()
    if (DEBUG) console.log('crearHoja:', payload.tipo)
  },

  eliminarHoja: async (id) => {
    await fetch(`${API_URL}/hojas/${id}`, { method: 'DELETE' })
    set(state => ({ hojas: state.hojas.filter(h => h.id !== id) }))
    if (DEBUG) console.log('eliminarHoja:', id)
  },

  updateIcono: async (id, icono) => {
    const res = await fetch(`${API_URL}/hojas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icono }),
    })
    if (!res.ok) throw new Error('Error al guardar icono')
    const { fecha_actualizado } = await res.json().catch(() => ({}))
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, icono, fecha_actualizado: fecha_actualizado ?? h.fecha_actualizado } : h),
    }))
    if (DEBUG) console.log('updateIcono:', id, icono)
  },

  updateApuntes: async (id, apuntes) => {
    const res = await fetch(`${API_URL}/hojas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apuntes }),
    })
    if (!res.ok) throw new Error('Error al guardar apuntes')
    const { fecha_actualizado } = await res.json().catch(() => ({}))
    set(state => ({
      hojas: state.hojas.map(h => h.id === id ? { ...h, apuntes, fecha_actualizado: fecha_actualizado ?? h.fecha_actualizado } : h),
    }))
    if (DEBUG) console.log('updateApuntes:', id)
  },
}))
