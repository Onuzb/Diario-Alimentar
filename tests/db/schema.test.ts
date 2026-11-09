/**
 * Testes do banco (constraints, RLS, triggers e funções RPC) num PostgreSQL real.
 *
 * Como rodar (o banco já precisa estar migrado, com as roles anon/authenticated):
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/diario npx vitest run tests/db
 *
 * Sem TEST_DATABASE_URL a suíte é ignorada.
 *
 * Cada teste roda numa transação com `set local role anon` e termina com ROLLBACK.
 * No início de cada transação os dados existentes são apagados (dentro da própria
 * transação), então os resultados não dependem do que já está no banco e nada
 * permanece depois. Os poucos testes que precisam de commits reais (updated_at,
 * ordem de "últimas atividades", atomicidade) usam um segundo cliente, dados com
 * prefixo "ztest-" / data 2099-12-31 e limpam tudo no final.
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import pg from 'pg'

const url = process.env.TEST_DATABASE_URL

// DATE vem como string "YYYY-MM-DD" (sem conversão de fuso do driver).
const types = {
  getTypeParser: (id: number, format?: any) =>
    id === 1082 ? (v: string) => v : (pg.types.getTypeParser as any)(id, format),
}

const D: Record<string, Record<string, unknown>> = {
  save_meal: {
    p_meal_id: null, p_date: null, p_meal_type: null, p_meal_time: null,
    p_feelings: null, p_thoughts: null, p_observations: null, p_feeling_tags: null,
  },
  add_food_to_meal: {
    p_meal_id: null, p_date: null, p_meal_type: null, p_food_id: null, p_food_name: null,
    p_quantity: null, p_consumed_time: null, p_observations: null,
  },
  save_food_experience: {
    p_id: null, p_food_id: null, p_food_name: null, p_type: 'new_food', p_date: null, p_time: null,
    p_feelings: null, p_thoughts: null, p_after_experience: null, p_observations: null,
    p_feeling_tags: null, p_replaced_food_id: null, p_replaced_food_name: null,
  },
  search_history: { p_query: null, p_from: null, p_to: null, p_limit: 30, p_offset: 0 },
  get_experiences: { p_type: null, p_from: null, p_to: null, p_food_id: null, p_limit: 30, p_offset: 0 },
  get_report: { p_from: null, p_to: null },
}

describe.skipIf(!url)('banco de dados', () => {
  let c: pg.Client // transacional (rollback)
  let c2: pg.Client // commits reais (poucos testes)

  const q = async (sql: string, params: any[] = []): Promise<any[]> => (await c.query(sql, params)).rows
  const one = async (sql: string, params: any[] = []): Promise<any> => (await q(sql, params))[0]

  async function rpcOn(client: pg.Client, fn: string, args: Record<string, unknown> = {}) {
    const keys = Object.keys(args)
    const sql = keys.length
      ? `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
      : `select public.${fn}() as r`
    return (await client.query(sql, keys.map((k) => args[k]))).rows[0].r
  }
  const call = (fn: string, args: Record<string, unknown> = {}) =>
    rpcOn(c, fn, { ...(D[fn] ?? {}), ...args })

  /** Espera um erro do Postgres sem abortar a transação do teste. */
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

  // ---- helpers de dados --------------------------------------------------
  const newFood = async (name: string): Promise<string> => call('get_or_create_food', { p_name: name }) as any
  const saveMeal = (a: Record<string, unknown>) => call('save_meal', a)
  const addFood = (a: Record<string, unknown>) => call('add_food_to_meal', a)
  const saveExp = (a: Record<string, unknown>) => call('save_food_experience', a)

  /** Cria uma refeição na data com os alimentos (por nome). Devolve o id da refeição. */
  async function meal(date: string, type: string, foods: string[], extra: Record<string, unknown> = {}) {
    let mealId: string | null = null
    for (const name of foods) {
      const r: any = await addFood({
        p_meal_id: mealId, p_date: date, p_meal_type: type, p_food_name: name, ...extra,
      })
      mealId = r.meal_id
    }
    return mealId as string
  }

  beforeAll(async () => {
    c = new pg.Client({ connectionString: url, types } as any)
    c2 = new pg.Client({ connectionString: url, types } as any)
    await c.connect()
    await c2.connect()
  })

  afterAll(async () => {
    await c?.end()
    await c2?.end()
  })

  beforeEach(async () => {
    await c.query('begin')
    // Como superusuário, dentro da transação: tela limpa para o teste.
    await c.query(`
      delete from public.food_experiences;
      delete from public.meal_foods;
      delete from public.meals;
      delete from public.daily_diaries;
      delete from public.foods;`)
    await c.query('set local role anon')
  })

  afterEach(async () => {
    await c.query('rollback')
  })

  // ===========================================================================
  describe('constraints', () => {
    it('rejeita tipo de refeição inválido', async () => {
      const d = await call('get_or_create_diary', { p_date: '2026-11-06' })
      await expectPgError(
        () => q(`insert into meals (diary_id, meal_type) values ($1, 'brunch')`, [d]),
        '23514', /meals_type_valid/)
    })

    it('rejeita tag de sentimento inválida em refeições e experiências', async () => {
      const d = await call('get_or_create_diary', { p_date: '2026-11-06' })
      await expectPgError(
        () => q(`insert into meals (diary_id, meal_type, feeling_tags) values ($1, 'lunch', '{bad}')`, [d]),
        '23514', /meals_feeling_tags_valid/)
      const f = await newFood('Pão')
      await expectPgError(
        () => q(`insert into food_experiences (food_id, experience_type, experience_date, feeling_tags)
                 values ($1, 'new_food', '2026-11-06', '{calm,bad}')`, [f]),
        '23514', /food_experiences_feeling_tags_valid/)
    })

    it('aceita todas as tags válidas e rejeita mais de 10', async () => {
      const d = await call('get_or_create_diary', { p_date: '2026-11-06' })
      const all = ['calm', 'happy', 'curious', 'hungry', 'satisfied', 'neutral', 'not_hungry', 'anxious', 'uncomfortable', 'tired']
      await q(`insert into meals (diary_id, meal_type, feeling_tags) values ($1, 'lunch', $2)`, [d, all])
      await expectPgError(
        () => q(`insert into meals (diary_id, meal_type, feeling_tags) values ($1, 'lunch', $2)`, [d, [...all, 'calm']]),
        '23514')
    })

    it('rejeita texto acima do limite', async () => {
      const d = await call('get_or_create_diary', { p_date: '2026-11-06' })
      await expectPgError(
        () => q(`insert into meals (diary_id, meal_type, feelings) values ($1, 'lunch', repeat('a', 2001))`, [d]),
        '23514', /meals_text_length/)
      await q(`insert into meals (diary_id, meal_type, feelings) values ($1, 'lunch', repeat('a', 2000))`, [d])
      await expectPgError(
        () => q(`update daily_diaries set general_observations = repeat('a', 4001) where id = $1`, [d]),
        '23514', /daily_diaries_observations_length/)
      const m = await one(`select id from meals limit 1`)
      const f = await newFood('Arroz')
      await expectPgError(
        () => q(`insert into meal_foods (meal_id, food_id, quantity) values ($1, $2, repeat('a', 81))`, [m.id, f]),
        '23514', /meal_foods_quantity_length/)
    })

    it('rejeita nome de alimento vazio ou com mais de 80 caracteres', async () => {
      await expectPgError(() => q(`insert into foods (name) values ('   ')`), '23514')
      await expectPgError(() => q(`insert into foods (name) values (repeat('a', 81))`), '23514', /foods_name_length/)
      await q(`insert into foods (name) values (repeat('a', 80))`)
    })

    it('rejeita data fora da faixa', async () => {
      await expectPgError(() => q(`insert into daily_diaries (date) values ('1999-12-31')`), '23514', /daily_diaries_date_range/)
      await expectPgError(() => q(`insert into daily_diaries (date) values ('2101-01-01')`), '23514')
      const f = await newFood('Pão')
      await expectPgError(
        () => q(`insert into food_experiences (food_id, experience_type, experience_date)
                 values ($1, 'new_food', '2101-01-01')`, [f]),
        '23514', /food_experiences_date_range/)
    })

    it('rejeita tipo de experiência inválido', async () => {
      const f = await newFood('Pão')
      await expectPgError(
        () => q(`insert into food_experiences (food_id, experience_type, experience_date)
                 values ($1, 'other', '2026-11-06')`, [f]),
        '23514', /food_experiences_type_valid/)
    })

    it('replaced_food_id só vale em substituição e precisa ser outro alimento', async () => {
      const a = await newFood('Leite de aveia')
      const b = await newFood('Leite')
      await expectPgError(
        () => q(`insert into food_experiences (food_id, experience_type, experience_date, replaced_food_id)
                 values ($1, 'new_food', '2026-11-06', $2)`, [a, b]),
        '23514', /replaced_only_for_substitution/)
      await expectPgError(
        () => q(`insert into food_experiences (food_id, experience_type, experience_date, replaced_food_id)
                 values ($1, 'substitution', '2026-11-06', $1)`, [a]),
        '23514', /replaced_differs/)
      await q(`insert into food_experiences (food_id, experience_type, experience_date, replaced_food_id)
               values ($1, 'substitution', '2026-11-06', $2)`, [a, b])
    })

    it('chaves estrangeiras: refeição exige diário e vínculo exige alimento', async () => {
      await expectPgError(
        () => q(`insert into meals (diary_id, meal_type) values (gen_random_uuid(), 'lunch')`), '23503')
      const d = await call('get_or_create_diary', { p_date: '2026-11-06' })
      const m = await one(`insert into meals (diary_id, meal_type, feelings) values ($1, 'lunch', 'x') returning id`, [d])
      await expectPgError(
        () => q(`insert into meal_foods (meal_id, food_id) values ($1, gen_random_uuid())`, [m.id]), '23503')
    })
  })

  // ===========================================================================
  describe('alimentos (foods)', () => {
    it('normaliza o nome ao gravar (espaços colapsados e aparados)', async () => {
      const f = await one(`insert into foods (name) values ('  Pão   de   forma ') returning name, name_key`)
      expect(f.name).toBe('Pão de forma')
      expect(f.name_key).toBe('pao de forma')
    })

    it('impede duplicatas ignorando acento, maiúsculas e espaços', async () => {
      await q(`insert into foods (name) values ('Pão')`)
      await expectPgError(() => q(`insert into foods (name) values (' pao  ')`), '23505', /foods_name_key_unique/)
      await expectPgError(() => q(`insert into foods (name) values ('PÃO')`), '23505')
      await q(`insert into foods (name) values ('Pão de forma')`)
      await expectPgError(() => q(`insert into foods (name) values ('pao   de forma')`), '23505')
    })

    it('renomear para um nome existente falha; renomear recalcula name_key', async () => {
      const a = await newFood('Pão')
      await newFood('Leite')
      await expectPgError(() => q(`update foods set name = 'leite' where id = $1`, [a]), '23505')
      await q(`update foods set name = 'Pão integral' where id = $1`, [a])
      expect((await one(`select name_key from foods where id = $1`, [a])).name_key).toBe('pao integral')
    })

    it('get_or_create_food é idempotente e devolve o nome original', async () => {
      const a = await newFood('Pão')
      const b = await newFood(' pao ')
      const cc = await newFood('PÃO')
      expect(b).toBe(a)
      expect(cc).toBe(a)
      const rows = await q(`select name from foods`)
      expect(rows).toEqual([{ name: 'Pão' }])
    })

    it('get_or_create_food rejeita nome vazio', async () => {
      await expectPgError(() => newFood('   '), '22023', /Informe o nome/)
      await expectPgError(() => newFood(null as any), '22023')
    })

    it('excluir alimento usado só em refeições remove o vínculo e mantém a refeição', async () => {
      const m = await meal('2026-11-06', 'lunch', ['Arroz'])
      await saveMeal({ p_meal_id: m, p_feelings: 'Gostei', p_meal_time: '12:00' })
      const f = await newFood('Arroz')
      await q(`delete from foods where id = $1`, [f])
      expect(await q(`select 1 from meal_foods`)).toHaveLength(0)
      const left = await one(`select feelings from meals where id = $1`, [m])
      expect(left.feelings).toBe('Gostei')
    })

    it('excluir alimento com experiência é bloqueado (23503)', async () => {
      const r: any = await saveExp({ p_food_name: 'Kiwi', p_date: '2026-11-06' })
      await expectPgError(() => q(`delete from foods where id = $1`, [r.food_id]), '23503', /food_experiences/)
      expect(await q(`select 1 from foods where id = $1`, [r.food_id])).toHaveLength(1)
    })

    it('excluir alimento usado como "substituído" zera replaced_food_id e mantém a experiência', async () => {
      const r: any = await saveExp({
        p_food_name: 'Leite de aveia', p_type: 'substitution', p_date: '2026-11-06', p_replaced_food_name: 'Leite',
      })
      expect(r.replaced_food_id).toBeTruthy()
      await q(`delete from foods where id = $1`, [r.replaced_food_id])
      const e = await one(`select replaced_food_id, experience_type from food_experiences where id = $1`, [r.id])
      expect(e.replaced_food_id).toBeNull()
      expect(e.experience_type).toBe('substitution')
    })
  })

  // ===========================================================================
  describe('diário, refeições e alimentos da refeição', () => {
    it('get_or_create_diary é idempotente e exige data', async () => {
      const a = await call('get_or_create_diary', { p_date: '2026-11-06' })
      const b = await call('get_or_create_diary', { p_date: '2026-11-06' })
      expect(b).toBe(a)
      expect(await q(`select 1 from daily_diaries`)).toHaveLength(1)
      await expectPgError(() => call('get_or_create_diary', { p_date: null }), '22023', /data/)
    })

    it('save_meal cria (com aparo de texto), atualiza e mantém tipo/data', async () => {
      const id = await saveMeal({
        p_date: '2026-11-06', p_meal_type: 'breakfast', p_meal_time: '08:00',
        p_feelings: '  Tranquilo ', p_thoughts: '', p_observations: null, p_feeling_tags: ['calm'],
      })
      let row = await one(`select m.*, d.date from meals m join daily_diaries d on d.id = m.diary_id where m.id = $1`, [id])
      expect(row.meal_type).toBe('breakfast')
      expect(row.date).toBe('2026-11-06')
      expect(row.meal_time).toBe('08:00:00')
      expect(row.feelings).toBe('Tranquilo')
      expect(row.thoughts).toBeNull()
      expect(row.feeling_tags).toEqual(['calm'])

      const same = await saveMeal({
        p_meal_id: id, p_date: '2030-01-01', p_meal_type: 'dinner', p_meal_time: '08:30',
        p_thoughts: 'Gostei', p_feeling_tags: ['calm', 'happy'],
      })
      expect(same).toBe(id)
      row = await one(`select m.*, d.date from meals m join daily_diaries d on d.id = m.diary_id where m.id = $1`, [id])
      expect(row.meal_type).toBe('breakfast') // tipo e data não mudam na edição
      expect(row.date).toBe('2026-11-06')
      expect(row.meal_time).toBe('08:30:00')
      expect(row.feelings).toBeNull()
      expect(row.thoughts).toBe('Gostei')
      expect(row.feeling_tags).toEqual(['calm', 'happy'])
    })

    it('save_meal rejeita refeição vazia e tag inválida', async () => {
      await expectPgError(
        () => saveMeal({ p_date: '2026-11-06', p_meal_type: 'lunch', p_feelings: '  ', p_feeling_tags: [] }),
        '22023', /Preencha ao menos um campo/)
      await expectPgError(
        () => saveMeal({ p_date: '2026-11-06', p_meal_type: 'lunch', p_feelings: 'x', p_feeling_tags: ['nope'] }),
        '23514')
      await expectPgError(() => saveMeal({ p_meal_type: 'lunch', p_feelings: 'x' }), '22023', /data e o tipo/)
      await expectPgError(
        () => saveMeal({ p_date: '2026-11-06', p_meal_type: 'brunch', p_feelings: 'x' }), '23514')
      expect(await q(`select 1 from meals`)).toHaveLength(0)
    })

    it('save_meal: atualizar para vazio só é aceito se a refeição tiver alimentos', async () => {
      const onlyText = await saveMeal({ p_date: '2026-11-06', p_meal_type: 'lunch', p_feelings: 'x' })
      await expectPgError(() => saveMeal({ p_meal_id: onlyText }), '22023', /Preencha ao menos um campo/)

      const withFood = await meal('2026-11-06', 'dinner', ['Sopa'])
      await saveMeal({ p_meal_id: withFood }) // sem texto, mas com alimento: permitido
      expect(await q(`select 1 from meals where id = $1`, [withFood])).toHaveLength(1)
    })

    it('save_meal em refeição inexistente devolve P0002', async () => {
      await expectPgError(
        () => saveMeal({ p_meal_id: '00000000-0000-0000-0000-000000000000', p_feelings: 'x' }),
        'P0002', /não existe mais/)
    })

    it('add_food_to_meal cria diário, refeição e alimento novo de uma vez', async () => {
      const r: any = await addFood({
        p_date: '2026-11-06', p_meal_type: 'lunch', p_food_name: ' Arroz ',
        p_quantity: ' 2 colheres ', p_consumed_time: '12:30', p_observations: 'bom',
      })
      expect(r.meal_id).toBeTruthy()
      expect(r.food_id).toBeTruthy()
      expect(await q(`select 1 from daily_diaries`)).toHaveLength(1)
      expect((await one(`select name from foods where id = $1`, [r.food_id])).name).toBe('Arroz')
      const m = await one(`select meal_type, meal_time from meals where id = $1`, [r.meal_id])
      expect(m).toEqual({ meal_type: 'lunch', meal_time: '12:30:00' })
      const mf = await one(`select quantity, consumed_time, observations from meal_foods where id = $1`, [r.meal_food_id])
      expect(mf).toEqual({ quantity: '2 colheres', consumed_time: '12:30:00', observations: 'bom' })
    })

    it('add_food_to_meal reaproveita alimento existente (por id ou por nome) sem duplicar', async () => {
      const first: any = await addFood({ p_date: '2026-11-06', p_meal_type: 'lunch', p_food_name: 'Arroz' })
      const byName: any = await addFood({ p_meal_id: first.meal_id, p_food_name: 'arroz' })
      const byId: any = await addFood({ p_meal_id: first.meal_id, p_food_id: first.food_id })
      expect(byName.food_id).toBe(first.food_id)
      expect(byId.food_id).toBe(first.food_id)
      expect(await q(`select 1 from foods`)).toHaveLength(1)
      expect(await q(`select 1 from meal_foods where meal_id = $1`, [first.meal_id])).toHaveLength(3)
      expect(await q(`select 1 from meals`)).toHaveLength(1)
    })

    it('permite várias ocorrências da mesma refeição no mesmo dia', async () => {
      const a = await meal('2026-11-06', 'lunch', ['Arroz'])
      const b = await meal('2026-11-06', 'lunch', ['Feijão'])
      expect(b).not.toBe(a)
      expect(await q(`select 1 from daily_diaries`)).toHaveLength(1)
      expect(await q(`select 1 from meals where meal_type = 'lunch'`)).toHaveLength(2)
    })

    it('add_food_to_meal valida alimento, refeição e tipo', async () => {
      await expectPgError(
        () => addFood({ p_date: '2026-11-06', p_meal_type: 'lunch', p_food_id: '00000000-0000-0000-0000-000000000000' }),
        'P0002', /alimento não existe/)
      await expectPgError(
        () => addFood({ p_meal_id: '00000000-0000-0000-0000-000000000000', p_food_name: 'Arroz' }),
        'P0002', /refeição não existe/)
      await expectPgError(() => addFood({ p_food_name: 'Arroz' }), '22023', /data e o tipo/)
      await expectPgError(() => addFood({ p_date: '2026-11-06', p_meal_type: 'lunch' }), '22023', /nome do alimento/)
    })

    it('remove_food_from_meal: refeição vazia some; com horário ou texto permanece', async () => {
      // 1) sem horário nem texto: some junto
      const e: any = await addFood({ p_date: '2026-11-06', p_meal_type: 'lunch', p_food_name: 'Arroz' })
      const r1: any = await call('remove_food_from_meal', { p_meal_food_id: e.meal_food_id })
      expect(r1).toEqual({ meal_id: e.meal_id, meal_deleted: true })
      expect(await q(`select 1 from meals where id = $1`, [e.meal_id])).toHaveLength(0)
      expect(await q(`select 1 from daily_diaries`)).toHaveLength(1) // o diário permanece

      // 2) com horário (consumed_time vira meal_time): permanece
      const t: any = await addFood({ p_date: '2026-11-07', p_meal_type: 'lunch', p_food_name: 'Arroz', p_consumed_time: '12:00' })
      const r2: any = await call('remove_food_from_meal', { p_meal_food_id: t.meal_food_id })
      expect(r2.meal_deleted).toBe(false)
      expect(await q(`select 1 from meals where id = $1`, [t.meal_id])).toHaveLength(1)

      // 3) com texto: permanece
      const x: any = await addFood({ p_date: '2026-11-08', p_meal_type: 'dinner', p_food_name: 'Sopa' })
      await saveMeal({ p_meal_id: x.meal_id, p_observations: 'leve' })
      const r3: any = await call('remove_food_from_meal', { p_meal_food_id: x.meal_food_id })
      expect(r3.meal_deleted).toBe(false)

      // 4) com outro alimento ainda dentro: permanece
      const y: any = await addFood({ p_date: '2026-11-09', p_meal_type: 'dinner', p_food_name: 'Sopa' })
      await addFood({ p_meal_id: y.meal_id, p_food_name: 'Pão' })
      const r4: any = await call('remove_food_from_meal', { p_meal_food_id: y.meal_food_id })
      expect(r4.meal_deleted).toBe(false)
      expect(await q(`select 1 from meal_foods where meal_id = $1`, [y.meal_id])).toHaveLength(1)
    })

    it('remove_food_from_meal em vínculo inexistente devolve P0002', async () => {
      await expectPgError(
        () => call('remove_food_from_meal', { p_meal_food_id: '00000000-0000-0000-0000-000000000000' }),
        'P0002', /já foi removido/)
    })

    it('excluir refeição leva os vínculos junto e preserva os alimentos do cadastro', async () => {
      const m = await meal('2026-11-06', 'lunch', ['Arroz', 'Feijão'])
      await q(`delete from meals where id = $1`, [m])
      expect(await q(`select 1 from meal_foods`)).toHaveLength(0)
      expect(await q(`select 1 from foods`)).toHaveLength(2)
    })

    it('save_day_notes cria o diário, apara o texto, atualiza e apaga com texto vazio', async () => {
      const id = await call('save_day_notes', { p_date: '2026-11-06', p_notes: '  dia calmo ' })
      expect((await one(`select general_observations from daily_diaries where id = $1`, [id])).general_observations).toBe('dia calmo')
      const again = await call('save_day_notes', { p_date: '2026-11-06', p_notes: 'outra' })
      expect(again).toBe(id)
      expect((await one(`select general_observations from daily_diaries where id = $1`, [id])).general_observations).toBe('outra')
      await call('save_day_notes', { p_date: '2026-11-06', p_notes: '   ' })
      expect((await one(`select general_observations from daily_diaries where id = $1`, [id])).general_observations).toBeNull()
      await expectPgError(() => call('save_day_notes', { p_date: null, p_notes: 'x' }), '22023')
    })
  })

  // ===========================================================================
  describe('experiências alimentares', () => {
    it('cria experiência com alimento novo por nome e edita depois', async () => {
      const r: any = await saveExp({
        p_food_name: ' Kiwi ', p_date: '2026-11-06', p_time: '15:00',
        p_feelings: ' curioso ', p_thoughts: 'diferente', p_after_experience: 'tudo bem',
        p_observations: '', p_feeling_tags: ['curious'],
      })
      expect(r.id).toBeTruthy()
      expect(r.replaced_food_id).toBeNull()
      let e = await one(`select e.*, f.name from food_experiences e join foods f on f.id = e.food_id where e.id = $1`, [r.id])
      expect(e.name).toBe('Kiwi')
      expect(e.experience_type).toBe('new_food')
      expect(e.experience_date).toBe('2026-11-06')
      expect(e.experience_time).toBe('15:00:00')
      expect(e.feelings).toBe('curioso')
      expect(e.observations).toBeNull()
      expect(e.feeling_tags).toEqual(['curious'])

      const edit: any = await saveExp({
        p_id: r.id, p_food_id: r.food_id, p_date: '2026-11-07', p_time: null,
        p_feelings: 'tranquilo', p_feeling_tags: ['calm', 'happy'],
      })
      expect(edit.id).toBe(r.id)
      e = await one(`select * from food_experiences where id = $1`, [r.id])
      expect(e.experience_date).toBe('2026-11-07')
      expect(e.experience_time).toBeNull()
      expect(e.feelings).toBe('tranquilo')
      expect(e.thoughts).toBeNull() // campos não enviados são limpos: a edição grava o formulário inteiro
      expect(e.feeling_tags).toEqual(['calm', 'happy'])
      expect(await q(`select 1 from food_experiences`)).toHaveLength(1)
    })

    it('editar pode trocar o alimento (por nome) sem duplicar cadastro', async () => {
      const r: any = await saveExp({ p_food_name: 'Kiwi', p_date: '2026-11-06' })
      const edit: any = await saveExp({ p_id: r.id, p_food_name: 'kiwí', p_date: '2026-11-06' })
      // "kiwí" e "Kiwi" têm a mesma chave (sem acento, minúscula): reaproveita o cadastro.
      expect(edit.food_id).toBe(r.food_id)
      expect(await q(`select 1 from foods`)).toHaveLength(1)
    }, 10000)

    it('substituição com alimento substituído por id e por nome novo', async () => {
      const leite = await newFood('Leite')
      const byId: any = await saveExp({
        p_food_name: 'Leite de aveia', p_type: 'substitution', p_date: '2026-11-06', p_replaced_food_id: leite,
      })
      expect(byId.replaced_food_id).toBe(leite)

      const byName: any = await saveExp({
        p_food_name: 'Manteiga vegetal', p_type: 'substitution', p_date: '2026-11-06', p_replaced_food_name: 'Manteiga',
      })
      expect(byName.replaced_food_id).toBeTruthy()
      expect((await one(`select name from foods where id = $1`, [byName.replaced_food_id])).name).toBe('Manteiga')

      const none: any = await saveExp({ p_food_name: 'Adoçante', p_type: 'substitution', p_date: '2026-11-06' })
      expect(none.replaced_food_id).toBeNull()
    })

    it('ignora o substituído quando o tipo é alimento novo', async () => {
      const leite = await newFood('Leite')
      const r: any = await saveExp({
        p_food_name: 'Kiwi', p_type: 'new_food', p_date: '2026-11-06', p_replaced_food_id: leite, p_replaced_food_name: 'Outro',
      })
      expect(r.replaced_food_id).toBeNull()
      expect(await q(`select 1 from foods where name = 'Outro'`)).toHaveLength(0)
    })

    it('rejeita substituído igual ao novo alimento, tipo inválido, data nula e ids inexistentes', async () => {
      await expectPgError(
        () => saveExp({ p_food_name: 'Leite', p_type: 'substitution', p_date: '2026-11-06', p_replaced_food_name: 'leite' }),
        '22023', /precisa ser diferente/)
      await expectPgError(() => saveExp({ p_food_name: 'Kiwi', p_type: 'other', p_date: '2026-11-06' }), '22023', /tipo da experiência/)
      await expectPgError(() => saveExp({ p_food_name: 'Kiwi', p_type: null, p_date: '2026-11-06' }), '22023')
      await expectPgError(() => saveExp({ p_food_name: 'Kiwi', p_date: null }), '22023', /data/)
      await expectPgError(() => saveExp({ p_date: '2026-11-06' }), '22023', /nome do alimento/)
      await expectPgError(
        () => saveExp({ p_food_id: '00000000-0000-0000-0000-000000000000', p_date: '2026-11-06' }),
        'P0002', /alimento não existe/)
      await expectPgError(
        () => saveExp({ p_id: '00000000-0000-0000-0000-000000000000', p_food_name: 'Kiwi', p_date: '2026-11-06' }),
        'P0002', /experiência não existe/)
      await expectPgError(
        () => saveExp({ p_food_name: 'Leite', p_type: 'substitution', p_date: '2026-11-06', p_replaced_food_id: '00000000-0000-0000-0000-000000000000' }),
        'P0002', /substituído não existe/)
    })

    it('rejeita tag inválida e data fora da faixa', async () => {
      await expectPgError(
        () => saveExp({ p_food_name: 'Kiwi', p_date: '2026-11-06', p_feeling_tags: ['nope'] }), '23514')
      await expectPgError(() => saveExp({ p_food_name: 'Kiwi', p_date: '2101-01-01' }), '23514')
    })

    it('nada é gravado quando a experiência falha (alimento novo não fica órfão)', async () => {
      await expectPgError(
        () => saveExp({ p_food_name: 'Fantasma', p_date: '2026-11-06', p_feeling_tags: ['nope'] }), '23514')
      expect(await q(`select 1 from foods where name = 'Fantasma'`)).toHaveLength(0)
      expect(await q(`select 1 from food_experiences`)).toHaveLength(0)
    })

    it('get_experience devolve a experiência com nomes ou null', async () => {
      const r: any = await saveExp({
        p_food_name: 'Leite de aveia', p_type: 'substitution', p_date: '2026-11-06', p_replaced_food_name: 'Leite',
      })
      const e: any = await call('get_experience', { p_id: r.id })
      expect(e.food_name).toBe('Leite de aveia')
      expect(e.replaced_food_name).toBe('Leite')
      expect(e.experience_type).toBe('substitution')
      expect(await call('get_experience', { p_id: '00000000-0000-0000-0000-000000000000' })).toBeNull()
    })
  })

  // ===========================================================================
  describe('leitura (RPCs)', () => {
    it('get_day devolve diário, refeições com alimentos e experiências do dia', async () => {
      const day = '2026-11-06'
      const empty: any = await call('get_day', { p_date: day })
      expect(empty).toEqual({ date: day, diary: null, meals: [], experiences: [] })

      const lunch = await meal(day, 'lunch', ['Arroz', 'Feijão'], {})
      // horário do alimento define a ordem dentro da refeição
      await q(`update meal_foods set consumed_time = '12:10' where meal_id = $1 and food_id = (select id from foods where name = 'Feijão')`, [lunch])
      await saveMeal({ p_meal_id: lunch, p_meal_time: '12:00', p_feelings: 'bem', p_feeling_tags: ['calm'] })
      const breakfast = await meal(day, 'breakfast', ['Pão'])
      await saveMeal({ p_meal_id: breakfast, p_meal_time: '08:00', p_thoughts: 'ok' })
      const noTime = await meal(day, 'supper', ['Chá'])
      await call('save_day_notes', { p_date: day, p_notes: 'dia bom' })
      await saveExp({ p_food_name: 'Kiwi', p_date: day, p_time: '15:00', p_feeling_tags: ['curious'] })
      await saveExp({ p_food_name: 'Manga', p_date: '2026-11-07' }) // outro dia: não aparece

      const r: any = await call('get_day', { p_date: day })
      expect(r.date).toBe(day)
      expect(r.diary.general_observations).toBe('dia bom')
      expect(r.diary.date).toBe(day)
      expect(r.meals.map((m: any) => m.meal_type)).toEqual(['breakfast', 'lunch', 'supper']) // por horário, sem horário por último
      expect(r.meals[2].id).toBe(noTime)
      const l = r.meals[1]
      expect(l.id).toBe(lunch)
      expect(l.meal_time).toBe('12:00:00')
      expect(l.feelings).toBe('bem')
      expect(l.feeling_tags).toEqual(['calm'])
      expect(l.foods.map((f: any) => f.food_name)).toEqual(['Feijão', 'Arroz'])
      expect(Object.keys(l.foods[0]).sort()).toEqual(
        ['consumed_time', 'food_id', 'food_name', 'id', 'observations', 'quantity'])
      expect(r.experiences).toHaveLength(1)
      expect(r.experiences[0]).toMatchObject({ food_name: 'Kiwi', experience_type: 'new_food', experience_time: '15:00:00', feeling_tags: ['curious'] })
    })

    it('get_calendar_month lista só dias com registro do mês', async () => {
      await meal('2026-11-03', 'lunch', ['Arroz'])
      await meal('2026-11-03', 'dinner', ['Sopa'])
      await saveExp({ p_food_name: 'Kiwi', p_date: '2026-11-10' })
      await call('save_day_notes', { p_date: '2026-11-15', p_notes: 'só observação' })
      await call('get_or_create_diary', { p_date: '2026-11-20' }) // diário vazio: não conta
      await meal('2026-12-01', 'lunch', ['Arroz']) // outro mês
      await meal('2026-11-10', 'lunch', ['Arroz']) // refeição + experiência no mesmo dia

      const days: any[] = await call('get_calendar_month', { p_year: 2026, p_month: 11 })
      expect(days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-10', '2026-11-15'])
      expect(days[0]).toEqual({ date: '2026-11-03', meal_count: 2, experience_count: 0, has_notes: false })
      expect(days[1]).toEqual({ date: '2026-11-10', meal_count: 1, experience_count: 1, has_notes: false })
      expect(days[2]).toEqual({ date: '2026-11-15', meal_count: 0, experience_count: 0, has_notes: true })
      expect(await call('get_calendar_month', { p_year: 2027, p_month: 1 })).toEqual([])
      await expectPgError(() => call('get_calendar_month', { p_year: 2026, p_month: 13 }), '22023', /Mês inválido/)
    })

    describe('search_history', () => {
      beforeEach(async () => {
        await meal('2026-10-15', 'lunch', ['Maçã'])
        await meal('2026-11-01', 'breakfast', ['Pão'])
        await meal('2026-11-02', 'lunch', ['Arroz'])
        await saveExp({ p_food_name: 'Pão de queijo', p_date: '2026-11-03' })
      })

      it('sem filtro lista todos os dias, do mais recente ao mais antigo', async () => {
        const r: any = await call('search_history')
        expect(r.total).toBe(4)
        expect(r.days.map((d: any) => d.date)).toEqual(['2026-11-03', '2026-11-02', '2026-11-01', '2026-10-15'])
        const d1 = r.days[2]
        expect(d1.meals).toEqual([expect.objectContaining({ meal_type: 'breakfast', foods: ['Pão'] })])
        expect(d1.experiences).toEqual([])
        expect(r.days[0].experiences).toEqual([expect.objectContaining({ food_name: 'Pão de queijo', experience_type: 'new_food' })])
        expect(await call('search_history', { p_query: '   ' })).toEqual(r) // só espaços = sem filtro
      })

      it('busca por alimento ignorando acento e maiúsculas, em refeições e experiências', async () => {
        const pao: any = await call('search_history', { p_query: 'pao' })
        expect(pao.total).toBe(2)
        expect(pao.days.map((d: any) => d.date)).toEqual(['2026-11-03', '2026-11-01'])
        const maca: any = await call('search_history', { p_query: 'MAÇA' })
        expect(maca.days.map((d: any) => d.date)).toEqual(['2026-10-15'])
        const none: any = await call('search_history', { p_query: 'xyz' })
        expect(none).toEqual({ total: 0, days: [] })
      })

      it('trata % e _ da busca como texto comum', async () => {
        expect((await call('search_history', { p_query: '%' }) as any).total).toBe(0)
        expect((await call('search_history', { p_query: '_' }) as any).total).toBe(0)
      })

      it('filtra por período e pagina', async () => {
        const per: any = await call('search_history', { p_from: '2026-11-01', p_to: '2026-11-02' })
        expect(per.days.map((d: any) => d.date)).toEqual(['2026-11-02', '2026-11-01'])
        const withQ: any = await call('search_history', { p_query: 'pao', p_from: '2026-11-02' })
        expect(withQ.days.map((d: any) => d.date)).toEqual(['2026-11-03'])
        const page2: any = await call('search_history', { p_limit: 2, p_offset: 2 })
        expect(page2.total).toBe(4)
        expect(page2.days.map((d: any) => d.date)).toEqual(['2026-11-01', '2026-10-15'])
      })
    })

    it('get_experiences filtra, ordena (mais recente primeiro), pagina e informa o total', async () => {
      await saveExp({ p_food_name: 'Kiwi', p_date: '2026-11-01', p_time: '09:00' })
      await saveExp({ p_food_name: 'Manga', p_date: '2026-11-05', p_time: '08:00' })
      await saveExp({ p_food_name: 'Melão', p_date: '2026-11-05', p_time: '18:00' })
      await saveExp({ p_food_name: 'Caqui', p_date: '2026-11-05' }) // sem horário: por último no dia
      const aveia: any = await saveExp({
        p_food_name: 'Leite de aveia', p_type: 'substitution', p_date: '2026-10-20', p_replaced_food_name: 'Leite',
      })

      const all: any = await call('get_experiences')
      expect(all.total).toBe(5)
      expect(all.items.map((i: any) => i.food_name)).toEqual(['Melão', 'Manga', 'Caqui', 'Kiwi', 'Leite de aveia'])
      expect(all.items[4].replaced_food_name).toBe('Leite')
      expect(all.items[0].replaced_food_name).toBeNull()

      const subs: any = await call('get_experiences', { p_type: 'substitution' })
      expect(subs.total).toBe(1)
      expect(subs.items[0].food_name).toBe('Leite de aveia')

      const news: any = await call('get_experiences', { p_type: 'new_food', p_from: '2026-11-01', p_to: '2026-11-04' })
      expect(news.items.map((i: any) => i.food_name)).toEqual(['Kiwi'])

      const byFood: any = await call('get_experiences', { p_food_id: aveia.food_id })
      expect(byFood.total).toBe(1)

      const page: any = await call('get_experiences', { p_limit: 2, p_offset: 1 })
      expect(page.total).toBe(5)
      expect(page.items.map((i: any) => i.food_name)).toEqual(['Manga', 'Caqui'])
    })

    it('foods_overview e get_food_detail: vezes consumido, primeiro registro e históricos', async () => {
      await meal('2026-11-05', 'lunch', ['Arroz'])
      await meal('2026-11-10', 'dinner', ['Arroz'])
      await saveExp({ p_food_name: 'Arroz', p_date: '2026-11-01', p_feelings: 'curioso' })
      await saveExp({ p_food_name: 'Kiwi', p_date: '2026-11-12' })
      await newFood('Pera')

      const ov = await q(`select * from foods_overview order by name`)
      const by = Object.fromEntries(ov.map((r: any) => [r.name, r]))
      expect(by['Arroz']).toMatchObject({
        times_consumed: 2, experience_count: 1, first_record_date: '2026-11-01', last_record_date: '2026-11-10',
      })
      expect(by['Kiwi']).toMatchObject({ times_consumed: 0, experience_count: 1, first_record_date: '2026-11-12' })
      expect(by['Pera']).toMatchObject({ times_consumed: 0, experience_count: 0, first_record_date: null, last_record_date: null })

      const arroz = await newFood('Arroz')
      const d: any = await call('get_food_detail', { p_food_id: arroz })
      expect(d.food).toMatchObject({ id: arroz, name: 'Arroz', times_consumed: 2, first_record_date: '2026-11-01' })
      expect(d.meals.map((m: any) => m.date)).toEqual(['2026-11-10', '2026-11-05'])
      expect(d.meals[0]).toMatchObject({ meal_type: 'dinner' })
      expect(d.experiences).toHaveLength(1)
      expect(d.experiences[0]).toMatchObject({ food_name: 'Arroz', feelings: 'curioso' })

      const missing: any = await call('get_food_detail', { p_food_id: '00000000-0000-0000-0000-000000000000' })
      expect(missing).toEqual({ food: null, meals: [], experiences: [] })
    })

    it('get_dashboard: contagens de hoje e até 8 últimas atividades', async () => {
      const today = '2026-11-06'
      await meal(today, 'breakfast', ['Pão', 'Leite'])
      await meal(today, 'lunch', ['Arroz'])
      await meal('2026-11-05', 'lunch', ['Arroz'])
      await saveExp({ p_food_name: 'Kiwi', p_date: today })
      for (let i = 0; i < 8; i++) await meal(`2026-10-${String(10 + i).padStart(2, '0')}`, 'dinner', [`Sopa ${i}`])

      const r: any = await call('get_dashboard', { p_today: today })
      expect(r.today).toEqual({ meal_count: 2, food_count: 3, experience_count: 1 })
      expect(r.recent).toHaveLength(8)
      for (const item of r.recent) {
        expect(['meal', 'experience']).toContain(item.kind)
        expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(item.id).toBeTruthy()
        expect(item.at).toBeTruthy()
        if (item.kind === 'meal') {
          expect(item.detail).toHaveProperty('meal_type')
          expect(Array.isArray(item.detail.foods)).toBe(true)
        } else {
          expect(item.detail).toHaveProperty('food_name')
          expect(item.detail).toHaveProperty('experience_type')
        }
      }
      const empty: any = await call('get_dashboard', { p_today: '2030-01-01' })
      expect(empty.today).toEqual({ meal_count: 0, food_count: 0, experience_count: 0 })
    })

    describe('get_report (definições do acompanhamento)', () => {
      beforeEach(async () => {
        await meal('2026-10-01', 'lunch', ['Arroz', 'Feijão'])
        await meal('2026-11-01', 'lunch', ['Arroz', 'Feijão'])
        await meal('2026-11-01', 'dinner', ['Arroz'])
        await meal('2026-11-02', 'breakfast', ['Pão'])
        await saveExp({ p_food_name: 'Pão', p_date: '2026-11-01', p_time: '08:00' })
        await saveExp({ p_food_name: 'Pão', p_date: '2026-11-05' })
        await saveExp({ p_food_name: 'Kiwi', p_date: '2026-10-25' })
        await saveExp({ p_food_name: 'Leite de aveia', p_type: 'substitution', p_date: '2026-10-20', p_replaced_food_name: 'Leite' })
      })

      it('totais, alimentos mais registrados, experiências por mês e linha do tempo', async () => {
        const r: any = await call('get_report')
        expect(r.totals).toEqual({
          meal_count: 4,
          distinct_foods_registered: 3, // Arroz, Feijão, Pão (só quem aparece em refeições)
          foods_tried: 2, // Pão e Kiwi: só "alimento novo", Pão contado uma vez
          experience_count: 4,
        })
        expect(r.top_foods.map((f: any) => [f.name, f.times])).toEqual([['Arroz', 3], ['Feijão', 2], ['Pão', 1]])
        expect(r.experiences_by_month).toEqual([
          { month: '2026-10', new_food: 1, substitution: 1 },
          { month: '2026-11', new_food: 2, substitution: 0 },
        ])
        expect(r.timeline.map((e: any) => [e.experience_date, e.food_name])).toEqual([
          ['2026-11-05', 'Pão'], ['2026-11-01', 'Pão'], ['2026-10-25', 'Kiwi'], ['2026-10-20', 'Leite de aveia'],
        ])
        expect(r.timeline[3].replaced_food_name).toBe('Leite')
      })

      it('respeita o período', async () => {
        const r: any = await call('get_report', { p_from: '2026-11-01', p_to: '2026-11-30' })
        expect(r.totals).toEqual({ meal_count: 3, distinct_foods_registered: 3, foods_tried: 1, experience_count: 2 })
        expect(r.top_foods.map((f: any) => [f.name, f.times])).toEqual([['Arroz', 2], ['Feijão', 1], ['Pão', 1]])
        expect(r.experiences_by_month).toEqual([{ month: '2026-11', new_food: 2, substitution: 0 }])
        expect(r.timeline).toHaveLength(2)
        const none: any = await call('get_report', { p_from: '2030-01-01', p_to: '2030-12-31' })
        expect(none.totals).toEqual({ meal_count: 0, distinct_foods_registered: 0, foods_tried: 0, experience_count: 0 })
        expect(none.top_foods).toEqual([])
        expect(none.experiences_by_month).toEqual([])
        expect(none.timeline).toEqual([])
      })
    })

    it('export_all devolve todas as tabelas', async () => {
      await meal('2026-11-06', 'lunch', ['Arroz', 'Feijão'])
      await call('save_day_notes', { p_date: '2026-11-06', p_notes: 'dia' })
      await saveExp({ p_food_name: 'Kiwi', p_date: '2026-11-06' })
      const r: any = await call('export_all')
      expect(r.version).toBe(1)
      expect(typeof r.exported_at).toBe('string')
      expect(r.foods).toHaveLength(3)
      expect(r.daily_diaries).toHaveLength(1)
      expect(r.daily_diaries[0].general_observations).toBe('dia')
      expect(r.meals).toHaveLength(1)
      expect(r.meal_foods).toHaveLength(2)
      expect(r.food_experiences).toHaveLength(1)
      const empty = await (async () => {
        await c.query('reset role')
        await c.query(`delete from public.food_experiences; delete from public.meal_foods; delete from public.meals; delete from public.daily_diaries; delete from public.foods;`)
        await c.query('set local role anon')
        return call('export_all') as Promise<any>
      })()
      expect(empty.foods).toEqual([])
      expect(empty.food_experiences).toEqual([])
    })
  })

  // ===========================================================================
  describe('RLS e permissões', () => {
    it('RLS está ligado e há política nas cinco tabelas', async () => {
      await c.query('reset role')
      const rls = await q(`select relname, relrowsecurity from pg_class
                           where relnamespace = 'public'::regnamespace
                             and relname in ('foods','daily_diaries','meals','meal_foods','food_experiences')
                           order by relname`)
      expect(rls).toHaveLength(5)
      expect(rls.every((r: any) => r.relrowsecurity)).toBe(true)
      const pol = await q(`select tablename from pg_policies where schemaname = 'public' order by tablename`)
      expect(pol.map((p: any) => p.tablename)).toEqual(['daily_diaries', 'food_experiences', 'foods', 'meal_foods', 'meals'])
    })

    for (const role of ['anon', 'authenticated']) {
      it(`${role} consegue criar, ler, editar e excluir`, async () => {
        await c.query(`set local role ${role}`)
        const f = await one(`insert into foods (name) values ('Teste RLS') returning id`)
        expect(await q(`select 1 from foods where id = $1`, [f.id])).toHaveLength(1)
        await q(`update foods set name = 'Teste RLS 2' where id = $1`, [f.id])
        expect((await one(`select name from foods where id = $1`, [f.id])).name).toBe('Teste RLS 2')
        const d = await one(`insert into daily_diaries (date) values ('2026-11-06') returning id`)
        const m = await one(`insert into meals (diary_id, meal_type, feelings) values ($1, 'lunch', 'x') returning id`, [d.id])
        await q(`insert into meal_foods (meal_id, food_id) values ($1, $2)`, [m.id, f.id])
        await q(`insert into food_experiences (food_id, experience_type, experience_date) values ($1, 'new_food', '2026-11-06')`, [f.id])
        expect(await q(`select 1 from foods_overview`)).toHaveLength(1) // view security_invoker
        expect((await call('get_day', { p_date: '2026-11-06' }) as any).meals).toHaveLength(1)
        await q(`delete from food_experiences`)
        await q(`delete from foods where id = $1`, [f.id])
        expect(await q(`select 1 from foods`)).toHaveLength(0)
      })
    }
  })

  // ===========================================================================
  // Testes com commit real (segundo cliente). Dados prefixados e limpos no final.
  describe('commits reais', () => {
    const DAY = '2099-12-31'
    const cleanup = async () => {
      await c2.query('reset role')
      await c2.query(`delete from public.daily_diaries where date = '${DAY}';
                      delete from public.food_experiences where experience_date = '${DAY}' or food_id in (select id from public.foods where name like 'ztest-%');
                      delete from public.foods where name like 'ztest-%';`)
    }
    beforeEach(cleanup)
    afterEach(cleanup)
    const sleep = () => c2.query('select pg_sleep(0.05)')
    const on = async (fn: string, args: Record<string, unknown>) => {
      await c2.query('set role anon')
      try {
        return await rpcOn(c2, fn, { ...(D[fn] ?? {}), ...args })
      } finally {
        await c2.query('reset role')
      }
    }

    it('updated_at muda ao atualizar alimento e refeição; meals.updated_at acompanha meal_foods', async () => {
      const f = await c2.query(`insert into foods (name) values ('ztest-updated') returning id, created_at, updated_at`)
      const f0 = f.rows[0]
      await sleep()
      await c2.query(`update foods set name = 'ztest-updated 2' where id = $1`, [f0.id])
      const f1 = (await c2.query(`select updated_at, created_at from foods where id = $1`, [f0.id])).rows[0]
      expect(f1.updated_at.getTime()).toBeGreaterThan(f0.updated_at.getTime())
      expect(f1.created_at.getTime()).toBe(f0.created_at.getTime())

      const a: any = await on('add_food_to_meal', {
        p_date: DAY, p_meal_type: 'lunch', p_food_name: 'ztest-arroz', p_consumed_time: '12:00',
      })
      const t0 = (await c2.query(`select updated_at from meals where id = $1`, [a.meal_id])).rows[0].updated_at
      await sleep()
      await on('add_food_to_meal', { p_meal_id: a.meal_id, p_food_name: 'ztest-feijao' })
      const t1 = (await c2.query(`select updated_at from meals where id = $1`, [a.meal_id])).rows[0].updated_at
      expect(t1.getTime()).toBeGreaterThan(t0.getTime())
      await sleep()
      await on('remove_food_from_meal', { p_meal_food_id: a.meal_food_id })
      const t2 = (await c2.query(`select updated_at from meals where id = $1`, [a.meal_id])).rows[0].updated_at
      expect(t2.getTime()).toBeGreaterThan(t1.getTime())
      await sleep()
      await on('save_meal', { p_meal_id: a.meal_id, p_meal_time: '12:15' })
      const t3 = (await c2.query(`select updated_at from meals where id = $1`, [a.meal_id])).rows[0].updated_at
      expect(t3.getTime()).toBeGreaterThan(t2.getTime())

      const diary0 = (await c2.query(`select updated_at from daily_diaries where date = $1`, [DAY])).rows[0].updated_at
      await sleep()
      await on('save_day_notes', { p_date: DAY, p_notes: 'nota' })
      const diary1 = (await c2.query(`select updated_at from daily_diaries where date = $1`, [DAY])).rows[0].updated_at
      expect(diary1.getTime()).toBeGreaterThan(diary0.getTime())

      const e: any = await on('save_food_experience', { p_food_name: 'ztest-kiwi', p_date: DAY })
      const e0 = (await c2.query(`select updated_at from food_experiences where id = $1`, [e.id])).rows[0].updated_at
      await sleep()
      await on('save_food_experience', { p_id: e.id, p_food_id: e.food_id, p_date: DAY, p_feelings: 'novo' })
      const e1 = (await c2.query(`select updated_at from food_experiences where id = $1`, [e.id])).rows[0].updated_at
      expect(e1.getTime()).toBeGreaterThan(e0.getTime())
    })

    it('get_dashboard ordena as últimas atividades por atualização (mais recente primeiro)', async () => {
      await on('add_food_to_meal', { p_date: DAY, p_meal_type: 'lunch', p_food_name: 'ztest-arroz' })
      await sleep()
      await on('save_food_experience', { p_food_name: 'ztest-kiwi', p_date: DAY })
      const r: any = await on('get_dashboard', { p_today: DAY })
      expect(r.today).toEqual({ meal_count: 1, food_count: 1, experience_count: 1 })
      expect(r.recent[0].kind).toBe('experience')
      expect(r.recent[0].detail.food_name).toBe('ztest-kiwi')
      expect(r.recent[1].kind).toBe('meal')
      expect(r.recent[1].detail.foods).toEqual(['ztest-arroz'])
    })

    it('falha no meio de add_food_to_meal / save_food_experience não deixa registros pela metade', async () => {
      await c2.query('set role anon')
      try {
        // tipo de refeição inválido: o alimento novo e o diário já teriam sido criados antes do erro
        await expect(
          rpcOn(c2, 'add_food_to_meal', { ...D.add_food_to_meal, p_date: DAY, p_meal_type: 'brunch', p_food_name: 'ztest-fantasma' }),
        ).rejects.toMatchObject({ code: '23514' })
        // tag inválida na experiência: o alimento novo (por nome) já teria sido criado
        await expect(
          rpcOn(c2, 'save_food_experience', { ...D.save_food_experience, p_food_name: 'ztest-fantasma2', p_date: DAY, p_feeling_tags: ['nope'] }),
        ).rejects.toMatchObject({ code: '23514' })
      } finally {
        await c2.query('reset role')
      }
      expect((await c2.query(`select 1 from foods where name like 'ztest-fantasma%'`)).rows).toHaveLength(0)
      expect((await c2.query(`select 1 from daily_diaries where date = $1`, [DAY])).rows).toHaveLength(0)
    })
  })
})
