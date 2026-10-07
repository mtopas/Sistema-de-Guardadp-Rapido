import { describe, expect, it } from 'vitest'
import { getVaultProjectStatusCopy } from './jarvisProjects.js'

describe('estado explicativo de proyectos de Bóveda', () => {
  it('explica la carga inicial', () => {
    expect(getVaultProjectStatusCopy('loading')).toEqual({
      title: 'Cargando proyectos de la Bóveda…',
      detail: 'Leyendo Bóveda / 01 - Proyectos.',
    })
  })

  it('explica vacío y fuente no disponible', () => {
    expect(getVaultProjectStatusCopy('empty').title).toContain('No hay proyectos')
    expect(getVaultProjectStatusCopy('unavailable').detail).toContain('no pudo leer')
  })

  it('explica que el dato mostrado quedó desactualizado', () => {
    expect(getVaultProjectStatusCopy('stale').detail).toContain('última lectura')
  })
})
