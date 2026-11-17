import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ShellProps {
  id: string
  label: string
  optional?: boolean
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

/** Rótulo visível + controle + dica. O erro ocupa o lugar da dica. */
export function FieldShell({ id, label, optional, hint, error, className, children }: ShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-soft">(opcional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const controlClasses = (invalid?: boolean) =>
  cn(
    'min-h-11 w-full rounded-field border bg-card px-3.5 text-ink transition-colors duration-150',
    'placeholder:text-ink-soft/70 hover:border-sage-500 focus:border-sage-700',
    invalid ? 'border-danger' : 'border-line-strong',
  )

interface CommonProps {
  label: string
  optional?: boolean
  hint?: string
  error?: string
  containerClassName?: string
}

type TextFieldProps = CommonProps & ComponentPropsWithRef<'input'>

export function TextField({ label, optional, hint, error, containerClassName, className, id, ...rest }: TextFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell id={fieldId} label={label} optional={optional} hint={hint} error={error} className={containerClassName}>
      <input
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(controlClasses(Boolean(error)), className)}
      />
    </FieldShell>
  )
}

type TextAreaProps = CommonProps & ComponentPropsWithRef<'textarea'>

export function TextArea({ label, optional, hint, error, containerClassName, className, id, rows = 3, ...rest }: TextAreaProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell id={fieldId} label={label} optional={optional} hint={hint} error={error} className={containerClassName}>
      <textarea
        {...rest}
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(controlClasses(Boolean(error)), 'min-h-24 resize-y py-2.5 leading-relaxed', className)}
      />
    </FieldShell>
  )
}

type SelectFieldProps = CommonProps & ComponentPropsWithRef<'select'>

export function SelectField({ label, optional, hint, error, containerClassName, className, id, children, ...rest }: SelectFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell id={fieldId} label={label} optional={optional} hint={hint} error={error} className={containerClassName}>
      <select
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(controlClasses(Boolean(error)), 'pr-9', className)}
      >
        {children}
      </select>
    </FieldShell>
  )
}
