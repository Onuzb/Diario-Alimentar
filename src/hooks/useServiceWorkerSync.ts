import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Recados do service worker para o app aberto:
 * - "meal-skipped": o botão "Não fiz" da notificação marcou uma refeição, então os dados recarregam;
 * - "navigate": o clique na notificação leva ao registro da refeição, sem recarregar a página.
 */
export function useServiceWorkerSync() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const container = navigator.serviceWorker
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: unknown } | null
      if (data?.type === 'meal-skipped') void queryClient.invalidateQueries()
      if (data?.type === 'navigate' && typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')) {
        void navigate(data.url)
      }
    }
    container.addEventListener('message', onMessage)
    // Com addEventListener as mensagens só chegam depois de liberadas; aqui já podem chegar.
    container.startMessages?.()
    return () => container.removeEventListener('message', onMessage)
  }, [queryClient, navigate])
}
