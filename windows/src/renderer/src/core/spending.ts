import type { AppData, Expense } from '@shared/types'
import { moveMoney } from './cash'
import { convert, type Rates } from './money'
import { daysInMonth } from './trades'

export { daysInMonth }

export interface SpendCategory {
  key: string
  label: string
}

export const SPEND_CATEGORIES: SpendCategory[] = [
  { key: 'food', label: 'Food & drink' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'transport', label: 'Transport' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'bills', label: 'Bills' },
  { key: 'housing', label: 'Rent & home' },
  { key: 'health', label: 'Health' },
  { key: 'fun', label: 'Fun' },
  { key: 'travel', label: 'Travel' },
  { key: 'education', label: 'Learning' },
  { key: 'gifts', label: 'Gifts' },
  { key: 'other', label: 'Other' }
]

export const categoryLabel = (key: string) => SPEND_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other'

/**
 * Takes the expense out of its source (sign 1) or puts it back (sign −1).
 * A card charge only lowers the bucket's budget: the bank pays later, on the card's pay day.
 */
export function applyExpense(draft: AppData, e: Expense, sign: 1 | -1, rates: Rates) {
  if (!e.source) return
  const src = e.source
  if (e.cardId) {
    if (src.kind !== 'bucket') return
    const b = draft.buckets.find((x) => x.id === src.id)
    if (b) b.amount = +(b.amount - sign * (convert(e.amount, e.currency, b.currency, rates) ?? e.amount)).toFixed(8)
    return
  }
  const srcCcy =
    src.kind === 'bucket'
      ? draft.buckets.find((b) => b.id === src.id)?.currency
      : draft.holdings.find((h) => h.id === src.id)?.currency
  if (!srcCcy) return
  const amount = convert(e.amount, e.currency, srcCcy, rates) ?? e.amount
  moveMoney(draft, src, -sign * amount, rates)
}

/**
 * Currencies you spend in most, most-used first: recent spending counts most,
 * then your buckets, cards and main currency.
 */
export function frequentCurrencies(data: AppData, limit = 6): string[] {
  const score = new Map<string, number>()
  const add = (c: string | undefined, n: number) => c && score.set(c, (score.get(c) ?? 0) + n)
  const cutoff = Date.now() - 120 * 86400000
  for (const e of data.expenses) add(e.currency, e.createdAt >= cutoff ? 3 : 1)
  for (const b of data.buckets) add(b.currency, 2)
  for (const c of data.cards) add(c.currency, 2)
  add(data.settings.baseCurrency, 1)
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c]) => c)
}

export function expensesIn(data: AppData, month: string): Expense[] {
  return data.expenses.filter((e) => e.date.startsWith(month))
}

/** The expense in the main currency, at the exchange rate of the day it was entered. */
export function inBase(e: Expense, base: string, rates: Rates): number {
  if (e.usd != null) return base === 'USD' ? e.usd : convert(e.usd, 'USD', base, rates) ?? 0
  return convert(e.amount, e.currency, base, rates) ?? 0
}

export function dailyTotals(expenses: Expense[], base: string, rates: Rates): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of expenses) out.set(e.date, (out.get(e.date) ?? 0) + inBase(e, base, rates))
  return out
}

export function byCategory(expenses: Expense[], base: string, rates: Rates): { key: string; label: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>()
  for (const e of expenses) {
    const cur = map.get(e.category) ?? { total: 0, count: 0 }
    cur.total += inBase(e, base, rates)
    cur.count++
    map.set(e.category, cur)
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: categoryLabel(key), ...v }))
    .sort((a, b) => b.total - a.total)
}

