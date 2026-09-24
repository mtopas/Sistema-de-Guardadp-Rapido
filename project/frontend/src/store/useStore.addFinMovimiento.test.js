import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { API_URL } from '../config.js'

// Mismo patrón de stub que habitos.test.js: useStore.js toca APIs de browser al
// cargar el módulo, y el environment de vitest es 'node' -- se stubean acá las
// mínimas necesarias antes de importar el store dinámicamente.
let useStore
beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const backing = {}
    globalThis.localStorage = {
      getItem:    k => (k in backing ? backing[k] : null),
      setItem:    (k, v) => { backing[k] = String(v) },
      removeItem: k => { delete backing[k] },
    }
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = { location: { pathname: '/finanzas' } }
  }
  if (typeof globalThis.document === 'undefined') {
    const styleProps = {}
    globalThis.document = {
      documentElement: {
        style: {
          setProperty:      (k, v) => { styleProps[k] = v },
          removeProperty:   k => { delete styleProps[k] },
          getPropertyValue: k => styleProps[k] || '',
        },
        dataset: {},
      },
    }
  }
  ;({ useStore } = await import('./useStore.js'))
})

const PAYLOAD = {
  tipo: 'expense', monto: -500, moneda: 'ARS', fecha: '2026-09-24T10:00',
  descripcion: 'Café', icono: '💸',
  cuenta_nombre: 'Efectivo', cuenta_id: 1,
  categoria_nombre: 'Varios',
  cuotas: null, nota: null,
}

describe('addFinMovimiento', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    useStore.setState({ finMovimientos: [], finMovimientosAll: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('camino exitoso: usa la respuesta de la API tal cual, sin alias legacy (desc/cat)', async () => {
    const apiResponse = { id: 42, ...PAYLOAD }
    fetchMock.mockImplementation(url => {
      if (String(url).includes('/fin/movimientos') && !String(url).includes('duplicados')) {
        return Promise.resolve({ ok: true, json: async () => apiResponse })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    await useStore.getState().addFinMovimiento(PAYLOAD)

    const row = useStore.getState().finMovimientos[0]
    expect(row).toEqual(apiResponse)
    expect(row).not.toHaveProperty('desc')
    expect(row).not.toHaveProperty('cat')
    expect(row).not.toHaveProperty('type')
    expect(row).not.toHaveProperty('amount')
  })

  it('fallback offline: el movimiento local queda en shape canónico puro (payload de origen ya no manda legacy)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false }))
    useStore.setState({ showToast: vi.fn() })

    await useStore.getState().addFinMovimiento(PAYLOAD)

    const row = useStore.getState().finMovimientos[0]
    expect(row.tipo).toBe('expense')
    expect(row.monto).toBe(-500)
    expect(row.descripcion).toBe('Café')
    expect(row.categoria_nombre).toBe('Varios')
    expect(row).not.toHaveProperty('desc')
    expect(row).not.toHaveProperty('cat')
    expect(row).not.toHaveProperty('type')
    expect(row).not.toHaveProperty('amount')
  })
})
