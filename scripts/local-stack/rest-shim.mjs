#!/usr/bin/env node
/**
 * Servidor de teste que imita a parte da API REST do Supabase (PostgREST) usada
 * pelo app, falando com o Postgres local (`npm run local:db`).
 *
 * SÓ PARA TESTE LOCAL. Não faz parte do app nem vai para produção: o site de
 * verdade fala direto com o seu projeto Supabase.
 *
 * Cada requisição roda numa transação com `set local role anon`, então as
 * permissões e a RLS do banco são exercitadas de verdade.
 *
 * Rotas:
 *   POST   /rest/v1/rpc/<função>         chama uma função do schema public
 *   GET    /rest/v1/<tabela>             select, order, limit, offset
 *   PATCH  /rest/v1/<tabela>?col=eq.x    update
 *   DELETE /rest/v1/<tabela>?col=eq.x    delete
 * Controle para o teste ponta a ponta:
 *   POST   /__reset                      apaga todos os dados
 *   POST   /__mode  {mode, delayMs}      mode: "ok" | "down" | "slow" | "badkey" | "badurl"
 */
import http from 'node:http'
import pg from 'pg'

const PORT = Number(process.env.SHIM_PORT ?? 54321)
const PG = {
  host: process.env.PGHOST_LOCAL ?? '/tmp',
  port: Number(process.env.PGPORT_LOCAL ?? 54329),
  user: 'postgres',
  database: 'diario',
}

// date vem como "YYYY-MM-DD" (sem conversão de fuso).
pg.types.setTypeParser(1082, (v) => v)

const pool = new pg.Pool({ ...PG, max: 8 })
const TABLES = new Set(['foods', 'foods_overview', 'daily_diaries', 'meals', 'meal_foods', 'food_experiences'])
const IDENT = /^[a-z_][a-z0-9_]*$/

let mode = 'ok'
let delayMs = 0
const log = []

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range')
}

