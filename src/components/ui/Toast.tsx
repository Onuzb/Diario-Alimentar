import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastKind = 'success' | 'error'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setItems((list) => [...list.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 9000 : 4500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 md:items-end md:px-8"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-pop-in items-start gap-3 rounded-2xl border bg-card py-3 pr-1.5 pl-4 shadow-float',
              t.kind === 'error' ? 'border-danger/50' : 'border-sage-300',
            )}
          >
            {t.kind === 'error' ? (
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            ) : (
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-sage-700" />
            )}
            <p className="flex-1 py-0.5 text-[0.95rem] leading-snug text-ink">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar aviso"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-sage-100"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
