import { daysInMonth, toISO } from '@/lib/dates'

export interface CalendarCell {
  iso: string
  day: number
  inMonth: boolean
}

/** Rótulos dos dias da semana (a semana começa no domingo). */
export const WEEKDAY_LABELS = [
  { short: 'D', long: 'domingo' },
  { short: 'S', long: 'segunda-feira' },
  { short: 'T', long: 'terça-feira' },
  { short: 'Q', long: 'quarta-feira' },
  { short: 'Q', long: 'quinta-feira' },
  { short: 'S', long: 'sexta-feira' },
  { short: 'S', long: 'sábado' },
] as const

/**
 * Monta as semanas de um mês (month de 1 a 12). Cada semana tem 7 células;
 * dias de meses vizinhos aparecem com inMonth = false.
 */
export function buildMonthGrid(year: number, month: number): CalendarCell[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const total = daysInMonth(year, month)
  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  const prevTotal = daysInMonth(prevMonth.year, prevMonth.month)

  const cells: CalendarCell[] = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevTotal - i
    cells.push({ iso: toISO(prevMonth.year, prevMonth.month, day), day, inMonth: false })
  }
  for (let day = 1; day <= total; day++) {
    cells.push({ iso: toISO(year, month, day), day, inMonth: true })
  }
  let nextDay = 1
  while (cells.length % 7 !== 0) {
    cells.push({ iso: toISO(nextMonth.year, nextMonth.month, nextDay), day: nextDay, inMonth: false })
    nextDay++
  }

  const weeks: CalendarCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
