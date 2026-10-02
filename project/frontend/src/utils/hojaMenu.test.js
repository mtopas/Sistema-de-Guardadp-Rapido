import { describe, it, expect, vi } from 'vitest'
import { buildHojaContextItems } from './hojaMenu'

// Regresión #7 + #5: el menú contextual de una hoja (árbol, workspace y
// "Últimas hojas") debe ofrecer Abrir / Editar / Eliminar, y cada acción debe
// disparar su callback con la hoja.
describe('buildHojaContextItems', () => {
  const hoja = { id: 42, contenido: 'Nota' }

  it('ofrece Abrir, Editar y Eliminar (es)', () => {
    const items = buildHojaContextItems(hoja, { lang: 'es' })
    expect(items.map(i => i.label)).toEqual(['Abrir hoja', 'Editar Hoja', 'Eliminar Hoja'])
  })

  it('traduce las etiquetas al inglés', () => {
    const items = buildHojaContextItems(hoja, { lang: 'en' })
    expect(items.map(i => i.label)).toEqual(['Open note', 'Edit note', 'Delete note'])
  })

  it('marca Eliminar como acción peligrosa', () => {
    const items = buildHojaContextItems(hoja, { lang: 'es' })
    expect(items[2].danger).toBe(true)
    expect(items[0].danger).toBeFalsy()
    expect(items[1].danger).toBeFalsy()
  })

  it('cablea cada acción a su callback con la hoja', () => {
    const onOpen = vi.fn(); const onEdit = vi.fn(); const onDelete = vi.fn()
    const items = buildHojaContextItems(hoja, { lang: 'es', onOpen, onEdit, onDelete })
    items[0].onClick()
    items[1].onClick()
    items[2].onClick()
    expect(onOpen).toHaveBeenCalledWith(hoja)
    expect(onEdit).toHaveBeenCalledWith(hoja)
    expect(onDelete).toHaveBeenCalledWith(hoja)
  })

  it('no rompe si faltan callbacks', () => {
    const items = buildHojaContextItems(hoja, { lang: 'es' })
    expect(() => items.forEach(i => i.onClick())).not.toThrow()
  })
})
