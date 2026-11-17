// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

/**
 * Teste do service worker (public/sw.js) rodando o arquivo de verdade num ambiente
 * de mentira: eventos, notificações, janelas abertas e chamadas ao Supabase são simulados.
 */
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

const MEAL_PUSH = {
  title: 'Falta registrar: Almoço',
  body: 'Seu almoço ainda não foi anotado.',
  url: '/diario/2026-11-12?refeicao=lunch',
  tag: 'refeicao-2026-11-12-lunch',
  date: '2026-11-12',
  meal_type: 'lunch',
  kind: 'mid',
}

function boot(options: { key?: string; fetchOk?: boolean; windows?: any[] } = {}) {
  const key = options.key ?? 'eyJanon'
  const handlers: Record<string, (event: any) => void> = {}
  const shown: Array<{ title: string; options: any }> = []
  const fetchMock = vi.fn(async (_url: string, _init?: any) => {
    if (options.fetchOk === false) throw new TypeError('Failed to fetch')
    return { ok: true, status: 200, json: async () => true }
  })
  const windows = options.windows ?? []
  const self = {
    location: {
      href: `https://diario.test/sw.js?u=${encodeURIComponent('https://proj.supabase.co/')}&k=${key}&v=BPtest`,
      origin: 'https://diario.test',
    },
    navigator: { userAgent: 'Teste/1.0' },
    skipWaiting: vi.fn(),
    addEventListener: (name: string, fn: (event: any) => void) => {
      handlers[name] = fn
    },
    registration: {
      showNotification: vi.fn(async (title: string, opts: any) => {
        shown.push({ title, options: opts })
      }),
      pushManager: { subscribe: vi.fn() },
    },
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null) },
  }
  runInNewContext(source, { self, fetch: fetchMock, URL, atob, Uint8Array, Promise, JSON, String, Math })

  async function fire(name: string, event: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = []
    handlers[name]!({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
  }
  return { self, shown, fetchMock, fire, handlers }
}

const pushEvent = (payload: unknown) => ({ data: { json: () => payload } })
const clickEvent = (action: string, data: Record<string, unknown>) => ({
  action,
  notification: { data, close: vi.fn() },
})

describe('push', () => {
  it('mostra "Falta registrar" com os botões Registrar e Não fiz', async () => {
    const sw = boot()
    await sw.fire('push', pushEvent(MEAL_PUSH))
    expect(sw.shown).toHaveLength(1)
    const { title, options } = sw.shown[0]!
    expect(title).toBe('Falta registrar: Almoço')
    expect(options.actions).toEqual([
      { action: 'open', title: 'Registrar' },
      { action: 'skip', title: 'Não fiz' },
    ])
    expect(options.tag).toBe('refeicao-2026-11-12-lunch')
    expect(options.renotify).toBe(true)
    expect(options.data).toEqual({ url: '/diario/2026-11-12?refeicao=lunch', date: '2026-11-12', meal_type: 'lunch' })
  })

  it('o aviso de teste não tem botões', async () => {
    const sw = boot()
    await sw.fire('push', pushEvent({ title: 'Lembretes ativados', body: 'Teste', url: '/configuracoes', tag: 'teste-lembrete', kind: 'test' }))
    expect(sw.shown[0]!.options.actions).toBeUndefined()
    expect(sw.shown[0]!.options.data.url).toBe('/configuracoes')
  })

  it('sem dados legíveis ainda mostra um aviso (o navegador exige)', async () => {
    const sw = boot()
    await sw.fire('push', { data: { json: () => { throw new Error('json inválido') } } })
    await sw.fire('push', {})
    expect(sw.shown.map((n) => n.title)).toEqual(['Falta registrar', 'Falta registrar'])
    expect(sw.shown[0]!.options.data.url).toBe('/')
  })

  it('ignora endereço de outro site no aviso', async () => {
    const sw = boot()
    await sw.fire('push', pushEvent({ ...MEAL_PUSH, url: '//malicioso.example/x' }))
    expect(sw.shown[0]!.options.data.url).toBe('/')
  })
})

describe('botão "Não fiz"', () => {
  const data = { url: MEAL_PUSH.url, date: MEAL_PUSH.date, meal_type: 'lunch' }

  it('marca a refeição no Supabase, fecha o aviso e atualiza as abas abertas', async () => {
    const tab = { url: 'https://diario.test/diario', postMessage: vi.fn() }
    const sw = boot({ windows: [tab] })
    const event = clickEvent('skip', data)
    await sw.fire('notificationclick', event)
    expect(event.notification.close).toHaveBeenCalled()
    expect(sw.fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = sw.fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/mark_meal_skipped')
    expect(JSON.parse(init.body)).toEqual({ p_date: '2026-11-12', p_meal_type: 'lunch' })
    expect(init.headers.apikey).toBe('eyJanon')
    expect(init.headers.Authorization).toBe('Bearer eyJanon')
    expect(tab.postMessage).toHaveBeenCalledWith({ type: 'meal-skipped' })
    expect(sw.shown).toHaveLength(0)
  })

  it('chave sb_publishable_ vai só no cabeçalho apikey', async () => {
    const sw = boot({ key: 'sb_publishable_abc' })
    await sw.fire('notificationclick', clickEvent('skip', data))
    expect(sw.fetchMock.mock.calls[0]![1].headers.Authorization).toBeUndefined()
    expect(sw.fetchMock.mock.calls[0]![1].headers.apikey).toBe('sb_publishable_abc')
  })

  it('sem internet avisa que não conseguiu e leva ao diário ao tocar', async () => {
    const tab = { url: 'https://diario.test/', postMessage: vi.fn() }
    const sw = boot({ fetchOk: false, windows: [tab] })
    await sw.fire('notificationclick', clickEvent('skip', data))
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0]!.title).toMatch(/Não consegui marcar/)
    expect(sw.shown[0]!.options.data.url).toBe(MEAL_PUSH.url)
    expect(tab.postMessage).not.toHaveBeenCalled()
  })
})

