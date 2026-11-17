import { useEffect } from 'react'

let locks = 0

/** Trava a rolagem da página enquanto um painel está aberto. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    locks += 1
    document.body.style.overflow = 'hidden'
    return () => {
      locks -= 1
      if (locks === 0) document.body.style.overflow = ''
    }
  }, [active])
}
