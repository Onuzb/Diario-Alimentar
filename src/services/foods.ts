import { AppError, toAppError } from '@/lib/errors'
import { callRpc, supabase } from '@/services/client'
import type { FoodDetail, FoodOverview } from '@/types/database'

const PAGE_SIZE = 1000

/** Todos os alimentos com os números de "Alimentos registrados". */
export async function listFoods(): Promise<FoodOverview[]> {
  const all: FoodOverview[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error, status } = await supabase
      .from('foods_overview')
      .select('*')
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw toAppError(error, status)
    const rows = (data ?? []) as FoodOverview[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return all.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Cadastra um alimento (ou devolve o existente, se o nome já estiver no cadastro). */
export async function createFood(name: string): Promise<string> {
  return callRpc<string>('get_or_create_food', { p_name: name })
}

export async function renameFood(id: string, name: string): Promise<void> {
  const { data, error, status } = await supabase.from('foods').update({ name }).eq('id', id).select('id')
  if (error) throw toAppError(error, status)
  if (!data || data.length === 0) throw new AppError('Esse alimento não existe mais. Atualize a página.')
}

/**
 * Exclui um alimento. O banco recusa se houver experiências ligadas a ele;
 * os vínculos com refeições são apenas removidos.
 */
export async function deleteFood(id: string): Promise<void> {
  const { data, error, status } = await supabase.from('foods').delete().eq('id', id).select('id')
  if (error) throw toAppError(error, status)
  if (!data || data.length === 0) throw new AppError('Esse alimento já foi excluído. Atualize a página.')
}

export async function getFoodDetail(id: string): Promise<FoodDetail> {
  return callRpc<FoodDetail>('get_food_detail', { p_food_id: id })
}
