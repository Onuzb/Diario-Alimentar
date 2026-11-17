import { env } from '@/config/env'
import { AppError } from '@/lib/errors'
import { callRpc } from '@/services/client'

/**
 * Notificações no aparelho (Web Push). O navegador guarda a inscrição; o banco
 * guarda uma cópia para a Edge Function saber a quem avisar.
 */

export type PushSupport = { supported: true } | { supported: false; reason: 'ios' | 'browser' }

export interface PushStatus {
  support: PushSupport
  /** Falta a chave VITE_VAPID_PUBLIC_KEY no site. */
  configured: boolean
  permission: NotificationPermission | 'unsupported'
  /** Este aparelho está inscrito e o banco sabe disso. */
  subscribed: boolean
}

export function getPushSupport(): PushSupport {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return { supported: true }
  }
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return { supported: false, reason: ios ? 'ios' : 'browser' }
}

/** O service worker recebe o endereço e a chave do banco pela URL, para o botão "Não fiz" da notificação. */
export function serviceWorkerUrl(): string {
  const query = new URLSearchParams({ u: env.supabaseUrl, k: env.supabaseAnonKey, v: env.vapidPublicKey })
  return `/sw.js?${query.toString()}`
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' })
  return navigator.serviceWorker.ready
}

async function getBrowserSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration ? registration.pushManager.getSubscription() : null
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    throw new AppError('O navegador não devolveu as chaves da notificação. Tente de novo.')
  }
  await callRpc<boolean>('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
}

export async function getPushStatus(): Promise<PushStatus> {
  const support = getPushSupport()
  const configured = Boolean(env.vapidPublicKey)
  if (!support.supported) return { support, configured, permission: 'unsupported', subscribed: false }

  const permission = Notification.permission
  let subscribed = false
  if (permission === 'granted') {
    const subscription = await getBrowserSubscription()
    if (subscription) {
      // Se o banco perdeu esta inscrição (por exemplo, foi recriado), grava de novo.
      const known = await callRpc<boolean>('has_push_subscription', { p_endpoint: subscription.endpoint })
      if (!known) await saveSubscription(subscription)
      subscribed = true
    }
  }
  return { support, configured, permission, subscribed }
}

/** Pede permissão, inscreve este aparelho e guarda a inscrição no banco. */
export async function enablePush(): Promise<void> {
  const support = getPushSupport()
  if (!support.supported) throw new AppError('Este navegador não recebe notificações do site.')
  if (!env.vapidPublicKey) {
    throw new AppError('Falta a chave VITE_VAPID_PUBLIC_KEY no site. Veja a seção "Lembretes de refeição" do README.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new AppError(
      permission === 'denied'
        ? 'As notificações estão bloqueadas neste navegador. Libere-as no cadeado ao lado do endereço do site e tente de novo.'
        : 'A permissão para notificações não foi concedida. Clique em Permitir quando o navegador perguntar.',
    )
  }

  try {
    const registration = await registerServiceWorker()
    const key = urlBase64ToBytes(env.vapidPublicKey)
    let subscription = await registration.pushManager.getSubscription()
    // Chave VAPID trocada: a inscrição antiga não serve mais.
    if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe()
      subscription = null
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await saveSubscription(subscription)
  } catch (error) {
    if (error instanceof AppError) throw error
    const name = error instanceof Error ? error.name : ''
    const text = error instanceof Error ? error.message : String(error)
    if (name === 'AbortError' || /push service/i.test(text)) {
      throw new AppError(
        'O navegador não conseguiu se registrar no serviço de notificações. No Brave, ative "Usar serviços do Google para mensagens push" nas configurações de privacidade. Em redes com bloqueio, tente outra rede.',
        undefined,
        { cause: error, technical: true, detail: `${name}: ${text}`.slice(0, 400) },
      )
    }
    throw new AppError('Não foi possível ativar as notificações neste aparelho.', undefined, {
      cause: error,
      technical: true,
      generic: true,
      detail: `${name}: ${text}`.slice(0, 400),
    })
  }
}

export async function disablePush(): Promise<void> {
  const subscription = await getBrowserSubscription()
  if (!subscription) return
  await callRpc<boolean>('delete_push_subscription', { p_endpoint: subscription.endpoint })
  await subscription.unsubscribe()
}

/** Pede à Edge Function um aviso de teste para este aparelho. */
export async function sendTestPush(): Promise<void> {
  const subscription = await getBrowserSubscription()
  if (!subscription) throw new AppError('Este aparelho ainda não está com os lembretes ativados.')

  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: env.supabaseAnonKey }
  if (env.supabaseAnonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${env.supabaseAnonKey}`

  let response: Response
  try {
    response = await fetch(`${env.supabaseUrl}/functions/v1/send-reminders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ test: true, endpoint: subscription.endpoint }),
    })
  } catch (error) {
    throw new AppError('Não consegui chamar a função send-reminders. Confira a conexão e se ela foi publicada no Supabase.', undefined, {
      cause: error,
      technical: true,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
  if (response.ok) return

  const text = await response.text().catch(() => '')
  let body: { error?: string; message?: string } | null = null
  try {
    body = JSON.parse(text) as { error?: string; message?: string }
  } catch {
    body = null
  }
  const detail = `HTTP ${response.status}${text ? ` · ${text}` : ''}`.slice(0, 400)
  let message = body?.error ?? 'A função send-reminders respondeu com erro.'
  if (response.status === 404 && !body?.error) {
    message = 'A função send-reminders não foi encontrada no Supabase. Publique a função (veja o README).'
  } else if (response.status === 401 || response.status === 403) {
    message = 'O Supabase recusou a chamada da função. Desligue "Verify JWT" na função send-reminders (veja o README).'
  }
  throw new AppError(message, String(response.status), { status: response.status, technical: true, detail })
}
