import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { FeelingPicker } from '@/components/feelings/FeelingPicker'
import { Button } from '@/components/ui/Button'
import { TextArea, TextField } from '@/components/ui/Field'
import { SlideOver } from '@/components/ui/SlideOver'
import { useAppMutation } from '@/hooks/queries'
import { trimTime } from '@/lib/dates'
import { mealTypeDefaultTime, mealTypeLabel, type MealTypeValue } from '@/lib/domain'
import { mealFormSchema, type MealFormValues } from '@/lib/validation'
import { saveMeal } from '@/services/diaries'
import type { Meal } from '@/types/database'

interface MealFormPanelProps {
  open: boolean
  onClose: () => void
  date: string
  mealType: MealTypeValue
  /** Refeição existente (editar). Sem ela, cria uma nova. */
  meal?: Meal
}

function startValues(mealType: MealTypeValue, meal?: Meal): MealFormValues {
  if (meal) {
    return {
      meal_time: trimTime(meal.meal_time),
      feelings: meal.feelings ?? '',
      thoughts: meal.thoughts ?? '',
      observations: meal.observations ?? '',
      feeling_tags: meal.feeling_tags,
    }
  }
  return {
    meal_time: mealTypeDefaultTime(mealType),
    feelings: '',
    thoughts: '',
    observations: '',
    feeling_tags: [],
  }
}

/** Painel "Editar refeição": horário, sentimentos, pensamentos e observações. */
export function MealFormPanel({ open, onClose, date, mealType, meal }: MealFormPanelProps) {
  const start = useMemo(() => startValues(mealType, meal), [date, mealType, meal])
  const form = useForm<MealFormValues>({
    resolver: zodResolver(mealFormSchema),
    mode: 'onTouched',
    defaultValues: start,
  })
  const { register, watch, setValue, clearErrors, formState } = form
  const { errors } = formState
  const [emptyError, setEmptyError] = useState('')
  const tags = watch('feeling_tags')
  const label = mealTypeLabel(mealType)

  const mutation = useAppMutation(saveMeal, {
    success: meal ? `${label} atualizado.` : `${label} registrado.`,
    onSuccess: onClose,
  })

  function submit(values: MealFormValues) {
    const everythingEmpty =
      !values.feelings.trim() && !values.thoughts.trim() && !values.observations.trim() && values.feeling_tags.length === 0
    if (!meal && everythingEmpty) {
      setEmptyError('Escreva algo ou escolha um sentimento. Para só lançar alimentos, use “Adicionar alimento”.')
      return
    }
    setEmptyError('')
    mutation.mutate({
      mealId: meal?.id ?? null,
      date,
      mealType,
      mealTime: values.meal_time,
      feelings: values.feelings,
      thoughts: values.thoughts,
      observations: values.observations,
      feelingTags: values.feeling_tags,
    })
  }

  const reg = (name: keyof MealFormValues) => ({
    ...register(name),
    onInput: () => {
      if (errors[name]) clearErrors(name)
      if (emptyError) setEmptyError('')
    },
  })

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      dirty={formState.isDirty}
      title={meal ? `Editar ${label.toLowerCase()}` : `Anotar ${label.toLowerCase()}`}
      description="Tudo aqui é opcional. Escreva só o que quiser guardar."
    >
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
        <TextField label="Horário" type="time" optional error={errors.meal_time?.message} {...reg('meal_time')} />

        <FeelingPicker
          legend="Como me senti?"
          hint="Escolha quantos quiser."
          value={tags}
          onChange={(next) => {
            setValue('feeling_tags', next, { shouldDirty: true })
            if (emptyError) setEmptyError('')
          }}
        />

        <TextArea label="Como me senti, em palavras" optional error={errors.feelings?.message} {...reg('feelings')} />
        <TextArea label="O que pensei?" optional error={errors.thoughts?.message} {...reg('thoughts')} />
        <TextArea label="Observações" optional error={errors.observations?.message} {...reg('observations')} />

        {emptyError && (
          <p role="alert" className="text-sm text-danger">
            {emptyError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" loading={mutation.isPending}>
            Salvar refeição
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}
