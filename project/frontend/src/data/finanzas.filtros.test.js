import { describe, it, expect } from 'vitest'
import { filtrarMovimientos } from './finanzas.js'

const movs = [
  { id: 1, tipo: 'expense', monto: 1000, fecha: '2026-01-05', categoria_nombre: 'Comida', cuenta_nombre: 'Efectivo' },
  { id: 2, tipo: 'income',  monto: 2000, fecha: '2026-01-10', categoria_nombre: 'Salario', cuenta_nombre: 'Banco' },
  { id: 3, tipo: 'expense', monto: 500,  fecha: '2026-02-01', categoria_nombre: 'Transferencia', cuenta_nombre: 'Banco' },
  { id: 4, tipo: 'income',  monto: 500,  fecha: '2026-02-01', categoria_nombre: 'Transferencia', cuenta_nombre: 'Efectivo' },
  { id: 5, tipo: 'expense', monto: 300,  fecha: '2026-03-15', categoria_nombre: 'Comida', cuenta_nombre: 'Banco' },
]

// Mismos movimientos, esquema viejo (mock: type/amount/date/cat/method)
const movsMock = movs.map(m => ({
  id: m.id, type: m.tipo, amount: m.monto, date: m.fecha, cat: m.categoria_nombre, method: m.cuenta_nombre,
}))

describe('filtrarMovimientos', () => {
  it('sin filtros devuelve todo tal cual', () => {
    expect(filtrarMovimientos(movs, {})).toHaveLength(5)
    expect(filtrarMovimientos(movs)).toHaveLength(5)
  })

  it('filtra por categoría (case-insensitive, exact match)', () => {
    const r = filtrarMovimientos(movs, { categoria: 'comida' })
    expect(r.map(m => m.id)).toEqual([1, 5])
  })

  it('filtra por cuenta', () => {
    const r = filtrarMovimientos(movs, { cuenta: 'Banco' })
    expect(r.map(m => m.id)).toEqual([2, 3, 5])
  })

  it('filtra por tipo income/expense EXCLUYENDO transferencias, aunque su campo tipo coincida', () => {
    // id 4 es income pero categoría Transferencia -> no debe aparecer en el filtro "income"
    const income = filtrarMovimientos(movs, { tipo: 'income' })
    expect(income.map(m => m.id)).toEqual([2])
    // id 3 es expense pero categoría Transferencia -> no debe aparecer en el filtro "expense"
    const expense = filtrarMovimientos(movs, { tipo: 'expense' })
    expect(expense.map(m => m.id)).toEqual([1, 5])
  })

  it('filtro tipo "transferencia" trae solo los marcados isTransferencia, sin importar income/expense', () => {
    const r = filtrarMovimientos(movs, { tipo: 'transferencia' })
    expect(r.map(m => m.id).sort()).toEqual([3, 4])
  })

  it('filtra por rango de fechas inclusivo', () => {
    const r = filtrarMovimientos(movs, { desde: '2026-01-06', hasta: '2026-02-28' })
    expect(r.map(m => m.id).sort()).toEqual([2, 3, 4])
  })

  it('combina varios filtros a la vez (AND)', () => {
    const r = filtrarMovimientos(movs, { categoria: 'Comida', cuenta: 'Banco' })
    expect(r.map(m => m.id)).toEqual([5])
  })

  it('funciona igual con el esquema viejo (mock: type/amount/date/cat/method)', () => {
    const r = filtrarMovimientos(movsMock, { categoria: 'comida', tipo: 'expense' })
    expect(r.map(m => m.id)).toEqual([1, 5])
  })

  it('categoría/cuenta que no matchean nada da array vacío', () => {
    expect(filtrarMovimientos(movs, { categoria: 'Inexistente' })).toEqual([])
    expect(filtrarMovimientos(movs, { cuenta: 'Inexistente' })).toEqual([])
  })

  it('lista vacía o undefined da array vacío sin tirar error', () => {
    expect(filtrarMovimientos([], { categoria: 'Comida' })).toEqual([])
    expect(filtrarMovimientos(undefined, { categoria: 'Comida' })).toEqual([])
  })
})
