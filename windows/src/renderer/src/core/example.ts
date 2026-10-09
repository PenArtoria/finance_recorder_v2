import type { AppData, CashBucket, CreditCard, Expense, Goal, Holding, Snapshot, Trade } from '@shared/types'
import { addMonths, monthKey } from './calc'
import { statementsOf } from './cards'
import { convert } from './money'
import { emptyData } from './data'
import { daysInMonth, SPEND_CATEGORIES } from './spending'
import { syncHolding, todayIso } from './trades'

// An example portfolio so the app can be explored before entering real numbers.
// Prices here are placeholders; the first refresh replaces them with live ones.

const RATES = { USD: 1, HKD: 7.85, GBP: 0.75 }

export function exampleData(): AppData {
  const now = Date.now()
  const d = emptyData()
  d.onboarded = true
  d.example = true
  d.fx = { rates: RATES, fetchedAt: 0, source: 'example' }
  const thisMonth = monthKey()

  // Deterministic randomness, so the example looks the same every time.
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647

  const invest: { id: string; symbol: string; name: string; type: Holding['type']; qty: number; price: number; ccy: string; account: string }[] = [
    { id: 'ex-vwra', symbol: 'VWRA.L', name: 'Vanguard FTSE All-World UCITS ETF (USD Acc)', type: 'etf', qty: 85, price: 193.1, ccy: 'USD', account: 'IBKR' },
    { id: 'ex-vall', symbol: 'VALL.L', name: 'Vanguard FTSE Global All Cap UCITS ETF', type: 'etf', qty: 900, price: 3.755, ccy: 'GBP', account: 'IBKR' },
    { id: 'ex-rklb', symbol: 'RKLB', name: 'Rocket Lab Corporation', type: 'stock', qty: 120, price: 69.99, ccy: 'USD', account: 'IBKR' },
    { id: 'ex-btc', symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', qty: 0.085, price: 82700, ccy: 'USD', account: 'Exchange' }
  ]

  // Monthly DCA: a starting position ten months ago, then one buy at the start of each month.
  const walk: Record<string, number[]> = {}
  for (const a of invest) {
    const vol = a.type === 'crypto' ? 0.16 : a.type === 'stock' ? 0.2 : 0.045
    const path = [1]
    for (let k = 1; k <= 10; k++) path.push(path[k - 1] * (1 - (0.012 + (rand() - 0.5) * vol)))
    walk[a.id] = path // walk[id][k] = price factor k months ago
  }
  const holdings: Holding[] = invest.map((a) => {
    const decimals = a.type === 'crypto' ? 4 : 0
    const monthly = +(a.qty * 0.065).toFixed(decimals)
    const start = +(a.qty - monthly * 10).toFixed(decimals)
    const trades: Trade[] = []
    for (let k = 10; k >= 0; k--) {
      const q = k === 10 ? start : monthly
      if (q <= 0) continue
      const price = a.price * walk[a.id][k]
      trades.push({
        id: `${a.id}-t${k}`,
        date: `${addMonths(thisMonth, -k)}-0${1 + (k % 5)}`,
        side: 'buy',
        quantity: q,
        amount: +(q * price + 1.5).toFixed(2),
        fee: 1.5,
        note: k === 10 ? 'Starting position' : undefined,
        createdAt: now
      })
    }
    const h: Holding = {
      id: a.id, symbol: a.symbol, name: a.name, type: a.type, quantity: 0, currency: a.ccy,
      account: a.account, trades, createdAt: now
    }
    d.quotes[a.symbol] = { symbol: a.symbol, price: a.price, previousClose: a.price, currency: a.ccy, name: a.name, fetchedAt: 0 }
    return syncHolding(h)
  })

  const accounts: Holding[] = [
    { id: 'ex-hsbc', symbol: '', name: 'HSBC Everyday', type: 'cash', quantity: 46000, currency: 'HKD', account: 'HSBC', createdAt: now },
    { id: 'ex-wise', symbol: '', name: 'Wise USD', type: 'cash', quantity: 6200, currency: 'USD', account: 'Wise', createdAt: now },
    { id: 'ex-fd', symbol: '', name: '12-month fixed deposit', type: 'deposit', quantity: 10000, currency: 'USD', account: 'HSBC', note: 'Matures March', createdAt: now }
  ]

  const buckets: CashBucket[] = [
    { id: 'ex-emergency', name: 'Emergency fund', amount: 10000, currency: 'USD', accountId: 'ex-fd', target: 15000, color: 0, createdAt: now },
    { id: 'ex-living', name: 'Living expenses', amount: 18000, currency: 'HKD', accountId: 'ex-hsbc', target: null, color: 2, createdAt: now },
    { id: 'ex-travel', name: 'Japan trip', amount: 12000, currency: 'HKD', accountId: 'ex-hsbc', target: 23000, color: 4, createdAt: now },
    { id: 'ex-reserve', name: 'Investment reserve', amount: 2500, currency: 'USD', accountId: 'ex-wise', target: null, color: 1, createdAt: now }
  ]

  const goals: Goal[] = [
    { id: 'ex-g1', name: 'Fully funded emergency fund', target: 15000, currency: 'USD', deadline: addMonths(thisMonth, 8), source: { kind: 'bucket', id: 'ex-emergency' }, createdAt: now },
    { id: 'ex-g2', name: 'Net worth of $100k', target: 100000, currency: 'USD', deadline: addMonths(thisMonth, 30), source: { kind: 'netWorth' }, createdAt: now },
    { id: 'ex-g3', name: 'Japan trip', target: 23000, currency: 'HKD', deadline: addMonths(thisMonth, 5), source: { kind: 'bucket', id: 'ex-travel' }, createdAt: now }
  ]

  // Spending from the living-expenses bucket: this month so far and all of last month.
  const expenses: Expense[] = []
  const today = todayIso()
  const notes: Record<string, string[]> = {
    food: ['Lunch', 'Coffee', 'Dinner with friends', 'Breakfast'],
    groceries: ['Supermarket', 'Market'],
    transport: ['Octopus top-up', 'Taxi', 'MTR'],
    shopping: ['Uniqlo', 'Books'],
    fun: ['Cinema', 'Concert ticket'],
    bills: ['Phone bill', 'Electricity'],
    health: ['Pharmacy']
  }
  const cats = Object.keys(notes)
  for (const month of [addMonths(thisMonth, -1), thisMonth]) {
    for (let day = 1; day <= daysInMonth(month); day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`
      if (date > today) break
      const n = Math.floor(rand() * 3.2)
      for (let i = 0; i < n; i++) {
        const cat = cats[Math.floor(rand() * cats.length)]
        const base = cat === 'bills' ? 280 : cat === 'shopping' ? 320 : cat === 'groceries' ? 210 : cat === 'fun' ? 160 : 70
        const list = notes[cat]
        expenses.push({
          id: `ex-e-${date}-${i}`,
          date,
          amount: Math.round(base * (0.5 + rand())),
          currency: 'HKD',
          category: SPEND_CATEGORIES.some((c) => c.key === cat) ? cat : 'other',
          note: list[Math.floor(rand() * list.length)],
          source: { kind: 'bucket', id: 'ex-living' },
          createdAt: now
        })
      }
    }
  }

  // A credit card paid from HSBC: some day-to-day spending goes on it, plus online orders in US dollars.
  const card: CreditCard = {
    id: 'ex-card', name: 'Visa Signature', issuer: 'HSBC', currency: 'HKD', limit: 30000,
    closingDay: 15, dueDay: 10, dueMonths: 1, payFromId: 'ex-hsbc', autoPay: true, payments: [], color: 6, createdAt: now
  }
  for (const e of expenses) {
    if (['shopping', 'fun', 'food'].includes(e.category) && rand() < 0.55) {
      e.cardId = card.id
      e.cardAmount = e.amount
    }
    e.usd = +(e.amount / RATES.HKD).toFixed(6)
  }
  for (const [i, month] of [addMonths(thisMonth, -1), thisMonth].entries()) {
    const date = `${month}-0${3 + i * 2}`
    if (date > today) continue
    const usd = i ? 42.5 : 34.99
    expenses.push({
      id: `ex-e-online-${i}`, date, amount: usd, currency: 'USD', category: 'shopping', note: 'Online order',
      source: { kind: 'bucket', id: 'ex-living' }, cardId: card.id, cardAmount: +(usd * RATES.HKD).toFixed(2), usd, createdAt: now
    })
  }
  d.expenses = expenses
  d.cards = [card]
  // Bills whose pay day has passed were already paid by the bank.
  for (const st of statementsOf(d, card, RATES)) {
    if (st.status !== 'open' && st.due < today && st.remaining > 0) {
      card.payments.push({ id: `ex-pay-${st.close}`, date: st.due, amount: st.remaining, fromAccountId: 'ex-hsbc', statement: st.close, auto: true, createdAt: now })
    }
  }

  // Ten months of history built from the same trades and a slowly growing cash pile.
  const snapshots: Snapshot[] = []
  for (let k = 1; k <= 10; k++) {
    const month = addMonths(thisMonth, -k)
    const end = `${month}-31`
    const sh = holdings.map((h) => {
      const a = invest.find((x) => x.id === h.id)!
      const quantity = (h.trades ?? []).filter((t) => t.date <= end).reduce((s, t) => s + t.quantity, 0)
      const price = a.price * walk[a.id][k]
      return {
        id: h.id, symbol: h.symbol, name: h.name, type: h.type, quantity: +quantity.toFixed(6), price, currency: a.ccy,
        value: convert(price * quantity, a.ccy, 'USD', RATES) ?? 0
      }
    })
    const cashFactor = Math.max(0.35, 1 - 0.06 * k)
    const sa = accounts.map((a) => {
      const quantity = Math.round(a.quantity * cashFactor)
      return { id: a.id, symbol: '', name: a.name, type: a.type, quantity, price: 1, currency: a.currency, value: convert(quantity, a.currency, 'USD', RATES) ?? 0 }
    })
    const sb = buckets.map((b) => {
      const amount = Math.round(b.amount * cashFactor)
      return { id: b.id, name: b.name, amount, currency: b.currency, value: convert(amount, b.currency, 'USD', RATES) ?? 0, accountId: b.accountId ?? undefined }
    })
    const equities = sh.filter((h) => h.type !== 'crypto').reduce((s, h) => s + h.value, 0)
    const crypto = sh.filter((h) => h.type === 'crypto').reduce((s, h) => s + h.value, 0)
    const cash = sa.reduce((s, a) => s + a.value, 0)
    snapshots.push({
      month, updatedAt: now, base: 'USD', source: 'auto', fx: RATES,
      holdings: [...sh, ...sa], buckets: sb,
      totals: { equities, crypto, cash, other: 0, netWorth: equities + crypto + cash }
    })
  }

  d.holdings = [...holdings, ...accounts]
  d.buckets = buckets
  d.goals = [
    ...goals,
    { id: 'ex-g4', name: 'Own 100 VWRA', target: 100, currency: 'USD', deadline: addMonths(thisMonth, 3), source: { kind: 'units', id: 'ex-vwra' }, createdAt: now }
  ]
  d.snapshots = snapshots.sort((a, b) => a.month.localeCompare(b.month))
  return d
}
