import { describe, expect, it } from 'vitest'
import { cleanSupabaseKey, cleanSupabaseUrl } from '@/config/env'

describe('cleanSupabaseUrl', () => {
  it('mantém um endereço correto', () => {
    expect(cleanSupabaseUrl('https://abcd.supabase.co')).toBe('https://abcd.supabase.co')
  })
  it('remove barra final, /rest/v1, aspas e espaços', () => {
    expect(cleanSupabaseUrl('  "https://abcd.supabase.co/"  ')).toBe('https://abcd.supabase.co')
    expect(cleanSupabaseUrl('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co')
    expect(cleanSupabaseUrl("'https://abcd.supabase.co/rest/v1'")).toBe('https://abcd.supabase.co')
  })
  it('acrescenta https:// quando falta', () => {
    expect(cleanSupabaseUrl('abcd.supabase.co')).toBe('https://abcd.supabase.co')
  })
  it('vazio continua vazio', () => {
    expect(cleanSupabaseUrl(undefined)).toBe('')
    expect(cleanSupabaseUrl('   ')).toBe('')
  })
  it('não mexe em endereço local de teste', () => {
    expect(cleanSupabaseUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321')
  })
})

describe('cleanSupabaseKey', () => {
  it('remove aspas, espaços e quebras de linha', () => {
    expect(cleanSupabaseKey('  "sb_publishable_abc123"  ')).toBe('sb_publishable_abc123')
    expect(cleanSupabaseKey('eyJhbGci\n  OiJIUzI1NiJ9.abc')).toBe('eyJhbGciOiJIUzI1NiJ9.abc')
  })
  it('vazio continua vazio', () => {
    expect(cleanSupabaseKey(undefined)).toBe('')
  })
})
