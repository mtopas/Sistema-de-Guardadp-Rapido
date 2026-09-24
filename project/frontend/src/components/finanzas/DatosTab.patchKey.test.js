import { describe, it, expect, beforeAll } from 'vitest'

// DatosTab.jsx importa useStore.js, que toca APIs de browser al cargar el módulo
// (mismo motivo que useStore.addFinMovimiento.test.js) -- se stubean antes de importar.
let getVal, PATCH_KEY
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
  ;({ getVal, PATCH_KEY } = await import('./DatosTab.jsx'))
})

// Bug encontrado (Finanzas-Roadmap.md, dual schema movimientos): patchKey() decidía
// la clave del PATCH según qué shape tenía el movimiento en memoria (type/amount/cat
// vs tipo/monto/categoria_nombre). Con movimientos en shape legacy, mandaba claves
// que el modelo Pydantic de PATCH /fin/movimientos/{id} (FinMovimientoPatch,
// app/main.py) no reconoce -- se ignoraban en silencio, sin error visible. Ahora que
// el origen del dual schema está cortado (MovementModal/useStore ya no producen
// shape legacy), PATCH_KEY es un mapeo estático campo-UI → campo-API canónico.
describe('DatosTab PATCH_KEY (fix del bug de patchKey por shape mixto)', () => {
  it('mapea cada campo editable de la UI a su clave canónica reconocida por FinMovimientoPatch', () => {
    expect(PATCH_KEY).toEqual({
      tipo: 'tipo',
      monto: 'monto',
      fecha: 'fecha',
      cat: 'categoria_nombre',
      desc: 'descripcion',
      method: 'cuenta_nombre',
      moneda: 'moneda',
      cuotas: 'cuotas',
    })
  })
})

describe('DatosTab getVal', () => {
  it('lee siempre el campo canónico, sin fallback a shape legacy', () => {
    const mov = {
      tipo: 'income', monto: 500, fecha: '2026-09-24',
      categoria_nombre: 'Sueldo', descripcion: 'Pago', cuenta_nombre: 'Banco',
      moneda: 'USD', cuotas: 3,
    }
    expect(getVal(mov, 'tipo')).toBe('income')
    expect(getVal(mov, 'monto')).toBe(500)
    expect(getVal(mov, 'fecha')).toBe('2026-09-24')
    expect(getVal(mov, 'cat')).toBe('Sueldo')
    expect(getVal(mov, 'desc')).toBe('Pago')
    expect(getVal(mov, 'method')).toBe('Banco')
    expect(getVal(mov, 'moneda')).toBe('USD')
    expect(getVal(mov, 'cuotas')).toBe(3)
  })

  it('usa defaults cuando el campo canónico no está presente (nunca cae a un alias legacy)', () => {
    expect(getVal({}, 'tipo')).toBe('expense')
    expect(getVal({}, 'monto')).toBe(0)
    expect(getVal({}, 'cat')).toBe('')
    expect(getVal({}, 'moneda')).toBe('ARS')
  })
})