function send(res, status, body) {
  cors(res)
  if (body === undefined) {
    res.writeHead(status)
    res.end()
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function statusForPgCode(code) {
  if (!code) return 400
  if (code.startsWith('23')) return 409
  if (code === '42501') return 403
  if (code === '42883' || code === '42P01') return 404
  if (code === 'P0001') return 400
  return 400
}

function sendPgError(res, err) {
  send(res, statusForPgCode(err.code), {
    code: err.code ?? 'PGRST000',
    message: err.message,
    details: err.detail ?? null,
    hint: err.hint ?? null,
  })
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

/** Roda `fn(client)` numa transação como o papel anon. */
async function asAnon(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role anon')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

function parseFilters(params, values) {
  const clauses = []
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue
    if (!IDENT.test(key)) throw Object.assign(new Error(`coluna inválida: ${key}`), { code: 'PGRST100' })
    const match = /^(eq|neq|gt|gte|lt|lte|ilike)\.(.*)$/.exec(raw)
    if (!match) throw Object.assign(new Error(`filtro não suportado: ${key}=${raw}`), { code: 'PGRST100' })
    const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', ilike: 'ilike' }
    values.push(match[2])
    clauses.push(`"${key}" ${ops[match[1]]} $${values.length}`)
  }
  return clauses.length ? ` where ${clauses.join(' and ')}` : ''
}

function selectList(params) {
  const select = params.get('select') ?? '*'
  if (select === '*') return '*'
  const cols = select.split(',')
  if (!cols.every((c) => IDENT.test(c))) throw Object.assign(new Error('select inválido'), { code: 'PGRST100' })
  return cols.map((c) => `"${c}"`).join(', ')
}

async function handleRpc(req, res, fn) {
  if (!IDENT.test(fn)) return send(res, 404, { code: 'PGRST202', message: 'função inválida' })
  const args = await readBody(req)
  const keys = Object.keys(args)
  if (!keys.every((k) => IDENT.test(k))) return send(res, 400, { code: 'PGRST100', message: 'argumento inválido' })
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
  const values = keys.map((k) => {
    const v = args[k]
    // Arrays e objetos vão como JSON; o Postgres converte para o tipo do parâmetro.
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v
  })
  try {
    const rows = await asAnon((c) => c.query(sql, values))
    send(res, 200, rows.rows[0].r)
  } catch (err) {
    sendPgError(res, err)
  }
}

async function handleTable(req, res, table, url) {
  if (!TABLES.has(table)) return send(res, 404, { code: 'PGRST205', message: `tabela desconhecida: ${table}` })
  const params = url.searchParams
  try {
    const values = []
    if (req.method === 'GET') {
      let sql = `select ${selectList(params)} from public."${table}"${parseFilters(params, values)}`
      const order = params.get('order')
      if (order) {
        const parts = order.split(',').map((o) => {
          const [col, dir = 'asc'] = o.split('.')
          if (!IDENT.test(col) || !['asc', 'desc'].includes(dir)) throw new Error('order inválido')
          return `"${col}" ${dir}`
        })
        sql += ` order by ${parts.join(', ')}`
      }
      if (params.get('limit')) sql += ` limit ${Number(params.get('limit'))}`
      if (params.get('offset')) sql += ` offset ${Number(params.get('offset'))}`
      const result = await asAnon((c) => c.query(sql, values))
      return send(res, 200, result.rows)
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req)
      const keys = Object.keys(body)
      if (keys.length === 0 || !keys.every((k) => IDENT.test(k))) return send(res, 400, { code: 'PGRST102', message: 'corpo inválido' })
      keys.forEach((k) => values.push(body[k]))
      const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
      const sql = `update public."${table}" set ${sets}${parseFilters(params, values)} returning ${selectList(params)}`
      const result = await asAnon((c) => c.query(sql, values))
      return send(res, 200, result.rows)
    }
    if (req.method === 'DELETE') {
      const sql = `delete from public."${table}"${parseFilters(params, values)} returning ${selectList(params)}`
      const result = await asAnon((c) => c.query(sql, values))
      return send(res, 200, result.rows)
    }
    return send(res, 405, { code: 'PGRST117', message: 'método não suportado' })
  } catch (err) {
    sendPgError(res, err)
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (req.method === 'OPTIONS') return send(res, 204)

  if (url.pathname === '/__reset' && req.method === 'POST') {
    await pool.query('truncate public.meal_foods, public.food_experiences, public.meals, public.daily_diaries, public.foods cascade')
    mode = 'ok'
    delayMs = 0
    log.length = 0
    return send(res, 200, { ok: true })
  }
  if (url.pathname === '/__mode' && req.method === 'POST') {
    const body = await readBody(req)
    mode = body.mode ?? 'ok'
    delayMs = Number(body.delayMs ?? 0)
    return send(res, 200, { mode, delayMs })
  }
  if (url.pathname === '/__log' && req.method === 'GET') return send(res, 200, log)

  if (!url.pathname.startsWith('/rest/v1/')) return send(res, 404, { message: 'não encontrado' })

  log.push(`${req.method} ${url.pathname}`)
  if (mode === 'down') {
    return send(res, 503, { code: 'PGRST000', message: 'Could not connect with the database' })
  }
  if (mode === 'badkey') {
    // O que o Supabase devolve para uma chave inválida: sem "code" do Postgres.
    return send(res, 401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' })
  }
  if (mode === 'badurl') return send(res, 404, {})
  if (mode === 'slow' || delayMs > 0) await new Promise((r) => setTimeout(r, delayMs || 1200))

  const rest = url.pathname.slice('/rest/v1/'.length)
  if (rest.startsWith('rpc/')) return handleRpc(req, res, rest.slice(4))
  return handleTable(req, res, rest, url)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor de teste (imita a API do Supabase) em http://127.0.0.1:${PORT}`)
})

process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))))
