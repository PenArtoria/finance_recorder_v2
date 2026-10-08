import type { AppData, Expense } from '@shared/types'
import { moveMoney } from './cash'
import { convert, type Rates } from './money'

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

/** Takes the expense out of its source (sign 1) or puts it back (sign −1). */
export function applyExpense(draft: AppData, e: Expense, sign: 1 | -1, rates: Rates) {
  if (!e.source) return
  const src = e.source
  const srcCcy =
    src.kind === 'bucket'
      ? draft.buckets.find((b) => b.id === src.id)?.currency
      : draft.holdings.find((h) => h.id === src.id)?.currency
  if (!srcCcy) return
  const amount = convert(e.amount, e.currency, srcCcy, rates) ?? e.amount
  moveMoney(draft, src, -sign * amount, rates)
}

export function expensesIn(data: AppData, month: string): Expense[] {
  return data.expenses.filter((e) => e.date.startsWith(month))
}

export function inBase(e: Expense, base: string, rates: Rates): number {
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

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
