import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, Plus, Sprout } from 'lucide-react'
import { MonthCalendar } from '@/components/calendar/MonthCalendar'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { useCalendarMonth, useDashboard, useDay } from '@/hooks/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatLongDate, greeting, parseISO, relativeDayLabel, todayISO, trimTime } from '@/lib/dates'
import { experienceTypeLabel, MEAL_TYPES, mealTypeLabel } from '@/lib/domain'
import { plural, summarizeList } from '@/lib/format'
import type { RecentItem } from '@/types/database'

function recentLine(item: RecentItem): { text: string; detail: string; to: string } {
  if (item.kind === 'meal') {
    const time = trimTime(item.detail.meal_time)
    return {
      text: `${mealTypeLabel(item.detail.meal_type)}${time ? ` às ${time}` : ''}`,
      detail: item.detail.foods.length > 0 ? summarizeList(item.detail.foods, 4) : 'Sem alimentos lançados',
      to: `/diario/${item.date}`,
    }
  }
  return {
    text: `Experiência com ${item.detail.food_name}`,
    detail: experienceTypeLabel(item.detail.experience_type),
    to: `/experiencias/${item.id}`,
  }
}

/** Painel principal (padrão Dashboard): um olhar sobre hoje e as últimas atividades. */
export function HomePage() {
  useDocumentTitle('Início')
  const navigate = useNavigate()
  const today = todayISO()
  const start = parseISO(today)
  const [month, setMonth] = useState({ year: start.year, month: start.month })

  const dashboard = useDashboard(today)
  const day = useDay(today)
  const calendar = useCalendarMonth(month.year, month.month)

  const counts = dashboard.data?.today
  const summary = counts
    ? counts.meal_count + counts.food_count + counts.experience_count === 0
      ? 'Nada registrado hoje ainda.'
      : `Hoje: ${plural(counts.meal_count, 'refeição', 'refeições')}, ${plural(counts.food_count, 'alimento', 'alimentos')} e ${plural(counts.experience_count, 'experiência', 'experiências')}.`
    : ''

  return (
    <>
      <section className="mb-8 md:mb-10">
        <p className="text-ink-soft first-letter:uppercase">{formatLongDate(today)}</p>
        <h1 className="mt-1 text-[2.25rem] leading-tight md:text-5xl">{greeting()}</h1>
        <p className="mt-2 min-h-6 text-ink-soft" aria-live="polite">
          {summary}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink to={`/diario/${today}`} variant="primary" icon={<Plus aria-hidden className="size-4" />}>
            Adicionar refeição
          </ButtonLink>
          <ButtonLink to="/experiencias" variant="secondary" icon={<Sprout aria-hidden className="size-4" />}>
            Registrar experiência alimentar
          </ButtonLink>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="today-heading" className="rounded-card border border-line bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 id="today-heading" className="text-xl">
                Refeições de hoje
              </h2>
              <Link to={`/diario/${today}`} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold text-sage-800 hover:bg-sage-100">
                <BookOpen aria-hidden className="size-4" />
                Abrir diário
              </Link>
            </div>

            {day.isLoading && (
              <LoadingArea loading label="Carregando as refeições de hoje" className="p-5">
                <CardSkeleton lines={4} />
              </LoadingArea>
            )}
            {day.isError && (
              <div className="p-5">
                <ErrorPanel error={day.error} onRetry={() => void day.refetch()} />
              </div>
            )}
            {day.data && (
              <ul className="divide-y divide-line">
                {MEAL_TYPES.map((type) => {
                  const meals = day.data.meals.filter((m) => m.meal_type === type.value)
                  const foods = meals.flatMap((m) => m.foods.map((f) => f.food_name))
                  const times = meals.map((m) => trimTime(m.meal_time)).filter(Boolean)
                  return (
                    <li key={type.value}>
                      <Link
                        to={`/diario/${today}`}
                        className="flex min-h-14 items-center gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-sage-50"
                      >
                        <span className="w-36 shrink-0 font-medium sm:w-44">{type.label}</span>
                        <span className="min-w-0 flex-1 text-ink-soft">
                          {meals.length === 0 ? (
                            'Não registrado'
                          ) : (
                            <>
                              {times.length > 0 && <span className="mr-2">{times.join(', ')}</span>}
                              {foods.length > 0 ? summarizeList(foods, 4) : 'Sem alimentos lançados'}
                            </>
                          )}
                        </span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-soft" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent-heading" className="rounded-card border border-line bg-card">
            <h2 id="recent-heading" className="border-b border-line px-5 py-4 text-xl">
              Últimas atividades
            </h2>
            {dashboard.isLoading && (
              <LoadingArea loading label="Carregando as últimas atividades" className="p-5">
                <CardSkeleton lines={3} />
              </LoadingArea>
            )}
            {dashboard.isError && (
              <div className="p-5">
                <ErrorPanel error={dashboard.error} onRetry={() => void dashboard.refetch()} />
              </div>
            )}
            {dashboard.data && dashboard.data.recent.length === 0 && (
              <EmptyState
                icon={<BookOpen className="size-5" />}
                title="Nenhuma atividade ainda"
                description="Refeições e experiências que você registrar aparecem aqui, da mais recente para a mais antiga."
                action={
                  <ButtonLink to={`/diario/${today}`} variant="primary">
                    Adicionar refeição
                  </ButtonLink>
                }
              />
            )}
            {dashboard.data && dashboard.data.recent.length > 0 && (
              <ul className="divide-y divide-line">
                {dashboard.data.recent.map((item) => {
                  const line = recentLine(item)
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link to={line.to} className="flex min-h-14 items-center gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-sage-50">
                        <span
                          aria-hidden
                          className={`size-2 shrink-0 rounded-full ${item.kind === 'meal' ? 'bg-sage-600' : 'bg-umber-500'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium break-words">{line.text}</span>
                          <span className="block text-sm break-words text-ink-soft">{line.detail}</span>
                        </span>
                        <span className="shrink-0 text-sm text-ink-soft">{relativeDayLabel(item.date, today)}</span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-soft" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <MonthCalendar
          year={month.year}
          month={month.month}
          today={today}
          marks={calendar.data ?? []}
          loading={calendar.isFetching}
          onMonthChange={(year, m) => setMonth({ year, month: m })}
          onSelect={(iso) => navigate(`/diario/${iso}`)}
        />
      </div>
    </>
  )
}
