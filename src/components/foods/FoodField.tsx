import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { controlClasses, FieldShell } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { findExact, suggestFoods, type NamedFood } from '@/lib/foodMatch'
import type { FoodFieldController } from '@/hooks/useFoodField'

interface FoodFieldProps {
  field: FoodFieldController
  foods: readonly NamedFood[]
  label: string
  optional?: boolean
  error?: string
  placeholder?: string
  /** Texto do botão que confirma um alimento novo. */
  confirmNewLabel?: string
  /** Mostra o nome sem permitir edição (edição de um alimento já lançado). */
  readOnly?: boolean
  /** Falso: a lista só sugere alimentos existentes (sem a linha "Cadastrar como novo"). */
  allowCreateOption?: boolean
  onBlur?: () => void
  inputRef?: (el: HTMLInputElement | null) => void
}

type Option = { kind: 'food'; food: NamedFood } | { kind: 'create' }

/** Campo de alimento: lista de sugestões do cadastro + opção de cadastrar um novo. */
export function FoodField({
  field,
  foods,
  label,
  optional,
  error,
  placeholder = 'Digite ou escolha um alimento',
  confirmNewLabel = 'Cadastrar e salvar',
  readOnly,
  allowCreateOption = true,
  onBlur,
  inputRef,
}: FoodFieldProps) {
  const id = useId()
  const listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const promptRef = useRef<HTMLDivElement>(null)

  const exact = findExact(foods, field.text)
  const options = useMemo<Option[]>(() => {
    const list: Option[] = suggestFoods(foods, field.text, 8).map((food) => ({ kind: 'food', food }))
    if (allowCreateOption && field.text.trim() !== '' && !exact) list.push({ kind: 'create' })
    return list
  }, [foods, field.text, exact, allowCreateOption])

  useEffect(() => {
    if (field.prompt) promptRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [field.prompt])

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <p className="min-h-11 rounded-field border border-line bg-sand-50 px-3.5 py-2.5 text-ink">{field.text}</p>
      </div>
    )
  }

  function choose(option: Option) {
    if (option.kind === 'food') field.select(option.food)
    else field.chooseNew()
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && open && active >= 0 && options[active]) {
      event.preventDefault()
      choose(options[active] as Option)
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
    }
  }

  const shownError = error || field.hint || undefined
  const prompt = field.prompt

  return (
    <div className="flex flex-col gap-2">
      <FieldShell id={id} label={label} optional={optional} error={shownError}>
        <div className="relative">
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? `${id}-error` : undefined}
            autoComplete="off"
            value={field.text}
            placeholder={placeholder}
            maxLength={80}
            onChange={(e) => {
              field.setText(e.target.value)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false)
              onBlur?.()
            }}
            onKeyDown={onKeyDown}
            className={controlClasses(Boolean(shownError))}
          />
          {open && options.length > 0 && !prompt && (
            <ul
              id={listId}
              role="listbox"
              aria-label={`Sugestões de ${label.toLowerCase()}`}
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-field border border-line-strong bg-card py-1 shadow-float"
            >
              {options.map((option, index) => (
                <li
                  key={option.kind === 'food' ? option.food.id : 'create'}
                  id={`${id}-opt-${index}`}
                  role="option"
                  aria-selected={active === index}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(option)
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 px-3.5 py-2 text-[0.95rem]',
                    active === index ? 'bg-sage-100 text-sage-900' : 'text-ink',
                    option.kind === 'create' && 'border-t border-line font-semibold text-sage-800',
                  )}
                >
                  {option.kind === 'food' ? (
                    option.food.name
                  ) : (
                    <>
                      <Plus aria-hidden className="size-4 shrink-0" />
                      Cadastrar “{field.text.trim()}” como novo alimento
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {field.intentNew && !prompt && (
          <p className="-mt-0.5 text-sm text-sage-800">Será cadastrado em Alimentos registrados ao salvar.</p>
        )}
      </FieldShell>

      {prompt && (
        <div ref={promptRef} role="group" aria-label="Confirmar alimento" className="flex flex-col gap-3 rounded-2xl border border-sage-300 bg-sage-50 p-4">
          {prompt.kind === 'same' && (
            <>
              <p className="text-[0.95rem] text-ink">
                Já existe <strong>“{prompt.match.name}”</strong> no seu cadastro. É o mesmo alimento?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => field.answer.useExisting(prompt.match)}>Sim, usar “{prompt.match.name}”</Button>
                <Button variant="secondary" onClick={() => field.answer.rename()}>
                  Não, é outro
                </Button>
              </div>
            </>
          )}
          {prompt.kind === 'similar' && (
            <>
              <p className="text-[0.95rem] text-ink">
                Parecido com {prompt.matches.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && (i === prompt.matches.length - 1 ? ' e ' : ', ')}
                    <strong>“{m.name}”</strong>
                  </span>
                ))}
                . É o mesmo alimento?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {prompt.matches.map((m) => (
                  <Button key={m.id} onClick={() => field.answer.useExisting(m)}>
                    Usar “{m.name}”
                  </Button>
                ))}
                <Button variant="secondary" onClick={() => field.answer.createNew()}>
                  Não, cadastrar “{prompt.typed}” como novo
                </Button>
                <Button variant="ghost" onClick={() => field.answer.cancel()}>
                  Voltar
                </Button>
              </div>
            </>
          )}
          {prompt.kind === 'new' && (
            <>
              <p className="text-[0.95rem] text-ink">
                <strong>“{prompt.typed}”</strong> é um alimento novo. Cadastrar em Alimentos registrados?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => field.answer.createNew()}>{confirmNewLabel}</Button>
                <Button variant="ghost" onClick={() => field.answer.cancel()}>
                  Voltar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
