import { describe, expect, it, vi } from 'vitest'
import {
  MOBILE_ACTIONS,
  mobileCategoryOption,
  loadMobileTargets,
  mobileDestination,
  submitMobileCapture,
  undoMobileCapture,
} from './mobileCapture'

function jsonResponse(data, ok = true) {
  return { ok, json: async () => data }
}

describe('captura móvil intencional', () => {
  it('expone las cinco acciones con destino explícito', () => {
    expect(MOBILE_ACTIONS.map(action => action.id)).toEqual(['gasto', 'boveda', 'tarea', 'habito', 'jarvis'])
    expect(mobileDestination('habito')).toBe('Hábitos · Diario')
    expect(mobileDestination('jarvis')).toBe('Jarvis · Chat nuevo')
    expect(mobileDestination('tarea', { listId: 7 }, { lists: [{ id: 7, nombre: 'Casa' }] }))
      .toBe('Agenda · Hoy · Casa')
  })

  it('carga solo categorías de Bóveda y fija Sin categorizar como destino', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      { id: 1, nombre: '01 - Proyectos' },
      { id: 2, nombre: '00 - Sin categorizar' },
    ]))
    const targets = await loadMobileTargets('boveda', fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/categorias$/)
    expect(targets.inbox.id).toBe(2)
    expect(mobileDestination('boveda', {}, targets)).toBe('Bóveda · 00 - Sin categorizar')
  })

  it('expone name como valor y etiqueta seleccionable de Gasto', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 3, name: 'Efectivo' }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 8, name: 'Comida', tipo: 'expense', oculta: false }]))

    const targets = await loadMobileTargets('gasto', fetchMock)

    expect(targets.categories).toEqual([{ id: 8, name: 'Comida', tipo: 'expense', oculta: false }])
    expect(mobileCategoryOption(targets.categories[0])).toEqual({ value: 'Comida', label: 'Comida' })
  })

  it('crea una tarea para hoy en la lista elegida', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 31 }))
    const result = await submitMobileCapture({
      action: 'tarea', text: 'Enviar informe', fields: { listId: '4' },
      targets: { lists: [{ id: 4, nombre: 'Trabajo' }] }, today: '2026-10-07',
    }, fetchMock)
    const [, options] = fetchMock.mock.calls[0]
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/agenda\/tareas$/)
    expect(JSON.parse(options.body)).toEqual({ titulo: 'Enviar informe', fecha_opcional: '2026-10-07', lista_id: 4 })
    expect(result.detail).toBe('Agenda · Hoy · Trabajo')
    expect(result.undo.path).toBe('/agenda/tareas/31')
  })

  it('crea un gasto con cuenta y categoría visibles y permite deshacer', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 88 }))
      .mockResolvedValueOnce(jsonResponse({ mensaje: 'Movimiento eliminado' }))
    const result = await submitMobileCapture({
      action: 'gasto', text: 'Almuerzo', fields: { amount: '1250,50', accountId: '3', categoryName: 'Comida' },
      targets: { accounts: [{ id: 3, name: 'Efectivo' }] }, now: new Date(2026, 9, 7, 13, 5),
    }, fetchMock)
    expect(result.detail).toBe('Finanzas · Efectivo · Comida')
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload).toMatchObject({ tipo: 'expense', monto: 1250.5, cuenta_id: 3, categoria_nombre: 'Comida' })
    await undoMobileCapture(result.undo, fetchMock)
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/fin\/movimientos\/88$/)
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })
})
