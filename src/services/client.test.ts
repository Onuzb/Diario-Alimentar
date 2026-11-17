import { afterEach, describe, expect, it, vi } from 'vitest'
import { toAppError } from '@/lib/errors'
import { withTimeout } from '@/services/client'

afterEach(() => vi.useRealTimers())

describe('withTimeout', () => {
  it('devolve a resposta quando ela chega a tempo', async () => {
    const base = vi.fn(async () => new Response('ok'))
    const response = await withTimeout(base as unknown as typeof fetch, 1000)('https://x.test')
    expect(await response.text()).toBe('ok')
  })

  it('cancela a chamada que passa do limite e lança TimeoutError', async () => {
    vi.useFakeTimers()
    let aborted = false
    const base = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    const pending = withTimeout(base as unknown as typeof fetch, 5000)('https://x.test')
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(aborted).toBe(true)
  })

  it('mantém o cancelamento feito por quem chamou (não vira TimeoutError)', async () => {
    const outer = new AbortController()
    const base = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const pending = withTimeout(base as unknown as typeof fetch, 60_000)('https://x.test', { signal: outer.signal })
    outer.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('erro de tempo esgotado', () => {
  it('vira uma mensagem em português que manda conferir se o registro entrou', () => {
    const error = toAppError({ message: 'TimeoutError: a chamada passou de 30 s sem resposta', details: '', hint: '', code: '' })
    expect(error.message).toMatch(/demorou demais/)
    expect(error.message).toMatch(/atualize a página/)
    expect(error.technical).toBe(true)
  })
})
