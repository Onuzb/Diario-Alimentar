import { describe, expect, it } from 'vitest'
import { buildMonthGrid } from '@/lib/calendar'

describe('buildMonthGrid', () => {
  it('novembro de 2026 começa no domingo e tem 5 semanas', () => {
    const weeks = buildMonthGrid(2026, 11)
    expect(weeks).toHaveLength(5)
    expect(weeks[0]?.[0]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true })
    expect(weeks[4]?.[1]).toEqual({ iso: '2026-11-30', day: 30, inMonth: true })
    expect(weeks[4]?.[2]).toEqual({ iso: '2026-12-01', day: 1, inMonth: false })
  })

  it('completa o começo com dias do mês anterior', () => {
    // 1º de outubro de 2026 é uma quinta-feira
    const weeks = buildMonthGrid(2026, 10)
    expect(weeks[0]?.slice(0, 4).map((c) => c.iso)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ])
    expect(weeks[0]?.[4]).toEqual({ iso: '2026-10-01', day: 1, inMonth: true })
  })

  it('toda semana tem 7 dias, inclusive na virada do ano', () => {
    for (const [y, m] of [
      [2026, 1],
      [2026, 2],
      [2026, 12],
      [2024, 2],
    ] as const) {
      const weeks = buildMonthGrid(y, m)
      expect(weeks.every((w) => w.length === 7)).toBe(true)
    }
    expect(buildMonthGrid(2026, 12).at(-1)?.at(-1)?.iso.startsWith('2027-01')).toBe(true)
  })

  it('fevereiro de 2026 cabe em 4 semanas', () => {
    expect(buildMonthGrid(2026, 2)).toHaveLength(4)
  })
})
