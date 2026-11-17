/** "1 refeição" / "2 refeições". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** "pão, leite e banana"; passando de `max`, "pão, leite, banana e mais 2". */
export function summarizeList(items: readonly string[], max = 4): string {
  if (items.length === 0) return ''
  const shown = items.slice(0, max)
  const rest = items.length - shown.length
  if (rest > 0) return `${shown.join(', ')} e mais ${rest}`
  if (shown.length === 1) return shown[0] as string
  return `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`
}
