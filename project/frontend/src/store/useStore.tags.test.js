import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let useStore

beforeAll(async () => {
  const backing = {}
  globalThis.localStorage = {
    getItem: key => backing[key] ?? null,
    setItem: (key, value) => { backing[key] = String(value) },
    removeItem: key => { delete backing[key] },
  }
  globalThis.window = { location: { pathname: '/' } }
  globalThis.document = {
    documentElement: { style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return '' } }, dataset: {} },
  }
  ;({ useStore } = await import('./useStore.js'))
})

beforeEach(() => {
  useStore.setState({
    hojas: [{ id: 8, contenido: 'Nota #manual', tags: ['manual', 'ia'] }],
    hojasRecientes: [{ id: 8, contenido: 'Nota #manual', tags: ['manual', 'ia'] }],
  })
})

describe('removeHojaTag', () => {
  it('guarda la lista sin el chip elegido y actualiza ambas vistas', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }))

    await useStore.getState().removeHojaTag(8, 'manual', ['manual', 'ia'])

    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({ tags: ['ia'] })
    expect(useStore.getState().hojas[0].tags).toEqual(['ia'])
    expect(useStore.getState().hojasRecientes[0].tags).toEqual(['ia'])
  })
})
