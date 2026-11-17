import { FEELINGS, type FeelingValue } from '@/lib/domain'
import { cn } from '@/lib/cn'

interface FeelingPickerProps {
  value: FeelingValue[]
  onChange: (next: FeelingValue[]) => void
  legend?: string
  hint?: string
}

/** Escolha de sentimentos com emoji. Seleção múltipla; o texto livre continua opcional. */
export function FeelingPicker({ value, onChange, legend = 'Sentimentos', hint }: FeelingPickerProps) {
  function toggle(item: FeelingValue) {
    onChange(value.includes(item) ? value.filter((v) => v !== item) : [...value, item])
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-ink">
        {legend}
        <span className="ml-1.5 font-normal text-ink-soft">(opcional)</span>
      </legend>
      {hint && <p className="-mt-0.5 text-sm text-ink-soft">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {FEELINGS.map((f) => {
          const selected = value.includes(f.value)
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(f.value)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[0.9rem] font-medium transition-colors duration-150',
                selected
                  ? 'border-sage-700 bg-sage-100 text-sage-900'
                  : 'border-line-strong bg-card text-ink hover:border-sage-500 hover:bg-sage-50',
              )}
            >
              <span aria-hidden className="text-lg leading-none">
                {f.emoji}
              </span>
              {f.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
