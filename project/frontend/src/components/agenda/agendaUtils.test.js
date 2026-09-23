import { describe, it, expect } from 'vitest'
import { toLocalISODate, timeToMinutes, minutesToTop } from './agendaUtils'

describe('toLocalISODate', () => {
  it('converts a Date to local ISO string YYYY-MM-DD', () => {
    // Usar una fecha en horario "normal" (no cerca de medianoche)
    const d = new Date(2026, 8, 23, 14, 30, 0) // 23 Sept 2026, 14:30
    const result = toLocalISODate(d)
    expect(result).toBe('2026-09-23')
  })

  it('preserves date across timezone boundaries near midnight', () => {
    // Prueba crítica: una hora justo antes de la medianoche
    // Si el timezone es UTC-3 (Argentina) y usamos toISOString() sin corrección,
    // a las 23:00 local se convertiría a 02:00 UTC del día SIGUIENTE, causando off-by-one.
    const d = new Date(2026, 8, 23, 23, 0, 0) // 23:00 local
    const result = toLocalISODate(d)
    // Debe seguir siendo 2026-09-23, no 2026-09-24
    expect(result).toBe('2026-09-23')
  })

  it('handles date after midnight correctly', () => {
    // Justo después de medianoche
    const d = new Date(2026, 8, 24, 0, 30, 0) // 00:30 local del 24 Sept
    const result = toLocalISODate(d)
    expect(result).toBe('2026-09-24')
  })

  it('uses default Date.now() if no argument given', () => {
    // toLocalISODate() sin argumentos debe usar new Date()
    const result = toLocalISODate()
    // El resultado debe ser un string con formato YYYY-MM-DD
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('handles dates at start of month', () => {
    const d = new Date(2026, 8, 1, 10, 0, 0) // 1 Sept 2026
    const result = toLocalISODate(d)
    expect(result).toBe('2026-09-01')
  })

  it('handles dates at end of month', () => {
    const d = new Date(2026, 8, 30, 10, 0, 0) // 30 Sept 2026
    const result = toLocalISODate(d)
    expect(result).toBe('2026-09-30')
  })

  it('handles leap year February', () => {
    const d = new Date(2024, 1, 29, 10, 0, 0) // 29 Feb 2024 (leap year)
    const result = toLocalISODate(d)
    expect(result).toBe('2024-02-29')
  })
})

describe('timeToMinutes', () => {
  it('converts "HH:MM" to minutes since midnight', () => {
    expect(timeToMinutes('08:30')).toBe(510) // 8*60 + 30
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('23:59')).toBe(1439) // 23*60 + 59
  })

  it('returns null for null input', () => {
    expect(timeToMinutes(null)).toBe(null)
  })

  it('returns null for undefined input', () => {
    expect(timeToMinutes(undefined)).toBe(null)
  })

  it('returns null for empty string', () => {
    expect(timeToMinutes('')).toBe(null)
  })

  it('handles time without minutes (e.g. "08")', () => {
    // "08".split(':') = ["08"]
    // [h, m] = ["08", undefined]
    // h*60 + (m || 0) = 8*60 + 0 = 480
    expect(timeToMinutes('08')).toBe(480)
  })

  it('handles single-digit hour', () => {
    expect(timeToMinutes('5')).toBe(300) // 5*60
  })

  it('handles "00:15"', () => {
    expect(timeToMinutes('00:15')).toBe(15)
  })

  it('handles morning times', () => {
    expect(timeToMinutes('06:00')).toBe(360) // 6*60
  })

  it('handles noon', () => {
    expect(timeToMinutes('12:00')).toBe(720) // 12*60
  })

  it('handles afternoon times', () => {
    expect(timeToMinutes('15:45')).toBe(945) // 15*60 + 45
  })
})

describe('minutesToTop', () => {
  it('calculates pixel position for a given minute offset', () => {
    // HOUR_HEIGHT = 56 px, startHour default = 6
    // minutesToTop(minutes, startHour) = ((minutes - startHour*60) / 60) * 56
    // Example: minute 360 (06:00), startHour 6 → ((360-360)/60)*56 = 0
    expect(minutesToTop(360)).toBe(0)
  })

  it('calculates correct offset for 08:00 (startHour=6)', () => {
    // 08:00 = 480 minutes
    // ((480 - 360) / 60) * 56 = (120/60)*56 = 2*56 = 112
    expect(minutesToTop(480)).toBe(112)
  })

  it('calculates correct offset for 12:00 (noon)', () => {
    // 12:00 = 720 minutes
    // ((720 - 360) / 60) * 56 = (360/60)*56 = 6*56 = 336
    expect(minutesToTop(720)).toBe(336)
  })

  it('calculates correct offset for 10:30', () => {
    // 10:30 = 630 minutes
    // ((630 - 360) / 60) * 56 = (270/60)*56 = 4.5*56 = 252
    expect(minutesToTop(630)).toBe(252)
  })

  it('allows custom startHour', () => {
    // minutesToTop(480, 8) = ((480 - 480) / 60) * 56 = 0
    expect(minutesToTop(480, 8)).toBe(0)
    // minutesToTop(540, 8) = ((540 - 480) / 60) * 56 = (60/60)*56 = 56
    expect(minutesToTop(540, 8)).toBe(56)
  })

  it('handles times before startHour (negative offset)', () => {
    // minutesToTop(300, 6) = ((300 - 360) / 60) * 56 = (-60/60)*56 = -56
    // Esto es "arriba" de la grilla, válido para casos donde los eventos comienzan antes
    expect(minutesToTop(300, 6)).toBe(-56)
  })

  it('handles late evening times', () => {
    // 22:00 = 1320 minutes
    // ((1320 - 360) / 60) * 56 = (960/60)*56 = 16*56 = 896
    expect(minutesToTop(1320)).toBe(896)
  })

  it('returns 0 for startHour time exactly', () => {
    // Hora exacta de inicio debe estar en la posición 0
    expect(minutesToTop(360, 6)).toBe(0)
  })
})
