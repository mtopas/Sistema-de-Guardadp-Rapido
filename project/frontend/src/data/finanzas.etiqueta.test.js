import { describe, it, expect } from 'vitest'
import { etiquetaMovimiento } from './finanzas'

// Regresión #15: en Recientes/Dashboard, un movimiento sin descripción debe
// mostrar la categoría como etiqueta principal, no una etiqueta en blanco.
describe('etiquetaMovimiento', () => {
  it('usa la descripción cuando existe', () => {
    expect(etiquetaMovimiento({ descripcion: 'Super chino', categoria_nombre: 'Comida' }))
      .toBe('Super chino')
  })

  it('cae a la categoría cuando la descripción está vacía', () => {
    expect(etiquetaMovimiento({ descripcion: '', categoria_nombre: 'Comida' }))
      .toBe('Comida')
  })

  it('cae a la categoría cuando la descripción es solo espacios', () => {
    expect(etiquetaMovimiento({ descripcion: '   ', categoria_nombre: 'Transporte' }))
      .toBe('Transporte')
  })

  it('cae a la categoría cuando no hay campo descripción', () => {
    expect(etiquetaMovimiento({ categoria_nombre: 'Sueldo' })).toBe('Sueldo')
  })

  it('preserva mayúsculas de la descripción', () => {
    expect(etiquetaMovimiento({ descripcion: 'Netflix', categoria_nombre: 'Ocio' }))
      .toBe('Netflix')
  })

  it('devuelve cadena vacía si no hay descripción ni categoría', () => {
    expect(etiquetaMovimiento({})).toBe('')
    expect(etiquetaMovimiento(null)).toBe('')
  })
})
