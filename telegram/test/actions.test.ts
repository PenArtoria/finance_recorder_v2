import type { AppData } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { ratesOf } from '../../windows/src/renderer/src/core/calc'
import { owedOn } from '../../windows/src/renderer/src/core/cards'
import { exampleData } from '../../windows/src/renderer/src/core/example'
import { answer, plan, run, undo, validateActions, type Action, type Candidate } from '../src/actions'
import { BotError } from '../src/env'
import { LANGS } from '../src/i18n'

// Moneta's example data: HSBC Everyday (HKD) holds the Living expenses and Japan trip
// buckets, Wise USD holds the Investment reserve, rates are USD 1 = HKD 7.85.

const t = LANGS.en
const today = '2026-10-25'

const bucket = (d: AppData, id: string) => d.buckets.find((b) => b.id === id)!
const holding = (d: AppData, id: string) => d.holdings.find((h) => h.id === id)!

function planned(d: AppData, actions: Action[]) {
  const p = plan(d, validateActions(actions), today, t)
  if (p.ask) throw new Error(`asked: ${p.ask.question}`)
  return p
}

/** Plans, saves and returns the undo steps, like pressing ✅. */
function save(d: AppData, actions: Action[]) {
  return run(d, planned(d, actions).actions, today, t)
}

describe('spending and income', () => {
  it('takes spending out of a bucket and its bank account, and undo puts it back', () => {
    const d = exampleData()
    const before = structuredClone(d)
    const { steps, lines } = save(d, [{ type: 'spend', amount: 120, currency: 'HKD', note: 'Lunch', category: 'food', from: 'living' }])
    expect(bucket(d, 'ex-living').amount).toBe(18000 - 120)
    expect(holding(d, 'ex-hsbc').quantity).toBe(46000 - 120)
    const e = d.expenses.at(-1)!
    expect(e).toMatchObject({ amount: 120, currency: 'HKD', category: 'food', note: 'Lunch', source: { kind: 'bucket', id: 'ex-living' }, date: today })
    expect(e.usd).toBeCloseTo(120 / 7.85, 5)
    expect(lines[0]).toContain('From: Living expenses (HSBC Everyday)')
    expect(lines[0]).toContain('Left: HK$17,880.00')

    expect(undo(d, steps)).toBe(1)
    expect(d.buckets).toEqual(before.buckets)
    expect(d.holdings).toEqual(before.holdings)
    expect(d.expenses).toEqual(before.expenses)
  })

  it('converts other currencies with the synced rates', () => {
    const d = exampleData()
    save(d, [{ type: 'spend', amount: 10, currency: 'USD', from: 'Living expenses' }])
    expect(bucket(d, 'ex-living').amount).toBeCloseTo(18000 - 78.5, 6)
  })

  it('only lowers the bucket’s budget for a card charge', () => {
    const d = exampleData()
    save(d, [{ type: 'spend', amount: 300, currency: 'HKD', from: 'Japan trip', card: 'visa' }])
    expect(bucket(d, 'ex-travel').amount).toBe(12000 - 300)
    expect(holding(d, 'ex-hsbc').quantity).toBe(46000)
    expect(d.expenses.at(-1)).toMatchObject({ cardId: 'ex-card', cardAmount: 300, source: { kind: 'bucket', id: 'ex-travel' } })
  })

  it('uses the currency of your last spending when none is given, as Moneta does', () => {
    const d = exampleData()
    save(d, [{ type: 'spend', amount: 5, currency: 'GBP', from: 'living' }])
    expect(planned(d, [{ type: 'spend', amount: 7 }]).actions[0]).toMatchObject({ currency: 'GBP', from: 'bucket:ex-living' })
    d.expenses = []
    expect(planned(d, [{ type: 'spend', amount: 7, from: 'living' }]).actions[0]).toMatchObject({ currency: 'HKD' })
  })

  it('uses the same place as last time when none is given', () => {
    const d = exampleData()
    save(d, [{ type: 'spend', amount: 5, from: 'Japan trip' }])
    const p = planned(d, [{ type: 'spend', amount: 7 }])
    expect(p.actions[0]).toMatchObject({ from: 'bucket:ex-travel', card: undefined })
  })

  it('records income into an account', () => {
    const d = exampleData()
    const { steps } = save(d, [{ type: 'income', amount: 28000, currency: 'HKD', category: 'salary', to: 'HSBC Everyday' }])
    expect(holding(d, 'ex-hsbc').quantity).toBe(46000 + 28000)
    expect(d.expenses.at(-1)).toMatchObject({ kind: 'income', category: 'salary', source: { kind: 'account', id: 'ex-hsbc' } })
    undo(d, steps)
    expect(holding(d, 'ex-hsbc').quantity).toBe(46000)
  })

  it('maps category names to keys and falls back to other', () => {
    const d = exampleData()
    expect(planned(d, [{ type: 'spend', amount: 1, category: 'Groceries', from: 'living' }]).actions[0]).toMatchObject({ category: 'groceries' })
    expect(planned(d, [{ type: 'spend', amount: 1, category: 'drink', from: 'living' }]).actions[0]).toMatchObject({ category: 'food' })
    expect(planned(d, [{ type: 'spend', amount: 1, category: 'spaceships', from: 'living' }]).actions[0]).toMatchObject({ category: 'other' })
  })

  it('refuses a currency it has no rate for', () => {
    const d = exampleData()
    expect(() => plan(d, [{ type: 'spend', amount: 1200, currency: 'JPY', from: 'living' }], today, t)).toThrow(BotError)
  })
})

