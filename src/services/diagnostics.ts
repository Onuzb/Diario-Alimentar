import { toAppError } from '@/lib/errors'
import { todayISO } from '@/lib/dates'
import { callRpc, supabase } from '@/services/client'

export interface CheckStep {
  label: string
  ok: boolean
  message: string
  /** Texto técnico (status, código e mensagem do Supabase) quando falha. */
  detail: string
}

/**
 * Testa a conexão com o Supabase em duas etapas, para dizer qual parte da
 * configuração está errada (endereço, chave, tabelas ou funções).
 */
export async function runConnectionCheck(): Promise<CheckStep[]> {
  const steps: CheckStep[] = []

  async function run(label: string, okMessage: string, fn: () => Promise<void>) {
    try {
      await fn()
      steps.push({ label, ok: true, message: okMessage, detail: '' })
    } catch (error) {
      const e = toAppError(error)
      steps.push({ label, ok: false, message: e.message, detail: e.detail })
    }
  }

  await run('Endereço, chave e tabelas', 'O Supabase respondeu e as tabelas estão acessíveis.', async () => {
    const { error, status } = await supabase.from('foods_overview').select('id').limit(1)
    if (error) throw toAppError(error, status)
  })

  await run('Funções do app', 'As funções do banco estão acessíveis.', async () => {
    await callRpc('get_dashboard', { p_today: todayISO() })
  })

  return steps
}
