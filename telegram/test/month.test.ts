import { describe, expect, it } from 'vitest'
import { exampleData } from '../../windows/src/renderer/src/core/example'
import { parseCommand } from '../src/commands'
import { LANGS } from '../src/i18n'
import { monthOf, monthSummary } from '../src/month'

describe('/month', () => {
  it('picks the month', () => {
    expect(monthOf('', '2026-10-25')).toBe('2026-10')
    expect(monthOf('last', '2026-01-05')).toBe('2025-12')
    expect(monthOf('2026-9', '2026-10-25')).toBe('2026-09')
    expect(monthOf('someday', '2026-10-25')).toBeNull()
    expect(parseCommand('/month last', '2026-10-25')).toEqual({ kind: 'month', arg: 'last' })
    expect(parseCommand('/spending', '2026-10-25')).toEqual({ kind: 'month', arg: '' })
  })

  it('totals spending and income, by category, with the latest entries', () => {
    const d = exampleData()
    const today = new Date().toISOString().slice(0, 10)
    const text = monthSummary(d, today.slice(0, 7), today, LANGS.en)
    expect(text).toMatch(/^📅 <b>\w+ \d{4}<\/b>\n💸 Spent: <b>\$[\d,.]+<\/b>\n💰 Income: <b>\$[\d,.]+<\/b>/)
    expect(text).toContain('📊 <b>By category</b>')
    expect(text).toContain('🕘 <b>Latest</b>')
    expect(text.split('\n').filter((l) => l.startsWith('• ')).length).toBeGreaterThan(1)
  })

  it('says so when the month is empty', () => {
    expect(monthSummary(exampleData(), '1999-01', '2026-10-25', LANGS.en)).toBe('📅 <b>January 1999</b>\nNothing recorded this month yet.')
  })
})
