import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { SettingsSection } from '@/components/layout/SettingsSection'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { controlClasses, FieldShell } from '@/components/ui/Field'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useAppMutation, useMealSchedule } from '@/hooks/queries'
import { getErrorMessage } from '@/lib/errors'
import { mealTypeLabel, type MealTypeValue } from '@/lib/domain'
import { cn } from '@/lib/cn'
import { formatHour, reminderTimes, sameSchedule, toMinutes, validateSchedule, type ScheduleItem } from '@/lib/schedule'
import { resetMealSchedule, saveMealSchedule } from '@/services/reminders'
import { useQueryClient } from '@tanstack/react-query'

function ScheduleForm({ initial }: { initial: ScheduleItem[] }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [touched, setTouched] = useState<Partial<Record<MealTypeValue, boolean>>>({})
  const [confirmReset, setConfirmReset] = useState(false)
  // O foco que o Salvar leva ao primeiro campo com erro não pode apagar o erro que acabou de aparecer.
  const focusedBySubmit = useRef(false)

  const errors = validateSchedule(rows)
  const dirty = !sameSchedule(rows, initial)

  const save = useAppMutation(saveMealSchedule, { success: 'Horários salvos.' })
  const reset = useMutation({
    mutationFn: resetMealSchedule,
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      setConfirmReset(false)
      toast.success('Horários padrão restaurados.')
    },
    onError: (error) => {
      setConfirmReset(false)
      toast.error(getErrorMessage(error))
    },
  })

  function update(meal: MealTypeValue, patch: Partial<ScheduleItem>) {
    setRows((current) => current.map((row) => (row.meal_type === meal ? { ...row, ...patch } : row)))
  }
  // Erro some no primeiro toque no campo e só volta quando a pessoa sai dele.
  const untouch = (meal: MealTypeValue) => setTouched((t) => ({ ...t, [meal]: false }))
  const onFieldFocus = (meal: MealTypeValue) => {
    if (focusedBySubmit.current) {
      focusedBySubmit.current = false
      return
    }
    untouch(meal)
  }
  const touch = (meal: MealTypeValue) => setTouched((t) => ({ ...t, [meal]: true }))

  function submit() {
    setTouched(Object.fromEntries(rows.map((r) => [r.meal_type, true])))
    const firstBad = rows.find((r) => errors[r.meal_type])
    if (firstBad) {
      focusedBySubmit.current = true
      document.getElementById(`schedule-${firstBad.meal_type}-start`)?.focus()
      return
    }
    save.mutate(rows)
  }

  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {rows.map((row) => {
          const label = mealTypeLabel(row.meal_type)
          const error = touched[row.meal_type] ? errors[row.meal_type] : undefined
          const valid = !errors[row.meal_type]
          const times = valid ? reminderTimes(row.start_time, row.end_time) : null
          const crossesMidnight = valid && toMinutes(row.end_time) <= toMinutes(row.start_time)
          const hint = !row.enabled
            ? 'Sem lembretes para esta refeição.'
            : times
              ? `Avisos às ${formatHour(times.mid)} e às ${formatHour(times.late)}${crossesMidnight ? ', já na madrugada. Conta como o dia em que o horário começou.' : '.'}`
              : undefined
          return (
            <fieldset key={row.meal_type} className="rounded-2xl border border-line p-4">
              <legend className="px-1.5 text-base font-semibold text-ink">{label}</legend>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <FieldShell id={`schedule-${row.meal_type}-start`} label="Começa às" className="w-36">
                  <input
                    id={`schedule-${row.meal_type}-start`}
                    type="time"
                    value={row.start_time}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`schedule-${row.meal_type}-note`}
                    className={controlClasses(Boolean(error))}
                    onFocus={() => onFieldFocus(row.meal_type)}
                    onChange={(e) => {
                      untouch(row.meal_type)
                      update(row.meal_type, { start_time: e.target.value })
                    }}
                    onBlur={() => touch(row.meal_type)}
                  />
                </FieldShell>
                <FieldShell id={`schedule-${row.meal_type}-end`} label="Termina às" className="w-36">
                  <input
                    id={`schedule-${row.meal_type}-end`}
                    type="time"
                    value={row.end_time}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`schedule-${row.meal_type}-note`}
                    className={controlClasses(Boolean(error))}
                    onFocus={() => onFieldFocus(row.meal_type)}
                    onChange={(e) => {
                      untouch(row.meal_type)
                      update(row.meal_type, { end_time: e.target.value })
                    }}
                    onBlur={() => touch(row.meal_type)}
                  />
                </FieldShell>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-ink">
                  <input
                    id={`schedule-${row.meal_type}-enabled`}
                    type="checkbox"
                    checked={row.enabled}
                    className="size-5 accent-sage-700"
                    onChange={(e) => update(row.meal_type, { enabled: e.target.checked })}
                  />
                  Avisar nesta refeição
                </label>
              </div>
              <p
                id={`schedule-${row.meal_type}-note`}
                role={error ? 'alert' : undefined}
                className={cn('mt-2 text-sm', error ? 'text-danger' : 'text-ink-soft')}
              >
                {error ?? hint}
              </p>
            </fieldset>
          )
        })}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={save.isPending}>
            Salvar horários
          </Button>
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            Restaurar horários padrão
          </Button>
          {dirty && (
            <span role="status" className="text-sm text-ink-soft">
              Alterações ainda não salvas.
            </span>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar os horários padrão?"
        confirmLabel="Restaurar horários"
        loading={reset.isPending}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
      >
        Seus horários e as refeições com aviso ligado ou desligado voltam ao original: café da manhã 8h às 9h, lanche da manhã 9h às 10h, almoço 12h às 13h, lanche da tarde 16h às 17h, jantar 21h às 22h e ceia 23h à 1h.
      </ConfirmDialog>
    </>
  )
}

/** Horários de cada refeição: o lembrete só chega dentro deles. */
export function ScheduleEditor() {
  const schedule = useMealSchedule()
  return (
    <SettingsSection id="schedule-title" title="Horários das refeições">
      <p>
        Os lembretes só chegam dentro do horário de cada refeição (horário de Brasília), e só se ela ainda não tiver registro nem “Não fiz”. A ceia pode passar da meia-noite.
      </p>
      {schedule.isLoading && (
        <LoadingArea loading label="Carregando os horários">
          <CardSkeleton lines={2} />
        </LoadingArea>
      )}
      {schedule.isError && (
        <ErrorPanel error={schedule.error} onRetry={() => void schedule.refetch()} title="Não foi possível carregar os horários" />
      )}
      {schedule.data && <ScheduleForm key={JSON.stringify(schedule.data)} initial={schedule.data} />}
    </SettingsSection>
  )
}
