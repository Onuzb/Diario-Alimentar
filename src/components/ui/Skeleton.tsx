import type { ReactNode } from 'react'
import { useDelayed } from '@/hooks/useDelayed'
import { cn } from '@/lib/cn'

export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-xl bg-sage-100 motion-safe:animate-pulse', className)} />
}

/**
 * Esqueleto de carregamento. Respostas de menos de 250 ms não mostram nada;
 * depois disso o esqueleto ocupa o mesmo espaço do conteúdo final.
 */
export function LoadingArea({ loading, label = 'Carregando', children, className }: {
  loading: boolean
  label?: string
  children: ReactNode
  className?: string
}) {
  const show = useDelayed(loading, 250)
  if (!loading) return null
  return (
    <div role="status" aria-label={label} className={cn('min-h-24', className)}>
      {show ? children : null}
    </div>
  )
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card border border-line bg-card p-5">
      <SkeletonBlock className="h-5 w-1/3" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonBlock key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  )
}
