import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { buildMonthGrid, WEEKDAY_LABELS } from '@/lib/calendar'
import { cn } from '@/lib/cn'
import { addMonths, formatLongDate, formatMonthYear, parseISO } from '@/lib/dates'
import type { CalendarMark } from '@/types/database'

interface MonthCalendarProps {
  year: number
  month: number
  today: string
  selected?: string
  marks: readonly CalendarMark[]
  onSelect: (iso: string) => void
  onMonthChange: (year: number, month: number) => void
  loading?: boolean
}

function describeDay(iso: string, mark: CalendarMark | undefined): string {
  if (!mark) return formatLongDate(iso)
  const parts: string[] = []
  if (mark.meal_count > 0) parts.push(`${mark.meal_count} ${mark.meal_count === 1 ? 'refeição' : 'refeições'}`)
  if (mark.experience_count > 0) {
    parts.push(`${mark.experience_count} ${mark.experience_count === 1 ? 'experiência' : 'experiências'}`)
  }
  if (mark.has_notes && parts.length === 0) parts.push('observação do dia')
  return `${formatLongDate(iso)}, ${parts.join(' e ')}`
}

/** Calendário mensal. Dias com registro ganham pontos: verde para refeições, terra para experiências. */
export function MonthCalendar({ year, month, today, selected, marks, onSelect, onMonthChange, loading }: MonthCalendarProps) {
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month])
  const byDate = useMemo(() => new Map(marks.map((m) => [m.date, m])), [marks])
  const title = formatMonthYear(year, month)
  const prev = addMonths(year, month, -1)
  const next = addMonths(year, month, 1)
  const todayParts = parseISO(today)
  const isCurrentMonth = todayParts.year === year && todayParts.month === month

  return (
    <section aria-label={`Calendário de ${title}`} className="rounded-card border border-line bg-card p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 aria-live="polite" className="pl-1 text-xl first-letter:uppercase">
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {!isCurrentMonth && (
            <Button variant="ghost" className="min-h-11 px-3" onClick={() => onMonthChange(todayParts.year, todayParts.month)}>
              Hoje
            </Button>
          )}
          <IconButton label="Mês anterior" onClick={() => onMonthChange(prev.year, prev.month)}>
            <ChevronLeft aria-hidden className="size-5" />
          </IconButton>
          <IconButton label="Próximo mês" onClick={() => onMonthChange(next.year, next.month)}>
            <ChevronRight aria-hidden className="size-5" />
          </IconButton>
        </div>
      </div>

      <div role="grid" aria-label={title} aria-busy={loading || undefined} className={cn('transition-opacity duration-150', loading && 'opacity-60')}>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={i} role="columnheader" aria-label={d.long} className="py-1.5 text-center text-sm font-medium text-ink-soft">
              {d.short}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.iso} role="row" className="grid grid-cols-7">
            {week.map((cell) => {
              const mark = byDate.get(cell.iso)
              const isToday = cell.iso === today
              const isSelected = cell.iso === selected
              return (
                <div key={cell.iso} role="gridcell" className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => onSelect(cell.iso)}
                    aria-label={describeDay(cell.iso, mark)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'relative flex min-h-11 w-full max-w-12 flex-col items-center justify-center rounded-full text-[0.95rem] transition-colors duration-150',
                      isSelected
                        ? 'bg-sage-700 font-semibold text-white'
                        : cell.inMonth
                          ? 'text-ink hover:bg-sage-100'
                          : 'text-ink-soft/70 hover:bg-sage-50',
                      isToday && !isSelected && 'font-semibold ring-2 ring-sage-600 ring-inset',
                    )}
                  >
                    <span>{cell.day}</span>
                    <span aria-hidden className="absolute bottom-1 flex h-1.5 gap-1">
                      {mark && (mark.meal_count > 0 || mark.has_notes) && (
                        <span className={cn('size-1.5 rounded-full', isSelected ? 'bg-sage-100' : 'bg-sage-600')} />
                      )}
                      {mark && mark.experience_count > 0 && (
                        <span className={cn('size-1.5 rounded-full', isSelected ? 'bg-sand-200' : 'bg-umber-500')} />
                      )}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-1 text-sm text-ink-soft" aria-label="Legenda">
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-sage-600" />
          Refeições
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-umber-500" />
          Experiências
        </li>
      </ul>
    </section>
  )
}
