import type {
  AppData,
  AssetType,
  CashBucket,
  Category,
  Goal,
  Holding,
  Quote,
  Snapshot,
  SnapshotTotals
} from '@shared/types'
import { convert, type Rates } from './money'

export const CATEGORIES: Category[] = ['equities', 'crypto', 'cash', 'other']

export const CATEGORY_LABEL: Record<Category, string> = {
  equities: 'Stocks & funds',
  crypto: 'Crypto',
  cash: 'Cash',
  other: 'Other'
}

export const CATEGORY_OF: Record<AssetType, Category> = {
  stock: 'equities',
  etf: 'equities',
  fund: 'equities',
  crypto: 'crypto',
  bond: 'other',
  other: 'other'
}

export const TYPE_LABEL: Record<AssetType, string> = {
  stock: 'Stock',
  etf: 'ETF',
  fund: 'Fund',
  crypto: 'Crypto',
  bond: 'Bond',
  other: 'Other'
}

// ---------- months ----------

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function parseMonth(month: string): { y: number; m: number } {
  const [y, m] = month.split('-').map(Number)
  return { y, m }
}

export function addMonths(month: string, n: number): string {
  const { y, m } = parseMonth(month)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Whole months from `a` to `b` (b − a). */
export function monthDiff(a: string, b: string): number {
  const A = parseMonth(a)
  const B = parseMonth(b)
  return (B.y - A.y) * 12 + (B.m - A.m)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export function monthLabel(month: string, style: 'short' | 'long' | 'axis' = 'short'): string {
  const { y, m } = parseMonth(month)
  if (style === 'long') return `${MONTHS_LONG[m - 1]} ${y}`
  if (style === 'axis') return `${MONTHS[m - 1]} ’${String(y).slice(2)}`
  return `${MONTHS[m - 1]} ${y}`
}

// ---------- portfolio ----------

export interface HoldingRow {
  holding: Holding
  category: Category
  quote?: Quote
  price: number | null
  priceCurrency: string
  previousClose: number | null
  valueLocal: number | null
  /** Value in the base currency. */
  value: number | null
  dayChange: number | null
  dayPct: number | null
  cost: number | null
  pnl: number | null
  pnlPct: number | null
  weight: number
  missingPrice: boolean
  missingFx: boolean
}

export interface BucketRow {
  bucket: CashBucket
  value: number | null
  progress: number | null
  missingFx: boolean
}

export interface Portfolio {
  base: string
  rates: Rates
  holdings: HoldingRow[]
  buckets: BucketRow[]
  totals: SnapshotTotals & { investments: number }
  dayChange: number
  dayPct: number | null
  missingPrice: string[]
  missingFx: string[]
  /** Oldest quote time among priced holdings, epoch ms. */
  oldestQuote: number | null
}

export function ratesOf(data: AppData): Rates {
  return { USD: 1, ...(data.fx?.rates ?? {}) }
}

export function computePortfolio(data: AppData): Portfolio {
  const base = data.settings.baseCurrency
  const rates = ratesOf(data)
  const missingPrice: string[] = []
  const missingFx = new Set<string>()
  const totals = { equities: 0, crypto: 0, cash: 0, other: 0, netWorth: 0, investments: 0 }
  let dayChange = 0
  let prevValue = 0
  let oldestQuote: number | null = null

  const holdings: HoldingRow[] = data.holdings.map((h) => {
    const quote = h.symbol ? data.quotes[h.symbol] : undefined
    let price: number | null = null
    let priceCurrency = h.currency
    let previousClose: number | null = null
    if (quote) {
      price = quote.price
      priceCurrency = quote.currency
      previousClose = quote.previousClose
      if (quote.fetchedAt > 0) oldestQuote = oldestQuote == null ? quote.fetchedAt : Math.min(oldestQuote, quote.fetchedAt)
    } else if (h.manualPrice != null) {
      price = h.manualPrice
    }
    const category = CATEGORY_OF[h.type]
    const valueLocal = price != null ? price * h.quantity : null
    const value = valueLocal != null ? convert(valueLocal, priceCurrency, base, rates) : null
    if (price == null) missingPrice.push(h.symbol || h.name)
    if (valueLocal != null && value == null) missingFx.add(priceCurrency)

    let dc: number | null = null
    let dayPct: number | null = null
    if (price != null && previousClose != null && previousClose > 0) {
      dc = convert((price - previousClose) * h.quantity, priceCurrency, base, rates)
      dayPct = price / previousClose - 1
    }
    const cost = h.cost != null && h.cost > 0 ? convert(h.cost, h.currency, base, rates) : null
    const pnl = value != null && cost != null ? value - cost : null
    const pnlPct = pnl != null && cost ? pnl / cost : null

    if (value != null) {
      totals[category] += value
      if (dc != null) {
        dayChange += dc
        prevValue += value - dc
      } else {
        prevValue += value
      }
    }
    return {
      holding: h, category, quote, price, priceCurrency, previousClose, valueLocal, value,
      dayChange: dc, dayPct, cost, pnl, pnlPct, weight: 0,
      missingPrice: price == null, missingFx: valueLocal != null && value == null
    }
  })

  const buckets: BucketRow[] = data.buckets.map((b) => {
    const value = convert(b.amount, b.currency, base, rates)
    if (value == null) missingFx.add(b.currency)
    else totals.cash += value
    return {
      bucket: b,
      value,
      progress: b.target && b.target > 0 ? b.amount / b.target : null,
      missingFx: value == null
    }
  })

  totals.investments = totals.equities + totals.crypto + totals.other
  totals.netWorth = totals.investments + totals.cash
  for (const r of holdings) r.weight = r.value != null && totals.investments > 0 ? r.value / totals.investments : 0

  return {
    base, rates, holdings, buckets, totals, dayChange,
    dayPct: prevValue > 0 ? dayChange / prevValue : null,
    missingPrice, missingFx: [...missingFx], oldestQuote
  }
}

// ---------- snapshots ----------

export function buildSnapshot(p: Portfolio, month: string): Snapshot {
  const { investments: _skip, ...totals } = p.totals
  return {
    month,
    updatedAt: Date.now(),
    base: p.base,
    totals,
    holdings: p.holdings
      .filter((r) => r.value != null && r.price != null)
      .map((r) => ({
        id: r.holding.id,
        symbol: r.holding.symbol,
        name: r.holding.name,
        type: r.holding.type,
        quantity: r.holding.quantity,
        price: r.price as number,
        currency: r.priceCurrency,
        value: r.value as number
      })),
    buckets: p.buckets
      .filter((r) => r.value != null)
      .map((r) => ({
        id: r.bucket.id,
        name: r.bucket.name,
        amount: r.bucket.amount,
        currency: r.bucket.currency,
        value: r.value as number
      })),
    fx: p.rates,
    source: 'auto'
  }
}

/** Factor to turn a snapshot's stored values into `base`. */
export function snapshotFactor(s: Snapshot, base: string, currentRates: Rates): number {
  if (s.base === base) return 1
  return convert(1, s.base, base, s.fx ?? currentRates) ?? convert(1, s.base, base, currentRates) ?? NaN
}

export function snapshotTotals(s: Snapshot, base: string, currentRates: Rates): SnapshotTotals {
  const f = snapshotFactor(s, base, currentRates)
  return {
    equities: s.totals.equities * f,
    crypto: s.totals.crypto * f,
    cash: s.totals.cash * f,
    other: s.totals.other * f,
    netWorth: s.totals.netWorth * f
  }
}

/** Upserts the live snapshot for the current month. Returns the same array when nothing changed. */
export function withLiveSnapshot(data: AppData, p: Portfolio, now = new Date()): Snapshot[] {
  if (!data.onboarded || (data.holdings.length === 0 && data.buckets.length === 0)) return data.snapshots
  const month = monthKey(now)
  const snap = buildSnapshot(p, month)
  const idx = data.snapshots.findIndex((s) => s.month === month)
  if (idx >= 0) {
    const old = data.snapshots[idx]
    if (old.source !== 'auto' && old.note) snap.note = old.note
    if (sameSnapshot(old, snap)) return data.snapshots
    const next = data.snapshots.slice()
    next[idx] = snap
    return next
  }
  return [...data.snapshots, snap].sort((a, b) => a.month.localeCompare(b.month))
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  const strip = (s: Snapshot) => JSON.stringify({ ...s, updatedAt: 0, fx: undefined })
  return strip(a) === strip(b)
}

export interface HistoryPoint {
  month: string
  totals: SnapshotTotals
  /** Net worth not split into categories (imported totals only). */
  unsplit: number
  live: boolean
  source: Snapshot['source']
  snapshot?: Snapshot
}

export function history(data: AppData, p: Portfolio, now = new Date()): HistoryPoint[] {
  const current = monthKey(now)
  const points: HistoryPoint[] = data.snapshots
    .filter((s) => s.month !== current)
    .map((s) => {
      const totals = snapshotTotals(s, p.base, p.rates)
      const split = totals.equities + totals.crypto + totals.cash + totals.other
      return {
        month: s.month,
        totals,
        unsplit: Math.max(0, totals.netWorth - split),
        live: false,
        source: s.source,
        snapshot: s
      }
    })
  if (data.holdings.length || data.buckets.length) {
    const { investments: _skip, ...totals } = p.totals
    points.push({
      month: current,
      totals,
      unsplit: 0,
      live: true,
      source: 'auto',
      snapshot: data.snapshots.find((s) => s.month === current)
    })
  }
  return points.sort((a, b) => a.month.localeCompare(b.month))
}

// ---------- month-over-month change ----------

export interface ChangeItem {
  key: string
  label: string
  sublabel: string
  kind: 'holding' | 'bucket' | 'category'
  delta: number
  market: number
  flow: number
  isNew?: boolean
  removed?: boolean
}

export interface MonthChange {
  previousMonth: string | null
  previous: number | null
  current: number
  delta: number | null
  pct: number | null
  /** Price and exchange-rate moves. */
  market: number | null
  /** Money you put in or took out: buys, sells, cash saved or spent. */
  flow: number | null
  items: ChangeItem[]
  detailed: boolean
  byCategory: Record<Category, number> | null
}

export function previousSnapshot(data: AppData, now = new Date()): Snapshot | undefined {
  const current = monthKey(now)
  const older = data.snapshots.filter((s) => s.month < current)
  return older[older.length - 1]
}

export function monthChange(data: AppData, p: Portfolio, now = new Date()): MonthChange {
  const prev = previousSnapshot(data, now)
  const current = p.totals.netWorth
  if (!prev) {
    return {
      previousMonth: null, previous: null, current, delta: null, pct: null,
      market: null, flow: null, items: [], detailed: false, byCategory: null
    }
  }
  const f = snapshotFactor(prev, p.base, p.rates)
  const prevTotals = snapshotTotals(prev, p.base, p.rates)
  const delta = current - prevTotals.netWorth
  const byCategory = {
    equities: p.totals.equities - prevTotals.equities,
    crypto: p.totals.crypto - prevTotals.crypto,
    cash: p.totals.cash - prevTotals.cash,
    other: p.totals.other - prevTotals.other
  }
  const base: MonthChange = {
    previousMonth: prev.month,
    previous: prevTotals.netWorth,
    current,
    delta,
    pct: prevTotals.netWorth > 0 ? delta / prevTotals.netWorth : null,
    market: null,
    flow: null,
    items: [],
    detailed: false,
    byCategory
  }

  if (!prev.holdings || !prev.buckets) {
    base.items = CATEGORIES.filter((c) => Math.abs(byCategory[c]) > 0.005).map((c) => ({
      key: c, label: CATEGORY_LABEL[c], sublabel: 'Category', kind: 'category',
      delta: byCategory[c], market: 0, flow: 0
    }))
    return base
  }

  const items: ChangeItem[] = []
  const prevH = new Map(prev.holdings.map((h) => [h.id, h]))
  for (const r of p.holdings) {
    if (r.value == null) continue
    const h = r.holding
    const old = prevH.get(h.id)
    prevH.delete(h.id)
    const v1 = r.value
    if (!old) {
      items.push({ key: h.id, label: h.symbol || h.name, sublabel: h.name, kind: 'holding', delta: v1, market: 0, flow: v1, isNew: true })
      continue
    }
    const v0 = old.value * f
    const unit1 = h.quantity !== 0 ? v1 / h.quantity : 0
    const flow = (h.quantity - old.quantity) * unit1
    items.push({ key: h.id, label: h.symbol || h.name, sublabel: h.name, kind: 'holding', delta: v1 - v0, market: v1 - v0 - flow, flow })
  }
  for (const old of prevH.values()) {
    const v0 = old.value * f
    items.push({ key: old.id, label: old.symbol || old.name, sublabel: old.name, kind: 'holding', delta: -v0, market: 0, flow: -v0, removed: true })
  }

  const prevB = new Map(prev.buckets.map((b) => [b.id, b]))
  for (const r of p.buckets) {
    if (r.value == null) continue
    const b = r.bucket
    const old = prevB.get(b.id)
    prevB.delete(b.id)
    const v1 = r.value
    if (!old) {
      items.push({ key: b.id, label: b.name, sublabel: 'Cash bucket', kind: 'bucket', delta: v1, market: 0, flow: v1, isNew: true })
      continue
    }
    const v0 = old.value * f
    const unit = convert(1, b.currency, p.base, p.rates) ?? 0
    const flow = (b.amount - old.amount) * unit
    items.push({ key: b.id, label: b.name, sublabel: 'Cash bucket', kind: 'bucket', delta: v1 - v0, market: v1 - v0 - flow, flow })
  }
  for (const old of prevB.values()) {
    const v0 = old.value * f
    items.push({ key: old.id, label: old.name, sublabel: 'Cash bucket', kind: 'bucket', delta: -v0, market: 0, flow: -v0, removed: true })
  }

  base.items = items.filter((i) => Math.abs(i.delta) > 0.005).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  base.market = items.reduce((s, i) => s + i.market, 0)
  base.flow = items.reduce((s, i) => s + i.flow, 0)
  base.detailed = true
  return base
}

// ---------- goals ----------

export type GoalStatus = 'reached' | 'on-track' | 'behind' | 'open' | 'unknown'

export interface GoalProgress {
  goal: Goal
  current: number | null
  pct: number
  remaining: number | null
  monthsLeft: number | null
  perMonth: number | null
  /** Average monthly change of the tracked amount over recent months. */
  pace: number | null
  projected: string | null
  status: GoalStatus
  sourceLabel: string
}

export function goalSourceLabel(goal: Goal, data: AppData): string {
  const s = goal.source
  switch (s.kind) {
    case 'netWorth': return 'Net worth'
    case 'investments': return 'All investments'
    case 'equities': return 'Stocks & funds'
    case 'crypto': return 'Crypto'
    case 'cash': return 'All cash'
    case 'manual': return 'Updated by hand'
    case 'bucket': return data.buckets.find((b) => b.id === s.id)?.name ?? 'Deleted bucket'
    case 'holding': {
      const h = data.holdings.find((x) => x.id === s.id)
      return h ? h.symbol || h.name : 'Deleted holding'
    }
  }
}

function sourceValueNow(goal: Goal, p: Portfolio): number | null {
  const s = goal.source
  switch (s.kind) {
    case 'netWorth': return p.totals.netWorth
    case 'investments': return p.totals.investments
    case 'equities': return p.totals.equities
    case 'crypto': return p.totals.crypto
    case 'cash': return p.totals.cash
    case 'manual': return convert(s.current, goal.currency, p.base, p.rates)
    case 'bucket': return p.buckets.find((b) => b.bucket.id === s.id)?.value ?? null
    case 'holding': return p.holdings.find((h) => h.holding.id === s.id)?.value ?? null
  }
}

function sourceValueAt(goal: Goal, snap: Snapshot, p: Portfolio): number | null {
  const s = goal.source
  const t = snapshotTotals(snap, p.base, p.rates)
  const f = snapshotFactor(snap, p.base, p.rates)
  switch (s.kind) {
    case 'netWorth': return t.netWorth
    case 'investments': return t.equities + t.crypto + t.other
    case 'equities': return t.equities
    case 'crypto': return t.crypto
    case 'cash': return t.cash
    case 'manual': return null
    case 'bucket': {
      const b = snap.buckets?.find((x) => x.id === s.id)
      return b ? b.value * f : null
    }
    case 'holding': {
      const h = snap.holdings?.find((x) => x.id === s.id)
      return h ? h.value * f : null
    }
  }
}

export function goalProgress(goal: Goal, data: AppData, p: Portfolio, now = new Date()): GoalProgress {
  const thisMonth = monthKey(now)
  const nowBase = sourceValueNow(goal, p)
  const current = nowBase != null ? convert(nowBase, p.base, goal.currency, p.rates) : null
  const pct = current != null && goal.target > 0 ? Math.max(0, current / goal.target) : 0
  const remaining = current != null ? Math.max(0, goal.target - current) : null
  const monthsLeft = goal.deadline ? Math.max(0, monthDiff(thisMonth, goal.deadline)) : null
  const perMonth = remaining != null && monthsLeft != null ? remaining / Math.max(1, monthsLeft) : null

  // Pace: change of the tracked amount over up to the last 6 months of history.
  let pace: number | null = null
  if (nowBase != null) {
    const past = data.snapshots
      .filter((s) => s.month < thisMonth && monthDiff(s.month, thisMonth) <= 6)
      .map((s) => ({ month: s.month, value: sourceValueAt(goal, s, p) }))
      .filter((x): x is { month: string; value: number } => x.value != null)
    if (past.length) {
      const first = past[0]
      const span = monthDiff(first.month, thisMonth)
      const startGoalCcy = convert(first.value, p.base, goal.currency, p.rates)
      if (span > 0 && startGoalCcy != null && current != null) pace = (current - startGoalCcy) / span
    }
  }

  let projected: string | null = null
  if (remaining != null && remaining > 0 && pace != null && pace > 0) {
    projected = addMonthsSafe(thisMonth, Math.ceil(remaining / pace))
  }

  let status: GoalStatus
  if (current != null && current >= goal.target) status = 'reached'
  else if (current == null) status = 'unknown'
  else if (!goal.deadline) status = 'open'
  else if (pace == null) status = 'unknown'
  else status = pace >= (perMonth ?? 0) * 0.95 ? 'on-track' : 'behind'

  return {
    goal, current, pct, remaining, monthsLeft, perMonth, pace, projected, status,
    sourceLabel: goalSourceLabel(goal, data)
  }
}

function addMonthsSafe(month: string, n: number): string | null {
  return n > 1200 ? null : addMonths(month, n)
}
