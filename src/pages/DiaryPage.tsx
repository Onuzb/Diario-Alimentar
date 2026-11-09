import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Moon, Plus, Sandwich, Soup, Sprout, Utensils, Coffee, Cookie, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { AddFoodPanel } from '@/components/meals/AddFoodPanel'
import { MealCard } from '@/components/meals/MealCard'
import { MealFormPanel } from '@/components/meals/MealFormPanel'
import { Button, ButtonLink, IconButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TextArea, TextField } from '@/components/ui/Field'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { FeelingChips } from '@/components/feelings/FeelingChips'
import { useAppMutation, useDay } from '@/hooks/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { addDays, formatLongDate, isISODate, todayISO, trimTime } from '@/lib/dates'
import { experienceTypeLabel, LIMITS, MEAL_TYPES, mealTypeLabel, type MealTypeValue } from '@/lib/domain'
import { deleteMeal, removeFoodFromMeal, saveDayNotes } from '@/services/diaries'
import type { Meal, MealFood } from '@/types/database'

const MEAL_ICONS: Record<MealTypeValue, LucideIcon> = {
  breakfast: Coffee,
  morning_snack: Cookie,
  lunch: Utensils,
  afternoon_snack: Sandwich,
  dinner: Soup,
  supper: Moon,
}

/** /diario sem data abre o dia de hoje. */
export function DiaryRedirect() {
  return <Navigate to={`/diario/${todayISO()}`} replace />
}

/** /diario/:date com validação da data. */
export function DiaryRoute() {
  const { date = '' } = useParams()
  if (!isISODate(date)) return <Navigate to={`/diario/${todayISO()}`} replace />
  return <DiaryDay key={date} date={date} />
}

/** Tirar o último alimento de uma refeição sem horário, texto nem sentimentos apaga a refeição. */
function willEmptyMeal(meal: Meal): boolean {
  return (
    meal.foods.length === 1 &&
    !meal.meal_time &&
    !meal.feelings &&
    !meal.thoughts &&
    !meal.observations &&
    meal.feeling_tags.length === 0
  )
}

type MealPanelState = { mealType: MealTypeValue; meal?: Meal }
type FoodPanelState = { mealType: MealTypeValue; meal?: Meal; entry?: MealFood }
type ConfirmState = { kind: 'meal'; meal: Meal } | { kind: 'food'; meal: Meal; entry: MealFood }

function DayNotes({ date, initial }: { date: string; initial: string }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState('')
  const mutation = useAppMutation((notes: string) => saveDayNotes(date, notes), {
    success: 'Observações do dia salvas.',
  })

  function save() {
    if (value.length > LIMITS.longText) {
      setError(`Use até ${LIMITS.longText} caracteres.`)
      return
    }
    setError('')
    mutation.mutate(value)
  }

  return (
    <section aria-label="Observações do dia" className="rounded-card border border-line bg-card p-5">
      <TextArea
        label="Observações do dia"
        optional
        rows={3}
        hint="Algo que valeu para o dia todo, e não só para uma refeição."
        value={value}
        error={error}
        onChange={(e) => {
          setValue(e.target.value)
          if (error) setError('')
        }}
      />
      <Button variant="secondary" className="mt-3" loading={mutation.isPending} onClick={save}>
        Salvar observações
      </Button>
    </section>
  )
}

