import { Info } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExperiencesByMonthChart, TopFoodsChart } from '@/components/charts/Charts'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { TextField } from '@/components/ui/Field'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { useReport } from '@/hooks/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { addDays, formatShortDate, monthBounds, parseISO, todayISO, trimTime } from '@/lib/dates'
import { experienceTypeLabel } from '@/lib/domain'
import { validatePeriod } from '@/lib/validation'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-card px-5 py-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-auto pt-2 font-display text-[2rem] leading-none font-semibold text-ink">{value}</dd>
    </div>
  )
}

/** Relatório (padrão Análise): números e gráficos do período, sem metas nem juízo de valor. */
export function ReportsPage() {
  useDocumentTitle('Relatório')
  const today = todayISO()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const periodError = validatePeriod(from, to)
  const report = useReport(from, to, !periodError)

  const now = parseISO(today)
  const presets = [
    { label: 'Tudo', from: '', to: '' },
    { label: 'Este mês', ...monthBounds(now.year, now.month) },
    { label: 'Últimos 30 dias', from: addDays(today, -29), to: today },
  ]

  const data = report.data
  const nothing = data && data.totals.meal_count === 0 && data.totals.experience_count === 0

  return (
    <>
      <section aria-label="Período do relatório" className="mb-6 flex flex-col gap-4 rounded-card border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Períodos prontos">
          {presets.map((p) => {
            const active = p.from === from && p.to === to
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFrom(p.from)
                  setTo(p.to)
                }}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full border px-4 text-[0.95rem] font-semibold transition-colors duration-150',
                  active ? 'border-sage-700 bg-sage-700 text-white' : 'border-line-strong bg-card text-ink hover:border-sage-500 hover:bg-sage-50',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <TextField label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {periodError && (
          <p role="alert" className="text-sm text-danger">
            {periodError}
          </p>
        )}
      </section>

      {report.isLoading && !periodError && (
        <LoadingArea loading label="Carregando o relatório" className="flex flex-col gap-4">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={4} />
        </LoadingArea>
      )}
      {report.isError && <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />}

      {data && !periodError && nothing && (
        <EmptyState
          tone="dashed"
          title="Nada registrado neste período"
          description="Quando houver refeições ou experiências no período escolhido, os números e gráficos aparecem aqui."
          action={
            <ButtonLink to={`/diario/${today}`} variant="primary">
              Adicionar refeição
            </ButtonLink>
          }
          secondaryAction={
            from || to ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setFrom('')
                  setTo('')
                }}
              >
                Limpar período
              </Button>
            ) : undefined
          }
        />
      )}

      {data && !periodError && !nothing && (
        <div className={cn('flex flex-col gap-8 transition-opacity duration-150', report.isPlaceholderData && 'opacity-60')}>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totais do período">
            <Stat label="Refeições registradas" value={data.totals.meal_count} />
            <Stat label="Alimentos diferentes registrados" value={data.totals.distinct_foods_registered} />
            <Stat label="Alimentos experimentados" value={data.totals.foods_tried} />
            <Stat label="Experiências alimentares" value={data.totals.experience_count} />
          </dl>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <section aria-labelledby="top-foods-title" className="rounded-card border border-line bg-card p-5">
              <h2 id="top-foods-title" className="text-xl">
                Alimentos mais registrados
              </h2>
              <p className="mt-1 mb-4 text-sm text-ink-soft">Quantas vezes cada alimento apareceu em refeições.</p>
              {data.top_foods.length > 0 ? (
                <TopFoodsChart data={data.top_foods} />
              ) : (
                <p className="text-ink-soft">Nenhum alimento lançado em refeições neste período.</p>
              )}
            </section>

            <section aria-labelledby="by-month-title" className="rounded-card border border-line bg-card p-5">
              <h2 id="by-month-title" className="text-xl">
                Experiências por mês
              </h2>
              <p className="mt-1 mb-4 text-sm text-ink-soft">Alimentos novos e substituições registrados em cada mês.</p>
              {data.experiences_by_month.length > 0 ? (
                <ExperiencesByMonthChart data={data.experiences_by_month} />
              ) : (
                <p className="text-ink-soft">Nenhuma experiência registrada neste período.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="period-timeline-title" className="rounded-card border border-line bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 id="period-timeline-title" className="text-xl">
                Experiências do período
              </h2>
              <Link to="/historico/linha-do-tempo" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-sage-800 hover:bg-sage-100">
                Ver linha do tempo completa
              </Link>
            </div>
            {data.timeline.length === 0 ? (
              <p className="px-5 py-6 text-ink-soft">Nenhuma experiência registrada neste período.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.timeline.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/experiencias/${e.id}`}
                      className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 transition-colors duration-150 hover:bg-sage-50"
                    >
                      <span className="w-28 shrink-0 text-ink-soft">
                        {formatShortDate(e.experience_date)}
                        {trimTime(e.experience_time) && <span className="ml-1.5 text-sm">{trimTime(e.experience_time)}</span>}
                      </span>
                      <span className="min-w-0 flex-1 font-medium break-words">{e.food_name}</span>
                      <Chip tone="earth">{experienceTypeLabel(e.experience_type)}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="flex items-start gap-2.5 rounded-2xl bg-sage-50 px-4 py-3 text-[0.95rem] text-ink-soft">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-sage-700" />
            Este relatório só conta o que foi registrado. Ele não avalia a alimentação nem indica o que é melhor ou pior.
          </p>
        </div>
      )}
    </>
  )
}
