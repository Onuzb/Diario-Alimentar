import { describe, expect, it } from 'vitest'
import { AppError, getErrorMessage, toAppError } from '@/lib/errors'

describe('toAppError', () => {
  it('mantém mensagens em português lançadas pelas funções do banco', () => {
    const e = toAppError({ code: '22023', message: 'Escolha uma data para o diário.' })
    expect(e.message).toBe('Escolha uma data para o diário.')
    expect(e.code).toBe('22023')
    expect(getErrorMessage({ code: 'P0002', message: 'Essa refeição não existe mais. Atualize a página.' })).toBe(
      'Essa refeição não existe mais. Atualize a página.',
    )
  })

  it('explica a exclusão bloqueada por experiências', () => {
    const e = toAppError({
      code: '23503',
      message:
        'update or delete on table "foods" violates foreign key constraint "food_experiences_food_id_fkey" on table "food_experiences"',
    })
    expect(e.message).toMatch(/experiências registradas/)
  })

  it('explica nome de alimento repetido', () => {
    const e = toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "foods_name_key_unique"' })
    expect(e.message).toMatch(/Já existe um alimento/)
  })

  it('explica valores recusados pelo banco', () => {
    expect(toAppError({ code: '23514', message: 'check constraint' }).message).toMatch(/Revise os campos/)
  })

  it('orienta quando as migrações não foram aplicadas', () => {
    expect(toAppError({ code: 'PGRST202', message: 'Could not find the function' }).message).toMatch(/migrações/)
    expect(toAppError({ code: 'PGRST205', message: 'Could not find the table' }).message).toMatch(/migrações/)
  })

  it('orienta quando o banco recusa acesso', () => {
    expect(toAppError({ code: '42501', message: 'permission denied' }).message).toMatch(/recusou o acesso/)
  })

  it('trata falha de rede', () => {
    expect(toAppError(new TypeError('Failed to fetch')).message).toMatch(/falar com o banco/)
    expect(toAppError({ message: 'TypeError: Failed to fetch' }).message).toMatch(/falar com o banco/)
  })

  it('trata banco indisponível (PostgREST 503)', () => {
    const e = toAppError({ code: 'PGRST000', message: 'Could not connect with the database' })
    expect(e.message).toMatch(/não respondeu/)
  })

  it('mostra o detalhe técnico quando não reconhece a causa', () => {
    const e = toAppError({ code: 'XX000', message: 'internal: algo estranho' }, 500)
    expect(e.message).toBe('Algo deu errado.')
    expect(e.generic).toBe(true)
    expect(e.detail).toContain('XX000')
    expect(e.detail).toContain('internal: algo estranho')
    expect(getErrorMessage({ code: 'XX000', message: 'internal: algo estranho' })).toMatch(/Detalhe: .*internal: algo estranho/)
  })

  it('reconhece chave inválida (HTTP 401 ou "Invalid API key")', () => {
    const byStatus = toAppError({ message: 'whatever' }, 401)
    expect(byStatus.message).toMatch(/não aceitou a chave/)
    expect(byStatus.technical).toBe(true)
    expect(byStatus.generic).toBe(false)
    expect(toAppError({ message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' }).message).toMatch(
      /não aceitou a chave/,
    )
    expect(toAppError({ code: 'PGRST301', message: 'JWSError JWSInvalidSignature' }).message).toMatch(/não aceitou a chave/)
  })

  it('reconhece chave secreta usada no navegador', () => {
    const e = toAppError({ message: 'Forbidden use of secret API key in browser' }, 401)
    expect(e.message).toMatch(/chave secreta/)
  })

  it('reconhece endereço errado (404 sem código do Postgres)', () => {
    const e = toAppError({ message: '' }, 404)
    expect(e.message).toMatch(/endereço do Supabase parece errado/)
    expect(e.detail).toContain('HTTP 404')
  })

  it('reconhece schema não exposto', () => {
    expect(toAppError({ code: 'PGRST106', message: 'The schema must be one of the following: api' }, 406).message).toMatch(/Exposed schemas/)
  })

  it('erros de preenchimento não são técnicos', () => {
    expect(toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "foods_name_key_unique"' }).technical).toBe(false)
  })

  it('não embrulha um AppError duas vezes', () => {
    const original = new AppError('mensagem', '123')
    expect(toAppError(original)).toBe(original)
  })
})
