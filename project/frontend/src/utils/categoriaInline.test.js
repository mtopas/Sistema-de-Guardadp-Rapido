import { describe, it, expect } from 'vitest'
import {
  etiquetaCategoria,
  esSinCategorizar,
  opcionesDestino,
  RUTA_SIN_CATEGORIZAR,
} from './categoriaInline'

// Regresión T5-C (#11a): el selector inline solo aparece en hojas de "Sin
// categorizar", etiqueta los destinos de forma legible y excluye inbox/basura.
describe('etiquetaCategoria', () => {
  it('quita los prefijos numéricos y separa la jerarquía', () => {
    expect(etiquetaCategoria({ ruta: '02 - Areas/Salud' })).toBe('Areas / Salud')
    expect(etiquetaCategoria({ ruta: '03 - Recursos/Carrera Profesional' }))
      .toBe('Recursos / Carrera Profesional')
  })

  it('cae al nombre si no hay ruta', () => {
    expect(etiquetaCategoria({ nombre: 'Proyecto X' })).toBe('Proyecto X')
  })
})

describe('esSinCategorizar', () => {
  const categorias = [
    { id: 1, ruta: RUTA_SIN_CATEGORIZAR },
    { id: 2, ruta: '02 - Areas/Salud' },
  ]

  it('detecta la hoja del inbox', () => {
    expect(esSinCategorizar({ categoria_id: 1 }, categorias)).toBe(true)
  })

  it('devuelve false para otras categorías', () => {
    expect(esSinCategorizar({ categoria_id: 2 }, categorias)).toBe(false)
    expect(esSinCategorizar({ categoria_id: 99 }, categorias)).toBe(false)
  })
})

describe('opcionesDestino', () => {
  it('excluye el inbox y la basura, y ordena por etiqueta', () => {
    const categorias = [
      { id: 1, ruta: RUTA_SIN_CATEGORIZAR },
      { id: 2, ruta: '05 - Basura' },
      { id: 3, ruta: '03 - Recursos/Salud' },
      { id: 4, ruta: '02 - Areas/Facultad' },
    ]
    const opts = opcionesDestino(categorias)
    expect(opts.map((o) => o.id)).toEqual([4, 3]) // Areas / Facultad < Recursos / Salud
    expect(opts.map((o) => o.label)).toEqual(['Areas / Facultad', 'Recursos / Salud'])
  })
})
