/**
 * Erros do app. Toda falha de banco vira um AppError com uma mensagem em
 * português que diz o que aconteceu e o que fazer.
 */

export class AppError extends Error {
  code?: string
  status?: number
  /** Texto técnico para diagnóstico: status HTTP, código e a mensagem original do Supabase. */
  detail: string
  /** Verdadeiro quando a causa não foi reconhecida e só o detalhe técnico explica. */
  generic: boolean
  /** Verdadeiro para falhas de conexão ou configuração (não para erros de preenchimento). */
  technical: boolean

  constructor(
    message: string,
    code?: string,
    options?: { cause?: unknown; status?: number; detail?: string; generic?: boolean; technical?: boolean },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.status = options?.status
    this.detail = options?.detail ?? ''
    this.generic = options?.generic ?? false
    this.technical = options?.technical ?? false
  }
}

interface RawError {
  message?: string
  details?: string | null
  hint?: string | null
  code?: string | null
  status?: number
}

const MSG = {
  connection:
    'Não foi possível falar com o banco de dados. Confira a internet e a VITE_SUPABASE_URL do arquivo .env (deve ser a Project URL do seu projeto) e tente de novo.',
  badKey:
    'O Supabase não aceitou a chave do arquivo .env. Copie de novo a chave Publishable (ou anon public) em Project Settings > API, cole sem aspas e sem espaços em VITE_SUPABASE_ANON_KEY e reinicie o npm run dev.',
  secretKey:
    'O .env está com a chave secreta (Secret key ou service_role). Troque pela chave Publishable (ou anon public), a única que pode ir no site, e reinicie o npm run dev.',
  badUrl:
    'O endereço do Supabase parece errado. No .env, VITE_SUPABASE_URL deve ser só https://SEU-PROJETO.supabase.co, sem /rest/v1 e sem barra no final. Corrija e reinicie o npm run dev.',
  schema:
    'O Supabase não está liberando o schema public. Em Project Settings > API (Data API), confira que "public" está em Exposed schemas.',
  denied:
    'O banco recusou o acesso. Confira se as migrações da pasta supabase/migrations foram aplicadas, inclusive a de segurança.',
  missingSetup:
    'O banco ainda não tem as tabelas ou funções do app. Rode as migrações da pasta supabase/migrations, na ordem.',
  duplicate: 'Já existe um item com esse nome. Use o cadastro existente ou ajuste o nome.',
  duplicateFood: 'Já existe um alimento com esse nome (sem contar acentos e maiúsculas). Use o existente ou ajuste o nome.',
  foodHasExperiences:
    'Este alimento tem experiências registradas. Exclua essas experiências antes de excluir o alimento.',
  invalidValue: 'O banco não aceitou algum valor. Revise os campos (tamanho dos textos, data e horário) e tente de novo.',
  unavailable: 'O banco de dados não respondeu agora. Aguarde um instante e tente de novo. Se o projeto estiver pausado no Supabase, reative-o no painel.',
  generic: 'Algo deu errado.',
} as const

function asRaw(error: unknown): RawError {
  if (error && typeof error === 'object') return error as RawError
  if (typeof error === 'string') return { message: error }
  return {}
}

/** Mensagens lançadas pelas funções do banco já estão em português e são seguras de mostrar. */
const PASS_THROUGH_CODES = new Set(['22023', 'P0001', 'P0002'])

/** Resume o erro original em uma linha, para diagnóstico. */
function describe(raw: RawError, status: number | undefined, isNetwork: boolean): string {
  const parts = [
    status ? `HTTP ${status}` : '',
    raw.code ? `código ${raw.code}` : '',
    isNetwork ? 'falha de rede' : '',
    raw.message ?? '',
    raw.details ?? '',
    raw.hint ?? '',
  ].filter((p) => p && p.trim() !== '')
  return parts.join(' · ').slice(0, 400)
}

export function toAppError(error: unknown, statusArg?: number): AppError {
  if (error instanceof AppError) return error
  const raw = asRaw(error)
  const code = raw.code || undefined
  const status = statusArg || raw.status || undefined
  const text = `${raw.message ?? ''} ${raw.details ?? ''} ${raw.hint ?? ''}`
  const isNetwork = error instanceof TypeError
  const detail = describe(raw, status, isNetwork)
  const make = (message: string, flags: { generic?: boolean; technical?: boolean } = {}) =>
    new AppError(message, code, { cause: error, status, detail, ...flags })

  // Erros de dados: mensagem curta e sem detalhe técnico.
  if (code && PASS_THROUGH_CODES.has(code) && raw.message) {
    return new AppError(raw.message, code, { cause: error, status, detail })
  }
  if (code === '23503' && /food_experiences/.test(text)) return make(MSG.foodHasExperiences)
  if (code === '23505') return make(/foods|name_key/.test(text) ? MSG.duplicateFood : MSG.duplicate)
  if (code === '23514' || code === '22001' || code === '22007' || code === '22008' || code === '22P02') {
    return make(MSG.invalidValue)
  }

  // Configuração e conexão: aqui o detalhe técnico ajuda a achar a causa.
  const technical = { technical: true }
  if (/secret api key/i.test(text)) return make(MSG.secretKey, technical)
  if (status === 401 || code === '401' || (code && /^PGRST30[1-3]$/.test(code)) || /(invalid|no|missing) api ?key|apikey|jwt/i.test(text)) {
    return make(MSG.badKey, technical)
  }
  if (code === '42501' || status === 403 || code === '403') return make(MSG.denied, technical)
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') {
    return make(MSG.missingSetup, technical)
  }
  if (code === 'PGRST106' || /invalid schema/i.test(text)) return make(MSG.schema, technical)
  if (!code && status === 404) return make(MSG.badUrl, technical)
  if ((code && /^PGRST00[0-3]$/.test(code)) || (!code && status !== undefined && status >= 500)) {
    return make(MSG.unavailable, technical)
  }
  if (isNetwork || (!code && /fetch|network|failed to|load failed|econn|enotfound/i.test(raw.message ?? ''))) {
    return make(MSG.connection, technical)
  }
  return make(MSG.generic, { generic: true, technical: true })
}

/** Texto para avisos curtos (toast). Se a causa é desconhecida, inclui o detalhe técnico. */
export function getErrorMessage(error: unknown): string {
  const e = toAppError(error)
  return e.generic && e.detail ? `${e.message} Detalhe: ${e.detail}` : e.message
}
