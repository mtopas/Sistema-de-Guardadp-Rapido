import { describe, it, expect } from 'vitest';
import {
  fmtARS,
  fmtUSD,
  fmtARSShort,
  fmtCantidad,
  fmtDolarQuote,
  contribucionFireUSD,
  mesesCalendarioHasta,
  cuotaMensualObjetivo,
} from './finanzas.js';

describe('Formateo de moneda y cantidades', () => {
  describe('fmtARS', () => {
    it('should format positive ARS amounts', () => {
      expect(fmtARS(100)).toBe('$100,00');
      expect(fmtARS(1000)).toBe('$1.000,00');
      expect(fmtARS(1000.5)).toBe('$1.000,50');
      expect(fmtARS(0)).toBe('$0,00');
    });

    it('should format negative ARS amounts with unicode minus sign', () => {
      expect(fmtARS(-100)).toBe('−$100,00');
      expect(fmtARS(-1000.5)).toBe('−$1.000,50');
      // El signo es U+2212, no un guion normal
      expect(fmtARS(-100)).toBe('−$100,00');
    });

    it('should handle invalid inputs and return fallback', () => {
      expect(fmtARS(null)).toBe('$0,00');
      expect(fmtARS(undefined)).toBe('$0,00');
      expect(fmtARS(NaN)).toBe('$0,00');
      expect(fmtARS('invalid')).toBe('$0,00');
      expect(fmtARS(Infinity)).toBe('$0,00');
      expect(fmtARS(-Infinity)).toBe('$0,00');
    });
  });

  describe('fmtUSD', () => {
    it('should format positive USD amounts', () => {
      expect(fmtUSD(100)).toBe('US$ 100,00');
      expect(fmtUSD(1000)).toBe('US$ 1.000,00');
      expect(fmtUSD(1000.5)).toBe('US$ 1.000,50');
    });

    it('should format negative USD amounts with unicode minus sign', () => {
      expect(fmtUSD(-100)).toBe('−US$ 100,00');
      expect(fmtUSD(-1000.5)).toBe('−US$ 1.000,50');
    });

    it('should handle invalid inputs and return fallback', () => {
      expect(fmtUSD(null)).toBe('US$ 0,00');
      expect(fmtUSD(undefined)).toBe('US$ 0,00');
      expect(fmtUSD(NaN)).toBe('US$ 0,00');
    });
  });

  describe('fmtARSShort', () => {
    it('should format below 1000 as regular ARS', () => {
      expect(fmtARSShort(100)).toBe('$100,00');
      expect(fmtARSShort(999)).toBe('$999,00');
      expect(fmtARSShort(999.99)).toBe('$999,99');
    });

    it('should format at exact 1000 boundary as K', () => {
      expect(fmtARSShort(1000)).toBe('$1,00K');
      expect(fmtARSShort(1000.5)).toBe('$1,00K');
    });

    it('should format between 1000 and 1_000_000 as K', () => {
      expect(fmtARSShort(5000)).toBe('$5,00K');
      // Justo debajo del umbral de redondeo
      expect(fmtARSShort(999_950)).toBe('$999,95K');
    });

    it('should switch to M when the K-rounded value would display as 1000 (fix 2026-09-24)', () => {
      // 999_999 / 1000 = 999.999 → redondeaba a "1.000,00K" (parecía 1M sin
      // serlo) -- ahora se muestra en M directamente. Ver Cerebro/estado-actual.md.
      expect(fmtARSShort(999_999)).toBe('$1,00M');
      expect(fmtARSShort(999_999.99)).toBe('$1,00M');
    });

    it('should format at exact 1_000_000 boundary as M', () => {
      expect(fmtARSShort(1_000_000)).toBe('$1,00M');
      expect(fmtARSShort(1_000_000.5)).toBe('$1,00M');
    });

    it('should format above 1_000_000 as M', () => {
      expect(fmtARSShort(5_000_000)).toBe('$5,00M');
      expect(fmtARSShort(10_000_000.99)).toBe('$10,00M');
    });

    it('should handle negative amounts with unicode minus sign', () => {
      expect(fmtARSShort(-1000)).toBe('−$1,00K');
      expect(fmtARSShort(-1_000_000)).toBe('−$1,00M');
    });

    it('should handle null/undefined by converting to 0', () => {
      expect(fmtARSShort(null)).toBe('$0,00');
      expect(fmtARSShort(undefined)).toBe('$0,00');
      expect(fmtARSShort(NaN)).toBe('$0,00');
    });
  });

  describe('fmtCantidad', () => {
    it('should format positive quantities', () => {
      expect(fmtCantidad(100)).toBe('100,00');
      expect(fmtCantidad(1000)).toBe('1.000,00');
      expect(fmtCantidad(0.5)).toBe('0,50');
    });

    it('should format negative quantities', () => {
      expect(fmtCantidad(-100)).toBe('-100,00');
      expect(fmtCantidad(-1000)).toBe('-1.000,00');
    });

    it('should handle invalid inputs and return fallback', () => {
      expect(fmtCantidad(null)).toBe('0,00');
      expect(fmtCantidad(undefined)).toBe('0,00');
      expect(fmtCantidad(NaN)).toBe('0,00');
      expect(fmtCantidad(Infinity)).toBe('0,00');
    });
  });

  describe('fmtDolarQuote', () => {
    it('should format dolar quotes with $ prefix', () => {
      expect(fmtDolarQuote(1000)).toBe('$1.000,00');
      expect(fmtDolarQuote(1000.5)).toBe('$1.000,50');
      expect(fmtDolarQuote(999.99)).toBe('$999,99');
    });

    it('should return em-dash for invalid inputs', () => {
      expect(fmtDolarQuote(null)).toBe('—');
      expect(fmtDolarQuote(undefined)).toBe('—');
      expect(fmtDolarQuote(NaN)).toBe('—');
      expect(fmtDolarQuote('invalid')).toBe('—');
      expect(fmtDolarQuote(Infinity)).toBe('—');
    });

    it('should handle zero as valid input', () => {
      expect(fmtDolarQuote(0)).toBe('$0,00');
    });
  });
});

