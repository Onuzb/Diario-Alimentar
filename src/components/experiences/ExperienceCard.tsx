import { Link } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { FeelingChips } from '@/components/feelings/FeelingChips'
import { IconButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { formatShortDate, trimTime } from '@/lib/dates'
import { experienceTypeLabel } from '@/lib/domain'
import type { Experience } from '@/types/database'

interface ExperienceCardProps {
  experience: Experience
  onDelete?: (experience: Experience) => void
  /** Esconde o nome do alimento (quando a página já é sobre ele). */
  hideFood?: boolean
}

function TextLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-sm font-semibold text-ink">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value}</dd>
    </div>
  )
}

/** Uma experiência alimentar: alimento, tipo, quando foi e o que a pessoa registrou. */
export function ExperienceCard({ experience: e, onDelete, hideFood }: ExperienceCardProps) {
  const time = trimTime(e.experience_time)
  const hasText = e.feelings || e.thoughts || e.after_experience || e.observations

  return (
    <article aria-label={`Experiência com ${e.food_name}`} className="rounded-card border border-line bg-card">
      <header className="flex items-start justify-between gap-2 py-3 pr-2 pl-5">
        <div className="min-w-0 py-1">
          {!hideFood && <h3 className="text-xl leading-snug break-words">{e.food_name}</h3>}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            <time dateTime={e.experience_date}>{formatShortDate(e.experience_date)}</time>
            {time && <span>às {time}</span>}
            <Chip tone="earth">{experienceTypeLabel(e.experience_type)}</Chip>
          </p>
          {e.experience_type === 'substitution' && e.replaced_food_name && (
            <p className="mt-1 text-sm text-ink-soft">
              No lugar de <strong className="font-semibold text-ink">{e.replaced_food_name}</strong>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <Link
            to={`/experiencias/${e.id}`}
            aria-label={`Editar experiência com ${e.food_name}`}
            title="Editar experiência"
            className="inline-flex size-11 items-center justify-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-sage-100 hover:text-sage-800"
          >
            <Pencil aria-hidden className="size-[1.125rem]" />
          </Link>
          {onDelete && (
            <IconButton label={`Excluir experiência com ${e.food_name}`} tone="danger" onClick={() => onDelete(e)}>
              <Trash2 aria-hidden className="size-[1.125rem]" />
            </IconButton>
          )}
        </div>
      </header>

      {(e.feeling_tags.length > 0 || hasText) && (
        <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
          <FeelingChips tags={e.feeling_tags} />
          {hasText && (
            <dl className="flex flex-col gap-3">
              <TextLine label="Como me senti" value={e.feelings} />
              <TextLine label="O que pensei" value={e.thoughts} />
              <TextLine label="Como foi depois" value={e.after_experience} />
              <TextLine label="Observações" value={e.observations} />
            </dl>
          )}
        </div>
      )}
    </article>
  )
}
