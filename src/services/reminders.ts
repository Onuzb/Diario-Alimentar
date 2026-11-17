import type { MealTypeValue } from '@/lib/domain'
import { sortSchedule, type ScheduleItem } from '@/lib/schedule'
import { callRpc } from '@/services/client'

export async function getMealSchedule(): Promise<ScheduleItem[]> {
  return sortSchedule(await callRpc<ScheduleItem[]>('get_meal_schedule', {}))
}

export async function saveMealSchedule(items: ScheduleItem[]): Promise<ScheduleItem[]> {
  return sortSchedule(await callRpc<ScheduleItem[]>('save_meal_schedule', { p_items: items }))
}

export async function resetMealSchedule(): Promise<ScheduleItem[]> {
  return sortSchedule(await callRpc<ScheduleItem[]>('reset_meal_schedule', {}))
}

export interface SkipInput {
  date: string
  mealType: MealTypeValue
}

/** Marca a refeição do dia como "Não fiz". Devolve false se ela já tinha registro. */
export function markMealSkipped({ date, mealType }: SkipInput): Promise<boolean> {
  return callRpc<boolean>('mark_meal_skipped', { p_date: date, p_meal_type: mealType })
}

export function unmarkMealSkipped({ date, mealType }: SkipInput): Promise<boolean> {
  return callRpc<boolean>('unmark_meal_skipped', { p_date: date, p_meal_type: mealType })
}
