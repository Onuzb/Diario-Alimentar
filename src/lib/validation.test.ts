import { describe, expect, it } from 'vitest'
import {
  addFoodFormSchema,
  experienceFormSchema,
  foodNameSchema,
  mealFormSchema,
  validatePeriod,
} from '@/lib/validation'

const validExperience = {
  food_name: 'Kiwi',
  experience_type: 'new_food' as const,
  replaced_food_name: '',
  experience_date: '2026-11-06',
  experience_time: '15:00',
  feelings: '',
  thoughts: '',
  after_experience: '',
  observations: '',
  feeling_tags: [] as const,
}

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? []
}

describe('foodNameSchema', () => {
  it('exige nome e limita o tamanho', () => {
    expect(foodNameSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(foodNameSchema.safeParse({ name: 'a'.repeat(81) }).success).toBe(false)
    expect(foodNameSchema.parse({ name: '  Pão  ' }).name).toBe('Pão')
  })
})

describe('mealFormSchema', () => {
  const base = { meal_time: '', feelings: '', thoughts: '', observations: '', feeling_tags: [] as const }

  it('aceita tudo vazio (refeição sem horário nem texto)', () => {
    expect(mealFormSchema.safeParse(base).success).toBe(true)
  })

  it('valida o formato do horário', () => {
    expect(mealFormSchema.safeParse({ ...base, meal_time: '08:30' }).success).toBe(true)
    expect(mealFormSchema.safeParse({ ...base, meal_time: '24:00' }).success).toBe(false)
    expect(mealFormSchema.safeParse({ ...base, meal_time: '8h' }).success).toBe(false)
  })

  it('aceita só os sentimentos conhecidos', () => {
    expect(mealFormSchema.safeParse({ ...base, feeling_tags: ['calm', 'tired'] }).success).toBe(true)
    expect(mealFormSchema.safeParse({ ...base, feeling_tags: ['inventado'] }).success).toBe(false)
  })

  it('limita os textos a 2000 caracteres', () => {
    expect(mealFormSchema.safeParse({ ...base, thoughts: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('addFoodFormSchema', () => {
  it('só o nome do alimento é obrigatório', () => {
    expect(addFoodFormSchema.safeParse({ food_name: 'Banana', quantity: '', consumed_time: '', observations: '' }).success).toBe(true)
    expect(addFoodFormSchema.safeParse({ food_name: '', quantity: '', consumed_time: '', observations: '' }).success).toBe(false)
  })

  it('limita a quantidade a 80 caracteres', () => {
    const r = addFoodFormSchema.safeParse({ food_name: 'Banana', quantity: 'x'.repeat(81), consumed_time: '', observations: '' })
    expect(r.success).toBe(false)
  })
})

describe('experienceFormSchema', () => {
  it('aceita uma experiência completa', () => {
    expect(experienceFormSchema.safeParse(validExperience).success).toBe(true)
  })

  it('recusa data inexistente', () => {
    const r = experienceFormSchema.safeParse({ ...validExperience, experience_date: '2026-02-30' })
    expect(r.success).toBe(false)
    expect(messages(r)).toContain('Escolha uma data válida.')
  })

  it('recusa substituir um alimento por ele mesmo (ignorando acentos)', () => {
    const r = experienceFormSchema.safeParse({
      ...validExperience,
      food_name: 'Pão',
      experience_type: 'substitution',
      replaced_food_name: 'pao',
    })
    expect(r.success).toBe(false)
    expect(messages(r)).toContain('O alimento substituído precisa ser diferente do novo alimento.')
  })

  it('aceita substituição com alimento diferente ou sem alimento substituído', () => {
    expect(
      experienceFormSchema.safeParse({
        ...validExperience,
        food_name: 'Leite de aveia',
        experience_type: 'substitution',
        replaced_food_name: 'Leite',
      }).success,
    ).toBe(true)
    expect(
      experienceFormSchema.safeParse({ ...validExperience, experience_type: 'substitution' }).success,
    ).toBe(true)
  })

  it('recusa tipo desconhecido', () => {
    expect(experienceFormSchema.safeParse({ ...validExperience, experience_type: 'outro' }).success).toBe(false)
  })
})

describe('validatePeriod', () => {
  it('aceita períodos vazios, parciais e em ordem', () => {
    expect(validatePeriod('', '')).toBeNull()
    expect(validatePeriod('2026-11-01', '')).toBeNull()
    expect(validatePeriod('2026-11-01', '2026-11-30')).toBeNull()
    expect(validatePeriod('2026-11-06', '2026-11-06')).toBeNull()
  })

  it('recusa datas invertidas ou inválidas', () => {
    expect(validatePeriod('2026-11-30', '2026-11-01')).toMatch(/anterior/)
    expect(validatePeriod('2026-13-01', '')).toMatch(/inicial/)
    expect(validatePeriod('', '2026-02-30')).toMatch(/final/)
  })
})