describe('asking which one', () => {
  it('asks when a name fits several places, and goes on after the answer', () => {
    const d = exampleData()
    // "HSBC" is the bank of both HSBC Everyday and the fixed deposit.
    const p = plan(d, [{ type: 'income', amount: 100, to: 'HSBC' }], today, t)
    expect(p.ask?.question).toBe('Which one is “HSBC”?')
    expect(p.ask?.options.map((o) => o.ref)).toEqual(['account:ex-hsbc', 'account:ex-fd'])
    const next = plan(d, answer(p.actions, p.ask!, 'account:ex-fd'), today, t)
    expect(next.ask).toBeUndefined()
    expect(next.actions[0]).toMatchObject({ to: 'account:ex-fd', currency: 'USD' })
  })

  it('offers every place when a name matches none', () => {
    const d = exampleData()
    const p = plan(d, [{ type: 'spend', amount: 1, from: 'my piggy bank' }], today, t)
    expect(p.ask?.question).toBe('I can’t find “my piggy bank”. Which one is it?')
    expect(p.ask?.options.length).toBe(d.buckets.length + 3)
  })

  it('asks where the money came from when there is no history', () => {
    const d = exampleData()
    d.expenses = []
    const p = plan(d, [{ type: 'spend', amount: 1 }], today, t)
    expect(p.ask?.question).toBe('Where did the money come from?')
    expect(p.ask?.options.at(-1)).toEqual({ ref: 'none', label: t.notTracked })
  })

  it('escapes names in questions', () => {
    const d = exampleData()
    const p = plan(d, [{ type: 'spend', amount: 1, from: '<b>x</b>' }], today, t)
    expect(p.ask?.question).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})

describe('moves', () => {
  it('moves money between currencies and undoes it', () => {
    const d = exampleData()
    const before = structuredClone(d)
    const { steps, lines } = save(d, [{ type: 'move', amount: 100, from: 'Wise USD', to: 'Living expenses' }])
    expect(holding(d, 'ex-wise').quantity).toBe(6200 - 100)
    expect(bucket(d, 'ex-living').amount).toBe(18000 + 785)
    expect(holding(d, 'ex-hsbc').quantity).toBe(46000 + 785)
    expect(lines[0]).toContain('Arrives: HK$785.00')
    undo(d, steps)
    expect(d.buckets).toEqual(before.buckets)
    expect(d.holdings).toEqual(before.holdings)
  })

  it('won’t move money to the same place', () => {
    const d = exampleData()
    expect(() => plan(d, [{ type: 'move', amount: 1, from: 'Wise USD', to: 'wise usd' }], today, t)).toThrow(BotError)
  })
})

describe('trades', () => {
  it('records a buy with a fee, paid from a bucket, and undoes it', () => {
    const d = exampleData()
    const before = structuredClone(d)
    const qty = holding(d, 'ex-rklb').quantity
    const { steps, lines } = save(d, [{ type: 'buy', holding: 'rklb', quantity: 2, price: 70, fee: 1, cash: 'Investment reserve' }])
    const h = holding(d, 'ex-rklb')
    expect(h.quantity).toBeCloseTo(qty + 2, 8)
    expect(h.trades!.at(-1)).toMatchObject({ side: 'buy', quantity: 2, amount: 141, fee: 1, cash: { kind: 'bucket', id: 'ex-reserve', amount: 141, currency: 'USD' } })
    expect(bucket(d, 'ex-reserve').amount).toBe(2500 - 141)
    expect(holding(d, 'ex-wise').quantity).toBe(6200 - 141)
    expect(lines[0]).toContain('<b>Buy 2 RKLB</b>')
    undo(d, steps)
    expect(d.holdings).toEqual(before.holdings)
    expect(d.buckets).toEqual(before.buckets)
  })

  it('works out units from a total and the last price', () => {
    const d = exampleData()
    const price = d.quotes['VWRA.L'].price
    const p = planned(d, [{ type: 'buy', holding: 'VWRA', total: 500, cash: 'none' }])
    expect(p.actions[0]).toMatchObject({ holding: 'ex-vwra', total: 500, cash: 'none', currency: 'USD' })
    expect((p.actions[0] as { quantity: number }).quantity).toBeCloseTo(500 / price, 8)
  })

  it('refuses to sell more than you hold, or something you don’t hold', () => {
    const d = exampleData()
    expect(() => plan(d, [{ type: 'sell', holding: 'RKLB', quantity: 100000, price: 70, cash: 'none' }], today, t)).toThrow(BotError)
    expect(() => plan(d, [{ type: 'buy', holding: 'NVDA', quantity: 1, price: 100, cash: 'none' }], today, t)).toThrow(BotError)
  })
})

describe('several entries at once', () => {
  it('describes each with the balance after it', () => {
    const d = exampleData()
    const p = planned(d, [
      { type: 'spend', amount: 100, currency: 'HKD', from: 'living' },
      { type: 'spend', amount: 50, currency: 'HKD', from: 'living' }
    ])
    expect(p.lines[0]).toContain('Left: HK$17,900.00')
    expect(p.lines[1]).toContain('Left: HK$17,850.00')
    // Planning doesn't change the data.
    expect(bucket(d, 'ex-living').amount).toBe(18000)
  })
})

describe('validateActions', () => {
  it('rejects anything unexpected', () => {
    const bad: unknown[] = [
      null,
      [],
      [{ type: 'steal', amount: 1 }],
      [{ type: 'spend', amount: -5 }],
      [{ type: 'spend', amount: '12' }],
      [{ type: 'move', amount: 5, from: 'a' }],
      [{ type: 'buy', quantity: 1 }],
      new Array(11).fill({ type: 'spend', amount: 1 })
    ]
    for (const b of bad) expect(() => validateActions(b)).toThrow(BotError)
  })

  it('drops bad optional fields instead of trusting them', () => {
    const [a] = validateActions([{ type: 'spend', amount: 5, currency: 'dollars', date: '2026-13-40', note: 'x'.repeat(500) }])
    expect(a).toMatchObject({ type: 'spend', amount: 5, currency: undefined, date: undefined, note: undefined })
  })
})

describe('buying something new', () => {
  const quote = (symbol: string, price: number, currency: string) => ({ symbol, price, previousClose: price, currency, fetchedAt: 1 })
  const panw: Candidate = { symbol: 'PANW', name: 'Palo Alto Networks, Inc.', type: 'stock', exchange: 'NASDAQ', quote: quote('PANW', 350, 'USD') }
  const panwTo: Candidate = { symbol: 'PANW.TO', name: 'Palo Alto Networks, Inc.', type: 'etf', exchange: 'Toronto', quote: quote('PANW.TO', 25, 'USD') }
  const withCandidates = (raw: Action[], candidates: Candidate[]) =>
    validateActions(raw).map((a) => (a.type === 'buy' ? { ...a, candidates } : a))

  it('adds the holding with its first buy, and undo takes it away again', () => {
    const d = exampleData()
    const before = structuredClone(d)
    const p = plan(d, withCandidates([{ type: 'buy', holding: 'panw', total: 350, currency: 'USD', cash: 'Wise USD' }], [panw, panwTo]), today, t)
    if (p.ask) throw new Error(p.ask.question)
    expect(p.lines[0]).toContain('<b>Buy 1 PANW</b>')
    expect(p.lines[0]).toContain('New holding: Palo Alto Networks, Inc.')
    expect(d.holdings.some((h) => h.symbol === 'PANW')).toBe(false)

    const { steps } = run(d, p.actions, today, t)
    const h = d.holdings.find((x) => x.symbol === 'PANW')!
    expect(h).toMatchObject({ name: 'Palo Alto Networks, Inc.', type: 'stock', currency: 'USD', quantity: 1, cost: 350 })
    expect(h.trades).toHaveLength(1)
    expect(d.quotes.PANW.price).toBe(350)
    expect(holding(d, 'ex-wise').quantity).toBe(6200 - 350)

    undo(d, steps)
    expect(d.holdings).toEqual(before.holdings)
  })

  it('asks which ticker when the name fits several', () => {
    const d = exampleData()
    const p = plan(d, withCandidates([{ type: 'buy', holding: 'palo alto', quantity: 2, cash: 'none' }], [panw, panwTo]), today, t)
    expect(p.ask?.question).toBe('Which “palo alto” do you mean?')
    expect(p.ask?.options.map((o) => o.ref)).toEqual(['new:PANW', 'new:PANW.TO'])
    const next = plan(d, answer(p.actions, p.ask!, 'new:PANW.TO'), today, t)
    expect(next.ask).toBeUndefined()
    expect(next.actions[0]).toMatchObject({ holding: 'new:PANW.TO', quantity: 2, total: 50 })
  })

  it('buys into a holding you already have instead of adding it twice', () => {
    const d = exampleData()
    const rklb: Candidate = { symbol: 'RKLB', name: 'Rocket Lab', type: 'stock', exchange: 'NASDAQ', quote: quote('RKLB', 70, 'USD') }
    const p = planned(d, [{ type: 'buy', holding: 'rklb', quantity: 1, cash: 'none' }])
    expect(p.actions[0]).toMatchObject({ holding: 'ex-rklb' })
    const viaLookup = plan(d, withCandidates([{ type: 'buy', holding: 'new:RKLB', quantity: 1, cash: 'none' }], [rklb]), today, t)
    expect(viaLookup.actions[0]).toMatchObject({ holding: 'ex-rklb' })
  })

  it('says so when a ticker can’t be found, and won’t sell what you don’t hold', () => {
    const d = exampleData()
    expect(() => plan(d, withCandidates([{ type: 'buy', holding: 'zzzz', quantity: 1, cash: 'none' }], []), today, t)).toThrow(
      expect.objectContaining({ key: 'noSymbol' })
    )
    expect(() => plan(d, [{ type: 'sell', holding: 'PANW', quantity: 1, price: 1, cash: 'none' }], today, t)).toThrow(
      expect.objectContaining({ key: 'noHolding' })
    )
  })

  it('ignores candidates an AI tries to pass in', () => {
    const [a] = validateActions([{ type: 'buy', holding: 'PANW', quantity: 1, candidates: [panw] }])
    expect(a).not.toHaveProperty('candidates')
  })
})

describe('“the bank”', () => {
  // Example bank accounts: HSBC Everyday (HKD), Wise USD (USD) and a fixed deposit (USD).

  it('means the bank account in the entry’s currency when there is one', () => {
    const d = exampleData()
    expect(planned(d, [{ type: 'spend', amount: 100, currency: 'HKD', from: 'the bank' }]).actions[0]).toMatchObject({ from: 'account:ex-hsbc' })
    expect(planned(d, [{ type: 'income', amount: 100, currency: 'HKD', to: '銀行' }]).actions[0]).toMatchObject({ to: 'account:ex-hsbc' })
  })

  it('asks between bank accounts only when several fit', () => {
    const d = exampleData()
    const p = plan(d, [{ type: 'buy', holding: 'RKLB', total: 350, currency: 'USD', cash: 'my bank' }], today, t)
    expect(p.ask?.question).toBe('Which bank account?')
    expect(p.ask?.options.map((o) => o.ref)).toEqual(['account:ex-wise', 'account:ex-fd'])
  })

  it('still prefers an account actually named like that', () => {
    const d = exampleData()
    d.holdings.find((h) => h.id === 'ex-wise')!.name = 'Bank'
    expect(planned(d, [{ type: 'spend', amount: 1, from: 'bank' }]).actions[0]).toMatchObject({ from: 'account:ex-wise' })
  })
})

describe('setting a balance', () => {
  it('sets a bank account’s balance, and undo keeps later changes', () => {
    const d = exampleData()
    const { steps, lines } = save(d, [{ type: 'set', target: 'HSBC Everyday', amount: 45000 }])
    expect(holding(d, 'ex-hsbc').quantity).toBe(45000)
    expect(bucket(d, 'ex-living').amount).toBe(18000)
    expect(lines[0]).toContain('<b>Set: HSBC Everyday</b>')
    expect(lines[0]).toContain('Was: HK$46,000.00')
    expect(lines[0]).toContain('Now: <b>HK$45,000.00</b> (−HK$1,000.00)')
    // Something else changes the account before the undo.
    save(d, [{ type: 'income', amount: 100, currency: 'HKD', to: 'HSBC Everyday' }])
    undo(d, steps)
    expect(holding(d, 'ex-hsbc').quantity).toBe(46100)
  })

  it('sets a bucket without touching its bank account', () => {
    const d = exampleData()
    const { lines } = save(d, [{ type: 'set', target: 'Japan trip', amount: 10000 }])
    expect(bucket(d, 'ex-travel').amount).toBe(10000)
    expect(holding(d, 'ex-hsbc').quantity).toBe(46000)
    expect(lines[0]).toContain('Only the bucket changes; HSBC Everyday stays the same.')
  })

  it('sets what an asset is worth, and understands “the bank” and zero', () => {
    const d = exampleData()
    d.holdings.push({ id: 'ex-pension', symbol: '', name: 'Pension', type: 'pension', quantity: 1, currency: 'USD', manualPrice: 20000, createdAt: 0 })
    save(d, [{ type: 'set', target: 'pension', amount: 21000 }])
    expect(holding(d, 'ex-pension').manualPrice).toBe(21000)
    save(d, [{ type: 'set', target: 'the bank', amount: 40000, currency: 'HKD' }])
    expect(holding(d, 'ex-hsbc').quantity).toBe(40000)
    save(d, [{ type: 'set', target: 'Investment reserve', amount: 0 }])
    expect(bucket(d, 'ex-reserve').amount).toBe(0)
  })

  it('adds a card charge when the card owes more, and undo removes it', () => {
    const d = exampleData()
    const card = d.cards[0]
    const before = owedOn(d, card, ratesOf(d))
    const { steps, lines } = save(d, [{ type: 'set', target: 'my card', amount: before + 500 }])
    expect(owedOn(d, card, ratesOf(d))).toBeCloseTo(before + 500, 6)
    const e = d.expenses.at(-1)!
    expect(e).toMatchObject({ cardId: card.id, category: 'other', note: 'Balance correction', source: null })
    expect(e.amount).toBeCloseTo(500, 6)
    expect(lines[0]).toContain('owed (+HK$500.00)')
    expect(lines[0]).toContain('added as a card charge')
    undo(d, steps)
    expect(owedOn(d, card, ratesOf(d))).toBeCloseTo(before, 6)
  })

  it('records payments that no bank account made when the card owes less', () => {
    const d = exampleData()
    const card = d.cards[0]
    const hsbc = holding(d, 'ex-hsbc').quantity
    const before = owedOn(d, card, ratesOf(d))
    expect(before).toBeGreaterThan(0)
    const { steps, lines } = save(d, [{ type: 'set', target: 'Visa', amount: 0 }])
    expect(owedOn(d, card, ratesOf(d))).toBe(0)
    expect(holding(d, 'ex-hsbc').quantity).toBe(hsbc)
    expect(lines[0]).toContain('recorded as a card payment')
    undo(d, steps)
    expect(owedOn(d, card, ratesOf(d))).toBeCloseTo(before, 6)
  })

  it('rejects a negative balance', () => {
    expect(() => validateActions([{ type: 'set', target: 'SMBC', amount: -5 }])).toThrow(BotError)
  })
})

describe('everyday defaults', () => {
  it('uses a named account’s or card’s currency over the last one used', () => {
    const d = exampleData()
    save(d, [{ type: 'spend', amount: 5, currency: 'GBP', from: 'living' }])
    expect(planned(d, [{ type: 'spend', amount: 120, from: 'Wise USD' }]).actions[0]).toMatchObject({ currency: 'USD' })
    expect(planned(d, [{ type: 'spend', amount: 120, card: 'Visa' }]).actions[0]).toMatchObject({ currency: 'HKD', from: 'bucket:ex-living' })
    d.expenses = d.expenses.filter((e) => !e.cardId)
    expect(planned(d, [{ type: 'spend', amount: 120, card: 'Visa' }]).actions[0]).toMatchObject({ from: 'none' })
    expect(planned(d, [{ type: 'income', amount: 120, to: 'Wise USD' }]).actions[0]).toMatchObject({ currency: 'USD' })
    // Nothing named: the last currency, as in Moneta.
    expect(planned(d, [{ type: 'spend', amount: 120 }]).actions[0]).toMatchObject({ currency: 'GBP' })
  })

  it('sells everything with “all”', () => {
    const d = exampleData()
    const qty = holding(d, 'ex-rklb').quantity
    const { steps } = save(d, [{ type: 'sell', holding: 'RKLB', all: true, cash: 'none' } as Action])
    expect(holding(d, 'ex-rklb').quantity).toBe(0)
    expect(d.holdings.find((h) => h.id === 'ex-rklb')!.trades!.at(-1)).toMatchObject({ side: 'sell', quantity: qty })
    undo(d, steps)
    expect(holding(d, 'ex-rklb').quantity).toBe(qty)
  })
})
