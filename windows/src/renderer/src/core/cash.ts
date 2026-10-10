import type { AppData, CashBucket, Holding, MoneySource } from '@shared/types'
import { reservedFor } from './cards'
import { convert, type Rates } from './money'
import { isBalance, isValued } from './trades'

// Moving money in and out of buckets and bank accounts.
// A bucket linked to an account is a slice of that account's balance, so money that
// actually leaves the bucket (spending, buying shares, moving it elsewhere) leaves the
// account too. Assigning unassigned money to a bucket only changes the bucket.

export function bankAccounts(data: AppData): Holding[] {
  return data.holdings.filter((h) => isBalance(h.type))
}

export function linkedAccount(data: AppData, b: CashBucket): Holding | undefined {
  if (!b.accountId) return undefined
  const a = data.holdings.find((h) => h.id === b.accountId)
  return a && isBalance(a.type) ? a : undefined
}

export function sourceCurrency(data: AppData, src: MoneySource | null | undefined): string | null {
  if (!src) return null
  if (src.kind === 'bucket') return data.buckets.find((b) => b.id === src.id)?.currency ?? null
  return data.holdings.find((h) => h.id === src.id)?.currency ?? null
}

export function sourceLabel(data: AppData, src: MoneySource | null | undefined): string {
  if (!src) return 'Not from a tracked balance'
  if (src.kind === 'bucket') {
    const b = data.buckets.find((x) => x.id === src.id)
    if (!b) return 'Deleted bucket'
    const a = linkedAccount(data, b)
    return a ? `${b.name} · ${a.name}` : b.name
  }
  const a = data.holdings.find((h) => h.id === src.id)
  if (!a) return 'Deleted account'
  return isBalance(a.type) ? `${a.name} (unassigned)` : a.name
}

export function sourceExists(data: AppData, src: MoneySource | null | undefined): boolean {
  if (!src) return false
  return src.kind === 'bucket' ? data.buckets.some((b) => b.id === src.id) : data.holdings.some((h) => h.id === src.id)
}

export const sourceKey = (src: MoneySource | null | undefined) => (src ? `${src.kind}:${src.id}` : '')
export const parseSourceKey = (key: string): MoneySource | null => {
  const [kind, id] = key.split(':')
  return (kind === 'bucket' || kind === 'account') && id ? { kind, id } : null
}

/**
 * Adds `delta` (negative to take money out) to a bucket or account, in that source's currency.
 * Money taken from a linked bucket also comes out of its account.
 */
export function moveMoney(draft: AppData, src: MoneySource, delta: number, rates: Rates) {
  const fix = (n: number) => +n.toFixed(8)
  if (src.kind === 'account') {
    const a = draft.holdings.find((h) => h.id === src.id)
    if (!a) return
    // Assets valued as a whole (a pension pot) grow in value; bank accounts in balance.
    if (isValued(a.type)) a.manualPrice = fix((a.manualPrice ?? 0) + delta)
    else a.quantity = fix(a.quantity + delta)
    return
  }
  const b = draft.buckets.find((x) => x.id === src.id)
  if (!b) return
  b.amount = fix(b.amount + delta)
  const a = linkedAccount(draft, b)
  if (a) a.quantity = fix(a.quantity + (convert(delta, b.currency, a.currency, rates) ?? delta))
}

/** Money in an account not in a bucket and not set aside for a card bill, in its currency. */
export function unassignedIn(data: AppData, accountId: string, rates: Rates): number {
  const a = data.holdings.find((h) => h.id === accountId)
  if (!a) return 0
  return a.quantity - assignedTo(data, accountId, rates) - reservedFor(data, accountId, rates)
}

/** How much of each account is assigned to buckets, in the account's currency. */
export function assignedTo(data: AppData, accountId: string, rates: Rates): number {
  const a = data.holdings.find((h) => h.id === accountId)
  if (!a) return 0
  return data.buckets
    .filter((b) => b.accountId === accountId)
    .reduce((s, b) => s + (convert(b.amount, b.currency, a.currency, rates) ?? 0), 0)
}
