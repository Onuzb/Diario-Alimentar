import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/client')>()
  return { ...actual, callRpc: vi.fn() }
})

import { addFoodToMeal, getDashboard, saveDayNotes, saveMeal, searchHistory } from '@/services/diaries'
import { getExperiences, saveExperience } from '@/services/experiences'
import { createFood, getFoodDetail } from '@/services/foods'
import { getReport } from '@/services/reports'
import { callRpc, emptyToNull } from '@/services/client'

const rpc = vi.mocked(callRpc)

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue(null as never)
})

describe('emptyToNull', () => {
  it('troca vazio e espaços por null', () => {
    expect(emptyToNull('')).toBeNull()
    expect(emptyToNull('   ')).toBeNull()
    expect(emptyToNull(undefined)).toBeNull()
    expect(emptyToNull('ok')).toBe('ok')
  })
})

describe('saveMeal', () => {
  it('manda todos os parâmetros, com campos vazios como null', async () => {
    await saveMeal({
      mealId: null,
      date: '2026-11-06',
      mealType: 'lunch',
      mealTime: '12:30',
      feelings: '  ',
      thoughts: 'gostei',
      observations: '',
      feelingTags: ['calm'],
    })
    expect(rpc).toHaveBeenCalledWith('save_meal', {
      p_meal_id: null,
      p_date: '2026-11-06',
      p_meal_type: 'lunch',
      p_meal_time: '12:30',
      p_feelings: null,
      p_thoughts: 'gostei',
      p_observations: null,
      p_feeling_tags: ['calm'],
    })
  })
})

describe('addFoodToMeal', () => {
  it('cria refeição e alimento novo de uma vez (sem ids)', async () => {
    await addFoodToMeal({
      mealId: null,
      date: '2026-11-06',
      mealType: 'breakfast',
      foodId: null,
      foodName: 'Banana',
      quantity: '2 unidades',
      consumedTime: '',
      observations: '',
    })
    expect(rpc).toHaveBeenCalledWith('add_food_to_meal', {
      p_meal_id: null,
      p_date: '2026-11-06',
      p_meal_type: 'breakfast',
      p_food_id: null,
      p_food_name: 'Banana',
      p_quantity: '2 unidades',
      p_consumed_time: null,
      p_observations: null,
    })
  })
})

describe('saveDayNotes e getDashboard', () => {
  it('usam os nomes de parâmetro do banco', async () => {
    await saveDayNotes('2026-11-06', 'dia calmo')
    expect(rpc).toHaveBeenCalledWith('save_day_notes', { p_date: '2026-11-06', p_notes: 'dia calmo' })
    await getDashboard('2026-11-06')
    expect(rpc).toHaveBeenCalledWith('get_dashboard', { p_today: '2026-11-06' })
  })
})

describe('saveExperience', () => {
  const base = {
    id: null,
    foodId: null,
    foodName: 'Leite de aveia',
    type: 'substitution' as const,
    date: '2026-11-06',
    time: '',
    feelings: '',
    thoughts: '',
    afterExperience: '',
    observations: '',
    feelingTags: [],
    replacedFoodId: 'abc',
    replacedFoodName: 'Leite',
  }

  it('em substituição envia o alimento substituído', async () => {
    await saveExperience(base)
    expect(rpc).toHaveBeenCalledWith(
      'save_food_experience',
      expect.objectContaining({ p_type: 'substitution', p_replaced_food_id: 'abc', p_replaced_food_name: 'Leite' }),
    )
  })

  it('em alimento novo nunca envia alimento substituído', async () => {
    await saveExperience({ ...base, type: 'new_food' })
    expect(rpc).toHaveBeenCalledWith(
      'save_food_experience',
      expect.objectContaining({ p_type: 'new_food', p_replaced_food_id: null, p_replaced_food_name: null }),
    )
  })
})

describe('filtros', () => {
  it('searchHistory troca filtros vazios por null', async () => {
    await searchHistory({ query: ' ', from: '', to: '2026-11-30' }, 20, 40)
    expect(rpc).toHaveBeenCalledWith('search_history', {
      p_query: null,
      p_from: null,
      p_to: '2026-11-30',
      p_limit: 20,
      p_offset: 40,
    })
  })

  it('getExperiences troca filtros vazios por null', async () => {
    await getExperiences({ type: '', from: '', to: '', foodId: '' }, 20, 0)
    expect(rpc).toHaveBeenCalledWith('get_experiences', {
      p_type: null,
      p_from: null,
      p_to: null,
      p_food_id: null,
      p_limit: 20,
      p_offset: 0,
    })
  })

  it('getReport aceita período aberto', async () => {
    await getReport('', '')
    expect(rpc).toHaveBeenCalledWith('get_report', { p_from: null, p_to: null })
  })
})

describe('alimentos', () => {
  it('createFood e getFoodDetail chamam as funções certas', async () => {
    await createFood('Kiwi')
    expect(rpc).toHaveBeenCalledWith('get_or_create_food', { p_name: 'Kiwi' })
    await getFoodDetail('id-1')
    expect(rpc).toHaveBeenCalledWith('get_food_detail', { p_food_id: 'id-1' })
  })
})
