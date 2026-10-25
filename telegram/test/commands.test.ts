import { describe, expect, it } from 'vitest'
import { parseCommand, parseDate } from '../src/commands'

const today = '2026-10-25'
const entry = (text: string) => {
  const c = parseCommand(text, today)
  if (c?.kind !== 'actions') throw new Error(`not an entry: ${JSON.stringify(c)}`)
  return c.actions[0]
}

describe('parseCommand', () => {
  it('reads spending with a source', () => {
    expect(entry('/spend 1200 lunch from Daily')).toMatchObject({ type: 'spend', amount: 1200, note: 'lunch', from: 'Daily' })
  })

  it('reads currency symbols, tags, cards, dates and any language', () => {
    expect(entry('/spend ¥1,200 ランチ #food from 生活費 card Visa on yesterday')).toMatchObject({
      type: 'spend',
      amount: 1200,
      currency: 'JPY',
      note: 'ランチ',
      category: 'food',
      from: '生活費',
      card: 'Visa',
      date: '2026-10-24'
    })
    expect(entry('/spend 1200円 昼ご飯')).toMatchObject({ amount: 1200, currency: 'JPY', note: '昼ご飯' })
    expect(entry('/spend 12.5 usd coffee')).toMatchObject({ amount: 12.5, currency: 'USD', note: 'coffee' })
    expect(entry('/spend HK$80 lunch')).toMatchObject({ amount: 80, currency: 'HKD' })
    expect(entry('/spend 30eur tickets')).toMatchObject({ amount: 30, currency: 'EUR', note: 'tickets' })
  })

  it('keeps lowercase words that happen to be rare currency codes', () => {
    const e = entry('/spend 500 cup noodles')
    expect(e).toMatchObject({ amount: 500, note: 'cup noodles' })
    expect(e).not.toHaveProperty('currency', 'CUP')
  })

  it('reads income, moves and trades', () => {
    expect(entry('/income 300000 salary #salary to SMBC')).toMatchObject({ type: 'income', amount: 300000, note: 'salary', category: 'salary', to: 'SMBC' })
    expect(entry('/move 700 USD from Wise USD to IBKR cash')).toMatchObject({ type: 'move', amount: 700, currency: 'USD', from: 'Wise USD', to: 'IBKR cash' })
    expect(entry('/buy 3 VWRA at 140 fee 2 from IBKR')).toMatchObject({ type: 'buy', holding: 'VWRA', quantity: 3, price: 140, fee: 2, cash: 'IBKR' })
    expect(entry('/buy VWRA for $500 on 10-20')).toMatchObject({ type: 'buy', holding: 'VWRA', total: 500, currency: 'USD', date: '2026-10-20' })
    expect(entry('/sell 1 RKLB at 70 to IBKR')).toMatchObject({ type: 'sell', holding: 'RKLB', quantity: 1, price: 70, cash: 'IBKR' })
  })

  it('explains usage when an entry is incomplete', () => {
    expect(parseCommand('/spend lunch', today)).toEqual({ kind: 'usage', command: 'spend' })
    expect(parseCommand('/move 700 from Wise', today)).toEqual({ kind: 'usage', command: 'move' })
    expect(parseCommand('/buy VWRA', today)).toEqual({ kind: 'usage', command: 'buy' })
    expect(parseCommand('/spend 100 lunch on someday', today)).toEqual({ kind: 'usage', command: 'spend' })
  })

  it('knows the other commands and ignores normal messages', () => {
    expect(parseCommand('/start', today)).toEqual({ kind: 'help' })
    expect(parseCommand('/balances', today)).toEqual({ kind: 'balances' })
    expect(parseCommand('/undo', today)).toEqual({ kind: 'undo' })
    expect(parseCommand('/whatever', today)).toEqual({ kind: 'unknown' })
    expect(parseCommand('/spend@MonetaBot 100', today)).toMatchObject({ kind: 'actions' })
    expect(parseCommand('lunch 1200 yen', today)).toBeNull()
  })
})

describe('parseDate', () => {
  it('reads the usual forms', () => {
    expect(parseDate(['today'], today)).toBe(today)
    expect(parseDate(['yesterday'], '2026-03-01')).toBe('2026-02-28')
    expect(parseDate(['2026-1-5'], today)).toBe('2026-01-05')
    expect(parseDate(['10/24'], today)).toBe('2026-10-24')
    expect(parseDate(['3'], today)).toBe('2026-10-03')
  })

  it('rejects dates that don’t exist', () => {
    expect(parseDate(['2026-02-30'], today)).toBeNull()
    expect(parseDate(['someday'], today)).toBeNull()
  })
})
