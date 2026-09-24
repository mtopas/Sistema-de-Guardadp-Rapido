import { describe, it, expect } from 'vitest';
import { isTransferencia, movimientoAsignadoACajon, contribucionCategoria, contribucionFire, acumuladoPorCategoriaNombre, saldoFondoEmergencia, NOMBRE_FONDO_EMERGENCIA } from './finanzas.js';

describe('Finanzas', () => {
  it('should correctly identify transferencia movements', () => {
    expect(isTransferencia({ cat: 'transferencia' })).toBe(true);
    expect(isTransferencia({ categoria_nombre: 'Transferencia' })).toBe(true);
    expect(isTransferencia({ cat: '  transferencia  ' })).toBe(true);
    expect(isTransferencia({ categoria_nombre: '  transferencia  ' })).toBe(true);
    expect(isTransferencia({ cat: 'otra categoria' })).toBe(false);
    expect(isTransferencia({ categoria_nombre: 'otra categoria' })).toBe(false);
  });

  it('should correctly match movements to a drawer by category or description', () => {
    expect(movimientoAsignadoACajon({ categoria_nombre: 'FIRE' }, 'FIRE')).toBe(true);
    expect(movimientoAsignadoACajon({ cat: 'FIRE' }, 'FIRE')).toBe(true);
    expect(movimientoAsignadoACajon({ categoria_nombre: 'FIRE' }, 'fire')).toBe(true);
    expect(movimientoAsignadoACajon({ cat: 'FIRE' }, 'fire')).toBe(true);
    expect(movimientoAsignadoACajon({ categoria_nombre: 'FIRE' }, 'otra categoria')).toBe(false);
    expect(movimientoAsignadoACajon({ cat: 'FIRE' }, 'otra categoria')).toBe(false);
    expect(movimientoAsignadoACajon({ categoria_nombre: 'otra categoria' }, 'FIRE')).toBe(false);
    expect(movimientoAsignadoACajon({ cat: 'otra categoria' }, 'FIRE')).toBe(false);
    // El matcher es genérico: matchea CUALQUIER nombre de cajón, no solo "FIRE".
    expect(movimientoAsignadoACajon({ categoria_nombre: 'otra categoria' }, 'otra categoria')).toBe(true);
    expect(movimientoAsignadoACajon({ cat: 'otra categoria' }, 'otra categoria')).toBe(true);
    expect(movimientoAsignadoACajon({ categoria_nombre: 'otra categoria' }, 'otro cajon distinto')).toBe(false);
  });

  it('should correctly calculate contribution by category', () => {
    expect(contribucionCategoria({ tipo: 'income', monto: 100 })).toBe(-100);
    expect(contribucionCategoria({ tipo: 'expense', monto: 100 })).toBe(100);
    expect(contribucionCategoria({ tipo: 'income', amount: -100 })).toBe(-100);
    expect(contribucionCategoria({ tipo: 'expense', amount: -100 })).toBe(100);
  });

  it('should correctly calculate contribution for FIRE category', () => {
    expect(contribucionFire({ categoria_nombre: 'FIRE', tipo: 'income', monto: 100 })).toBe(-100);
    expect(contribucionFire({ categoria_nombre: 'FIRE', tipo: 'expense', monto: 100 })).toBe(100);
    expect(contribucionFire({ categoria_nombre: 'FIRE', tipo: 'income', amount: -100 })).toBe(-100);
    expect(contribucionFire({ categoria_nombre: 'FIRE', tipo: 'expense', amount: -100 })).toBe(100);
    expect(contribucionFire({ categoria_nombre: 'otra categoria', tipo: 'income', monto: 100 })).toBe(0);
    expect(contribucionFire({ categoria_nombre: 'otra categoria', tipo: 'expense', monto: 100 })).toBe(0);
    // Descripción "FIRE" con categoría distinta también cuenta (mismo matcher que categoría).
    expect(contribucionFire({ categoria_nombre: 'otra categoria', descripcion: 'FIRE', tipo: 'income', monto: 100 })).toBe(-100);
    expect(contribucionFire({ categoria_nombre: 'otra categoria', descripcion: 'fire', tipo: 'expense', monto: 100 })).toBe(100);
  });

  it('should correctly accumulate contribution by category name', () => {
    expect(acumuladoPorCategoriaNombre([], 'FIRE')).toBe(0);
    expect(acumuladoPorCategoriaNombre([{ categoria_nombre: 'FIRE', tipo: 'income', monto: 100 }], 'FIRE')).toBe(-100);
    expect(acumuladoPorCategoriaNombre([{ categoria_nombre: 'FIRE', tipo: 'expense', monto: 100 }], 'FIRE')).toBe(100);
    // Solo suma el movimiento asignado a "FIRE" — el de "otra categoria" queda excluido.
    expect(acumuladoPorCategoriaNombre([{ categoria_nombre: 'FIRE', tipo: 'income', monto: 100 }, { categoria_nombre: 'otra categoria', tipo: 'expense', monto: 50 }], 'FIRE')).toBe(-100);
    expect(acumuladoPorCategoriaNombre([{ categoria_nombre: 'FIRE', tipo: 'income', monto: 100 }, { categoria_nombre: 'otra categoria', tipo: 'expense', monto: 50 }], '')).toBe(0);
    expect(acumuladoPorCategoriaNombre([{ categoria_nombre: 'FIRE', tipo: 'income', monto: 100 }, { categoria_nombre: 'otra categoria', tipo: 'expense', monto: 50 }], undefined)).toBe(0);
  });

  it('should calculate the emergency fund balance client-side (replaces deprecated GET /fin/emergencia)', () => {
    // Reemplazo del endpoint deprecated (Finanzas-Roadmap.md): mismo cálculo que cualquier
    // otro cajón por categoría/descripción homónima, aplicado al objetivo seed "Fondo de emergencia".
    expect(saldoFondoEmergencia([])).toBe(0);
    expect(saldoFondoEmergencia(undefined)).toBe(0);

    const movs = [
      { categoria_nombre: NOMBRE_FONDO_EMERGENCIA, tipo: 'expense', monto: 1000 },
      { categoria_nombre: NOMBRE_FONDO_EMERGENCIA, tipo: 'income', monto: 200 },
      { categoria_nombre: 'otra categoria', tipo: 'expense', monto: 5000 },
    ];
    // 1000 (gasto suma) - 200 (ingreso resta) = 800; el movimiento de "otra categoria" no suma.
    expect(saldoFondoEmergencia(movs)).toBe(800);

    // Matchea por descripción también (mismo patrón que FIRE/objetivos), case-insensitive.
    expect(saldoFondoEmergencia([
      { categoria_nombre: 'otra categoria', descripcion: 'fondo de emergencia', tipo: 'expense', monto: 300 },
    ])).toBe(300);

    // Formato legado (cat/amount/type) también funciona vía los normalizadores existentes.
    expect(saldoFondoEmergencia([
      { cat: NOMBRE_FONDO_EMERGENCIA, type: 'expense', amount: 150 },
    ])).toBe(150);
  });
});