describe('abrir o registro', () => {
  const data = { url: MEAL_PUSH.url, date: MEAL_PUSH.date, meal_type: 'lunch' }

  it('com o app aberto, foca a janela e manda navegar (sem recarregar)', async () => {
    const tab = { url: 'https://diario.test/historico', focused: false, focus: vi.fn(async () => tab), postMessage: vi.fn() }
    const sw = boot({ windows: [tab] })
    const event = clickEvent('open', data)
    await sw.fire('notificationclick', event)
    expect(event.notification.close).toHaveBeenCalled()
    expect(tab.focus).toHaveBeenCalled()
    expect(tab.postMessage).toHaveBeenCalledWith({ type: 'navigate', url: MEAL_PUSH.url })
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('o clique no corpo do aviso (sem botão) também abre o registro', async () => {
    const sw = boot()
    await sw.fire('notificationclick', clickEvent('', data))
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith('https://diario.test/diario/2026-11-12?refeicao=lunch')
  })

  it('com o app fechado, abre uma janela nova direto na refeição', async () => {
    const sw = boot()
    await sw.fire('notificationclick', clickEvent('open', data))
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith('https://diario.test/diario/2026-11-12?refeicao=lunch')
  })

  it('não usa janelas de outros sites', async () => {
    const other = { url: 'https://outro.example/', focus: vi.fn(), postMessage: vi.fn() }
    const sw = boot({ windows: [other] })
    await sw.fire('notificationclick', clickEvent('open', data))
    expect(other.postMessage).not.toHaveBeenCalled()
    expect(sw.self.clients.openWindow).toHaveBeenCalled()
  })
})

describe('inscrição trocada pelo navegador', () => {
  it('grava a nova inscrição e apaga a antiga', async () => {
    const sw = boot()
    const newSubscription = { toJSON: () => ({ endpoint: 'https://push.test/novo', keys: { p256dh: 'P', auth: 'A' } }) }
    await sw.fire('pushsubscriptionchange', { newSubscription, oldSubscription: { endpoint: 'https://push.test/antigo' } })
    const calls = sw.fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(init.body)])
    expect(calls[0]).toEqual([
      'https://proj.supabase.co/rest/v1/rpc/save_push_subscription',
      { p_endpoint: 'https://push.test/novo', p_p256dh: 'P', p_auth: 'A', p_user_agent: 'Teste/1.0' },
    ])
    expect(calls[1]).toEqual(['https://proj.supabase.co/rest/v1/rpc/delete_push_subscription', { p_endpoint: 'https://push.test/antigo' }])
  })
})

describe('ciclo de vida', () => {
  it('assume o controle das abas assim que instala e ativa', async () => {
    const sw = boot()
    await sw.fire('install')
    await sw.fire('activate')
    expect(sw.self.skipWaiting).toHaveBeenCalled()
    expect(sw.self.clients.claim).toHaveBeenCalled()
  })
})