function DiaryDay({ date }: { date: string }) {
  const today = todayISO()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useDay(date)
  const [mealPanel, setMealPanel] = useState<MealPanelState | null>(null)
  const [foodPanel, setFoodPanel] = useState<FoodPanelState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  useDocumentTitle('Meu diário')

  const deleteMealMutation = useAppMutation(deleteMeal, {
    success: 'Refeição excluída.',
    onSuccess: () => setConfirm(null),
  })
  const removeFoodMutation = useAppMutation(removeFoodFromMeal, {
    success: (res) => (res.meal_deleted ? 'Alimento removido. A refeição ficou vazia e foi excluída.' : 'Alimento removido da refeição.'),
    onSuccess: () => setConfirm(null),
  })

  const longDate = formatLongDate(date)

  return (
    <>
      <PageHeader title="Meu diário" description="Registre as refeições do dia e como você se sentiu com elas." />

      <div className="mb-6 flex flex-wrap items-end gap-x-3 gap-y-4 rounded-card border border-line bg-card p-4 sm:p-5">
        <IconButton label="Dia anterior" className="mb-0.5" onClick={() => navigate(`/diario/${addDays(date, -1)}`)}>
          <ChevronLeft aria-hidden className="size-5" />
        </IconButton>
        <TextField
          label="Data"
          type="date"
          containerClassName="w-44"
          value={date}
          onChange={(e) => {
            if (isISODate(e.target.value)) navigate(`/diario/${e.target.value}`)
          }}
        />
        <IconButton label="Próximo dia" className="mb-0.5" onClick={() => navigate(`/diario/${addDays(date, 1)}`)}>
          <ChevronRight aria-hidden className="size-5" />
        </IconButton>
        {date !== today && (
          <Button variant="secondary" className="mb-0.5" onClick={() => navigate(`/diario/${today}`)}>
            Ir para hoje
          </Button>
        )}
        <h2 className="mb-1 ml-auto basis-full text-[1.625rem] leading-tight first-letter:uppercase md:basis-auto md:text-3xl">
          {longDate}
        </h2>
      </div>

      {isLoading && (
        <LoadingArea loading label="Carregando o diário" className="flex flex-col gap-6">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </LoadingArea>
      )}

      {isError && <ErrorPanel error={error} onRetry={() => void refetch()} title="Não foi possível abrir este dia" />}

      {data && (
        <div className="flex flex-col gap-8">
          <DayNotes key={`${date}-${data.diary?.updated_at ?? 'novo'}`} date={date} initial={data.diary?.general_observations ?? ''} />

          <ol className="relative flex flex-col gap-8 md:before:absolute md:before:top-5 md:before:bottom-5 md:before:left-[1.125rem] md:before:w-px md:before:bg-line-strong">
            {MEAL_TYPES.map((type) => {
              const meals = data.meals.filter((m) => m.meal_type === type.value)
              const Icon = MEAL_ICONS[type.value]
              const headingId = `slot-${type.value}`
              return (
                <li key={type.value} className="relative md:pl-14">
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-0 left-0 hidden size-9 items-center justify-center rounded-full md:flex',
                      meals.length > 0 ? 'bg-sage-700 text-white' : 'border border-dashed border-line-strong bg-paper text-ink-soft',
                    )}
                  >
                    <Icon className="size-[1.125rem]" />
                  </span>
                  <section aria-labelledby={headingId} className="flex flex-col gap-3">
                    <h2 id={headingId} className="flex items-center gap-2.5 text-xl md:min-h-9">
                      <Icon aria-hidden className="size-5 text-sage-700 md:hidden" />
                      {type.label}
                    </h2>

                    {meals.length === 0 ? (
                      <div className="flex flex-col gap-4 rounded-card border border-dashed border-line-strong p-5">
                        <p className="text-ink-soft">Não registrado</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            icon={<Plus aria-hidden className="size-4" />}
                            onClick={() => setFoodPanel({ mealType: type.value })}
                          >
                            Adicionar alimento
                          </Button>
                          <Button variant="ghost" onClick={() => setMealPanel({ mealType: type.value })}>
                            Anotar como foi
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {meals.map((meal) => (
                          <MealCard
                            key={meal.id}
                            meal={meal}
                            onEdit={(m) => setMealPanel({ mealType: m.meal_type, meal: m })}
                            onDelete={(m) => setConfirm({ kind: 'meal', meal: m })}
                            onAddFood={(m) => setFoodPanel({ mealType: m.meal_type, meal: m })}
                            onEditFood={(m, entry) => setFoodPanel({ mealType: m.meal_type, meal: m, entry })}
                            onRemoveFood={(m, entry) => setConfirm({ kind: 'food', meal: m, entry })}
                          />
                        ))}
                        <div>
                          <Button
                            variant="ghost"
                            aria-label={`Adicionar outra ocorrência de ${type.label.toLowerCase()}`}
                            icon={<Plus aria-hidden className="size-4" />}
                            onClick={() => setFoodPanel({ mealType: type.value })}
                          >
                            Outra ocorrência
                          </Button>
                        </div>
                      </>
                    )}
                  </section>
                </li>
              )
            })}
          </ol>

          <section aria-labelledby="day-experiences" className="flex flex-col gap-3">
            <h2 id="day-experiences" className="text-xl">
              Experiências alimentares do dia
            </h2>
            {data.experiences.length === 0 ? (
              <p className="text-ink-soft">Nenhuma experiência registrada neste dia.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.experiences.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-card py-2 pr-2 pl-4">
                    <span className="font-medium">{e.food_name}</span>
                    <Chip tone="earth">{experienceTypeLabel(e.experience_type)}</Chip>
                    {e.experience_time && <span className="text-sm text-ink-soft">às {trimTime(e.experience_time)}</span>}
                    <FeelingChips tags={e.feeling_tags} />
                    <ButtonLink to={`/experiencias/${e.id}`} variant="ghost" className="ml-auto">
                      Abrir
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <ButtonLink to={`/experiencias?data=${date}`} variant="secondary" icon={<Sprout aria-hidden className="size-4" />}>
                + Registrar nova experiência alimentar
              </ButtonLink>
            </div>
          </section>
        </div>
      )}

      {mealPanel && (
        <MealFormPanel
          key={`${mealPanel.meal?.id ?? 'new'}-${mealPanel.mealType}`}
          open
          onClose={() => setMealPanel(null)}
          date={date}
          mealType={mealPanel.mealType}
          meal={mealPanel.meal}
        />
      )}

      {foodPanel && (
        <AddFoodPanel
          key={`${foodPanel.entry?.id ?? foodPanel.meal?.id ?? 'new'}-${foodPanel.mealType}`}
          open
          onClose={() => setFoodPanel(null)}
          date={date}
          mealType={foodPanel.mealType}
          meal={foodPanel.meal}
          entry={foodPanel.entry}
        />
      )}

      <ConfirmDialog
        open={confirm?.kind === 'meal'}
        title={
          confirm?.kind === 'meal'
            ? `Excluir ${mealTypeLabel(confirm.meal.meal_type).toLowerCase()}${confirm.meal.meal_time ? ` das ${trimTime(confirm.meal.meal_time)}` : ''}?`
            : ''
        }
        confirmLabel="Excluir refeição"
        loading={deleteMealMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === 'meal' && deleteMealMutation.mutate(confirm.meal.id)}
      >
        Os alimentos lançados e as anotações desta refeição serão apagados. Os alimentos continuam no cadastro.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === 'food'}
        title={
          confirm?.kind === 'food'
            ? `Excluir “${confirm.entry.food_name}” do ${mealTypeLabel(confirm.meal.meal_type).toLowerCase()}?`
            : ''
        }
        confirmLabel="Excluir alimento"
        loading={removeFoodMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === 'food' && removeFoodMutation.mutate(confirm.entry.id)}
      >
        O alimento sai só desta refeição e continua em Alimentos registrados.
        {confirm?.kind === 'food' && willEmptyMeal(confirm.meal) && ' Como a refeição ficará sem nenhum registro, ela também será excluída.'}
      </ConfirmDialog>
    </>
  )
}
