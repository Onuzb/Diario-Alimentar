import '@fontsource-variable/figtree'
import '@fontsource-variable/literata'
import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from '@/App'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ToastProvider } from '@/components/ui/Toast'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // O cliente do Supabase já repete leituras em falhas passageiras (503/520);
      // repetir aqui de novo só atrasaria o aviso de erro.
      retry: false,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado em index.html.')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
