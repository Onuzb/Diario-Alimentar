// =============================================================================
// Diário Alimentar — envio dos lembretes de refeição (Supabase Edge Function)
//
// O agendador do banco (pg_cron, veja supabase/reminders-cron.sql) chama esta
// função a cada 5 minutos. Ela pergunta ao banco quais refeições estão sem
// registro dentro do horário (claim_due_reminders) e manda uma notificação
// "Falta registrar" para cada aparelho inscrito.
//
// Também atende o botão "Enviar aviso de teste" das Configurações do site.
//
// Segredos (Edge Functions > Secrets), sem os prefixos SUPABASE_:
//   VAPID_PUBLIC_KEY   chave pública  (gerada por: npm run vapid)
//   VAPID_PRIVATE_KEY  chave privada  (gerada por: npm run vapid)
//   VAPID_SUBJECT      opcional: "mailto:voce@exemplo.com" (padrão: a URL do projeto)
//   CRON_SECRET        opcional mas recomendado: mesma senha usada em reminders-cron.sql
// O Supabase já fornece SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY à função.
// Se o seu projeto não fornecer a chave de serviço, crie o segredo SERVICE_ROLE_KEY.
//
// IMPORTANTE: ao publicar, DESLIGUE "Verify JWT" (ou use --no-verify-jwt). O
// agendador e o site não enviam um JWT; a proteção é o CRON_SECRET.
//
// O envio usa o padrão Web Push (RFC 8030, 8291 e 8292) com a API Web Crypto,
// sem bibliotecas de terceiros além do cliente do Supabase.
// =============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

export interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
}

export interface Reminder {
  date: string
  meal_type: string
  kind: 'mid' | 'end'
  title: string
  body: string
  url: string
  tag: string
  ttl_seconds: number
}

const enc = new TextEncoder()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

export function b64urlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const buf = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource

// ---------------------------------------------------------------------------
// Web Push: criptografia da mensagem (RFC 8291, aes128gcm)
// ---------------------------------------------------------------------------

export interface EncryptOptions {
  /** Só para testes: sal e par de chaves fixos. */
  salt?: Uint8Array
  senderKey?: CryptoKeyPair
}

export async function encryptPayload(
  sub: { p256dh: string; auth: string },
  payload: Uint8Array,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  if (payload.length > 3900) throw new Error('Mensagem grande demais para uma notificação.')
  let uaPublicBytes: Uint8Array
  let authSecret: Uint8Array
  try {
    uaPublicBytes = b64urlToBytes(sub.p256dh)
    authSecret = b64urlToBytes(sub.auth)
  } catch {
    throw new Error('Chaves da inscrição inválidas (p256dh ou auth).')
  }
  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 4) throw new Error('Chave p256dh inválida.')

  const uaPublic = await crypto.subtle.importKey('raw', buf(uaPublicBytes), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sender =
    options.senderKey ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey))
  const ecdhSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublic }, sender.privateKey, 256)

  // IKM = HKDF(auth, ecdh, "WebPush: info" || 0 || ua_public || as_public)
  const ecdhKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublicBytes, asPublicBytes)
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(authSecret), info: buf(keyInfo) },
    ecdhKey,
    256,
  )

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(enc.encode('Content-Encoding: aes128gcm\0')) },
    ikmKey,
    128,
  )
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(enc.encode('Content-Encoding: nonce\0')) },
    ikmKey,
    96,
  )
  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt'])

  // um único registro: mensagem + byte delimitador 0x02 (último registro)
  const plaintext = concat(payload, new Uint8Array([2]))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, buf(plaintext)))

  const recordSize = new Uint8Array([0, 0, 0x10, 0]) // 4096
  return concat(salt, recordSize, new Uint8Array([asPublicBytes.length]), asPublicBytes, ciphertext)
}

// ---------------------------------------------------------------------------
// Web Push: identificação do servidor (VAPID, RFC 8292)
// ---------------------------------------------------------------------------