describe('Contribuciones y fechas', () => {
  describe('contribucionFireUSD', () => {
    it('should return 0 for non-FIRE movements', () => {
      expect(contribucionFireUSD({ categoria_nombre: 'otra', tipo: 'expense', monto: 100 }, 1000)).toBe(0);
      expect(contribucionFireUSD({ categoria_nombre: 'otra', tipo: 'income', monto: 100 }, 1000)).toBe(0);
    });

    it('should handle FIRE movement in USD (no division)', () => {
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 100, moneda: 'USD' }, 1000)).toBe(100);
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'income', monto: 100, moneda: 'USD' }, 1000)).toBe(-100);
    });

    it('should handle FIRE movement in ARS (divide by dolar)', () => {
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 1000, moneda: 'ARS' }, 1000)).toBe(1);
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'income', monto: 1000, moneda: 'ARS' }, 1000)).toBe(-1);
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 500, moneda: 'ARS' }, 1000)).toBe(0.5);
    });

    it('should use 1 as divisor when dolar is 0, null, or undefined', () => {
      // dolar = 0 → divide por 1
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 1000 }, 0)).toBe(1000);
      // dolar = null → divide por 1
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 1000 }, null)).toBe(1000);
      // dolar = undefined → divide por 1
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 1000 }, undefined)).toBe(1000);
    });

    it('should use abs(monto) internally, respecting sign from tipo', () => {
      // Monto negativo en expense = suma positiva
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: -100, moneda: 'USD' }, 1000)).toBe(100);
      // Monto negativo en income = suma negativa
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'income', monto: -100, moneda: 'USD' }, 1000)).toBe(-100);
    });

    it('should default moneda to ARS if not specified', () => {
      expect(contribucionFireUSD({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 1000 }, 1000)).toBe(1);
    });

    it('should match FIRE by description if categoria_nombre is diferent', () => {
      expect(contribucionFireUSD({ categoria_nombre: 'otra', descripcion: 'FIRE', tipo: 'expense', monto: 100, moneda: 'USD' }, 1000)).toBe(100);
    });
  });

  describe('mesesCalendarioHasta', () => {
    it('should return null for invalid fechaLimite', () => {
      expect(mesesCalendarioHasta(null)).toBe(null);
      expect(mesesCalendarioHasta(undefined)).toBe(null);
      expect(mesesCalendarioHasta('')).toBe(null);
      expect(mesesCalendarioHasta('invalid')).toBe(null);
      expect(mesesCalendarioHasta('2026')).toBe(null);
      expect(mesesCalendarioHasta('2026-13')).toBeGreaterThan(0); // 13 es mes inválido pero el formato parsea
    });

    it('should calculate months inclusively (ej: enero -> diciembre = 12, not 11)', () => {
      const refDate = new Date('2026-01-15');
      expect(mesesCalendarioHasta('2026-01', refDate)).toBe(1); // mismo mes
      expect(mesesCalendarioHasta('2026-12', refDate)).toBe(12); // enero hasta diciembre = 12 meses
    });

    it('should handle fechaLimite in the past (returns null)', () => {
      const refDate = new Date('2026-12-15');
      expect(mesesCalendarioHasta('2026-01', refDate)).toBe(null); // enero está en el pasado
      expect(mesesCalendarioHasta('2025-12', refDate)).toBe(null);
    });

    it('should handle multi-year ranges correctly', () => {
      const refDate = new Date('2026-01-15');
      expect(mesesCalendarioHasta('2027-01', refDate)).toBe(13); // enero 2026 a enero 2027 = 13 meses
      expect(mesesCalendarioHasta('2028-06', refDate)).toBe(30); // enero 2026 a junio 2028 = 30 meses
    });

    it('should use current date by default (refDate)', () => {
      // Sin refDate, usa new Date() — no fijo en test, así que solo verificamos que no crash
      const result = mesesCalendarioHasta('2030-12');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should parse YYYY-MM prefix correctly (ignoring rest)', () => {
      const refDate = new Date('2026-01-15');
      expect(mesesCalendarioHasta('2026-06-15', refDate)).toBe(6);
      expect(mesesCalendarioHasta('2026-06T00:00:00Z', refDate)).toBe(6);
    });
  });

  describe('cuotaMensualObjetivo', () => {
    it('should return null if no fecha_limite or invalid', () => {
      expect(cuotaMensualObjetivo({}, 0)).toBe(null);
      expect(cuotaMensualObjetivo({ meta: 1000 }, 0)).toBe(null);
      expect(cuotaMensualObjetivo({ fecha_limite: 'invalid', meta: 1000 }, 0)).toBe(null);
    });

    it('should calculate monthly quota as falta / meses', () => {
      const refDate = new Date('2026-01-15');
      const obj = { fecha_limite: '2026-12', meta: 1200 };
      // enero a diciembre = 12 meses, meta 1200, acumulado 0 → falta 1200 → 1200/12 = 100
      expect(cuotaMensualObjetivo(obj, 0, refDate)).toBe(100);
    });

    it('should account for accumulated amount', () => {
      const refDate = new Date('2026-01-15');
      const obj = { fecha_limite: '2026-12', meta: 1200 };
      // meta 1200, acumulado 400 → falta 800 → 800/12 = 66.67
      expect(cuotaMensualObjetivo(obj, 400, refDate)).toBeCloseTo(66.67, 1);
    });

    it('should return 0 if already at meta', () => {
      const refDate = new Date('2026-01-15');
      const obj = { fecha_limite: '2026-12', meta: 1200 };
      // acumulado >= meta → falta = max(0, ...) = 0 → 0/12 = 0
      expect(cuotaMensualObjetivo(obj, 1200, refDate)).toBe(0);
      expect(cuotaMensualObjetivo(obj, 2000, refDate)).toBe(0);
    });

    it('should handle default acumulado = 0', () => {
      const refDate = new Date('2026-01-15');
      const obj = { fecha_limite: '2026-12', meta: 1200 };
      expect(cuotaMensualObjetivo(obj, undefined, refDate)).toBe(100);
    });

    it('should use current date by default if no refDate', () => {
      // Future date → should work
      const obj = { fecha_limite: '2030-12', meta: 1200 };
      const result = cuotaMensualObjetivo(obj, 0);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should handle obj.meta as string (coerced to number)', () => {
      const refDate = new Date('2026-01-15');
      const obj = { fecha_limite: '2026-12', meta: '1200' };
      expect(cuotaMensualObjetivo(obj, 0, refDate)).toBe(100);
    });

    it('should handle null/undefined meta as 0', () => {
      const refDate = new Date('2026-01-15');
      const obj = { fecha_limite: '2026-12', meta: null };
      // meta = 0, acumulado = 0 → falta = 0 → 0/12 = 0
      expect(cuotaMensualObjetivo(obj, 0, refDate)).toBe(0);
    });
  });
});
