import type { ExperienceTypeValue, FeelingValue, MealTypeValue } from '@/lib/domain'

/** Alimento dentro de uma refeição (resposta de get_day). */
export interface MealFood {
  id: string
  food_id: string
  food_name: string
  quantity: string | null
  consumed_time: string | null
  observations: string | null
}

export interface Meal {
  id: string
  diary_id: string
  meal_type: MealTypeValue
  meal_time: string | null
  feelings: string | null
  thoughts: string | null
  observations: string | null
  feeling_tags: FeelingValue[]
  created_at: string
  updated_at: string
  foods: MealFood[]
}

/** Resumo de uma experiência dentro do dia (resposta de get_day). */
export interface DayExperience {
  id: string
  food_id: string
  food_name: string
  experience_type: ExperienceTypeValue
  experience_time: string | null
  feeling_tags: FeelingValue[]
}

export interface DayData {
  date: string
  diary: {
    id: string
    date: string
    general_observations: string | null
    updated_at: string
  } | null
  meals: Meal[]
  experiences: DayExperience[]
}

export interface Experience {
  id: string
  food_id: string
  food_name: string
  replaced_food_id: string | null
  replaced_food_name: string | null
  experience_type: ExperienceTypeValue
  experience_date: string
  experience_time: string | null
  feelings: string | null
  thoughts: string | null
  after_experience: string | null
  observations: string | null
  feeling_tags: FeelingValue[]
  created_at: string
  updated_at: string
}

export interface ExperiencePage {
  total: number
  items: Experience[]
}

/** Alimento com os números de "Alimentos registrados" (view foods_overview). */
export interface FoodOverview {
  id: string
  name: string
  created_at: string
  times_consumed: number
  experience_count: number
  first_record_date: string | null
  last_record_date: string | null
}

export interface FoodMealAppearance {
  meal_food_id: string
  meal_id: string
  date: string
  meal_type: MealTypeValue
  meal_time: string | null
  consumed_time: string | null
  quantity: string | null
  observations: string | null
}

export interface FoodDetail {
  food: FoodOverview | null
  meals: FoodMealAppearance[]
  experiences: Experience[]
}

export interface CalendarMark {
  date: string
  meal_count: number
  experience_count: number
  has_notes: boolean
}

export interface HistoryDay {
  date: string
  meals: { id: string; meal_type: MealTypeValue; meal_time: string | null; foods: string[] }[]
  experiences: { id: string; food_name: string; experience_type: ExperienceTypeValue }[]
}

export interface HistoryPage {
  total: number
  days: HistoryDay[]
}

export type RecentItem =
  | {
      kind: 'meal'
      id: string
      date: string
      at: string
      detail: { meal_type: MealTypeValue; meal_time: string | null; foods: string[] }
    }
  | {
      kind: 'experience'
      id: string
      date: string
      at: string
      detail: { food_name: string; experience_type: ExperienceTypeValue }
    }

export interface DashboardData {
  today: { meal_count: number; food_count: number; experience_count: number }
  recent: RecentItem[]
}

export interface ReportData {
  totals: {
    meal_count: number
    distinct_foods_registered: number
    foods_tried: number
    experience_count: number
  }
  top_foods: { food_id: string; name: string; times: number }[]
  experiences_by_month: { month: string; new_food: number; substitution: number }[]
  timeline: Experience[]
}

export interface ExportData {
  version: number
  exported_at: string
  foods: unknown[]
  daily_diaries: unknown[]
  meals: unknown[]
  meal_foods: unknown[]
  food_experiences: unknown[]
}