export async function vapidAuthorization(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const pub = b64urlToBytes(publicKey)
  if (pub.length !== 65) throw new Error('VAPID_PUBLIC_KEY inválida: deve ter 65 bytes (base64url).')
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: privateKey, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: subject })),
  )
  const input = `${header}.${claims}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(input))))
  return `vapid t=${input}.${bytesToB64url(signature)}, k=${publicKey}`
}

export interface PushConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export interface PushResult {
  ok: boolean
  /** O aparelho não aceita mais notificações (404 ou 410): a inscrição deve ser apagada. */
  gone: boolean
  status: number
}

export async function sendPush(
  sub: Subscription,
  message: Record<string, unknown>,
  config: PushConfig,
  ttlSeconds: number,
  fetchFn: typeof fetch = fetch,
): Promise<PushResult> {
  try {
    const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)))
    const authorization = await vapidAuthorization(sub.endpoint, config.publicKey, config.privateKey, config.subject)
    const res = await fetchFn(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(Math.max(0, Math.floor(ttlSeconds))),
        Urgency: 'high',
      },
      body: buf(body),
      signal: AbortSignal.timeout(10_000),
    })
    await res.text().catch(() => '')
    return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status }
  } catch (error) {
    console.error('Falha ao enviar notificação:', error instanceof Error ? error.message : error)
    return { ok: false, gone: false, status: 0 }
  }
}

// ---------------------------------------------------------------------------
// Função HTTP
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function messageFor(n: Reminder) {
  return { title: n.title, body: n.body, url: n.url, tag: n.tag, date: n.date, meal_type: n.meal_type, kind: n.kind }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const publicKey = (Deno.env.get('VAPID_PUBLIC_KEY') ?? '').trim()
  const privateKey = (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
  if (!publicKey || !privateKey) {
    return json({ error: 'Faltam os segredos VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas configurações da função.' }, 500)
  }
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Faltam SUPABASE_URL ou a chave de serviço. Crie o segredo SERVICE_ROLE_KEY na função.' }, 500)
  }
  const config: PushConfig = { publicKey, privateKey, subject: (Deno.env.get('VAPID_SUBJECT') ?? '').trim() || supabaseUrl }

  let input: { test?: boolean; endpoint?: string } = {}
  try {
    input = await req.json()
  } catch {
    input = {}
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // --- aviso de teste, pedido pelo botão das Configurações --------------------
  if (input.test) {
    if (typeof input.endpoint !== 'string' || !input.endpoint) return json({ error: 'Informe o endpoint do aparelho.' }, 400)
    const { data, error } = await supabase.rpc('get_push_subscription', { p_endpoint: input.endpoint })
    if (error) return json({ error: error.message }, 500)
    if (!data) return json({ error: 'Este aparelho não está inscrito. Desative e ative os lembretes de novo.' }, 404)
    const result = await sendPush(
      data as Subscription,
      { title: 'Lembretes ativados', body: 'Este é um aviso de teste do Diário Alimentar.', url: '/configuracoes', tag: 'teste-lembrete', kind: 'test' },
      config,
      300,
    )
    if (result.gone) {
      await supabase.rpc('delete_push_subscription', { p_endpoint: input.endpoint })
      return json({ error: 'O navegador não aceita mais notificações deste aparelho. Ative os lembretes de novo.' }, 410)
    }
    if (!result.ok) return json({ error: `O serviço de notificações do navegador respondeu com erro (${result.status || 'sem resposta'}).` }, 502)
    return json({ ok: true })
  }

  // --- varredura do agendador -------------------------------------------------
  const secret = Deno.env.get('CRON_SECRET')
  if (secret && req.headers.get('x-cron-secret') !== secret) return json({ error: 'Não autorizado.' }, 401)

  const { data, error } = await supabase.rpc('claim_due_reminders')
  if (error) return json({ error: error.message }, 500)
  const { subscriptions, notifications } = data as { subscriptions: Subscription[]; notifications: Reminder[] }
  if (!notifications.length) return json({ ok: true, due: 0, sent: 0 })

  const gone = new Set<string>()
  const release: { date: string; meal_type: string; kind: string }[] = []
  let sent = 0
  let failed = 0
  for (const n of notifications) {
    const results = await Promise.all(subscriptions.map((s) => sendPush(s, messageFor(n), config, n.ttl_seconds)))
    results.forEach((r, i) => {
      if (r.gone) gone.add(subscriptions[i]!.endpoint)
    })
    const delivered = results.filter((r) => r.ok).length
    sent += delivered
    failed += results.length - delivered
    // Nenhum aparelho recebeu: devolve o aviso para o próximo ciclo tentar de novo.
    if (delivered === 0) release.push({ date: n.date, meal_type: n.meal_type, kind: n.kind })
  }
  for (const endpoint of gone) await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint })
  if (release.length) await supabase.rpc('release_reminders', { p_items: release })

  return json({ ok: true, due: notifications.length, sent, failed, removed: gone.size, released: release.length })
}

// Nos testes (SEND_REMINDERS_TEST=1) o módulo é só importado, sem abrir o servidor.
if (Deno.env.get('SEND_REMINDERS_TEST') !== '1') Deno.serve(handler)
