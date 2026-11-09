/**
 * Constantes de domínio. Os códigos (valores em inglês) são os mesmos aceitos
 * pelo banco; os rótulos são o que aparece na interface.
 */

export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Café da manhã', defaultTime: '08:00' },
  { value: 'morning_snack', label: 'Lanche da manhã', defaultTime: '10:00' },
  { value: 'lunch', label: 'Almoço', defaultTime: '12:30' },
  { value: 'afternoon_snack', label: 'Lanche da tarde', defaultTime: '16:00' },
  { value: 'dinner', label: 'Jantar', defaultTime: '19:30' },
  { value: 'supper', label: 'Ceia', defaultTime: '21:30' },
] as const

export type MealTypeValue = (typeof MEAL_TYPES)[number]['value']

export const MEAL_TYPE_VALUES = MEAL_TYPES.map((m) => m.value) as unknown as readonly [
  MealTypeValue,
  ...MealTypeValue[],
]

export function mealTypeLabel(value: string): string {
  return MEAL_TYPES.find((m) => m.value === value)?.label ?? 'Refeição'
}

export function mealTypeDefaultTime(value: MealTypeValue): string {
  return MEAL_TYPES.find((m) => m.value === value)?.defaultTime ?? ''
}

export const EXPERIENCE_TYPES = [
  { value: 'new_food', label: 'Alimento novo' },
  { value: 'substitution', label: 'Substituição alimentar' },
] as const

export type ExperienceTypeValue = (typeof EXPERIENCE_TYPES)[number]['value']

export function experienceTypeLabel(value: string): string {
  return EXPERIENCE_TYPES.find((t) => t.value === value)?.label ?? 'Experiência'
}

export const FEELINGS = [
  { value: 'calm', emoji: '😌', label: 'Tranquilo' },
  { value: 'happy', emoji: '😊', label: 'Feliz' },
  { value: 'curious', emoji: '🤔', label: 'Curioso' },
  { value: 'hungry', emoji: '🤤', label: 'Com vontade' },
  { value: 'satisfied', emoji: '😋', label: 'Satisfeito' },
  { value: 'neutral', emoji: '😐', label: 'Neutro' },
  { value: 'not_hungry', emoji: '😶', label: 'Sem fome' },
  { value: 'anxious', emoji: '😟', label: 'Ansioso' },
  { value: 'uncomfortable', emoji: '😣', label: 'Desconfortável' },
  { value: 'tired', emoji: '😴', label: 'Cansado' },
] as const

export type FeelingValue = (typeof FEELINGS)[number]['value']

export const FEELING_VALUES = FEELINGS.map((f) => f.value) as unknown as readonly [
  FeelingValue,
  ...FeelingValue[],
]

export function feelingInfo(value: string) {
  return FEELINGS.find((f) => f.value === value)
}

/** Limites de tamanho (iguais aos do banco). */
export const LIMITS = {
  foodName: 80,
  quantity: 80,
  longText: 2000,
} as const
