import type { FeelingValue, MealTypeValue } from '@/lib/domain'
import { AppError, toAppError } from '@/lib/errors'
import { callRpc, emptyToNull, supabase } from '@/services/client'
import type { CalendarMark, DashboardData, DayData, HistoryPage } from '@/types/database'

export function getDay(date: string): Promise<DayData> {
  return callRpc<DayData>('get_day', { p_date: date })
}

export interface SaveMealInput {
  /** null cria uma refeição nova na data informada. */
  mealId: string | null
  date: string
  mealType: MealTypeValue
  mealTime: string
  feelings: string
  thoughts: string
  observations: string
  feelingTags: FeelingValue[]
}

/** Cria ou atualiza uma refeição. Devolve o id da refeição. */
export function saveMeal(input: SaveMealInput): Promise<string> {
  return callRpc<string>('save_meal', {
    p_meal_id: input.mealId,
    p_date: input.date,
    p_meal_type: input.mealType,
    p_meal_time: emptyToNull(input.mealTime),
    p_feelings: emptyToNull(input.feelings),
    p_thoughts: emptyToNull(input.thoughts),
    p_observations: emptyToNull(input.observations),
    p_feeling_tags: input.feelingTags,
  })
}

export async function deleteMeal(id: string): Promise<void> {
  const { data, error, status } = await supabase.from('meals').delete().eq('id', id).select('id')
  if (error) throw toAppError(error, status)
  if (!data || data.length === 0) throw new AppError('Essa refeição já foi excluída. Atualize a página.')
}

export interface AddFoodInput {
  /** null cria uma refeição nova (do tipo e na data informados). */
  mealId: string | null
  date: string
  mealType: MealTypeValue
  /** id de um alimento já cadastrado; null cadastra pelo nome. */
  foodId: string | null
  foodName: string
  quantity: string
  consumedTime: string
  observations: string
}

export interface AddFoodResult {
  meal_id: string
  meal_food_id: string
  food_id: string
}

export function addFoodToMeal(input: AddFoodInput): Promise<AddFoodResult> {
  return callRpc<AddFoodResult>('add_food_to_meal', {
    p_meal_id: input.mealId,
    p_date: input.date,
    p_meal_type: input.mealType,
    p_food_id: input.foodId,
    p_food_name: input.foodName,
    p_quantity: emptyToNull(input.quantity),
    p_consumed_time: emptyToNull(input.consumedTime),
    p_observations: emptyToNull(input.observations),
  })
}

export interface UpdateMealFoodInput {
  id: string
  quantity: string
  consumedTime: string
  observations: string
}

/** Edita quantidade, horário e observações de um alimento numa refeição. */
export async function updateMealFood(input: UpdateMealFoodInput): Promise<void> {
  const { data, error, status } = await supabase
    .from('meal_foods')
    .update({
      quantity: emptyToNull(input.quantity),
      consumed_time: emptyToNull(input.consumedTime),
      observations: emptyToNull(input.observations),
    })
    .eq('id', input.id)
    .select('id')
  if (error) throw toAppError(error, status)
  if (!data || data.length === 0) throw new AppError('Esse alimento já foi removido da refeição. Atualize a página.')
}

export interface RemoveFoodResult {
  meal_id: string
  meal_deleted: boolean
}

export function removeFoodFromMeal(mealFoodId: string): Promise<RemoveFoodResult> {
  return callRpc<RemoveFoodResult>('remove_food_from_meal', { p_meal_food_id: mealFoodId })
}

export function saveDayNotes(date: string, notes: string): Promise<string> {
  return callRpc<string>('save_day_notes', { p_date: date, p_notes: notes })
}

export function getCalendarMonth(year: number, month: number): Promise<CalendarMark[]> {
  return callRpc<CalendarMark[]>('get_calendar_month', { p_year: year, p_month: month })
}

export interface HistoryFilters {
  query: string
  from: string
  to: string
}

export function searchHistory(filters: HistoryFilters, limit: number, offset: number): Promise<HistoryPage> {
  return callRpc<HistoryPage>('search_history', {
    p_query: emptyToNull(filters.query),
    p_from: emptyToNull(filters.from),
    p_to: emptyToNull(filters.to),
    p_limit: limit,
    p_offset: offset,
  })
}

export function getDashboard(today: string): Promise<DashboardData> {
  return callRpc<DashboardData>('get_dashboard', { p_today: today })
}
