import { useMemo, useState } from 'react'
import { Sprout } from 'lucide-react'
import { ExperienceCard } from '@/components/experiences/ExperienceCard'
import { ExperienceDeleteDialog } from '@/components/experiences/ExperienceDeleteDialog'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { SelectField, TextField } from '@/components/ui/Field'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { useExperienceList, useFoods } from '@/hooks/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatMonthYear } from '@/lib/dates'
import { EXPERIENCE_TYPES, type ExperienceTypeValue } from '@/lib/domain'
import { plural } from '@/lib/format'
import { validatePeriod } from '@/lib/validation'
import type { Experience } from '@/types/database'

interface MonthGroup {
  key: string
  year: number
  month: number
  items: Experience[]
}

function groupByMonth(items: readonly Experience[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const item of items) {
    const key = item.experience_date.slice(0, 7)
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      group = { key, year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}

/** Linha do tempo (padrão Feed de atividade): experiências alimentares da mais recente para a mais antiga. */
export function TimelinePage() {
  useDocumentTitle('Linha do tempo')
  const [type, setType] = useState<ExperienceTypeValue | ''>('')
  const [foodId, setFoodId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [toDelete, setToDelete] = useState<Experience | null>(null)

  const periodError = validatePeriod(from, to)
  const hasFilters = type !== '' || foodId !== '' || from !== '' || to !== ''
  const foods = useFoods()
  const list = useExperienceList({ type, from, to, foodId }, !periodError)

  const experienceFoods = useMemo(() => (foods.data ?? []).filter((f) => f.experience_count > 0), [foods.data])
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data])
  const groups = useMemo(() => groupByMonth(items), [items])
  const total = list.data?.pages[0]?.total ?? 0

  function clearFilters() {
    setType('')
    setFoodId('')
    setFrom('')
    setTo('')
  }

  return (
    <>
      <form
        noValidate
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filtrar experiências"
        className="mb-6 flex flex-col gap-3 rounded-card border border-line bg-card p-4 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Tipo" value={type} onChange={(e) => setType(e.target.value as ExperienceTypeValue | '')}>
            <option value="">Todos os tipos</option>
            {EXPERIENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Alimento" value={foodId} onChange={(e) => setFoodId(e.target.value)}>
            <option value="">Todos os alimentos</option>
            {experienceFoods.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </SelectField>
          <TextField label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {periodError && (
          <p role="alert" className="text-sm text-danger">
            {periodError}
          </p>
        )}
        {hasFilters && (
          <div>
            <Button variant="ghost" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        )}
      </form>

      {list.isPending && !periodError && (
        <LoadingArea loading label="Carregando a linha do tempo" className="flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </LoadingArea>
      )}
      {list.isError && <ErrorPanel error={list.error} onRetry={() => void list.refetch()} />}

      {list.data && items.length === 0 && !hasFilters && (
        <EmptyState
          tone="dashed"
          icon={<Sprout className="size-5" />}
          title="Nenhuma experiência registrada"
          description="Registre quando provar um alimento novo ou trocar um alimento por outro. A linha do tempo mostra cada experiência em ordem."
          action={
            <ButtonLink to="/experiencias" variant="primary">
              Registrar experiência alimentar
            </ButtonLink>
          }
        />
      )}
      {list.data && items.length === 0 && hasFilters && (
        <EmptyState
          tone="dashed"
          title="Nenhuma experiência encontrada"
          description="Nenhum registro combina com os filtros escolhidos. Limpe os filtros para ver todas as experiências."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <>
          <p className="mb-4 text-sm text-ink-soft" aria-live="polite">
            {hasFilters ? `${plural(total, 'experiência encontrada', 'experiências encontradas')}.` : `${plural(total, 'experiência registrada', 'experiências registradas')}.`}
          </p>
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`month-${group.key}`}>
                <h2 id={`month-${group.key}`} className="mb-4 text-xl first-letter:uppercase">
                  {formatMonthYear(group.year, group.month)}
                </h2>
                <ol className="relative ml-2 border-l border-line-strong pl-6 md:ml-3 md:pl-8">
                  {group.items.map((experience) => (
                    <li key={experience.id} className="relative pb-5 last:pb-0">
                      <span
                        aria-hidden
                        className="absolute top-6 -left-[calc(1.5rem+0.3125rem+0.5px)] size-2.5 rounded-full bg-umber-500 ring-4 ring-paper md:-left-[calc(2rem+0.3125rem+0.5px)]"
                      />
                      <ExperienceCard experience={experience} onDelete={setToDelete} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {list.hasNextPage && (
            <div className="mt-6 flex flex-col items-start gap-2">
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                Ver mais experiências
              </Button>
              <p className="text-sm text-ink-soft">
                Mostrando {items.length} de {total}.
              </p>
            </div>
          )}
        </>
      )}

      <ExperienceDeleteDialog experience={toDelete} onClose={() => setToDelete(null)} />
    </>
  )
}
