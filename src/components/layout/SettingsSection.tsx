import type { ReactNode } from 'react'

/** Bloco de uma página de configurações: título e conteúdo dentro de um cartão. */
export function SettingsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-card p-5 sm:p-6">
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-ink-soft">{children}</div>
    </section>
  )
}
