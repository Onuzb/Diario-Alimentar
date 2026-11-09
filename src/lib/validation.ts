import { z } from 'zod'
import { isISODate } from '@/lib/dates'
import { EXPERIENCE_TYPES, FEELING_VALUES, LIMITS } from '@/lib/domain'
import { normalizeName } from '@/lib/foodMatch'

const timeField = z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM, como 08:30.')

const foodName = z
  .string()
  .trim()
  .min(1, 'Informe o nome do alimento.')
  .max(LIMITS.foodName, `Use até ${LIMITS.foodName} caracteres.`)

const optionalFoodName = z.string().trim().max(LIMITS.foodName, `Use até ${LIMITS.foodName} caracteres.`)

const longText = z.string().max(LIMITS.longText, `Use até ${LIMITS.longText} caracteres.`)

const feelingTags = z.array(z.enum(FEELING_VALUES)).max(FEELING_VALUES.length)

/** Nome do alimento na tela "Meus alimentos" (cadastrar e renomear). */
export const foodNameSchema = z.object({ name: foodName })
export type FoodNameValues = z.infer<typeof foodNameSchema>

/** Formulário de refeição (horário, sentimentos, pensamentos e observações). */
export const mealFormSchema = z.object({
  meal_time: timeField,
  feelings: longText,
  thoughts: longText,
  observations: longText,
  feeling_tags: feelingTags,
})
export type MealFormValues = z.infer<typeof mealFormSchema>

/** Formulário "Adicionar alimento" a uma refeição. */
export const addFoodFormSchema = z.object({
  food_name: foodName,
  quantity: z.string().trim().max(LIMITS.quantity, `Use até ${LIMITS.quantity} caracteres.`),
  consumed_time: timeField,
  observations: longText,
})
export type AddFoodFormValues = z.infer<typeof addFoodFormSchema>

/** Formulário "Registro de experiência alimentar". */
export const experienceFormSchema = z
  .object({
    food_name: foodName,
    experience_type: z.enum(EXPERIENCE_TYPES.map((t) => t.value) as ['new_food', 'substitution']),
    replaced_food_name: optionalFoodName,
    experience_date: z.string().refine((v) => isISODate(v), 'Escolha uma data válida.'),
    experience_time: timeField,
    feelings: longText,
    thoughts: longText,
    after_experience: longText,
    observations: longText,
    feeling_tags: feelingTags,
  })
  .superRefine((values, ctx) => {
    if (
      values.experience_type === 'substitution' &&
      values.replaced_food_name &&
      normalizeName(values.replaced_food_name) === normalizeName(values.food_name)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['replaced_food_name'],
        message: 'O alimento substituído precisa ser diferente do novo alimento.',
      })
    }
  })
export type ExperienceFormValues = z.infer<typeof experienceFormSchema>

/** Filtro de período: "de" não pode ser depois de "até". */
export function validatePeriod(from: string, to: string): string | null {
  if (from && !isISODate(from)) return 'A data inicial é inválida.'
  if (to && !isISODate(to)) return 'A data final é inválida.'
  if (from && to && from > to) return 'A data inicial precisa ser anterior à data final.'
  return null
}
