import type { AppData, CashBucket, Goal, Holding, Snapshot } from '@shared/types'
import { addMonths, monthKey } from './calc'
import { convert } from './money'
import { emptyData } from './data'

// An example portfolio so the app can be explored before entering real numbers.
// Prices here are placeholders; the first refresh replaces them with live ones.

const RATES = { USD: 1, HKD: 7.85, GBP: 0.75 }

export function exampleData(): AppData {
  const now = Date.now()
  const d = emptyData()
  d.onboarded = true
  d.example = true
  d.fx = { rates: RATES, fetchedAt: 0, source: 'example' }

  const holdings: Holding[] = [
    { id: 'ex-vwra', symbol: 'VWRA.L', name: 'Vanguard FTSE All-World UCITS ETF (USD Acc)', type: 'etf', quantity: 85, currency: 'USD', cost: 13900, account: 'IBKR', createdAt: now },
    { id: 'ex-vall', symbol: 'VALL.L', name: 'Vanguard FTSE Global All Cap UCITS ETF', type: 'etf', quantity: 900, currency: 'GBP', cost: 3150, account: 'IBKR', createdAt: now },
    { id: 'ex-rklb', symbol: 'RKLB', name: 'Rocket Lab Corporation', type: 'stock', quantity: 120, currency: 'USD', cost: 4800, account: 'IBKR', createdAt: now },
    { id: 'ex-btc', symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', quantity: 0.085, currency: 'USD', cost: 6000, account: 'Exchange', createdAt: now }
  ]
  const prices: Record<string, [number, string]> = {
    'VWRA.L': [193.1, 'USD'],
    'VALL.L': [3.755, 'GBP'],
    RKLB: [69.99, 'USD'],
    'BTC-USD': [82700, 'USD']
  }
  for (const h of holdings) {
    const [price, currency] = prices[h.symbol]
    d.quotes[h.symbol] = { symbol: h.symbol, price, previousClose: price, currency, name: h.name, fetchedAt: 0 }
  }

  const buckets: CashBucket[] = [
    { id: 'ex-emergency', name: 'Emergency fund', amount: 11200, currency: 'USD', target: 15000, color: 0, createdAt: now },
    { id: 'ex-living', name: 'Living expenses', amount: 18000, currency: 'HKD', target: null, color: 2, createdAt: now },
    { id: 'ex-travel', name: 'Japan trip', amount: 1650, currency: 'USD', target: 3000, color: 4, createdAt: now },
    { id: 'ex-reserve', name: 'Investment reserve', amount: 2500, currency: 'USD', target: null, color: 1, createdAt: now }
  ]

  const thisMonth = monthKey()
  const goals: Goal[] = [
    { id: 'ex-g1', name: 'Fully funded emergency fund', target: 15000, currency: 'USD', deadline: addMonths(thisMonth, 8), source: { kind: 'bucket', id: 'ex-emergency' }, createdAt: now },
    { id: 'ex-g2', name: 'Net worth of $100k', target: 100000, currency: 'USD', deadline: addMonths(thisMonth, 30), source: { kind: 'netWorth' }, createdAt: now },
    { id: 'ex-g3', name: 'Japan trip', target: 3000, currency: 'USD', deadline: addMonths(thisMonth, 5), source: { kind: 'bucket', id: 'ex-travel' }, createdAt: now }
  ]

  // Ten months of history: steady buying plus a deterministic random walk in prices.
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5
  const snapshots: Snapshot[] = []
  const priceWalk: Record<string, number> = Object.fromEntries(holdings.map((h) => [h.id, 1]))
  for (let k = 1; k <= 10; k++) {
    const month = addMonths(thisMonth, -k)
    const qtyFactor = Math.max(0.35, 1 - 0.065 * k)
    for (const h of holdings) {
      const vol = h.type === 'crypto' ? 0.16 : h.type === 'stock' ? 0.2 : 0.045
      priceWalk[h.id] *= 1 - (0.012 + rand() * vol)
    }
    const sh = holdings.map((h) => {
      const [p, ccy] = prices[h.symbol]
      const price = p * priceWalk[h.id]
      const quantity = +(h.quantity * qtyFactor).toFixed(h.type === 'crypto' ? 4 : 0)
      return {
        id: h.id, symbol: h.symbol, name: h.name, type: h.type, quantity, price, currency: ccy,
        value: convert(price * quantity, ccy, 'USD', RATES) ?? 0
      }
    })
    const sb = buckets.map((b) => {
      const amount = Math.round(b.amount * Math.max(0.3, 1 - 0.07 * k + rand() * 0.05))
      return { id: b.id, name: b.name, amount, currency: b.currency, value: convert(amount, b.currency, 'USD', RATES) ?? 0 }
    })
    const equities = sh.filter((h) => h.type !== 'crypto').reduce((s, h) => s + h.value, 0)
    const crypto = sh.filter((h) => h.type === 'crypto').reduce((s, h) => s + h.value, 0)
    const cash = sb.reduce((s, b) => s + b.value, 0)
    snapshots.push({
      month, updatedAt: now, base: 'USD', source: 'auto', fx: RATES, holdings: sh, buckets: sb,
      totals: { equities, crypto, cash, other: 0, netWorth: equities + crypto + cash }
    })
  }

  d.holdings = holdings
  d.buckets = buckets
  d.goals = goals
  d.snapshots = snapshots.sort((a, b) => a.month.localeCompare(b.month))
  return d
}
