import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ExperienceCard } from '@/components/experiences/ExperienceCard'
import { ExperienceDeleteDialog } from '@/components/experiences/ExperienceDeleteDialog'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { useFoodDetail } from '@/hooks/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatShortDate, todayISO, trimTime } from '@/lib/dates'
import { mealTypeLabel } from '@/lib/domain'
import { plural } from '@/lib/format'
import type { Experience } from '@/types/database'

/** Um alimento (padrão Detalhe): onde apareceu e as experiências ligadas a ele. */
export function FoodDetailPage() {
  const { id } = useParams()
  const { data, isLoading, isError, error, refetch } = useFoodDetail(id)
  const [toDelete, setToDelete] = useState<Experience | null>(null)
  useDocumentTitle(data?.food?.name ?? 'Alimento')

  const back = (
    <Link to="/alimentos" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 font-semibold text-sage-800 hover:underline">
      <ArrowLeft aria-hidden className="size-4" />
      Alimentos registrados
    </Link>
  )

  if (isLoading) {
    return (
      <>
        {back}
        <LoadingArea loading label="Carregando o alimento" className="flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </LoadingArea>
      </>
    )
  }

  if (isError) {
    return (
      <>
        {back}
        <ErrorPanel error={error} onRetry={() => void refetch()} />
      </>
    )
  }

  if (!data?.food) {
    return (
      <>
        {back}
        <EmptyState
          tone="dashed"
          title="Alimento não encontrado"
          description="Ele pode ter sido excluído. Volte para a lista para ver os alimentos que existem."
          action={
            <ButtonLink to="/alimentos" variant="primary">
              Ver alimentos registrados
            </ButtonLink>
          }
        />
      </>
    )
  }

  const food = data.food
  const first = food.first_record_date

  return (
    <>
      {back}
      <header className="mb-8">
        <h1 className="text-[1.75rem] leading-tight break-words md:text-[2.25rem]">{food.name}</h1>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-ink-soft">
          <div>
            <dt className="text-sm">Primeiro registro</dt>
            <dd className="font-medium text-ink">{first ? formatShortDate(first) : 'Sem registro'}</dd>
          </div>
          <div>
            <dt className="text-sm">Vezes consumido</dt>
            <dd className="font-medium text-ink">{food.times_consumed}</dd>
          </div>
          <div>
            <dt className="text-sm">Experiências</dt>
            <dd className="font-medium text-ink">{food.experience_count}</dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="meals-heading" className="flex flex-col gap-3">
          <h2 id="meals-heading" className="text-xl">
            Refeições em que apareceu
          </h2>
          {data.meals.length === 0 ? (
            <EmptyState
              tone="dashed"
              title="Ainda não apareceu em refeições"
              description="Quando você adicionar este alimento a uma refeição, cada ocorrência aparece aqui."
              action={
                <ButtonLink to={`/diario/${todayISO()}`} variant="primary">
                  Adicionar refeição
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card">
              {data.meals.map((m) => (
                <li key={m.meal_food_id}>
                  <Link to={`/diario/${m.date}`} className="flex min-h-14 flex-col justify-center px-5 py-2.5 transition-colors duration-150 hover:bg-sage-50">
                    <span className="font-medium">
                      {formatShortDate(m.date)}
                      <span className="ml-2 font-normal text-ink-soft">
                        {mealTypeLabel(m.meal_type)}
                        {trimTime(m.consumed_time ?? m.meal_time) ? ` às ${trimTime(m.consumed_time ?? m.meal_time)}` : ''}
                      </span>
                    </span>
                    {(m.quantity || m.observations) && (
                      <span className="text-sm break-words text-ink-soft">
                        {m.quantity}
                        {m.quantity && m.observations ? ' – ' : ''}
                        {m.observations}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-soft">{plural(data.meals.length, 'ocorrência', 'ocorrências')} em refeições.</p>
        </section>

        <section aria-labelledby="exp-heading" className="flex flex-col gap-3">
          <h2 id="exp-heading" className="text-xl">
            Experiências relacionadas
          </h2>
          {data.experiences.length === 0 ? (
            <EmptyState
              tone="dashed"
              title="Nenhuma experiência com este alimento"
              description="Se ele for novo para você, ou entrar no lugar de outro, registre como foi."
              action={
                <ButtonLink to={`/experiencias?alimento=${encodeURIComponent(food.name)}`} variant="primary">
                  Registrar experiência alimentar
                </ButtonLink>
              }
            />
          ) : (
            data.experiences.map((e) => <ExperienceCard key={e.id} experience={e} hideFood onDelete={setToDelete} />)
          )}
        </section>
      </div>

      <ExperienceDeleteDialog experience={toDelete} onClose={() => setToDelete(null)} />
    </>
  )
}
