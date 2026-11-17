import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'sage' | 'earth' | 'neutral'

const tones: Record<Tone, string> = {
  sage: 'bg-sage-100 text-sage-800',
  earth: 'bg-sand-100 text-umber-700',
  neutral: 'bg-paper text-ink-soft border border-line',
}

/** Etiqueta pequena e só de leitura (tipo de experiência, sentimento). */
export function Chip({ tone = 'sage', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}
