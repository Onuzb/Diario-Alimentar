import type { ExperienceTypeValue, FeelingValue } from '@/lib/domain'
import { AppError, toAppError } from '@/lib/errors'
import { callRpc, emptyToNull, supabase } from '@/services/client'
import type { Experience, ExperiencePage } from '@/types/database'

export interface SaveExperienceInput {
  /** null cria uma experiência nova. */
  id: string | null
  foodId: string | null
  foodName: string
  type: ExperienceTypeValue
  date: string
  time: string
  feelings: string
  thoughts: string
  afterExperience: string
  observations: string
  feelingTags: FeelingValue[]
  replacedFoodId: string | null
  replacedFoodName: string
}

export interface SaveExperienceResult {
  id: string
  food_id: string
  replaced_food_id: string | null
}

export function saveExperience(input: SaveExperienceInput): Promise<SaveExperienceResult> {
  const isSubstitution = input.type === 'substitution'
  return callRpc<SaveExperienceResult>('save_food_experience', {
    p_id: input.id,
    p_food_id: input.foodId,
    p_food_name: input.foodName,
    p_type: input.type,
    p_date: input.date,
    p_time: emptyToNull(input.time),
    p_feelings: emptyToNull(input.feelings),
    p_thoughts: emptyToNull(input.thoughts),
    p_after_experience: emptyToNull(input.afterExperience),
    p_observations: emptyToNull(input.observations),
    p_feeling_tags: input.feelingTags,
    p_replaced_food_id: isSubstitution ? input.replacedFoodId : null,
    p_replaced_food_name: isSubstitution ? emptyToNull(input.replacedFoodName) : null,
  })
}

export interface ExperienceFilters {
  type: ExperienceTypeValue | ''
  from: string
  to: string
  foodId: string
}

export function getExperiences(filters: ExperienceFilters, limit: number, offset: number): Promise<ExperiencePage> {
  return callRpc<ExperiencePage>('get_experiences', {
    p_type: emptyToNull(filters.type),
    p_from: emptyToNull(filters.from),
    p_to: emptyToNull(filters.to),
    p_food_id: emptyToNull(filters.foodId),
    p_limit: limit,
    p_offset: offset,
  })
}

export async function getExperience(id: string): Promise<Experience | null> {
  return callRpc<Experience | null>('get_experience', { p_id: id })
}

export async function deleteExperience(id: string): Promise<void> {
  const { data, error, status } = await supabase.from('food_experiences').delete().eq('id', id).select('id')
  if (error) throw toAppError(error, status)
  if (!data || data.length === 0) throw new AppError('Essa experiência já foi excluída. Atualize a página.')
}
