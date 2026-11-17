import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { FeelingPicker } from '@/components/feelings/FeelingPicker'
import { FoodField } from '@/components/foods/FoodField'
import { Button } from '@/components/ui/Button'
import { TextArea, TextField } from '@/components/ui/Field'
import { useFoodField } from '@/hooks/useFoodField'
import { useAppMutation, useFoods } from '@/hooks/queries'
import { cn } from '@/lib/cn'
import { currentTime, todayISO } from '@/lib/dates'
import { EXPERIENCE_TYPES } from '@/lib/domain'
import { cleanName } from '@/lib/foodMatch'
import { experienceFormSchema, type ExperienceFormValues } from '@/lib/validation'
import { saveExperience, type SaveExperienceResult } from '@/services/experiences'
import type { Experience } from '@/types/database'

interface ExperienceFormProps {
  /** Experiência existente (modo edição). */
  experience?: Experience
  /** Valores iniciais de uma experiência nova. */
  defaults?: { foodId?: string | null; foodName?: string; date?: string; time?: string }
  submitLabel?: string
  cancelLabel?: string
  onSaved?: (result: SaveExperienceResult, foodName: string) => void
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

function initialValues(experience: Experience | undefined, defaults: ExperienceFormProps['defaults']): ExperienceFormValues {
  if (experience) {
    return {
      food_name: experience.food_name,
      experience_type: experience.experience_type,
      replaced_food_name: experience.replaced_food_name ?? '',
      experience_date: experience.experience_date,
      experience_time: experience.experience_time ? experience.experience_time.slice(0, 5) : '',
      feelings: experience.feelings ?? '',
      thoughts: experience.thoughts ?? '',
      after_experience: experience.after_experience ?? '',
      observations: experience.observations ?? '',
      feeling_tags: experience.feeling_tags,
    }
  }
  const date = defaults?.date ?? todayISO()
  return {
    food_name: defaults?.foodName ?? '',
    experience_type: 'new_food',
    replaced_food_name: '',
    experience_date: date,
    experience_time: defaults?.time ?? (date === todayISO() ? currentTime() : ''),
    feelings: '',
    thoughts: '',
    after_experience: '',
    observations: '',
    feeling_tags: [],
  }
}

/** Formulário "Registro de experiência alimentar" (página e painel do diário). */
export function ExperienceForm({
  experience,
  defaults,
  submitLabel = 'Salvar experiência',
  cancelLabel = 'Cancelar',
  onSaved,
  onCancel,
  onDirtyChange,
}: ExperienceFormProps) {
  const { data: foods = [] } = useFoods()
  const start = useMemo(() => initialValues(experience, defaults), [experience, defaults])
  const form = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceFormSchema),
    mode: 'onTouched',
    defaultValues: start,
  })
  const { register, watch, setValue, clearErrors, formState } = form
  const { errors } = formState

  const foodField = useFoodField(foods, {
    id: experience?.food_id ?? defaults?.foodId ?? null,
    name: start.food_name,
  })
  const replacedField = useFoodField(foods, {
    id: experience?.replaced_food_id ?? null,
    name: start.replaced_food_name,
  })

  const [pendingError, setPendingError] = useState('')
  const type = watch('experience_type')
  const tags = watch('feeling_tags')
  const foodReg = register('food_name')

  const dirty =
    formState.isDirty ||
    foodField.text !== start.food_name ||
    replacedField.text !== start.replaced_food_name
  useEffect(() => {
    onDirtyChange?.(dirty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  useEffect(() => {
    if (errors.food_name && cleanName(foodField.text)) clearErrors('food_name')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodField.text])

  const mutation = useAppMutation(saveExperience, {
    success: () => (experience ? 'Experiência atualizada.' : 'Experiência salva. Ela já aparece na linha do tempo do histórico.'),
    onSuccess: (result, input) => onSaved?.(result, input.foodName),
  })

  async function submit(values: ExperienceFormValues) {
    setPendingError('')
    const food = await foodField.resolve()
    if (!food) return

    let replaced = null
    if (values.experience_type === 'substitution' && cleanName(replacedField.text)) {
      replaced = await replacedField.resolve()
      if (!replaced) return
      if (food.id && replaced.id && food.id === replaced.id) {
        setPendingError('O alimento substituído precisa ser diferente do novo alimento.')
        return
      }
    }

    mutation.mutate({
      id: experience?.id ?? null,
      foodId: food.id,
      foodName: food.name,
      type: values.experience_type,
      date: values.experience_date,
      time: values.experience_time,
      feelings: values.feelings,
      thoughts: values.thoughts,
      afterExperience: values.after_experience,
      observations: values.observations,
      feelingTags: values.feeling_tags,
      replacedFoodId: replaced?.id ?? null,
      replacedFoodName: replaced?.name ?? '',
    })
  }

  function syncNames() {
    setValue('food_name', foodField.text)
    setValue('replaced_food_name', replacedField.text)
  }

  const busy = mutation.isPending || formState.isSubmitting
  const reg = (name: keyof ExperienceFormValues) => {
    const r = register(name)
    return {
      ...r,
      onInput: () => {
        if (errors[name]) clearErrors(name)
      },
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        syncNames()
        void form.handleSubmit(submit)(event)
      }}
      className="flex flex-col gap-5"
    >
      <FoodField
        field={foodField}
        foods={foods}
        label="Alimento"
        error={errors.food_name?.message}
        confirmNewLabel="Cadastrar e salvar"
        inputRef={foodReg.ref}
        onBlur={() => {
          setValue('food_name', foodField.text)
          void form.trigger('food_name')
        }}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink">Tipo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXPERIENCE_TYPES.map((t) => (
            <label
              key={t.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-field border px-3.5 py-2 transition-colors duration-150',
                type === t.value ? 'border-sage-700 bg-sage-100 text-sage-900' : 'border-line-strong bg-card hover:border-sage-500',
              )}
            >
              <input type="radio" value={t.value} {...register('experience_type')} className="size-4 accent-sage-700" />
              <span className="font-medium">{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {type === 'substitution' && (
        <FoodField
          field={replacedField}
          foods={foods}
          label="No lugar de qual alimento?"
          optional
          placeholder="Alimento que foi trocado"
          error={errors.replaced_food_name?.message || pendingError || undefined}
          confirmNewLabel="Cadastrar e continuar"
          onBlur={() => {
            setValue('replaced_food_name', replacedField.text)
            void form.trigger('replaced_food_name')
          }}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Data" type="date" error={errors.experience_date?.message} {...reg('experience_date')} />
        <TextField label="Horário" type="time" optional error={errors.experience_time?.message} {...reg('experience_time')} />
      </div>

      <FeelingPicker
        legend="Sentimentos"
        value={tags}
        onChange={(next) => setValue('feeling_tags', next, { shouldDirty: true })}
      />

      <TextArea label="Como me senti?" optional error={errors.feelings?.message} {...reg('feelings')} />
      <TextArea label="O que pensei?" optional error={errors.thoughts?.message} {...reg('thoughts')} />
      <TextArea label="Como foi depois?" optional error={errors.after_experience?.message} {...reg('after_experience')} />
      <TextArea label="Observações" optional error={errors.observations?.message} {...reg('observations')} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
      </div>
    </form>
  )
}
