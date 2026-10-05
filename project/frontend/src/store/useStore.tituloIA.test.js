import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let useStore
beforeAll(async () => {
  const backing = {}
  globalThis.localStorage = {
    getItem: k => backing[k] ?? null,
    setItem: (k, value) => { backing[k] = String(value) },
    removeItem: k => { delete backing[k] },
  }
  globalThis.window = { location: { pathname: '/' } }
  globalThis.document = {
    documentElement: { style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return '' } }, dataset: {} },
  }
  ;({ useStore } = await import('./useStore.js'))
})

beforeEach(() => {
  useStore.setState({
    hojas: [{ id: 5, contenido: 'ejemplo.com', apuntes: '<p>https://ejemplo.com</p>' }],
    hojasRecientes: [{ id: 5, contenido: 'ejemplo.com' }],
  })
})

describe('refinarTituloHoja', () => {
  it('reemplaza el título cuando la IA devuelve uno', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ titulo: 'Título IA', pregunta: null }) }))
    await useStore.getState().refinarTituloHoja(5, 'ejemplo.com')
    expect(useStore.getState().hojas[0].contenido).toBe('Título IA')
    expect(useStore.getState().hojasRecientes[0].contenido).toBe('Título IA')
  })

  it('no toca nada si la IA no devuelve título (pregunta/fallback)', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ titulo: null, pregunta: '¿De qué trata?' }) }))
    await useStore.getState().refinarTituloHoja(5, 'ejemplo.com')
    expect(useStore.getState().hojas[0].contenido).toBe('ejemplo.com')
  })

  it('es silencioso si el fetch falla', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('sin red'))
    await useStore.getState().refinarTituloHoja(5, 'ejemplo.com')
    expect(useStore.getState().hojas[0].contenido).toBe('ejemplo.com')
  })

  it('no hace nada sin id', async () => {
    const f = vi.fn()
    globalThis.fetch = f
    await useStore.getState().refinarTituloHoja(null, 'x')
    expect(f).not.toHaveBeenCalled()
  })
})
