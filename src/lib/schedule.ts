import { MEAL_TYPES, mealTypeLabel, type MealTypeValue } from '@/lib/domain'

/** Horário de uma refeição para os lembretes. Horas no formato "HH:MM", relógio de Brasília. */
export interface ScheduleItem {
  meal_type: MealTypeValue
  start_time: string
  end_time: string
  enabled: boolean
}

/** O mínimo que o banco aceita entre o início e o fim (mesma regra de save_meal_schedule). */
export const MIN_WINDOW_MINUTES = 20
/** O segundo aviso chega tantos minutos antes do fim. */
export const LATE_REMINDER_MINUTES_BEFORE_END = 10

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function isHHMM(value: string): boolean {
  return HHMM.test(value)
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function fromMinutes(total: number): string {
  const v = ((Math.round(total) % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

/** Duração do horário em minutos; fim menor que o início cruza a meia-noite (ceia). */
export function windowMinutes(start: string, end: string): number {
  return (((toMinutes(end) - toMinutes(start)) % 1440) + 1440) % 1440
}

/** Os dois momentos de aviso: no meio do horário e 10 minutos antes do fim. */
export function reminderTimes(start: string, end: string): { mid: string; late: string } {
  const length = windowMinutes(start, end)
  return {
    mid: fromMinutes(toMinutes(start) + Math.floor(length / 2)),
    late: fromMinutes(toMinutes(end) - LATE_REMINDER_MINUTES_BEFORE_END),
  }
}

/** "8h às 9h" ou "8h30 às 9h". */
export function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
}

export function formatWindow(start: string, end: string): string {
  return `${formatHour(start)} às ${formatHour(end)}`
}

/** Mensagem de erro de uma refeição (ou null se estiver tudo certo). Começa pela correção. */
export function validateItem(item: Pick<ScheduleItem, 'meal_type' | 'start_time' | 'end_time'>): string | null {
  const label = mealTypeLabel(item.meal_type)
  if (!isHHMM(item.start_time) || !isHHMM(item.end_time)) {
    return `${label}: informe o início e o fim, como 08:30.`
  }
  if (windowMinutes(item.start_time, item.end_time) < MIN_WINDOW_MINUTES) {
    return `${label}: o fim precisa ser pelo menos ${MIN_WINDOW_MINUTES} minutos depois do início.`
  }
  return null
}

export function validateSchedule(items: ScheduleItem[]): Partial<Record<MealTypeValue, string>> {
  const errors: Partial<Record<MealTypeValue, string>> = {}
  for (const item of items) {
    const message = validateItem(item)
    if (message) errors[item.meal_type] = message
  }
  return errors
}

/** Ordem do dia (café da manhã … ceia), seja qual for a ordem que veio do banco. */
export function sortSchedule(items: ScheduleItem[]): ScheduleItem[] {
  const order = MEAL_TYPES.map((m) => m.value) as MealTypeValue[]
  return [...items].sort((a, b) => order.indexOf(a.meal_type) - order.indexOf(b.meal_type))
}

export function sameSchedule(a: ScheduleItem[], b: ScheduleItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i]
      return !!y && x.meal_type === y.meal_type && x.start_time === y.start_time && x.end_time === y.end_time && x.enabled === y.enabled
    })
  )
}
