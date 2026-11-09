import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Mantém o foco do teclado dentro de um painel aberto, leva o foco para ele ao
 * abrir e devolve ao elemento que abriu quando fecha.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, initialFocus?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const first = initialFocus?.current ?? container.querySelector<HTMLElement>(FOCUSABLE) ?? container
    first.focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0] as HTMLElement
      const lastItem = items[items.length - 1] as HTMLElement
      const current = document.activeElement
      if (event.shiftKey && (current === firstItem || !container.contains(current))) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && (current === lastItem || !container.contains(current))) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
