import { Button } from '@/components/ui/Button'
import { toAppError } from '@/lib/errors'

/** Falha ao carregar: diz o que houve, mostra o detalhe técnico e oferece tentar de novo. */
export function ErrorPanel({ error, onRetry, title = 'Não foi possível carregar' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const e = toAppError(error)
  return (
    <section role="alert" className="rounded-card border border-danger/40 bg-danger-soft p-6">
      <h2 className="text-lg text-danger">{title}</h2>
      <p className="mt-1 max-w-prose text-ink">{e.message}</p>
      {e.technical && e.detail && (
        <details open={e.generic} className="mt-3 max-w-prose text-sm text-ink-soft">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-ink">Detalhes técnicos</summary>
          <p className="mt-1 font-mono text-[0.8125rem] break-words select-all">{e.detail}</p>
        </details>
      )}
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </section>
  )
}
