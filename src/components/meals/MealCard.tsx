import { Pencil, Plus, Trash2 } from 'lucide-react'
import { FeelingChips } from '@/components/feelings/FeelingChips'
import { Button, IconButton } from '@/components/ui/Button'
import { trimTime } from '@/lib/dates'
import { mealTypeLabel } from '@/lib/domain'
import type { Meal, MealFood } from '@/types/database'

interface MealCardProps {
  meal: Meal
  onEdit: (meal: Meal) => void
  onDelete: (meal: Meal) => void
  onAddFood: (meal: Meal) => void
  onEditFood: (meal: Meal, entry: MealFood) => void
  onRemoveFood: (meal: Meal, entry: MealFood) => void
}

function NotRecorded() {
  return <span className="text-ink-soft">Não registrado</span>
}

/** Cartão de uma refeição registrada: alimentos, sentimentos, pensamentos e observações. */
export function MealCard({ meal, onEdit, onDelete, onAddFood, onEditFood, onRemoveFood }: MealCardProps) {
  const time = trimTime(meal.meal_time)
  const label = mealTypeLabel(meal.meal_type)
  const heading = time ? `${label} às ${time}` : label

  return (
    <article aria-label={heading} className="rounded-card border border-line bg-card">
      <header className="flex items-start justify-between gap-2 border-b border-line py-3 pr-2 pl-5">
        <div className="min-w-0 py-1.5">
          <h3 className="text-xl leading-snug">{label}</h3>
          <p className="text-sm text-ink-soft">{time ? <time>{time}</time> : 'Sem horário'}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label={`Editar ${label.toLowerCase()}${time ? ` das ${time}` : ''}`} onClick={() => onEdit(meal)}>
            <Pencil aria-hidden className="size-[1.125rem]" />
          </IconButton>
          <IconButton label={`Excluir ${label.toLowerCase()}${time ? ` das ${time}` : ''}`} tone="danger" onClick={() => onDelete(meal)}>
            <Trash2 aria-hidden className="size-[1.125rem]" />
          </IconButton>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-5">
        <section aria-label="Alimentos">
          <h4 className="mb-1 text-sm font-semibold text-ink">Alimentos</h4>
          {meal.foods.length === 0 ? (
            <p className="py-1">
              <NotRecorded />
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {meal.foods.map((entry) => {
                const consumed = trimTime(entry.consumed_time)
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <p className="font-medium break-words">
                        {entry.food_name}
                        {entry.quantity && <span className="ml-2 font-normal text-ink-soft">{entry.quantity}</span>}
                      </p>
                      {(consumed || entry.observations) && (
                        <p className="text-sm break-words text-ink-soft">
                          {consumed && consumed !== time ? `às ${consumed}` : null}
                          {consumed && consumed !== time && entry.observations ? ' – ' : null}
                          {entry.observations}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <IconButton label={`Editar ${entry.food_name}`} onClick={() => onEditFood(meal, entry)}>
                        <Pencil aria-hidden className="size-4" />
                      </IconButton>
                      <IconButton label={`Excluir ${entry.food_name} desta refeição`} tone="danger" onClick={() => onRemoveFood(meal, entry)}>
                        <Trash2 aria-hidden className="size-4" />
                      </IconButton>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <FeelingChips tags={meal.feeling_tags} />

        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-sm font-semibold text-ink">Como me senti</dt>
            <dd className="whitespace-pre-wrap break-words">{meal.feelings ? meal.feelings : <NotRecorded />}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink">O que pensei</dt>
            <dd className="whitespace-pre-wrap break-words">{meal.thoughts ? meal.thoughts : <NotRecorded />}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink">Observações</dt>
            <dd className="whitespace-pre-wrap break-words">{meal.observations ? meal.observations : <NotRecorded />}</dd>
          </div>
        </dl>

        <div>
          <Button variant="secondary" icon={<Plus aria-hidden className="size-4" />} onClick={() => onAddFood(meal)}>
            Adicionar alimento
          </Button>
        </div>
      </div>
    </article>
  )
}
