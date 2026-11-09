import { FeelingChips } from '@/components/feelings/FeelingChips'
import { trimTime } from '@/lib/dates'
import { mealTypeLabel } from '@/lib/domain'
import type { Meal } from '@/types/database'

/** Refeição em modo leitura (histórico): mostra só o que foi registrado. */
export function MealSummary({ meal }: { meal: Meal }) {
  const time = trimTime(meal.meal_time)
  const label = mealTypeLabel(meal.meal_type)
  return (
    <article aria-label={time ? `${label} às ${time}` : label} className="rounded-2xl border border-line bg-card p-4">
      <h3 className="text-lg leading-snug">
        {label}
        {time && <span className="ml-2 text-base font-normal text-ink-soft">{time}</span>}
      </h3>

      {meal.foods.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-0.5">
          {meal.foods.map((f) => (
            <li key={f.id} className="break-words">
              {f.food_name}
              {f.quantity && <span className="ml-2 text-ink-soft">{f.quantity}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-ink-soft">Nenhum alimento registrado</p>
      )}

      {meal.feeling_tags.length > 0 && (
        <div className="mt-3">
          <FeelingChips tags={meal.feeling_tags} />
        </div>
      )}

      {(meal.feelings || meal.thoughts || meal.observations) && (
        <dl className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
          {meal.feelings && (
            <div>
              <dt className="text-sm font-semibold">Como me senti</dt>
              <dd className="whitespace-pre-wrap break-words">{meal.feelings}</dd>
            </div>
          )}
          {meal.thoughts && (
            <div>
              <dt className="text-sm font-semibold">O que pensei</dt>
              <dd className="whitespace-pre-wrap break-words">{meal.thoughts}</dd>
            </div>
          )}
          {meal.observations && (
            <div>
              <dt className="text-sm font-semibold">Observações</dt>
              <dd className="whitespace-pre-wrap break-words">{meal.observations}</dd>
            </div>
          )}
        </dl>
      )}
    </article>
  )
}
