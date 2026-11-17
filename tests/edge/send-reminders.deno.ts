/**
 * Testes da Edge Function send-reminders (precisa do Deno instalado).
 *
 *   deno test --allow-env --allow-net --allow-read tests/edge/send-reminders.deno.ts
 *   (ou: npm run test:edge)
 *
 * O vetor de teste abaixo é o do apêndice A da RFC 8291 (a mesma mensagem, as
 * mesmas chaves e o mesmo sal), e o resultado esperado foi conferido com a
 * biblioteca http_ece, que o navegador e o Web Push usam como referência.
 */
import nodeAssert from 'node:assert/strict'

function assert(value: unknown, message?: string): asserts value {
  nodeAssert.ok(value, message)
}
const assertEquals = (actual: unknown, expected: unknown) => nodeAssert.deepEqual(actual, expected)
const assertRejects = async (run: () => Promise<unknown>, _type: unknown, text: string) => {
  await nodeAssert.rejects(run, (error: Error) => error.message.includes(text))
}

Deno.env.set('SEND_REMINDERS_TEST', '1')
const mod = await import('../../supabase/functions/send-reminders/index.ts')
const { b64urlToBytes, bytesToB64url, encryptPayload, vapidAuthorization, sendPush } = mod

const AS_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
const AS_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg'
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw'
const EXPECTED_BODY =
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'

async function fixedSenderKey(): Promise<CryptoKeyPair> {
  const pub = b64urlToBytes(AS_PUBLIC)
  const jwk = { kty: 'EC', crv: 'P-256', x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), ext: true }
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  const privateKey = await crypto.subtle.importKey('jwk', { ...jwk, d: AS_PRIVATE }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return { publicKey, privateKey }
}

Deno.test('criptografia da mensagem bate com o vetor da RFC 8291', async () => {
  const body = await encryptPayload(
    { p256dh: UA_PUBLIC, auth: AUTH },
    new TextEncoder().encode('When I grow up, I want to be a watermelon'),
    { salt: b64urlToBytes(SALT), senderKey: await fixedSenderKey() },
  )
  assertEquals(bytesToB64url(body), EXPECTED_BODY)
})

Deno.test('cada mensagem usa sal e chave novos quando nada é fixado', async () => {
  const msg = new TextEncoder().encode('oi')
  const a = await encryptPayload({ p256dh: UA_PUBLIC, auth: AUTH }, msg)
  const b = await encryptPayload({ p256dh: UA_PUBLIC, auth: AUTH }, msg)
  assert(bytesToB64url(a) !== bytesToB64url(b))
  assertEquals(a.length, 16 + 4 + 1 + 65 + msg.length + 1 + 16)
})

Deno.test('recusa chave do aparelho inválida e mensagem grande demais', async () => {
  await assertRejects(() => encryptPayload({ p256dh: 'curta', auth: AUTH }, new Uint8Array(3)), Error, 'inválidas')
  await assertRejects(() => encryptPayload({ p256dh: 'AAAA', auth: AUTH }, new Uint8Array(3)), Error, 'p256dh')
  await assertRejects(() => encryptPayload({ p256dh: UA_PUBLIC, auth: AUTH }, new Uint8Array(4000)), Error, 'grande')
})

async function newVapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { pair, publicKey: bytesToB64url(raw), privateKey: jwk.d as string }
}

Deno.test('VAPID: cabeçalho assinado com ES256, audiência e validade corretas', async () => {
  const v = await newVapid()
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', v.publicKey, v.privateKey, 'mailto:eu@exemplo.com', 1_700_000_000)
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)
  assert(match, `formato inesperado: ${header}`)
  const [, h, c, s, k] = match
  assertEquals(k, v.publicKey)
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(c!)))
  assertEquals(claims, { aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 43200, sub: 'mailto:eu@exemplo.com' })
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlToBytes(h!))), { typ: 'JWT', alg: 'ES256' })
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    v.pair.publicKey,
    b64urlToBytes(s!) as unknown as BufferSource,
    new TextEncoder().encode(`${h}.${c}`) as unknown as BufferSource,
  )
  assert(ok, 'assinatura inválida')
})

Deno.test('sendPush: cabeçalhos, resultado 201, inscrição expirada e falhas', async () => {
  const v = await newVapid()
  const config = { publicKey: v.publicKey, privateKey: v.privateKey, subject: 'mailto:eu@exemplo.com' }
  const sub = { endpoint: 'https://push.example.test/abc', p256dh: UA_PUBLIC, auth: AUTH }
  const seen: { url: string; headers: Headers; size: number }[] = []
  const fake = (status: number | 'erro') => (async (input: string | URL | Request, init?: RequestInit) => {
    if (status === 'erro') throw new TypeError('rede fora')
    seen.push({ url: String(input), headers: new Headers(init?.headers), size: (init?.body as Uint8Array).length })
    return new Response('', { status })
  }) as typeof fetch

  const ok = await sendPush(sub, { title: 'x' }, config, 600, fake(201))
  assertEquals(ok, { ok: true, gone: false, status: 201 })
  const req = seen[0]!
  assertEquals(req.url, sub.endpoint)
  assertEquals(req.headers.get('content-encoding'), 'aes128gcm')
  assertEquals(req.headers.get('ttl'), '600')
  assertEquals(req.headers.get('urgency'), 'high')
  assert(req.headers.get('authorization')!.startsWith('vapid t='))

  assertEquals((await sendPush(sub, {}, config, 60, fake(410))).gone, true)
  assertEquals((await sendPush(sub, {}, config, 60, fake(404))).gone, true)
  assertEquals(await sendPush(sub, {}, config, 60, fake(503)), { ok: false, gone: false, status: 503 })
  assertEquals(await sendPush(sub, {}, config, 60, fake('erro')), { ok: false, gone: false, status: 0 })
})
