import { createClient } from '@supabase/supabase-js'
import { env } from '@/config/env'
import { toAppError } from '@/lib/errors'

/**
 * Cliente do Supabase. O app não usa login, então a sessão não é guardada e
 * nenhuma chamada de autenticação é feita.
 */
export const supabase = createClient(env.supabaseUrl || 'http://localhost:54321', env.supabaseAnonKey || 'sem-chave', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
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
