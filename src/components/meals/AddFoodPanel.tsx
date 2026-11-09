import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Sprout } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { ExperienceForm } from '@/components/experiences/ExperienceForm'
import { FoodField } from '@/components/foods/FoodField'
import { Button } from '@/components/ui/Button'
import { TextArea, TextField } from '@/components/ui/Field'
import { SlideOver } from '@/components/ui/SlideOver'
import { useToast } from '@/components/ui/Toast'
import { useAppMutation, useFoods } from '@/hooks/queries'
import { useFoodField } from '@/hooks/useFoodField'
import { trimTime } from '@/lib/dates'
import { mealTypeDefaultTime, mealTypeLabel, type MealTypeValue } from '@/lib/domain'
import { addFoodFormSchema, type AddFoodFormValues } from '@/lib/validation'
import { addFoodToMeal, updateMealFood } from '@/services/diaries'
import type { Meal, MealFood } from '@/types/database'

interface AddFoodPanelProps {
  open: boolean
  onClose: () => void
  date: string
  mealType: MealTypeValue
  /** Refeição onde o alimento entra. Sem ela, a refeição é criada junto. */
  meal?: Meal
  /** Alimento já lançado (modo edição: muda quantidade, horário e observações). */
  entry?: MealFood
}

type Step = 'food' | 'experience'

/**
 * Painel "Adicionar alimento". Em um mesmo painel há dois passos em sequência:
 * o alimento e, se a pessoa quiser, "+ Registrar nova experiência alimentar".
 */
export function AddFoodPanel({ open, onClose, date, mealType, meal, entry }: AddFoodPanelProps) {
  const [step, setStep] = useState<Step>('food')
  const [experienceDirty, setExperienceDirty] = useState(false)
  const { data: foods = [] } = useFoods()
  const toast = useToast()
  const label = mealTypeLabel(mealType)

  const start = useMemo<AddFoodFormValues>(() => {
    // Refeição nova: horário típico da refeição (quem registra depois não precisa corrigir "agora").
    const fallbackTime = meal?.meal_time ? trimTime(meal.meal_time) : mealTypeDefaultTime(mealType)
    return {
      food_name: entry?.food_name ?? '',
      quantity: entry?.quantity ?? '',
      consumed_time: entry ? trimTime(entry.consumed_time) : fallbackTime,
      observations: entry?.observations ?? '',
    }
  }, [date, entry, meal, mealType])

  const form = useForm<AddFoodFormValues>({
    resolver: zodResolver(addFoodFormSchema),
    mode: 'onTouched',
    defaultValues: start,
  })
  const { register, setValue, getValues, clearErrors, formState } = form
  const { errors } = formState
  const foodField = useFoodField(foods, { id: entry?.food_id ?? null, name: start.food_name })
  const foodReg = register('food_name')

  // O erro do nome some na primeira tecla que corrige o campo.
  useEffect(() => {
    if (errors.food_name && foodField.text.trim()) clearErrors('food_name')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodField.text])

  const addMutation = useAppMutation(addFoodToMeal, {
    success: (_data, vars) => `“${vars.foodName}” adicionado ao ${label.toLowerCase()}.`,
    onSuccess: onClose,
  })
  const editMutation = useAppMutation(updateMealFood, {
    success: 'Alimento atualizado.',
    onSuccess: onClose,
  })

  async function submit(values: AddFoodFormValues) {
    if (entry) {
      editMutation.mutate({
        id: entry.id,
        quantity: values.quantity,
        consumedTime: values.consumed_time,
        observations: values.observations,
      })
      return
    }
    const food = await foodField.resolve()
    if (!food) return
    addMutation.mutate({
      mealId: meal?.id ?? null,
      date,
      mealType,
      foodId: food.id,
      foodName: food.name,
      quantity: values.quantity,
      consumedTime: values.consumed_time,
      observations: values.observations,
    })
  }

  const dirty =
    formState.isDirty || foodField.text !== start.food_name || (step === 'experience' && experienceDirty)

  const reg = (name: keyof AddFoodFormValues) => ({
    ...register(name),
    onInput: () => {
      if (errors[name]) clearErrors(name)
    },
  })

  const busy = addMutation.isPending || editMutation.isPending || formState.isSubmitting

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      dirty={dirty}
      title={
        step === 'experience'
          ? 'Registrar experiência alimentar'
          : entry
            ? `Editar ${entry.food_name}`
            : `Adicionar alimento ao ${label.toLowerCase()}`
      }
      description={
        step === 'experience'
          ? 'Para alimento novo ou substituição. Depois você volta para a refeição.'
          : 'Só o nome do alimento é obrigatório.'
      }
    >
      {step === 'food' ? (
        <form
          noValidate
          onSubmit={(event) => {
            setValue('food_name', foodField.text)
            void form.handleSubmit(submit)(event)
          }}
          className="flex flex-col gap-5"
        >
          <FoodField
            field={foodField}
            foods={foods}
            label="Alimento"
            readOnly={Boolean(entry)}
            error={errors.food_name?.message}
            confirmNewLabel="Cadastrar e adicionar"
            inputRef={foodReg.ref}
            onBlur={() => {
              setValue('food_name', foodField.text, { shouldTouch: true })
              void form.trigger('food_name')
            }}
          />
          <TextField label="Quantidade" optional placeholder="Ex.: 2 fatias, 1 copo" error={errors.quantity?.message} {...reg('quantity')} />
          <TextField label="Horário do consumo" type="time" optional error={errors.consumed_time?.message} {...reg('consumed_time')} />
          <TextArea label="Observações" optional rows={3} error={errors.observations?.message} {...reg('observations')} />

          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={busy}>
                {entry ? 'Salvar alterações' : 'Adicionar alimento'}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </div>
            {!entry && (
              <div className="border-t border-line pt-4">
                <Button
                  variant="secondary"
                  icon={<Sprout aria-hidden className="size-4" />}
                  onClick={() => {
                    setValue('food_name', foodField.text)
                    setStep('experience')
                  }}
                >
                  + Registrar nova experiência alimentar
                </Button>
                <p className="mt-2 text-sm text-ink-soft">Opcional. Você não precisa registrar uma experiência para adicionar o alimento.</p>
              </div>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <Button variant="ghost" className="self-start" onClick={() => setStep('food')}>
            Voltar ao alimento
          </Button>
          <ExperienceForm
            defaults={{
              foodId: foodField.selectedId,
              foodName: foodField.text,
              date,
              time: getValues('consumed_time'),
            }}
            submitLabel="Salvar experiência"
            cancelLabel="Voltar ao alimento"
            onCancel={() => setStep('food')}
            onDirtyChange={setExperienceDirty}
            onSaved={(result, foodName) => {
              foodField.select({ id: result.food_id, name: foodName })
              setStep('food')
              toast.success('Agora é só adicionar o alimento à refeição.')
            }}
          />
        </div>
      )}
    </SlideOver>
  )
}
