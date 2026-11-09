/** Remove aspas e espaços que costumam vir junto ao colar um valor no .env. */
function stripQuotes(value: string): string {
  return value.trim().replace(/^["'`]+|["'`]+$/g, '').trim()
}

/** Aceita o endereço do projeto mesmo com erros comuns: sem https://, com /rest/v1 ou com barra no final. */
export function cleanSupabaseUrl(raw: string | undefined): string {
  let value = stripQuotes(raw ?? '')
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  value = value.replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1$/i, '').replace(/\/+$/, '')
  return value
}

/** Chaves não têm espaços nem quebras de linha: remove os que vierem da cópia. */
export function cleanSupabaseKey(raw: string | undefined): string {
  return stripQuotes(raw ?? '').replace(/\s+/g, '')
}

const url = cleanSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const anonKey = cleanSupabaseKey(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** Falso enquanto o arquivo .env não foi preenchido. */
  isConfigured: Boolean(url && anonKey && !url.includes('SEU-PROJETO') && !anonKey.startsWith('cole-aqui')),
} as const

export function supabaseHost(): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
