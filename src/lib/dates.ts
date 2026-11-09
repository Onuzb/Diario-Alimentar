/**
 * Datas e horários do diário.
 *
 * O diário guarda "relógio de parede": datas como YYYY-MM-DD e horários como
 * HH:MM, sem conversão de fuso. O que muda com o fuso é só o "agora": "hoje" é
 * sempre o dia de São Paulo, mesmo que o aparelho esteja em outro fuso.
 */

export const TIME_ZONE = 'America/Sao_Paulo'

const nowFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const pad = (n: number, size = 2) => String(n).padStart(size, '0')

function partsOf(date: Date) {
  const out: Record<string, string> = {}
  for (const part of nowFormatter.formatToParts(date)) out[part.type] = part.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
  }
}

/** Data de hoje em São Paulo, como YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const p = partsOf(now)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** Hora atual em São Paulo, como HH:MM. */
export function currentTime(now: Date = new Date()): string {
  const p = partsOf(now)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

export function greeting(now: Date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const { hour } = partsOf(now)
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface DateParts {
  year: number
  month: number
  day: number
}

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

export function parseISO(value: string): DateParts {
  const m = ISO_RE.exec(value)
  if (!m) throw new Error(`Data inválida: ${value}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

export function toISO(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

function utcDate(iso: string): Date {
  const { year, month, day } = parseISO(iso)
  // meio-dia UTC evita qualquer virada de dia na formatação
  return new Date(Date.UTC(year, month - 1, day, 12))
}

export function addDays(iso: string, days: number): string {
  const d = utcDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function monthBounds(year: number, month: number): { from: string; to: string } {
  return { from: toISO(year, month, 1), to: toISO(year, month, daysInMonth(year, month)) }
}

const longFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const dayMonthFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'long' })
const weekdayDayFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const shortFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short' })

/** "sexta-feira, 6 de novembro de 2026" */
export function formatLongDate(iso: string): string {
  return longFormatter.format(utcDate(iso))
}

/** "6 de novembro" */
export function formatDayMonth(iso: string): string {
  return dayMonthFormatter.format(utcDate(iso))
}

/** "sexta-feira, 6 de novembro" */
export function formatWeekdayDayMonth(iso: string): string {
  return weekdayDayFormatter.format(utcDate(iso))
}

/** "06/11/2026" */
export function formatShortDate(iso: string): string {
  return shortFormatter.format(utcDate(iso))
}

/** "novembro de 2026" */
export function formatMonthYear(year: number, month: number): string {
  return monthYearFormatter.format(new Date(Date.UTC(year, month - 1, 1, 12)))
}

/** "nov" */
export function formatMonthShort(year: number, month: number): string {
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1, 12))).replace('.', '')
}

/** "2026-11" -> "nov/26" */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-')
  const year = Number(y)
  const month = Number(m)
  return `${formatMonthShort(year, month)}/${pad(year % 100)}`
}

/** "08:30:00" -> "08:30"; vazio ou nulo -> "" */
export function trimTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : ''
}

/** "Hoje", "Ontem", "Amanhã" ou a data curta. */
export function relativeDayLabel(iso: string, today: string): string {
  if (iso === today) return 'Hoje'
  if (iso === addDays(today, -1)) return 'Ontem'
  if (iso === addDays(today, 1)) return 'Amanhã'
  return formatShortDate(iso)
}

/** Data (ISO) de um timestamp, no fuso de São Paulo. */
export function isoDateOfTimestamp(timestamp: string): string {
  return todayISO(new Date(timestamp))
}
