import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useScrollLock } from '@/hooks/useScrollLock'

interface ConfirmDialogProps {
  open: boolean
  /** Diga o nome exato do que será afetado: "Excluir o almoço de 12:30?". */
  title: string
  children?: ReactNode
  /** Verbo destrutivo: "Excluir refeição", "Remover alimento". Sem ele, o diálogo só informa. */
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm?: () => void
  onCancel: () => void
}

/**
 * Confirmação de ação destrutiva. O foco começa em "Cancelar"; Esc cancela.
 * Sem confirmLabel, vira um aviso com um único botão de fechar.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useScrollLock(open)
  useFocusTrap(dialogRef, open, cancelRef)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden onClick={onCancel} className="absolute inset-0 animate-fade-in bg-ink/45" />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        className="relative w-full max-w-md animate-pop-in rounded-card border border-line bg-card p-6 shadow-float"
      >
        <h2 id={titleId} className="text-xl leading-snug">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">
            {children}
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-card px-5 text-[0.95rem] font-semibold text-ink hover:border-sage-500 hover:bg-sage-50"
          >
            {cancelLabel ?? (confirmLabel ? 'Cancelar' : 'Entendi')}
          </button>
          {confirmLabel && (
            <Button variant="danger-solid" loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
