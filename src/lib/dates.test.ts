import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  currentTime,
  daysInMonth,
  formatLongDate,
  formatMonthKey,
  formatShortDate,
  greeting,
  isISODate,
  monthBounds,
  relativeDayLabel,
  todayISO,
  trimTime,
} from '@/lib/dates'

describe('todayISO / currentTime (America/Sao_Paulo)', () => {
  it('usa o dia de São Paulo, não o de UTC', () => {
    // 02:30 UTC = 23:30 do dia anterior em São Paulo (UTC-3)
    const instant = new Date('2026-11-07T02:30:00Z')
    expect(todayISO(instant)).toBe('2026-11-06')
    expect(currentTime(instant)).toBe('23:30')
  })

  it('vira o dia às 03:00 UTC', () => {
    expect(todayISO(new Date('2026-11-07T02:59:00Z'))).toBe('2026-11-06')
    expect(todayISO(new Date('2026-11-07T03:00:00Z'))).toBe('2026-11-07')
    expect(currentTime(new Date('2026-11-07T03:00:00Z'))).toBe('00:00')
  })

  it('não gera hora 24', () => {
    expect(currentTime(new Date('2026-06-15T03:05:00Z'))).toBe('00:05')
  })
})

describe('greeting', () => {
  it('muda conforme o horário de São Paulo', () => {
    expect(greeting(new Date('2026-11-06T09:00:00Z'))).toBe('Bom dia') // 06:00
    expect(greeting(new Date('2026-11-06T15:00:00Z'))).toBe('Boa tarde') // 12:00
    expect(greeting(new Date('2026-11-06T21:00:00Z'))).toBe('Boa noite') // 18:00
    expect(greeting(new Date('2026-11-06T05:00:00Z'))).toBe('Boa noite') // 02:00
  })
})

describe('isISODate', () => {
  it('aceita datas reais e recusa inexistentes', () => {
    expect(isISODate('2026-11-06')).toBe(true)
    expect(isISODate('2024-02-29')).toBe(true)
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('06/11/2026')).toBe(false)
    expect(isISODate('')).toBe(false)
  })
})

describe('aritmética de datas', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('soma meses', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2026, month: 12 })
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths(2026, 3, -15)).toEqual({ year: 2024, month: 12 })
  })

  it('calcula limites do mês', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(monthBounds(2026, 11)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })
})

describe('formatação em português', () => {
  it('formata a data por extenso', () => {
    expect(formatLongDate('2026-11-06')).toBe('sexta-feira, 6 de novembro de 2026')
  })

  it('formata a data curta e o mês', () => {
    expect(formatShortDate('2026-11-06')).toBe('06/11/2026')
    expect(formatMonthKey('2026-11')).toBe('nov/26')
  })

  it('corta os segundos do horário', () => {
    expect(trimTime('08:30:00')).toBe('08:30')
    expect(trimTime(null)).toBe('')
    expect(trimTime('')).toBe('')
  })

  it('usa rótulos relativos', () => {
    expect(relativeDayLabel('2026-11-06', '2026-11-06')).toBe('Hoje')
    expect(relativeDayLabel('2026-11-05', '2026-11-06')).toBe('Ontem')
    expect(relativeDayLabel('2026-11-07', '2026-11-06')).toBe('Amanhã')
    expect(relativeDayLabel('2026-10-01', '2026-11-06')).toBe('01/10/2026')
  })
})
