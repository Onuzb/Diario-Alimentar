import { useEffect, useState } from 'react'

/** Só vira true depois de `ms` com a condição ligada. Evita piscar esqueleto em respostas rápidas. */
export function useDelayed(condition: boolean, ms = 250): boolean {
  const [delayed, setDelayed] = useState(false)
  useEffect(() => {
    if (!condition) {
      setDelayed(false)
      return
    }
    const timer = window.setTimeout(() => setDelayed(true), ms)
    return () => window.clearTimeout(timer)
  }, [condition, ms])
  return delayed
}

/** Valor com atraso, para campos de busca. */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return debounced
}
