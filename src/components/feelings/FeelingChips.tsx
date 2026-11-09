import { feelingInfo } from '@/lib/domain'
import { Chip } from '@/components/ui/Chip'

/** Sentimentos escolhidos, em modo leitura. */
export function FeelingChips({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Sentimentos">
      {tags.map((tag) => {
        const info = feelingInfo(tag)
        if (!info) return null
        return (
          <li key={tag}>
            <Chip tone="sage">
              <span aria-hidden>{info.emoji}</span>
              {info.label}
            </Chip>
          </li>
        )
      })}
    </ul>
  )
}
