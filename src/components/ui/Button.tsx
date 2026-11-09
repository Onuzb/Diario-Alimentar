import type { ComponentPropsWithRef, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/ui/Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[0.95rem] font-semibold transition-colors duration-150 select-none'

const variants: Record<Variant, string> = {
  primary: 'bg-sage-700 text-white hover:bg-sage-800 active:bg-sage-900',
  secondary: 'border border-line-strong bg-card text-ink hover:border-sage-500 hover:bg-sage-50',
  ghost: 'text-sage-800 hover:bg-sage-100',
  danger: 'border border-line-strong bg-card text-danger hover:border-danger hover:bg-danger-soft',
  'danger-solid': 'bg-danger text-white hover:bg-[#7a3129]',
}

export function buttonClasses(variant: Variant = 'primary', extra?: string) {
  return cn(base, variants[variant], extra)
}

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: Variant
  /** Mostra o indicador de carregamento e ignora novos cliques (o botão não fica desabilitado). */
  loading?: boolean
  icon?: ReactNode
}

/** Botão de ação. O envio nunca fica desabilitado: o clique mostra o que falta. */
export function Button({ variant = 'primary', loading, icon, className, children, onClick, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
      className={cn(buttonClasses(variant), loading && 'opacity-80', className)}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  icon?: ReactNode
}

export function ButtonLink({ variant = 'secondary', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} className={cn(buttonClasses(variant), className)}>
      {icon}
      {children}
    </Link>
  )
}

interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  label: string
  tone?: 'neutral' | 'danger'
}

/** Botão só com ícone: 44x44, sempre com nome acessível e dica (title). */
export function IconButton({ label, tone = 'neutral', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-150',
        tone === 'danger' ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-sage-100 hover:text-sage-800',
        className,
      )}
    >
      {children}
    </button>
  )
}
