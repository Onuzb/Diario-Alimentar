import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useScrollLock } from '@/hooks/useScrollLock'
import { cn } from '@/lib/cn'

interface SlideOverProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  /** Com alterações não salvas, fechar pede confirmação dentro do próprio painel. */
  dirty?: boolean
  side?: 'right' | 'left'
  children: ReactNode
}

/**
 * Painel lateral para tarefas rápidas (menos de 10 s). Entra pela borda direita,
 * ocupa a altura toda e, no celular, a largura toda. Nunca empilha outro painel.
 */
export function SlideOver({ open, title, description, onClose, dirty = false, side = 'right', children }: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  useScrollLock(open)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) setConfirmingDiscard(false)
  }, [open])

  function requestClose() {
    if (dirty) setConfirmingDiscard(true)
    else onClose()
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (dirty) setConfirmingDiscard(true)
        else onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, dirty, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden onClick={requestClose} className="absolute inset-0 animate-fade-in bg-ink/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-full flex-col bg-paper shadow-float sm:max-w-[30rem]',
          side === 'right' ? 'right-0 animate-slide-in border-l border-line' : 'left-0 animate-slide-in-left border-r border-line',
        )}
      >
        <header className="flex items-start gap-2 border-b border-line bg-card py-3 pr-2 pl-5">
          <div className="min-w-0 flex-1 py-1.5">
            <h2 id={titleId} className="text-xl leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-ink-soft">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Fechar painel" onClick={requestClose}>
            <X aria-hidden className="size-5" />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

        {confirmingDiscard && (
          <div role="alert" className="flex flex-col gap-3 border-t border-line-strong bg-sand-50 px-5 py-4">
            <p className="text-[0.95rem] font-semibold text-ink">Descartar as alterações deste formulário?</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setConfirmingDiscard(false)}>
                Continuar editando
              </Button>
              <Button variant="danger" onClick={onClose}>
                Descartar alterações
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
