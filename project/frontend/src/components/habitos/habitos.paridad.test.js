// Tests de paridad de hábitos -- lado frontend (habitosUtils.js).
//
// Consume ../../../../tests/fixtures/habitos_paridad.json, el mismo fixture que usan
// project/tests/test_habitos_paridad.py (backend) y
// project/tests/test_bot_habitos_paridad.py (bot), para confirmar que
// isScheduled()/calcStreak()/calcMaxStreak()/calcMonthPct() devuelven lo mismo que
// _habito_is_scheduled()/habitos_stats() (backend) y _is_scheduled()/_calc_racha() (bot)
// ante los mismos datos.
//
// "today" se congela a 2026-09-23T12:00:00 -- mismo patrón y misma fecha que ya usa
// habitos.test.js (vi.setSystemTime), y el mismo valor de FIXTURES.today que usan los
// otros dos lados, para que los tres calculen sobre el mismo "hoy".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isScheduled, calcStreak, calcMaxStreak, calcMonthPct } from './habitosUtils.js'
import FIXTURES from '../../../../tests/fixtures/habitos_paridad.json'

describe('habitos paridad (frontend vs backend vs bot)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${FIXTURES.today}T12:00:00`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('isScheduled', () => {
    FIXTURES.schedule_cases.forEach(c => {
      const expected = c.expected_frontend_bot ?? c.expected
      it(`${c.name}: coincide con el fixture compartido`, () => {
        Object.entries(expected).forEach(([fecha, esperado]) => {
          const [y, m, d] = fecha.split('-').map(Number)
          const date = new Date(y, m - 1, d)
          expect(isScheduled(c.habito, date)).toBe(esperado)
        })
      })
    })

    it('diario_inactivo: las tres implementaciones respetan "activo"', () => {
      const c = FIXTURES.schedule_cases.find(x => x.name === 'diario_inactivo')
      Object.values(c.expected).forEach(v => expect(v).toBe(false))
    })
  })

  describe('calcStreak (racha_actual)', () => {
    FIXTURES.streak_cases
      .forEach(c => {
        it(`${c.name}: coincide con backend y bot`, () => {
          const habito = { ...c.habito, id: 1 }
          const registrosMap = buildRegistrosMap(1, c.registros)
          expect(calcStreak(habito, registrosMap)).toBe(c.expected.racha_actual)
        })
      })

  })

  describe('calcMaxStreak (racha_max, solo frontend/backend -- el bot no la calcula)', () => {
    FIXTURES.streak_cases
      .filter(c => c.expected && 'racha_max' in c.expected)
      .forEach(c => {
        it(`${c.name}: coincide con backend`, () => {
          const habito = { ...c.habito, id: 1 }
          const registrosMap = buildRegistrosMap(1, c.registros)
          expect(calcMaxStreak(habito, registrosMap)).toBe(c.expected.racha_max)
        })
      })
  })

  describe('calcMonthPct (pct_mes, solo frontend/backend -- el bot no la calcula)', () => {
    FIXTURES.month_pct_cases.forEach(c => {
      it(`${c.name}: coincide con backend`, () => {
        const habito = { ...c.habito, id: 1 }
        const registrosMap = buildRegistrosMap(1, c.registros)
        expect(calcMonthPct(habito, registrosMap, c.year, c.month - 1)).toBe(c.expected_pct_mes)
      })
    })
  })

  describe('hábito inactivo -- racha_actual/racha_max/pct_mes en 0', () => {
    const fixture = FIXTURES.inactive_habit_ignored_by_backend

    it('calcStreak/calcMaxStreak/calcMonthPct dan 0 porque isScheduled respeta "activo"', () => {
      const habito = { ...fixture.habito, id: 1 }
      const registrosMap = buildRegistrosMap(1, fixture.registros)

      expect(calcStreak(habito, registrosMap)).toBe(fixture.expected.racha_actual)
      expect(calcMaxStreak(habito, registrosMap)).toBe(fixture.expected.racha_max)
      expect(calcMonthPct(habito, registrosMap, 2026, 8)).toBe(fixture.expected.pct_mes)
    })
  })
})

function buildRegistrosMap(habitoId, registros) {
  const map = {}
  for (const r of registros) {
    map[`${habitoId}-${r.fecha}`] = r
  }
  return map
}
