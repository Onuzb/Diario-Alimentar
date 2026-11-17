#!/usr/bin/env node
/**
 * Teste de ponta a ponta da Edge Function send-reminders, no seu computador:
 *
 *   banco local (npm run local:db) + servidor de teste (npm run local:api)
 *   + Deno + um "serviço de notificações" falso com HTTPS.
 *
 *   npm run local:push-test
 *
 * Confere: autorização por CRON_SECRET, quem é avisado (vem do banco, pelas
 * funções SQL reais), a criptografia e a assinatura VAPID da mensagem (conferidas
 * aqui por código independente, do Node), nova tentativa quando o envio falha,
 * remoção de aparelho expirado (410) e o aviso de teste.
 */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateVapidKeys } from '../generate-vapid-keys.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const API = process.env.SHIM_URL ?? 'http://127.0.0.1:54321'
const FUNC_PORT = 54399
const PUSH_PORT = 54398
const FUNC = `http://127.0.0.1:${FUNC_PORT}`
const DENO = process.env.DENO_BIN ?? (fs.existsSync('/tmp/denotest/node_modules/.bin/deno') ? '/tmp/denotest/node_modules/.bin/deno' : 'deno')
const SECRET = 'segredo-de-teste'
const ENDPOINT = `https://127.0.0.1:${PUSH_PORT}/push/aparelho-1`

const b64u = (b) => Buffer.from(b).toString('base64url')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
const ok = (msg) => {
  passed += 1
  console.log(`  ✓ ${msg}`)
}

async function rpc(name, args = {}, key = 'anon-test-key') {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: key },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  assert.ok(res.ok, `${name} falhou: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}
const service = (name, args) => rpc(name, args, 'service-test-key')

// --- aparelho falso (o navegador) -------------------------------------------
const ua = crypto.createECDH('prime256v1')
ua.generateKeys()
const authSecret = crypto.randomBytes(16)

function decrypt(body) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPub = body.subarray(21, 21 + idlen)
  const cipher = body.subarray(21 + idlen)
  assert.equal(body.readUInt32BE(16), 4096, 'tamanho do registro')
  const secret = ua.computeSecret(asPub)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub])
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, authSecret, keyInfo, 32))
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(cipher.subarray(-16))
  const plain = Buffer.concat([d.update(cipher.subarray(0, -16)), d.final()])
  assert.equal(plain.at(-1), 2, 'delimitador do último registro')
  return JSON.parse(plain.subarray(0, -1).toString('utf8'))
}

function verifyVapid(header, publicKey) {
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)
  assert.ok(m, `Authorization inesperado: ${header}`)
  const [, h, c, s, k] = m
  assert.equal(k, publicKey)
  const raw = Buffer.from(publicKey, 'base64url')
  const key = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) },
    format: 'jwk',
  })
  const valid = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
  assert.ok(valid, 'assinatura VAPID inválida')
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
  assert.equal(claims.aud, `https://127.0.0.1:${PUSH_PORT}`)
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400)
}

// --- serviço de notificações falso ------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'push-test-'))
execFileSync('openssl', [
  'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1',
  '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem'), '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=IP:127.0.0.1',
], { stdio: 'ignore' })
const received = []
let pushStatus = 201
const pushServer = https.createServer(
  { key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(path.join(tmp, 'c.pem')) },
  (req, res) => {
    const chunks = []
    req.on('data', (d) => chunks.push(d))
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(pushStatus)
      res.end()
    })
  },
)

let denoProcess
async function cleanup() {
  denoProcess?.kill('SIGTERM')
  pushServer.close()
  await fetch(`${API}/__reset`, { method: 'POST' }).catch(() => {})
  fs.rmSync(tmp, { recursive: true, force: true })
}

