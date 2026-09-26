import { describe, expect, it } from 'vitest'
import {
  acumuladoPorCategoriaNombreEnMoneda,
  ahorradoFireUSDEnMes,
  ahorroFireRealOOverride,
  montoEnMoneda,
  sumarMesesFecha,
} from './finanzas.js'
import { parseFinCsv } from './finCsv.js'

describe('Importes reales de Finanzas', () => {
  const usdFire = { fecha: '2026-09-15', tipo: 'expense', monto: -100, moneda: 'USD', categoria_nombre: 'FIRE' }
  const arsFire = { fecha: '2026-09-16', tipo: 'expense', monto: -120000, moneda: 'ARS', categoria_nombre: 'FIRE' }

  it('FIRE mezcla aportes ARS/USD una sola vez: antes 100,08 USD; ahora 200 USD', () => {
    expect(ahorradoFireUSDEnMes([usdFire, arsFire], {}, '2026-09', 1200)).toBe(200)
  })

  it('override ya expresado en USD: antes 0,17 USD; ahora 200 USD', () => {
    expect(ahorradoFireUSDEnMes([], { '2026-09': 200 }, '2026-09', 1200)).toBe(200)
  })

  it('objetivo y reparto convierten USD a ARS: antes 10.100 ARS; ahora 130.000 ARS', () => {
    const ars = { ...arsFire, monto: -10000, categoria_nombre: 'Viaje' }
    const usd = { ...usdFire, categoria_nombre: 'Viaje' }
    expect(montoEnMoneda(usd, 'ARS', 1200)).toBe(120000)
    expect(acumuladoPorCategoriaNombreEnMoneda([ars, usd], 'Viaje', 'ARS', 1200)).toBe(130000)
    expect(acumuladoPorCategoriaNombreEnMoneda([ars, usd], 'Viaje', 'USD', 1200)).toBeCloseTo(108.333333, 5)
  })

  it('retiro neto FIRE no se tapa con override: antes +50 USD; ahora -100 USD', () => {
    expect(ahorroFireRealOOverride(-100, 50)).toBe(-100)
    expect(ahorradoFireUSDEnMes([{ ...usdFire, tipo: 'income', monto: 100 }], { '2026-09': 50 }, '2026-09', 1200)).toBe(-100)
  })

  it('cuotas del día 31 terminan en el último día del mes siguiente', () => {
    const end = sumarMesesFecha('2026-01-31', 1)
    expect([end.getFullYear(), end.getMonth() + 1, end.getDate()]).toEqual([2026, 2, 28])
  })

  it('importa el CSV exportado con descripción entre comillas y categoría', () => {
    const rows = parseFinCsv('fecha,tipo,monto,moneda,descripcion,categoria,cuenta,cuotas,nota\r\n2026-09-01,expense,-100,USD,"Compra, exterior",Viaje,Banco,,"nota"\r\n')
    expect(rows).toEqual([{ fecha: '2026-09-01', tipo: 'expense', monto: -100, descripcion: 'Compra, exterior', moneda: 'USD', categoria_nombre: 'Viaje', cuenta_nombre: 'Banco', cuotas: null, nota: 'nota' }])
  })
})
