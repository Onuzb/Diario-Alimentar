import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada')
  return (
    <EmptyState
      tone="dashed"
      title="Página não encontrada"
      description="O endereço não existe ou mudou. Volte ao início para continuar."
      action={
        <ButtonLink to="/" variant="primary">
          Ir para o início
        </ButtonLink>
      }
    />
  )
}