const callFunction = (body = {}, headers = {}) =>
  fetch(FUNC, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const sweep = async () => {
  const res = await callFunction({}, { 'x-cron-secret': SECRET })
  return { status: res.status, ...(await res.json()) }
}
const lastMessage = () => decrypt(received.at(-1).body)

function nowInSaoPaulo() {
  const [date, time] = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split(' ')
  const [h, m] = time.split(':').map(Number)
  return { date, minutes: h * 60 + m }
}
const hhmm = (min) => {
  const v = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

try {
  console.log('Edge Function send-reminders — teste de ponta a ponta')
  await fetch(`${API}/__reset`, { method: 'POST' })
  await new Promise((r) => pushServer.listen(PUSH_PORT, '127.0.0.1', r))

  const vapid = generateVapidKeys()
  denoProcess = spawn(
    DENO,
    ['run', '--allow-net', '--allow-env', '--allow-read', '--unsafely-ignore-certificate-errors', path.join(ROOT, 'supabase/functions/send-reminders/index.ts')],
    {
      env: {
        ...process.env,
        DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FUNC_PORT}`,
        SUPABASE_URL: API,
        SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: 'mailto:teste@exemplo.com',
        CRON_SECRET: SECRET,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
  for (let i = 0; i < 120; i += 1) {
    try {
      await fetch(FUNC, { method: 'OPTIONS' })
      break
    } catch {
      await sleep(500)
      assert.ok(i < 119, 'a função não subiu')
    }
  }
  ok('função no ar (Deno)')

  // preparação: um aparelho inscrito e só o almoço ativo, com o horário em volta de "agora"
  await rpc('save_push_subscription', { p_endpoint: ENDPOINT, p_p256dh: b64u(ua.getPublicKey()), p_auth: b64u(authSecret) })
  const { date, minutes } = nowInSaoPaulo()
  const schedule = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'].map((meal_type) =>
    meal_type === 'lunch'
      ? { meal_type, start_time: hhmm(minutes - 40), end_time: hhmm(minutes + 20), enabled: true }
      : { meal_type, start_time: '03:00', end_time: '03:30', enabled: false },
  )
  await rpc('save_meal_schedule', { p_items: schedule })

  // 1. autorização
  assert.equal((await callFunction({})).status, 401)
  assert.equal((await callFunction({}, { 'x-cron-secret': 'errado' })).status, 401)
  assert.equal(received.length, 0)
  ok('sem o CRON_SECRET certo a função recusa (401) e não envia nada')

  // 2. envio normal
  const first = await sweep()
  assert.deepEqual([first.status, first.due, first.sent, first.failed], [200, 1, 1, 0])
  assert.equal(received.length, 1)
  const req = received[0]
  assert.equal(req.url, '/push/aparelho-1')
  assert.equal(req.headers['content-encoding'], 'aes128gcm')
  assert.equal(req.headers.urgency, 'high')
  assert.ok(Number(req.headers.ttl) > 0 && Number(req.headers.ttl) <= 3600)
  verifyVapid(req.headers.authorization, vapid.publicKey)
  ok('aviso enviado ao aparelho, com assinatura VAPID válida')
  const msg = lastMessage()
  assert.equal(msg.title, 'Falta registrar: Almoço')
  assert.equal(msg.url, `/diario/${msg.date}?refeicao=lunch`)
  assert.equal(msg.kind, 'mid')
  assert.match(msg.body, /Não fiz/)
  assert.equal(msg.tag, `refeicao-${msg.date}-lunch`)
  ok(`mensagem decifrada no aparelho: "${msg.title}" → ${msg.url}`)

  // 3. não repete
  const second = await sweep()
  assert.deepEqual([second.due, received.length], [0, 1])
  ok('segunda varredura não repete o aviso')

  // 4. envio falha → aviso devolvido e tentado de novo
  await service('release_reminders', { p_items: [{ date: msg.date, meal_type: 'lunch', kind: 'mid' }] })
  pushStatus = 500
  const failed = await sweep()
  assert.deepEqual([failed.due, failed.sent, failed.failed, failed.released], [1, 0, 1, 1])
  pushStatus = 201
  const retry = await sweep()
  assert.deepEqual([retry.due, retry.sent], [1, 1])
  ok('falha no serviço de notificações: aviso devolvido e reenviado na varredura seguinte')

  // 5. aparelho expirado (410) é removido
  await service('release_reminders', { p_items: [{ date: msg.date, meal_type: 'lunch', kind: 'mid' }] })
  pushStatus = 410
  const gone = await sweep()
  assert.deepEqual([gone.due, gone.removed], [1, 1])
  assert.equal(await rpc('has_push_subscription', { p_endpoint: ENDPOINT }), false)
  ok('aparelho que não aceita mais notificações (410) é removido')
  pushStatus = 201

  // 6. aviso de teste (botão das Configurações)
  await rpc('save_push_subscription', { p_endpoint: ENDPOINT, p_p256dh: b64u(ua.getPublicKey()), p_auth: b64u(authSecret) })
  const before = received.length
  const test = await callFunction({ test: true, endpoint: ENDPOINT })
  assert.deepEqual([test.status, (await test.json()).ok], [200, true])
  assert.equal(received.length, before + 1)
  assert.equal(lastMessage().title, 'Lembretes ativados')
  ok('aviso de teste chega ao aparelho (sem precisar do CRON_SECRET)')
  const unknown = await callFunction({ test: true, endpoint: 'https://127.0.0.1:1/nao-existe' })
  assert.equal(unknown.status, 404)
  ok('aviso de teste para aparelho não inscrito: 404 com mensagem em português')
  pushStatus = 410
  const expired = await callFunction({ test: true, endpoint: ENDPOINT })
  assert.equal(expired.status, 410)
  assert.equal(await rpc('has_push_subscription', { p_endpoint: ENDPOINT }), false)
  ok('aviso de teste para aparelho expirado: 410 e inscrição removida')

  // 7. CORS (o site chama a função do navegador)
  const preflight = await fetch(FUNC, { method: 'OPTIONS', headers: { origin: 'https://exemplo.vercel.app', 'access-control-request-headers': 'content-type,apikey' } })
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  assert.match(preflight.headers.get('access-control-allow-headers'), /apikey/)
  ok('CORS liberado para o site')

  console.log(`\n${passed} verificações passaram.`)
} catch (error) {
  console.error('\nFALHOU:', error)
  process.exitCode = 1
} finally {
  await cleanup()
}
