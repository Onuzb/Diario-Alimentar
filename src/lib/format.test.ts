import { describe, expect, it } from 'vitest'
import { plural, summarizeList } from '@/lib/format'

describe('plural', () => {
  it('escolhe singular e plural', () => {
    expect(plural(0, 'refeição', 'refeições')).toBe('0 refeições')
    expect(plural(1, 'refeição', 'refeições')).toBe('1 refeição')
    expect(plural(3, 'refeição', 'refeições')).toBe('3 refeições')
  })
})

describe('summarizeList', () => {
  it('junta com vírgula e "e"', () => {
    expect(summarizeList([])).toBe('')
    expect(summarizeList(['pão'])).toBe('pão')
    expect(summarizeList(['pão', 'leite'])).toBe('pão e leite')
    expect(summarizeList(['pão', 'leite', 'banana'])).toBe('pão, leite e banana')
  })

  it('resume listas longas', () => {
    expect(summarizeList(['a', 'b', 'c', 'd', 'e', 'f'], 4)).toBe('a, b, c, d e mais 2')
  })
})
