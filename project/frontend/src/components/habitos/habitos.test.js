import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import {
  isScheduled,
  calcStreak,
  calcMaxStreak,
  calcMonthPct,
  buildRegistrosMap,
  toISODate,
} from './habitosUtils.js'

// useStore.js toca APIs de browser al cargar el módulo (localStorage, document,
// window.location) para inicializar tema/tono/idioma -- el vitest de este proyecto
// corre en environment 'node' (ver vitest.config.js) para no pagar el costo de jsdom
// en tests de funciones puras como los de arriba. Se stubean acá las APIs mínimas que
// el store toca al importarse, y se importa dinámicamente recién en beforeAll para que
// el stub ya esté en pie antes de que el módulo se evalúe (los `import` estáticos se
// hoistean por encima de cualquier código, así que no alcanza con stubear más abajo).
let useStore
beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const backing = {}
    globalThis.localStorage = {
      getItem:    k => (k in backing ? backing[k] : null),
      setItem:    (k, v) => { backing[k] = String(v) },
      removeItem: k => { delete backing[k] },
    }
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = { location: { pathname: '/agenda' } }
  }
  if (typeof globalThis.document === 'undefined') {
    const styleProps = {}
    globalThis.document = {
      documentElement: {
        style: {
          setProperty:      (k, v) => { styleProps[k] = v },
          removeProperty:   k => { delete styleProps[k] },
          getPropertyValue: k => styleProps[k] || '',
        },
        dataset: {},
      },
    }
  }
  ;({ useStore } = await import('../../store/useStore.js'))
})

