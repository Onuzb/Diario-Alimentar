import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Rede de segurança: se algo quebrar ao desenhar a tela, mostra um aviso em vez de uma página em branco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro ao desenhar a tela:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page flex min-h-dvh flex-col items-center justify-center gap-4 py-10 text-center">
        <h1 className="text-[1.75rem]">Algo deu errado</h1>
        <p className="max-w-md text-ink-soft">
          A tela não pôde ser exibida. Seus registros salvos continuam seguros. Recarregue a página para tentar de novo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-sage-700 px-5 font-semibold text-white hover:bg-sage-800"
        >
          Recarregar a página
        </button>
      </main>
    )
  }
}
