import type { AssetType, Holding, Trade } from '@shared/types'

// Buys and sells for unit-priced holdings (stocks, ETFs, funds, crypto, bonds).
// The holding's quantity and cost basis are always replayed from its trades,
// using the average-cost method: a sale removes cost in proportion to the units sold.

/** Bank accounts and deposits: a balance, no units or price. */
export const BALANCE_TYPES: ReadonlySet<AssetType> = new Set(['cash', 'deposit'])
/** Assets valued as a whole (a flat, a pension pot). */
export const VALUE_TYPES: ReadonlySet<AssetType> = new Set(['property', 'pension', 'other'])

export const isBalance = (t: AssetType) => BALANCE_TYPES.has(t)
export const isValued = (t: AssetType) => VALUE_TYPES.has(t)
export const isUnits = (t: AssetType) => !BALANCE_TYPES.has(t) && !VALUE_TYPES.has(t)

export interface Position {
  quantity: number
  /** Cost of the units with a known price; null when no buy has a known amount. */
  cost: number | null
  /** Units covered by `cost`. */
  costQuantity: number
}

const round = (n: number) => +n.toPrecision(12)

export function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

export function replay(trades: Trade[]): Position {
  let quantity = 0
  let cost = 0
  let costQuantity = 0
  let anyCost = false
  for (const t of sortTrades(trades)) {
    if (t.side === 'buy') {
      quantity += t.quantity
      if (t.amount != null) {
        cost += t.amount
        costQuantity += t.quantity
        anyCost = true
      }
    } else if (quantity > 0) {
      const sold = Math.min(t.quantity, quantity)
      const share = sold / quantity
      cost -= cost * share
      costQuantity -= costQuantity * share
      quantity -= sold
    }
  }
  return {
    quantity: round(quantity),
    cost: anyCost ? round(cost) : null,
    costQuantity: round(costQuantity)
  }
}

/** Writes the replayed position onto the holding. */
export function syncHolding(h: Holding): Holding {
  if (!h.trades || !isUnits(h.type)) return h
  const p = replay(h.trades)
  h.quantity = p.quantity
  h.cost = p.cost
  h.costQuantity = p.costQuantity
  return h
}

/** Average price paid per unit, or null when unknown. */
export function averageCost(h: Holding): number | null {
  const q = h.costQuantity ?? (h.cost != null ? h.quantity : 0)
  return h.cost != null && q > 0 ? h.cost / q : null
}

export function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isoFromMs(ms: number): string {
  return todayIso(new Date(ms))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function dateLabel(iso: string, withYear = true): string {
  const [y, m, d] = iso.split('-').map(Number)
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`
}
