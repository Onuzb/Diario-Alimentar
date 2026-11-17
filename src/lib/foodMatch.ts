/**
 * Comparação de nomes de alimentos. A normalização repete a do banco
 * (sem acentos, minúsculas, espaços únicos): "Pão", "pão" e "PAO" são iguais.
 */

export interface NamedFood {
  id: string
  name: string
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Remove espaços repetidos e das pontas, mantendo acentos e maiúsculas. */
export function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost)
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

export function findExact<T extends NamedFood>(foods: readonly T[], name: string): T | undefined {
  const key = normalizeName(name)
  if (!key) return undefined
  return foods.find((f) => normalizeName(f.name) === key)
}

function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `)
}

/**
 * Alimentos parecidos com o nome digitado, sem contar o igual:
 *  - um nome contém o outro como palavra inteira ("pão" e "pão francês");
 *  - ou diferem por poucas letras ("banana" e "bananna").
 */
export function findSimilar<T extends NamedFood>(foods: readonly T[], name: string, limit = 5): T[] {
  const key = normalizeName(name)
  if (key.length < 2) return []

  const scored: { food: T; score: number }[] = []
  for (const food of foods) {
    const other = normalizeName(food.name)
    if (!other || other === key) continue

    let score: number | null = null
    if (key.length >= 3 && containsWords(other, key)) {
      score = 1 + (other.length - key.length) / 100
    } else if (other.length >= 3 && containsWords(key, other)) {
      score = 1 + (key.length - other.length) / 100
    } else {
      const shortest = Math.min(key.length, other.length)
      if (shortest >= 4) {
        const distance = levenshtein(key, other)
        const allowed = shortest >= 8 ? 2 : 1
        if (distance <= allowed) score = 2 + distance
      }
    }
    if (score !== null) scored.push({ food, score })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name, 'pt-BR'))
    .slice(0, limit)
    .map((s) => s.food)
}

/** Sugestões para a lista que abre enquanto a pessoa digita. */
export function suggestFoods<T extends NamedFood>(foods: readonly T[], term: string, limit = 8): T[] {
  const key = normalizeName(term)
  const sorted = [...foods].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  if (!key) return sorted.slice(0, limit)

  const ranked: { food: T; rank: number }[] = []
  for (const food of sorted) {
    const other = normalizeName(food.name)
    if (other.startsWith(key)) ranked.push({ food, rank: 0 })
    else if (other.split(' ').some((word) => word.startsWith(key))) ranked.push({ food, rank: 1 })
    else if (other.includes(key)) ranked.push({ food, rank: 2 })
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.food)
}

/** Escapa % e _ para uso em padrões LIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
