/*
 * Service worker do Diário Alimentar.
 * Recebe os lembretes de refeição (Web Push) mesmo com o site fechado, mostra a
 * notificação "Falta registrar" e trata os cliques: abrir o registro da refeição
 * ou marcar "Não fiz" direto na notificação.
 *
 * O endereço do Supabase e a chave pública chegam pela URL de registro
 * (/sw.js?u=...&k=...&v=...), porque este arquivo não passa pelo build do Vite.
 */
'use strict'

const params = new URL(self.location.href).searchParams
const SUPABASE_URL = (params.get('u') || '').replace(/\/+$/, '')
const SUPABASE_KEY = params.get('k') || ''
const VAPID_KEY = params.get('v') || ''

const ICON = '/icon-192.png'
const BADGE = '/badge-96.png'
const DEFAULT_TAG = 'diario-alimentar'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/* ------------------------------------------------------------------ push -- */

function readPayload(event) {
  try {
    return event.data ? event.data.json() : null
  } catch (_) {
    return null
  }
}

function safePath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function showReminder(event) {
  const payload = readPayload(event) || {}
  const isMeal = typeof payload.date === 'string' && typeof payload.meal_type === 'string'
  const options = {
    body: payload.body || 'Toque para abrir o diário.',
    icon: ICON,
    badge: BADGE,
    lang: 'pt-BR',
    // Mesma etiqueta para os dois avisos da mesma refeição: o segundo troca o primeiro e toca de novo.
    tag: payload.tag || DEFAULT_TAG,
    renotify: true,
    data: {
      url: safePath(payload.url),
      date: isMeal ? payload.date : null,
      meal_type: isMeal ? payload.meal_type : null,
    },
  }
  if (isMeal) {
    options.actions = [
      { action: 'open', title: 'Registrar' },
      { action: 'skip', title: 'Não fiz' },
    ]
  }
  // Todo push precisa mostrar uma notificação; sem dados legíveis, vale o aviso genérico.
  return self.registration.showNotification(payload.title || 'Falta registrar', options)
}

self.addEventListener('push', (event) => {
  event.waitUntil(showReminder(event))
})

/* ----------------------------------------------------------------- clique -- */

function rpc(name, body) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.reject(new Error('Site sem configuração do Supabase.'))
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + SUPABASE_KEY
  return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers, body: JSON.stringify(body) }).then((response) => {
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return response.json()
  })
}

async function windowClients() {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return all.filter((client) => {
    try {
      return new URL(client.url).origin === self.location.origin
    } catch (_) {
      return false
    }
  })
}

async function openApp(path) {
  const open = await windowClients()
  const client = open.find((c) => c.focused) || open[0]
  if (client) {
    try {
      await client.focus()
    } catch (_) {
      /* o navegador pode negar o foco; a mensagem abaixo ainda leva ao lugar certo */
    }
    // O app navega sozinho, sem recarregar a página.
    client.postMessage({ type: 'navigate', url: path })
    return
  }
  await self.clients.openWindow(new URL(path, self.location.origin).href)
}

async function skipMeal(data) {
  try {
    await rpc('mark_meal_skipped', { p_date: data.date, p_meal_type: data.meal_type })
  } catch (_) {
    // Sem internet (ou o banco recusou): avisa e deixa abrir o diário para marcar lá.
    await self.registration.showNotification('Não consegui marcar "Não fiz"', {
      body: 'Toque para abrir o diário e marcar por lá.',
      icon: ICON,
      badge: BADGE,
      lang: 'pt-BR',
      tag: (data.date || '') + '-' + (data.meal_type || '') + '-erro',
      data: { url: data.url, date: null, meal_type: null },
    })
    return
  }
  // Abas abertas recarregam os dados para mostrar a marca.
  for (const client of await windowClients()) client.postMessage({ type: 'meal-skipped' })
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {}
  event.notification.close()
  if (event.action === 'skip' && data.date && data.meal_type) {
    event.waitUntil(skipMeal(data))
    return
  }
  event.waitUntil(openApp(safePath(data.url)))
})

/* ------------------------------------------- inscrição trocada pelo navegador -- */

function keyToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function renewSubscription(event) {
  if (!VAPID_KEY) return
  const subscription =
    event.newSubscription ||
    (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_KEY) }))
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys) return
  await rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: String((self.navigator && self.navigator.userAgent) || '').slice(0, 300),
  })
  const previous = event.oldSubscription
  if (previous && previous.endpoint && previous.endpoint !== json.endpoint) {
    await rpc('delete_push_subscription', { p_endpoint: previous.endpoint }).catch(() => undefined)
  }
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(renewSubscription(event).catch(() => undefined))
})
