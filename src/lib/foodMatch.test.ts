import { describe, expect, it } from 'vitest'
import {
  cleanName,
  escapeLike,
  findExact,
  findSimilar,
  levenshtein,
  normalizeName,
  suggestFoods,
} from '@/lib/foodMatch'

const foods = [
  { id: '1', name: 'Pão' },
  { id: '2', name: 'Pão francês' },
  { id: '3', name: 'Leite' },
  { id: '4', name: 'Banana' },
  { id: '5', name: 'Ovo cozido' },
  { id: '6', name: 'Biscoitos novos' },
  { id: '7', name: 'Maçã' },
]

describe('normalizeName', () => {
  it('ignora acentos, maiúsculas e espaços repetidos', () => {
    expect(normalizeName('  PÃO   Francês ')).toBe('pao frances')
    expect(normalizeName('Maçã')).toBe('maca')
  })
})

describe('cleanName', () => {
  it('só tira espaços, mantendo acentos e maiúsculas', () => {
    expect(cleanName('  Pão   de  queijo ')).toBe('Pão de queijo')
  })
})

describe('levenshtein', () => {
  it('conta edições', () => {
    expect(levenshtein('banana', 'banana')).toBe(0)
    expect(levenshtein('banana', 'bananna')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })
})

describe('findExact', () => {
  it('acha o mesmo alimento ignorando acento e maiúsculas', () => {
    expect(findExact(foods, 'pao')?.id).toBe('1')
    expect(findExact(foods, 'MACA')?.id).toBe('7')
    expect(findExact(foods, 'pão de forma')).toBeUndefined()
    expect(findExact(foods, '   ')).toBeUndefined()
  })
})

describe('findSimilar', () => {
  it('sugere nomes que contêm o digitado como palavra inteira', () => {
    expect(findSimilar(foods, 'pão').map((f) => f.id)).toEqual(['2'])
    expect(findSimilar(foods, 'frances').map((f) => f.id)).toEqual(['2'])
  })

  it('não confunde pedaço de palavra', () => {
    // "ovo" está dentro de "novos", mas não é a palavra inteira
    expect(findSimilar(foods, 'ovo').map((f) => f.id)).toEqual(['5'])
  })

  it('pega erros de digitação pequenos', () => {
    expect(findSimilar(foods, 'bananna').map((f) => f.id)).toEqual(['4'])
    expect(findSimilar(foods, 'leit').map((f) => f.id)).toEqual(['3'])
  })

  it('não inclui o alimento igual', () => {
    expect(findSimilar(foods, 'Leite')).toEqual([])
  })

  it('devolve vazio para texto curto demais', () => {
    expect(findSimilar(foods, 'p')).toEqual([])
  })
})

describe('suggestFoods', () => {
  it('mostra os primeiros em ordem alfabética sem texto', () => {
    expect(suggestFoods(foods, '', 3).map((f) => f.name)).toEqual(['Banana', 'Biscoitos novos', 'Leite'])
  })

  it('prioriza quem começa com o texto', () => {
    const result = suggestFoods(foods, 'pa')
    expect(result.map((f) => f.id)).toEqual(['1', '2'])
  })

  it('acha por palavra do meio e por trecho', () => {
    expect(suggestFoods(foods, 'frances').map((f) => f.id)).toEqual(['2'])
    expect(suggestFoods(foods, 'ozid').map((f) => f.id)).toEqual(['5'])
  })
})

describe('escapeLike', () => {
  it('escapa curingas', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})
