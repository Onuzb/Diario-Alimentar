import { useEffect } from 'react'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} · Diário alimentar` : 'Diário alimentar'
    return () => {
      document.title = previous
    }
  }, [title])
}
