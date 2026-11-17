import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight md:text-[2.25rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-prose text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
