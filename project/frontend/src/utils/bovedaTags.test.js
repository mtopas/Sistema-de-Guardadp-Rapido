import { beforeAll, describe, expect, it } from 'vitest'
import { buildBovedaTagCounts, filterBovedaHojas } from './bovedaTags'

let buildGraph

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
  ;({ buildGraph } = await import('../components/NetworkGraph'))
})

const hojas = [
  {
    id: 1,
    contenido: 'Nota sin hashtags',
    apuntes: '<p>Contenido propio</p>',
    tags: ['proyecto'],
    categoria_id: 1,
    categoria_nombre: 'Trabajo',
    fecha: '2026-10-07T10:00:00Z',
  },
  {
    id: 2,
    contenido: 'Otra nota',
    apuntes: '',
    tags: ['proyecto'],
    categoria_id: 1,
    categoria_nombre: 'Trabajo',
    fecha: '2026-10-07T09:00:00Z',
  },
]

describe('consumidores de tags propios de Bóveda', () => {
  it('muestra y filtra hojas propias en lista y explorador', () => {
    expect(buildBovedaTagCounts(hojas)).toEqual([['proyecto', 2]])
    expect(filterBovedaHojas(hojas, { selectedTag: 'proyecto' }).map(hoja => hoja.id)).toEqual([1, 2])
    expect(filterBovedaHojas(hojas, { query: 'proyecto' }).map(hoja => hoja.id)).toEqual([1, 2])
  })

  it('usa tags propios para enlaces cruzados del grafo', () => {
    const graph = buildGraph(
      [{ id: 1, nombre: 'Trabajo', padre_id: null }],
      hojas,
    )
    expect(graph.leaves).toHaveLength(2)
    expect(graph.crossLinks).toHaveLength(1)
  })
})
