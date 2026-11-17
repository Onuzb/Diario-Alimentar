import { describe, expect, it } from 'vitest'
import {
  formatWindow,
  fromMinutes,
  reminderTimes,
  sameSchedule,
  sortSchedule,
  toMinutes,
  validateItem,
  validateSchedule,
  windowMinutes,
  type ScheduleItem,
} from '@/lib/schedule'

const item = (meal_type: ScheduleItem['meal_type'], start_time: string, end_time: string, enabled = true): ScheduleItem => ({
  meal_type,
  start_time,
  end_time,
  enabled,
})

describe('horários das refeições', () => {
  it('converte hora e minutos, dando a volta na meia-noite', () => {
    expect(toMinutes('08:30')).toBe(510)
    expect(fromMinutes(510)).toBe('08:30')
    expect(fromMinutes(-10)).toBe('23:50')
    expect(fromMinutes(1450)).toBe('00:10')
  })

  it('calcula a duração, inclusive quando cruza a meia-noite', () => {
    expect(windowMinutes('08:00', '09:00')).toBe(60)
    expect(windowMinutes('23:00', '01:00')).toBe(120)
    expect(windowMinutes('12:00', '12:00')).toBe(0)
  })

  it('calcula os dois momentos de aviso (mesmos do banco)', () => {
    expect(reminderTimes('08:00', '09:00')).toEqual({ mid: '08:30', late: '08:50' })
    expect(reminderTimes('23:00', '01:00')).toEqual({ mid: '00:00', late: '00:50' })
    expect(reminderTimes('12:00', '12:40')).toEqual({ mid: '12:20', late: '12:30' })
  })

  it('escreve o horário em português', () => {
    expect(formatWindow('08:00', '09:00')).toBe('8h às 9h')
    expect(formatWindow('12:30', '13:45')).toBe('12h30 às 13h45')
    expect(formatWindow('23:00', '01:00')).toBe('23h às 1h')
  })

  it('valida: formato, duração mínima e mensagem que começa pela refeição', () => {
    expect(validateItem(item('lunch', '12:00', '13:00'))).toBeNull()
    expect(validateItem(item('supper', '23:00', '01:00'))).toBeNull()
    expect(validateItem(item('lunch', '', '13:00'))).toMatch(/^Almoço: informe o início e o fim/)
    expect(validateItem(item('lunch', '12:00', '12:19'))).toMatch(/pelo menos 20 minutos/)
    expect(validateItem(item('lunch', '12:00', '12:20'))).toBeNull()
    expect(validateItem(item('dinner', '21:00', '21:00'))).toMatch(/^Jantar:/)
  })

  it('validateSchedule devolve só as refeições com problema', () => {
    const errors = validateSchedule([item('breakfast', '08:00', '09:00'), item('lunch', '12:00', '12:05')])
    expect(Object.keys(errors)).toEqual(['lunch'])
  })

  it('ordena do café da manhã à ceia e compara listas', () => {
    const list = [item('supper', '23:00', '01:00'), item('breakfast', '08:00', '09:00')]
    expect(sortSchedule(list).map((i) => i.meal_type)).toEqual(['breakfast', 'supper'])
    expect(sameSchedule(list, [...list])).toBe(true)
    expect(sameSchedule(list, [list[0]!, item('breakfast', '08:00', '09:30')])).toBe(false)
  })
})
