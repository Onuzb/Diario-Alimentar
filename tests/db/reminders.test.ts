/**
 * Testes dos lembretes de refeição no banco: horários, "Não fiz", inscrições de
 * notificação e a regra de quem avisar agora (claim_due_reminders).
 *
 * Como rodar (banco migrado, com as roles anon/authenticated/service_role):
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:54329/diario?host=/tmp npx vitest run tests/db
 *
 * Cada teste roda numa transação com ROLLBACK, como em schema.test.ts.
 * O Brasil não tem horário de verão: 08:30 em Brasília = 11:30 UTC.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'

const url = process.env.TEST_DATABASE_URL

const types = {
  getTypeParser: (id: number, format?: any) =>
    id === 1082 ? (v: string) => v : (pg.types.getTypeParser as any)(id, format),
}

const ENDPOINT = 'https://push.example.test/send/abc123'
const KEYS = { p256dh: 'BPtestkeytestkeytestkeytestkeytestkey', auth: 'authsecret1234' }

/** Hora de Brasília ("2026-11-12 08:30") → instante UTC em ISO. */
const br = (local: string) => new Date(`${local.replace(' ', 'T')}:00-03:00`).toISOString()

describe.skipIf(!url)('lembretes (banco)', () => {
  let c: pg.Client

  const q = async (sql: string, params: any[] = []): Promise<any[]> => (await c.query(sql, params)).rows
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const keys = Object.keys(args)
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
    return (await c.query(sql, keys.map((k) => args[k]))).rows[0].r
  }

  async function expectPgError(run: () => Promise<unknown>, code: string, message?: RegExp) {
    await c.query('savepoint expect_err')
    let error: any = null
    try {
      await run()
    } catch (e) {
      error = e
    }
    if (error) await c.query('rollback to savepoint expect_err')
    else await c.query('release savepoint expect_err')
    expect(error, `esperava erro ${code}`).not.toBeNull()
    expect(error.code).toBe(code)
    if (message) expect(error.message).toMatch(message)
  }

  /** Executa como outro papel e volta para anon. */
  async function as<T>(role: string, run: () => Promise<T>): Promise<T> {
    await c.query('reset role')
    await c.query(`set local role ${role}`)
    try {
      return await run()
    } finally {
      await c.query('reset role')
      await c.query('set local role anon')
    }
  }

  const claim = (local: string) => as('service_role', () => rpc('claim_due_reminders', { p_now: br(local) }))
  const subscribe = () =>
    rpc('save_push_subscription', { p_endpoint: ENDPOINT, p_p256dh: KEYS.p256dh, p_auth: KEYS.auth, p_user_agent: 'teste' })
  const kinds = (r: any) => r.notifications.map((n: any) => `${n.meal_type}:${n.kind}`)

  async function addMeal(date: string, type: string) {
    return rpc('add_food_to_meal', {
      p_meal_id: null, p_date: date, p_meal_type: type, p_food_id: null, p_food_name: `Comida ${type}`,
      p_quantity: null, p_consumed_time: null, p_observations: null,
    })
  }

  beforeAll(async () => {
    c = new pg.Client({ connectionString: url, types } as any)
    await c.connect()
  })
  afterAll(async () => {
    await c?.end()
  })
  beforeEach(async () => {
    await c.query('begin')
    await c.query(`
      delete from public.food_experiences;
      delete from public.meal_foods;
      delete from public.meals;
      delete from public.daily_diaries;
      delete from public.foods;
      delete from public.meal_skips;
      delete from public.push_subscriptions;
      delete from public.reminder_log;
      select public.reset_meal_schedule();`)
    await c.query('set local role anon')
  })
  afterEach(async () => {
    await c.query('rollback')
  })

  // ===========================================================================
  describe('horários', () => {
    it('vêm com os horários combinados, na ordem do dia', async () => {
      const s = await rpc('get_meal_schedule')
      expect(s.map((x: any) => [x.meal_type, x.start_time, x.end_time, x.enabled])).toEqual([
        ['breakfast', '08:00', '09:00', true],
        ['morning_snack', '09:00', '10:00', true],
        ['lunch', '12:00', '13:00', true],
        ['afternoon_snack', '16:00', '17:00', true],
        ['dinner', '21:00', '22:00', true],
        ['supper', '23:00', '01:00', true],
      ])
    })

    it('salva mudanças, desativa uma refeição e devolve tudo atualizado', async () => {
      const s = await rpc('save_meal_schedule', {
        p_items: JSON.stringify([
          { meal_type: 'lunch', start_time: '12:30', end_time: '13:45', enabled: true },
          { meal_type: 'breakfast', start_time: '07:00', end_time: '08:00', enabled: false },
        ]),
      })
      const lunch = s.find((x: any) => x.meal_type === 'lunch')
      const breakfast = s.find((x: any) => x.meal_type === 'breakfast')
      expect([lunch.start_time, lunch.end_time]).toEqual(['12:30', '13:45'])
      expect([breakfast.start_time, breakfast.enabled]).toEqual(['07:00', false])
      expect(s).toHaveLength(6)
    })

    it('aceita ceia que cruza a meia-noite', async () => {
      const s = await rpc('save_meal_schedule', {
        p_items: JSON.stringify([{ meal_type: 'supper', start_time: '22:30', end_time: '00:30', enabled: true }]),
      })
      expect(s.find((x: any) => x.meal_type === 'supper').end_time).toBe('00:30')
    })

    it('recusa horário com menos de 20 minutos, com mensagem em português', async () => {
      await expectPgError(
        () => rpc('save_meal_schedule', { p_items: JSON.stringify([{ meal_type: 'lunch', start_time: '12:00', end_time: '12:15', enabled: true }]) }),
        '22023',
        /almoço precisa ter pelo menos 20 minutos/,
      )
      await expectPgError(
        () => rpc('save_meal_schedule', { p_items: JSON.stringify([{ meal_type: 'dinner', start_time: '21:00', end_time: '21:00', enabled: true }]) }),
        '22023',
        /jantar precisa ter pelo menos 20 minutos/,
      )
    })

    it('recusa formato de hora inválido, refeição desconhecida e lista vazia', async () => {
      await expectPgError(
        () => rpc('save_meal_schedule', { p_items: JSON.stringify([{ meal_type: 'lunch', start_time: '8:30', end_time: '13:00' }]) }),
        '22023',
        /hora e minutos/,
      )
      await expectPgError(
        () => rpc('save_meal_schedule', { p_items: JSON.stringify([{ meal_type: 'lunch', start_time: '24:00', end_time: '13:00' }]) }),
        '22023',
      )
      await expectPgError(
        () => rpc('save_meal_schedule', { p_items: JSON.stringify([{ meal_type: 'brunch', start_time: '10:00', end_time: '11:00' }]) }),
        '22023',
        /desconhecida/,
      )
      await expectPgError(() => rpc('save_meal_schedule', { p_items: '[]' }), '22023')
    })

    it('é tudo ou nada: um item inválido não grava os anteriores', async () => {
      await expectPgError(
        () =>
          rpc('save_meal_schedule', {
            p_items: JSON.stringify([
              { meal_type: 'breakfast', start_time: '06:00', end_time: '07:00', enabled: true },
              { meal_type: 'lunch', start_time: '12:00', end_time: '12:05', enabled: true },
            ]),
          }),
        '22023',
      )
      const s = await rpc('get_meal_schedule')
      expect(s.find((x: any) => x.meal_type === 'breakfast').start_time).toBe('08:00')
    })

    it('a tabela também barra janelas curtas (constraint)', async () => {
      await expectPgError(
        () => q(`update meal_schedule set end_time = '12:10' where meal_type = 'lunch'`),
        '23514',
      )
    })

    it('restaura os horários padrão', async () => {
      await rpc('save_meal_schedule', {
        p_items: JSON.stringify([{ meal_type: 'lunch', start_time: '11:00', end_time: '12:00', enabled: false }]),
      })
      const s = await rpc('reset_meal_schedule')
      const lunch = s.find((x: any) => x.meal_type === 'lunch')
      expect([lunch.start_time, lunch.end_time, lunch.enabled]).toEqual(['12:00', '13:00', true])
    })
  })

  // ===========================================================================
  describe('"Não fiz"', () => {
    it('marca, aparece em get_day e pode ser desfeito', async () => {
      expect(await rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'lunch' })).toBe(true)
      expect(await rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'lunch' })).toBe(true) // repetir não dá erro
      expect(await q(`select 1 from meal_skips`)).toHaveLength(1)
      expect((await rpc('get_day', { p_date: '2026-11-12' })).skipped_meals).toEqual(['lunch'])
      expect((await rpc('get_day', { p_date: '2026-11-13' })).skipped_meals).toEqual([])

      expect(await rpc('unmark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'lunch' })).toBe(true)
      expect(await rpc('unmark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'lunch' })).toBe(false)
      expect((await rpc('get_day', { p_date: '2026-11-12' })).skipped_meals).toEqual([])
    })

    it('não marca refeição que já tem registro (devolve false, sem erro)', async () => {
      await addMeal('2026-11-12', 'lunch')
      expect(await rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'lunch' })).toBe(false)
      expect(await q(`select 1 from meal_skips`)).toHaveLength(0)
    })

    it('registrar a refeição depois desfaz o "Não fiz" daquele dia e tipo', async () => {
      await rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'lunch' })
      await rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'dinner' })
      await rpc('mark_meal_skipped', { p_date: '2026-11-11', p_meal_type: 'lunch' })
      await addMeal('2026-11-12', 'lunch')
      expect((await rpc('get_day', { p_date: '2026-11-12' })).skipped_meals).toEqual(['dinner'])
      expect((await rpc('get_day', { p_date: '2026-11-11' })).skipped_meals).toEqual(['lunch'])
    })

    it('valida data e tipo', async () => {
      await expectPgError(() => rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'brunch' }), '22023', /desconhecida/)
      await expectPgError(() => rpc('mark_meal_skipped', { p_date: null, p_meal_type: 'lunch' }), '22023')
    })

    it('a exportação inclui os "Não fiz" e os horários', async () => {
      await rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'supper' })
      const e = await rpc('export_all')
      expect(e.meal_skips).toHaveLength(1)
      expect(e.meal_skips[0]).toMatchObject({ skip_date: '2026-11-12', meal_type: 'supper' })
      expect(e.meal_schedule).toHaveLength(6)
    })
  })

  // ===========================================================================
  describe('inscrições de notificação', () => {
    it('anon não lê nem grava a tabela diretamente', async () => {
      await expectPgError(() => q(`select * from push_subscriptions`), '42501')
      await expectPgError(() => q(`insert into push_subscriptions (endpoint, p256dh, auth) values ('https://x.test/aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaa')`), '42501')
      await expectPgError(() => q(`select * from reminder_log`), '42501')
    })

    it('salva, atualiza as chaves, consulta e remove pelas funções', async () => {
      expect(await rpc('has_push_subscription', { p_endpoint: ENDPOINT })).toBe(false)
      expect(await subscribe()).toBe(true)
      expect(await rpc('has_push_subscription', { p_endpoint: ENDPOINT })).toBe(true)
      await rpc('save_push_subscription', { p_endpoint: ENDPOINT, p_p256dh: 'BPnovachavenovachavenovachave', p_auth: 'novaauth12345' })
      const rows = await as('service_role', () => q(`select p256dh, auth from push_subscriptions`))
      expect(rows).toEqual([{ p256dh: 'BPnovachavenovachavenovachave', auth: 'novaauth12345' }])
      expect(await rpc('delete_push_subscription', { p_endpoint: ENDPOINT })).toBe(true)
      expect(await rpc('delete_push_subscription', { p_endpoint: ENDPOINT })).toBe(false)
    })

    it('recusa endereço que não é https e chaves vazias', async () => {
      await expectPgError(
        () => rpc('save_push_subscription', { p_endpoint: 'http://inseguro.test/x', p_p256dh: KEYS.p256dh, p_auth: KEYS.auth }),
        '22023',
      )
      await expectPgError(
        () => rpc('save_push_subscription', { p_endpoint: ENDPOINT, p_p256dh: '', p_auth: KEYS.auth }),
        '22023',
      )
    })

    it('só a chave de serviço executa claim_due_reminders, release_reminders e get_push_subscription', async () => {
      await expectPgError(() => rpc('claim_due_reminders', { p_now: br('2026-11-12 08:30') }), '42501')
      await expectPgError(() => rpc('release_reminders', { p_items: '[]' }), '42501')
      await expectPgError(() => rpc('get_push_subscription', { p_endpoint: ENDPOINT }), '42501')
      await subscribe()
      expect(await as('service_role', () => rpc('get_push_subscription', { p_endpoint: ENDPOINT }))).toEqual({
        endpoint: ENDPOINT, p256dh: KEYS.p256dh, auth: KEYS.auth,
      })
      expect(await as('service_role', () => rpc('get_push_subscription', { p_endpoint: 'https://outro.test/x' }))).toBeNull()
      expect(await as('service_role', () => rpc('delete_push_subscription', { p_endpoint: ENDPOINT }))).toBe(true)
      await c.query('reset role')
      await c.query('set local role authenticated')
      await expectPgError(() => rpc('claim_due_reminders', { p_now: br('2026-11-12 08:30') }), '42501')
      await c.query('reset role')
      await c.query('set local role anon')
      const r = await claim('2026-11-12 08:30')
      expect(r).toEqual({ subscriptions: [], notifications: [] })
    })
  })

  // ===========================================================================
  describe('claim_due_reminders (quem avisar agora)', () => {
    it('sem aparelhos inscritos não avisa nem marca nada como enviado', async () => {
      const r = await claim('2026-11-12 08:30')
      expect(r.notifications).toEqual([])
      expect(await as('service_role', () => q(`select 1 from reminder_log`))).toHaveLength(0)
      await subscribe()
      expect(kinds(await claim('2026-11-12 08:30'))).toEqual(['breakfast:mid'])
    })

    it('avisa no meio do horário e perto do fim, uma vez cada', async () => {
      await subscribe()
      expect(kinds(await claim('2026-11-12 07:59'))).toEqual([])
      expect(kinds(await claim('2026-11-12 08:29'))).toEqual([])

      const mid = await claim('2026-11-12 08:30')
      expect(kinds(mid)).toEqual(['breakfast:mid'])
      expect(mid.subscriptions).toEqual([{ endpoint: ENDPOINT, p256dh: KEYS.p256dh, auth: KEYS.auth }])
      expect(mid.notifications[0]).toMatchObject({
        date: '2026-11-12',
        title: 'Falta registrar: Café da manhã',
        url: '/diario/2026-11-12?refeicao=breakfast',
        tag: 'refeicao-2026-11-12-breakfast',
        ttl_seconds: 1800,
      })
      expect(mid.notifications[0].body).toMatch(/Não fiz/)

      expect(kinds(await claim('2026-11-12 08:31'))).toEqual([]) // já avisou
      expect(kinds(await claim('2026-11-12 08:49'))).toEqual([])

      const end = await claim('2026-11-12 08:50')
      expect(kinds(end)).toEqual(['breakfast:end'])
      expect(end.notifications[0].body).toMatch(/termina às 09:00/)
      expect(end.notifications[0].ttl_seconds).toBe(600)
      expect(kinds(await claim('2026-11-12 08:55'))).toEqual([])

      expect(kinds(await claim('2026-11-12 09:00'))).toEqual([]) // janela do café fechou; o lanche só avisa às 09:30
    })

    it('se os dois momentos já venceram, manda só o último (e não manda o do meio depois)', async () => {
      await subscribe()
      expect(kinds(await claim('2026-11-12 12:55'))).toEqual(['lunch:end'])
      expect(kinds(await claim('2026-11-12 12:56'))).toEqual([])
    })

    it('não avisa refeição já registrada nem marcada como "Não fiz", mas avisa as outras', async () => {
      await subscribe()
      await addMeal('2026-11-12', 'breakfast')
      await rpc('mark_meal_skipped', { p_date: '2026-11-12', p_meal_type: 'morning_snack' })
      expect(kinds(await claim('2026-11-12 08:45'))).toEqual([])
      expect(kinds(await claim('2026-11-12 09:45'))).toEqual([])
      expect(kinds(await claim('2026-11-12 12:30'))).toEqual(['lunch:mid'])
    })

    it('registro de outro dia não conta', async () => {
      await subscribe()
      await addMeal('2026-11-11', 'breakfast')
      expect(kinds(await claim('2026-11-12 08:30'))).toEqual(['breakfast:mid'])
    })

    it('respeita refeição desativada e horários editados', async () => {
      await subscribe()
      await rpc('save_meal_schedule', {
        p_items: JSON.stringify([
          { meal_type: 'breakfast', start_time: '08:00', end_time: '09:00', enabled: false },
          { meal_type: 'lunch', start_time: '12:00', end_time: '12:40', enabled: true },
        ]),
      })
      expect(kinds(await claim('2026-11-12 08:30'))).toEqual([])
      expect(kinds(await claim('2026-11-12 12:19'))).toEqual([])
      expect(kinds(await claim('2026-11-12 12:20'))).toEqual(['lunch:mid'])
      expect(kinds(await claim('2026-11-12 12:30'))).toEqual(['lunch:end'])
    })

    it('a ceia que cruza a meia-noite pertence ao dia em que começou', async () => {
      await subscribe()
      expect(kinds(await claim('2026-11-12 23:30'))).toEqual([])
      const mid = await claim('2026-11-13 00:00')
      expect(kinds(mid)).toEqual(['supper:mid'])
      expect(mid.notifications[0]).toMatchObject({
        date: '2026-11-12',
        url: '/diario/2026-11-12?refeicao=supper',
        title: 'Falta registrar: Ceia',
      })
      expect(kinds(await claim('2026-11-13 00:20'))).toEqual([])
      const end = await claim('2026-11-13 00:50')
      expect(kinds(end)).toEqual(['supper:end'])
      expect(end.notifications[0].body).toMatch(/da ceia termina às 01:00/)
      expect(kinds(await claim('2026-11-13 01:00'))).toEqual([])
    })

    it('ceia registrada no dia em que começou silencia o aviso da madrugada', async () => {
      await subscribe()
      await addMeal('2026-11-12', 'supper')
      expect(kinds(await claim('2026-11-13 00:30'))).toEqual([])
    })

    it('release_reminders permite tentar o aviso de novo', async () => {
      await subscribe()
      const first = await claim('2026-11-12 16:30')
      expect(kinds(first)).toEqual(['afternoon_snack:mid'])
      expect(kinds(await claim('2026-11-12 16:31'))).toEqual([])
      const n = await as('service_role', () =>
        rpc('release_reminders', { p_items: JSON.stringify([{ date: '2026-11-12', meal_type: 'afternoon_snack', kind: 'mid' }]) }),
      )
      expect(n).toBe(1)
      expect(kinds(await claim('2026-11-12 16:32'))).toEqual(['afternoon_snack:mid'])
    })

    it('vários aparelhos recebem a mesma lista de avisos', async () => {
      await subscribe()
      await rpc('save_push_subscription', { p_endpoint: 'https://push.example.test/send/outro', p_p256dh: KEYS.p256dh, p_auth: KEYS.auth })
      const r = await claim('2026-11-12 21:30')
      expect(r.subscriptions).toHaveLength(2)
      expect(kinds(r)).toEqual(['dinner:mid'])
    })
  })
})
