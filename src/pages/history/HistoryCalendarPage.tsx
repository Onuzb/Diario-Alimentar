import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { MonthCalendar } from '@/components/calendar/MonthCalendar'
import { FeelingChips } from '@/components/feelings/FeelingChips'
import { MealSummary } from '@/components/meals/MealSummary'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { TextField } from '@/components/ui/Field'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { useCalendarMonth, useDay, useHistory } from '@/hooks/queries'
import { useDebouncedValue } from '@/hooks/useDelayed'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatLongDate, formatShortDate, parseISO, todayISO, trimTime } from '@/lib/dates'
import { experienceTypeLabel, MEAL_TYPES, mealTypeLabel } from '@/lib/domain'
import { plural, summarizeList } from '@/lib/format'
import { validatePeriod } from '@/lib/validation'
import type { HistoryDay } from '@/types/database'

/** Um dia em modo leitura: as seis refeições, as experiências e as observações. */
function DayDetail({ date }: { date: string }) {
  const { data, isLoading, isError, error, refetch } = useDay(date)
  const hasAnything = Boolean(data && (data.meals.length > 0 || data.experiences.length > 0 || data.diary?.general_observations))

  return (
    <section aria-labelledby="day-detail-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="day-detail-title" className="text-xl first-letter:uppercase">
          {formatLongDate(date)}
        </h2>
        <ButtonLink to={`/diario/${date}`} variant={hasAnything ? 'secondary' : 'primary'}>
          {hasAnything ? 'Editar no diário' : 'Adicionar refeição'}
        </ButtonLink>
      </div>

      {isLoading && (
        <LoadingArea loading label="Carregando o dia" className="flex flex-col gap-3">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
        </LoadingArea>
      )}
      {isError && <ErrorPanel error={error} onRetry={() => void refetch()} />}

      {data && (
        <>
          <ul className="flex flex-col gap-3">
            {MEAL_TYPES.map((type) => {
              const meals = data.meals.filter((m) => m.meal_type === type.value)
              if (meals.length === 0) {
                return (
                  <li
                    key={type.value}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-2"
                  >
                    <span className="font-medium">{type.label}</span>
                    <span className="text-ink-soft">Não registrado</span>
                  </li>
                )
              }
              return meals.map((meal) => (
                <li key={meal.id}>
                  <MealSummary meal={meal} />
                </li>
              ))
            })}
          </ul>

          {data.experiences.length > 0 && (
            <section aria-labelledby="day-exp-title" className="rounded-2xl border border-line bg-card p-4">
              <h3 id="day-exp-title" className="text-lg">
                Experiências do dia
              </h3>
              <ul className="mt-2 divide-y divide-line">
                {data.experiences.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/experiencias/${e.id}`}
                      className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:text-sage-800"
                    >
                      <span className="font-medium break-words">{e.food_name}</span>
                      <Chip tone="earth">{experienceTypeLabel(e.experience_type)}</Chip>
                      {trimTime(e.experience_time) && <span className="text-sm text-ink-soft">{trimTime(e.experience_time)}</span>}
                      <FeelingChips tags={e.feeling_tags} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="day-notes-title" className="rounded-2xl border border-line bg-card p-4">
            <h3 id="day-notes-title" className="text-lg">
              Observações do dia
            </h3>
            {data.diary?.general_observations ? (
              <p className="mt-1 whitespace-pre-wrap break-words">{data.diary.general_observations}</p>
            ) : (
              <p className="mt-1 text-ink-soft">Não registrado</p>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function resultLine(day: HistoryDay): string[] {
  const lines = day.meals.map((m) => {
    const time = trimTime(m.meal_time)
    const foods = m.foods.length > 0 ? summarizeList(m.foods, 4) : 'sem alimentos lançados'
    return `${mealTypeLabel(m.meal_type)}${time ? ` ${time}` : ''}: ${foods}`
  })
  for (const e of day.experiences) lines.push(`Experiência com ${e.food_name} (${experienceTypeLabel(e.experience_type)})`)
  return lines
}

/** Resultado da pesquisa: dias que combinam com o alimento e o período. */
function SearchResults({
  query,
  from,
  to,
  periodError,
  onClear,
}: {
  query: string
  from: string
  to: string
  periodError: string | null
  onClear: () => void
}) {
  const history = useHistory({ query, from, to }, !periodError && (query !== '' || from !== '' || to !== ''))
  const days = history.data?.pages.flatMap((p) => p.days) ?? []
  const total = history.data?.pages[0]?.total ?? 0

  if (periodError) {
    return (
      <EmptyState
        tone="dashed"
        title="Confira o período"
        description={`${periodError} Ajuste as datas para ver os resultados.`}
        action={<Button variant="secondary" onClick={onClear}>Limpar filtros</Button>}
      />
    )
  }

  return (
    <section aria-labelledby="results-title" className="flex flex-col gap-3">
      <h2 id="results-title" className="text-xl">
        Resultados
      </h2>

      {history.isPending && (
        <LoadingArea loading label="Pesquisando" className="flex flex-col gap-3">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
        </LoadingArea>
      )}
      {history.isError && <ErrorPanel error={history.error} onRetry={() => void history.refetch()} />}

      {history.data && days.length === 0 && (
        <EmptyState
          tone="dashed"
          title="Nenhum dia encontrado"
          description="Nenhum registro combina com a pesquisa. Confira a escrita do alimento ou amplie o período."
          action={<Button variant="secondary" onClick={onClear}>Limpar filtros</Button>}
        />
      )}

      {days.length > 0 && (
        <>
          <p className="text-sm text-ink-soft" aria-live="polite">
            {plural(total, 'dia encontrado', 'dias encontrados')}.
          </p>
          <ul className="flex flex-col gap-3">
            {days.map((day) => (
              <li key={day.date}>
                <Link
                  to={`/diario/${day.date}`}
                  className="block rounded-2xl border border-line bg-card p-4 transition-colors duration-150 hover:border-sage-400 hover:bg-sage-50"
                >
                  <span className="block font-medium first-letter:uppercase">{formatLongDate(day.date)}</span>
                  <span className="sr-only">{formatShortDate(day.date)}</span>
                  <span className="mt-1.5 flex flex-col gap-0.5 text-sm text-ink-soft">
                    {resultLine(day).map((line, i) => (
                      <span key={i} className="break-words">
                        {line}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {history.hasNextPage && (
            <div>
              <Button variant="secondary" loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                Ver mais dias
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Histórico (padrão Calendário): escolha um dia no calendário ou pesquise por alimento e período. */
export function HistoryCalendarPage() {
  useDocumentTitle('Histórico')
  const today = todayISO()
  const start = parseISO(today)
  const [month, setMonth] = useState({ year: start.year, month: start.month })
  const [selected, setSelected] = useState(today)
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const debounced = useDebouncedValue(query.trim(), 300)
  const hasFilters = query.trim() !== '' || from !== '' || to !== ''
  const periodError = validatePeriod(from, to)
  const calendar = useCalendarMonth(month.year, month.month)

  function clearFilters() {
    setQuery('')
    setFrom('')
    setTo('')
  }

  function selectDay(iso: string) {
    setSelected(iso)
    const p = parseISO(iso)
    if (p.year !== month.year || p.month !== month.month) setMonth({ year: p.year, month: p.month })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        <form
          noValidate
          onSubmit={(e) => e.preventDefault()}
          aria-label="Pesquisar no histórico"
          className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 sm:p-5"
        >
          <TextField
            label="Pesquisar por alimento"
            type="search"
            value={query}
            maxLength={80}
            placeholder="Por exemplo, banana"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
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

        <MonthCalendar
          year={month.year}
          month={month.month}
          today={today}
          selected={hasFilters ? undefined : selected}
          marks={calendar.data ?? []}
          loading={calendar.isFetching}
          onMonthChange={(year, m) => setMonth({ year, month: m })}
          onSelect={(iso) => {
            if (hasFilters) clearFilters()
            selectDay(iso)
          }}
        />
        {calendar.isError && <ErrorPanel error={calendar.error} onRetry={() => void calendar.refetch()} title="Não foi possível carregar o calendário" />}
      </div>

      <div className="min-w-0">
        {hasFilters ? (
          <SearchResults query={debounced} from={from} to={to} periodError={periodError} onClear={clearFilters} />
        ) : (
          <DayDetail key={selected} date={selected} />
        )}
        {!hasFilters && !calendar.data?.length && !calendar.isLoading && (
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-soft">
            <CalendarDays aria-hidden className="size-4 shrink-0" />
            Os dias com registro ganham um ponto no calendário.
          </p>
        )}
      </div>
    </div>
  )
}
