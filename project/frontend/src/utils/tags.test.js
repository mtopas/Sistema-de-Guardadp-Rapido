import { describe, expect, it } from 'vitest'
import { getHojaTags, removeTag } from './tags'

describe('tags propios de Bóveda', () => {
  it('conserva compatibilidad con hashtags cuando no hay array propio', () => {
    expect(getHojaTags({ contenido: 'Nota #Manual', apuntes: '<p>Cuerpo #cuerpo</p>' }))
      .toEqual(['manual', 'cuerpo'])
  })

  it('usa el array persistido y permite quitar un chip sin reextraerlo del texto', () => {
    const hoja = { contenido: 'Nota #manual', tags: ['manual', 'ia'] }
    expect(getHojaTags(hoja)).toEqual(['manual', 'ia'])
    expect(removeTag(getHojaTags(hoja), 'manual')).toEqual(['ia'])
  })
})