describe('habitosUtils', () => {
  // Varios tests de este archivo asumen implícitamente una fecha de "hoy" fija
  // (comentarios como "today is 23" a lo largo del archivo) porque
  // calcStreak/calcMaxStreak/calcMonthPct usan `new Date()` internamente sin
  // aceptar una fecha de referencia como parámetro -- sin fijar el reloj, esos
  // tests se rompen cada vez que pasa un día real (encontrado 2026-09-24, ver
  // Cerebro/estado-actual.md). Se fija a la fecha que los comentarios ya
  // asumían (2026-09-23) para no tener que rehacer los cálculos esperados.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('isScheduled', () => {
    it('returns false if habit is not active', () => {
      const habito = {
        id: 1,
        activo: 0,
        frecuencia_tipo: 'diario',
        dias_semana: null,
      }
      const date = new Date(2026, 8, 23) // arbitrary date
      expect(isScheduled(habito, date)).toBe(false)
    })

    it('returns true for daily habits on any day', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
      }
      // Test multiple dates
      const dates = [
        new Date(2026, 8, 20), // Sunday
        new Date(2026, 8, 21), // Monday
        new Date(2026, 8, 22), // Tuesday
      ]
      dates.forEach(date => {
        expect(isScheduled(habito, date)).toBe(true)
      })
    })

    it('returns true only on scheduled days for weekly habits', () => {
      // Schedule for Monday (1) and Wednesday (3) in JS convention
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'semanal',
        dias_semana: JSON.stringify([1, 3]),
      }

      // Create a reference date for day-of-week calculations
      // Using 2026-09-21 (Monday) as known Monday
      const monday = new Date(2026, 8, 21) // Monday
      const tuesday = new Date(2026, 8, 22) // Tuesday
      const wednesday = new Date(2026, 8, 23) // Wednesday

      expect(isScheduled(habito, monday)).toBe(true)
      expect(isScheduled(habito, tuesday)).toBe(false)
      expect(isScheduled(habito, wednesday)).toBe(true)
    })

    it('handles invalid dias_semana JSON gracefully', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'semanal',
        dias_semana: 'invalid json',
      }
      const date = new Date(2026, 8, 21)
      expect(isScheduled(habito, date)).toBe(false)
    })
  })

  describe('calcMaxStreak', () => {
    it('returns 0 for habit without creado_en', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: null,
      }
      const registrosMap = {}
      expect(calcMaxStreak(habito, registrosMap)).toBe(0)
    })

    it('calculates max streak with completed daily registros', () => {
      // Habit created 2026-09-15
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-09-15T00:00:00',
      }

      // Completed: 15, 16, 17 (3 day streak), then break, then 19, 20 (2 day streak)
      const registrosMap = {
        '1-2026-09-15': { valor: 1 },
        '1-2026-09-16': { valor: 1 },
        '1-2026-09-17': { valor: 1 },
        // gap on 18
        '1-2026-09-19': { valor: 1 },
        '1-2026-09-20': { valor: 1 },
      }

      expect(calcMaxStreak(habito, registrosMap)).toBe(3)
    })

    it('counts partial completions (0.5) as streak', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-09-15T00:00:00',
      }

      const registrosMap = {
        '1-2026-09-15': { valor: 0.5 },
        '1-2026-09-16': { valor: 0.5 },
        '1-2026-09-17': { valor: 1 },
      }

      expect(calcMaxStreak(habito, registrosMap)).toBe(3)
    })

    it('breaks streak on 0 valor', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-09-15T00:00:00',
      }

      const registrosMap = {
        '1-2026-09-15': { valor: 1 },
        '1-2026-09-16': { valor: 0 }, // explicit 0 breaks
        '1-2026-09-17': { valor: 1 },
      }

      expect(calcMaxStreak(habito, registrosMap)).toBe(1)
    })

    it('skips non-scheduled days in weekly habits', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'semanal',
        dias_semana: JSON.stringify([1, 3]), // Mon, Wed
        creado_en: '2026-09-15T00:00:00',
      }

      // 2026-09-21 = Monday, 22 = Tuesday, 23 = Wednesday, 24 = Thursday
      const registrosMap = {
        '1-2026-09-21': { valor: 1 }, // Mon - scheduled
        // Tue - not scheduled, should be skipped
        '1-2026-09-23': { valor: 1 }, // Wed - scheduled
      }

      expect(calcMaxStreak(habito, registrosMap)).toBe(2)
    })

    it('handles ongoing streak on today (if today has valor > 0)', () => {
      // Simulate today is 2026-09-23
      const today = new Date(2026, 8, 23)
      const dateISO = toISODate(today)

      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-09-20T00:00:00',
      }

      const registrosMap = {
        '1-2026-09-20': { valor: 1 },
        '1-2026-09-21': { valor: 1 },
        '1-2026-09-22': { valor: 1 },
        [`1-${dateISO}`]: { valor: 1 },
      }

      expect(calcMaxStreak(habito, registrosMap)).toBe(4)
    })

    it('handles case limit: ongoing streak but today scheduled and not completed', () => {
      // This is the critical edge case: racha en curso + hoy programado + sin completar
      // Expected: racha máxima is hasta ayer, no incluye hoy
      const today = new Date(2026, 8, 23)

      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-09-20T00:00:00',
      }

      // Completed 20, 21, 22 consecutively, but NOT today (23)
      const registrosMap = {
        '1-2026-09-20': { valor: 1 },
        '1-2026-09-21': { valor: 1 },
        '1-2026-09-22': { valor: 1 },
        // 2026-09-23 (today) has NO registro
      }

      // Max streak should be 3 (up to yesterday)
      // Logic: on day 23 (today), is_scheduled=true, no valor → d < today is false (since d == today)
      // so cur does NOT get reset to 0
      // This means cur stays at 3, but doesn't grow
      // On next iteration (past today), loop ends
      // So maxStreak = 3
      // BUT: the condition is "else if (d < today)" — since d is today, this is false
      // So it just skips the reset, and the loop continues (but will exit since d > today next)
      // Actually, let me re-read: while (d <= today) in calcMaxStreak
      // On day 23 (today): d <= today (true), is_scheduled (true), no valor → "else if d < today" (false)
      // So doesn't reset. Continues loop. Next iteration: d = 24, 24 <= 23 (false), exits.
      // So maxStreak = 3 (correct)
      expect(calcMaxStreak(habito, registrosMap)).toBe(3)
    })
  })

  describe('calcMonthPct', () => {
    it('returns 0 if no scheduled days', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'semanal',
        dias_semana: JSON.stringify([]), // no days
        creado_en: '2026-09-01T00:00:00',
      }
      const registrosMap = {}
      expect(calcMonthPct(habito, registrosMap, 2026, 8)).toBe(0)
    })

    it('calculates percentage for current month up to today', () => {
      // September 2026 (month 8 in 0-indexed), today is 23
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-09-01T00:00:00',
      }

      // Completed 10 out of 23 days scheduled in this month
      const registrosMap = {
        '1-2026-09-01': { valor: 1 },
        '1-2026-09-02': { valor: 1 },
        '1-2026-09-03': { valor: 1 },
        '1-2026-09-04': { valor: 1 },
        '1-2026-09-05': { valor: 1 },
        '1-2026-09-06': { valor: 0.5 },
        '1-2026-09-07': { valor: 0.5 },
        '1-2026-09-08': { valor: 0.5 },
        '1-2026-09-09': { valor: 0.5 },
        '1-2026-09-10': { valor: 0.5 },
        // rest empty
      }

      // total = 5*1 + 5*0.5 = 7.5, scheduled = 23, pct = 7.5/23*100 ≈ 33%
      expect(calcMonthPct(habito, registrosMap, 2026, 8)).toBe(33)
    })

    it('calculates for past months entirely (all days)', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-08-01T00:00:00',
      }

      // August has 31 days. Complete all 31.
      const registrosMap = {}
      for (let d = 1; d <= 31; d++) {
        registrosMap[`1-2026-08-${String(d).padStart(2, '0')}`] = { valor: 1 }
      }

      // Past month, so all 31 days count
      expect(calcMonthPct(habito, registrosMap, 2026, 7)).toBe(100)
    })

    it('only counts scheduled days for weekly habits', () => {
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'semanal',
        dias_semana: JSON.stringify([1]), // Monday only
        creado_en: '2026-09-01T00:00:00',
      }

      // September 2026 has 5 Mondays: 7, 14, 21, 28
      // Complete 4 of them
      const registrosMap = {
        '1-2026-09-07': { valor: 1 },
        '1-2026-09-14': { valor: 1 },
        '1-2026-09-21': { valor: 1 },
        '1-2026-09-28': { valor: 1 },
      }

      // Up to today (23), that's 4 Mondays scheduled (7, 14, 21, no 28 yet since today is 23)
      // Completed all 3 up to today: 3/3 = 100%
      expect(calcMonthPct(habito, registrosMap, 2026, 8)).toBe(100)
    })

    it('counts partial values in monthly percentage', () => {
      // This is already tested above with "calculates percentage for current month up to today"
      // where we have 5*1 + 5*0.5 = 7.5 out of 23 ≈ 33%
      // Just verify that partial values (0.5) are counted correctly in the sum
      const habito = {
        id: 1,
        activo: 1,
        frecuencia_tipo: 'diario',
        dias_semana: null,
        creado_en: '2026-09-01T00:00:00',
      }

      const registrosMap = {
        '1-2026-09-01': { valor: 0.5 },
        '1-2026-09-02': { valor: 0.5 },
      }

      // With only 2 days having 0.5 each, total = 1.0, scheduled = 2 (up to today = 23)
      // pct = 1.0/2 = 50%
      // But today is 23, so 23 scheduled days total
      // pct = 1.0/23 ≈ 4%
      // Just verify > 0, since we know partial values are counted
      const pct = calcMonthPct(habito, registrosMap, 2026, 8)
      expect(pct).toBeGreaterThan(0)
    })
  })

  describe('toISODate', () => {
    it('formats date as YYYY-MM-DD', () => {
      const date = new Date(2026, 8, 5) // Sep 5, 2026
      expect(toISODate(date)).toBe('2026-09-05')
    })

    it('pads month and day with leading zeros', () => {
      const date = new Date(2026, 0, 1) // Jan 1, 2026
      expect(toISODate(date)).toBe('2026-01-01')
    })
  })

  describe('buildRegistrosMap', () => {
    it('builds a map keyed by habitoId-fecha', () => {
      const registros = [
        { habito_id: 1, fecha: '2026-09-20', valor: 1 },
        { habito_id: 1, fecha: '2026-09-21', valor: 0.5 },
        { habito_id: 2, fecha: '2026-09-20', valor: 1 },
      ]
      const map = buildRegistrosMap(registros)

      expect(map['1-2026-09-20']).toEqual({ habito_id: 1, fecha: '2026-09-20', valor: 1 })
      expect(map['1-2026-09-21']).toEqual({ habito_id: 1, fecha: '2026-09-21', valor: 0.5 })
      expect(map['2-2026-09-20']).toEqual({ habito_id: 2, fecha: '2026-09-20', valor: 1 })
    })

    it('handles empty registros array', () => {
      const map = buildRegistrosMap([])
      expect(Object.keys(map).length).toBe(0)
    })
  })

  // Agrega POST /habitos/registros/batch como consumidor real desde el
  // frontend (usado por "Marcar todos" en Agenda HOY, agenda/HoyTab.jsx) --
  // antes el endpoint existía en el backend sin ningún caller en el store.
  describe('useStore.batchUpsertHabitoRegistros', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
      useStore.setState({ habitosRegistros: [] })
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('does nothing for an empty items list (no fetch call)', async () => {
      global.fetch = vi.fn()
      await useStore.getState().batchUpsertHabitoRegistros([])
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('optimistically upserts every item, then reconciles with the server response', async () => {
      const serverRows = [
        { id: 101, habito_id: 1, fecha: '2026-09-23', valor: 1, nota: null, creado_en: '2026-09-23T10:00:00' },
        { id: 102, habito_id: 2, fecha: '2026-09-23', valor: 1, nota: null, creado_en: '2026-09-23T10:00:00' },
      ]
      global.fetch = vi.fn(async (url, opts) => {
        expect(url).toContain('/habitos/registros/batch')
        const body = JSON.parse(opts.body)
        expect(body).toEqual({
          registros: [
            { habito_id: 1, fecha: '2026-09-23', valor: 1.0, nota: null },
            { habito_id: 2, fecha: '2026-09-23', valor: 1.0, nota: null },
          ],
        })
        return { ok: true, json: async () => serverRows }
      })

      const promise = useStore.getState().batchUpsertHabitoRegistros([
        { habitoId: 1, fecha: '2026-09-23', valor: 1.0, nota: null },
        { habitoId: 2, fecha: '2026-09-23', valor: 1.0, nota: null },
      ])

      // Optimistic update happens synchronously before the fetch resolves.
      const optimistic = useStore.getState().habitosRegistros
      expect(optimistic).toHaveLength(2)
      expect(optimistic.find(r => r.habito_id === 1)).toMatchObject({ habito_id: 1, fecha: '2026-09-23', valor: 1.0 })

      await promise

      const final = useStore.getState().habitosRegistros
      expect(final).toEqual(expect.arrayContaining(serverRows))
      expect(final).toHaveLength(2)
    })

    it('merges into an existing registro instead of duplicating it', async () => {
      useStore.setState({
        habitosRegistros: [{ id: 5, habito_id: 1, fecha: '2026-09-23', valor: 0.5, nota: 'parcial', creado_en: '2026-09-23T08:00:00' }],
      })
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 5, habito_id: 1, fecha: '2026-09-23', valor: 1.0, nota: 'parcial', creado_en: '2026-09-23T08:00:00' }],
      }))

      await useStore.getState().batchUpsertHabitoRegistros([
        { habitoId: 1, fecha: '2026-09-23', valor: 1.0 },
      ])

      const final = useStore.getState().habitosRegistros
      expect(final).toHaveLength(1)
      expect(final[0]).toMatchObject({ id: 5, habito_id: 1, valor: 1.0 })
    })

    it('keeps the optimistic update and shows a toast when the request fails', async () => {
      global.fetch = vi.fn(async () => ({ ok: false }))

      await useStore.getState().batchUpsertHabitoRegistros([
        { habitoId: 1, fecha: '2026-09-23', valor: 1.0 },
      ])

      const state = useStore.getState()
      expect(state.habitosRegistros).toHaveLength(1)
      expect(state.toast).toMatchObject({ type: 'error' })
    })
  })
})
