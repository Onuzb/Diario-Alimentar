import { createClient } from '@supabase/supabase-js'
import { env } from '@/config/env'
import { toAppError } from '@/lib/errors'

/** Depois disso a chamada é cancelada e a pessoa recebe um aviso, em vez de um botão girando para sempre. */
export const REQUEST_TIMEOUT_MS = 30_000

/** fetch que cancela a chamada se ela passar de `ms`. O erro tem name "TimeoutError". */
export function withTimeout(baseFetch: typeof fetch, ms: number = REQUEST_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController()
    const outer = init?.signal
    const onOuterAbort = () => controller.abort()
    if (outer?.aborted) controller.abort()
    else outer?.addEventListener('abort', onOuterAbort, { once: true })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, ms)
    try {
      return await baseFetch(input, { ...init, signal: controller.signal })
    } catch (error) {
      if (timedOut) {
        const timeout = new Error(`a chamada passou de ${Math.round(ms / 1000)} s sem resposta`)
        timeout.name = 'TimeoutError'
        throw timeout
      }
      throw error
    } finally {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onOuterAbort)
    }
  }
}

/**
 * Cliente do Supabase. O app não usa login, então a sessão não é guardada e
 * nenhuma chamada de autenticação é feita.
 */
export const supabase = createClient(env.supabaseUrl || 'http://localhost:54321', env.supabaseAnonKey || 'sem-chave', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: withTimeout((...args) => fetch(...args)) },
})

/** Chama uma função do banco e devolve o resultado ou lança um AppError em português. */
export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await supabase.rpc(fn, args)
  if (error) throw toAppError(error, status)
  return data as T
}

/** "" ou só espaços viram null (o banco guarda "sem informação" como null). */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.trim() === '' ? null : value
}
