import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
  /** Ação principal: um botão com verbo ("Adicionar alimento"). */
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
  tone?: 'plain' | 'dashed'
}

/** Estado vazio: o que cabe aqui, por que vale preencher e uma ação para começar. */
export function EmptyState({ icon, title, description, action, secondaryAction, className, tone = 'plain' }: EmptyStateProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col items-center gap-3 rounded-card px-6 py-10 text-center',
        tone === 'dashed' && 'border border-dashed border-line-strong',
        className,
      )}
    >
      {icon && (
        <div aria-hidden className="flex size-12 items-center justify-center rounded-full bg-sage-100 text-sage-700">
          {icon}
        </div>
      )}
      <h3 className="text-lg">{title}</h3>
      <p className="max-w-sm text-[0.95rem] text-ink-soft">{description}</p>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </section>
  )
}
