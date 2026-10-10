import type { AppData, Settings } from '@shared/types'
import { syncHolding } from '../core/trades'

// Three-way merge of synced data. `base` is the last version both sides agreed on,
// `local` has this device's edits and `remote` has the other device's. Edits on either
// side survive: lists merge item by item (by id), a field changed on one side wins, and
// balances changed on both sides add up both changes (e.g. two spendings from one bucket).

/** Preferences that stay per device and are never synced. */
export const DEVICE_SETTINGS: (keyof Settings)[] = ['theme', 'hideAmounts', 'refreshMinutes']

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b)

/** The synced part of the data, as a comparable string. Prices and device preferences are left out. */
export function canonical(d: AppData): string {
  const settings = { ...d.settings } as Partial<Settings>
  for (const k of DEVICE_SETTINGS) delete settings[k]
  return stableStringify({ ...d, quotes: undefined, fx: undefined, settings })
}

type Item = Record<string, any>

function mergeFields(b: Item | undefined, l: Item, r: Item, opts: ItemOpts): Item {
  if (!b) return l
  if (same(l, b)) return r
  if (same(r, b)) return l
  const out: Item = { ...r }
  for (const k of new Set([...Object.keys(l), ...Object.keys(b)])) {
    if (opts.lists?.[k]) out[k] = mergeList(b[k] ?? [], l[k] ?? [], r[k] ?? [], opts.lists[k])
    else if (opts.sums?.includes(k) && typeof b[k] === 'number' && typeof l[k] === 'number' && typeof r[k] === 'number') {
      out[k] = +(r[k] + (l[k] - b[k])).toFixed(8)
    } else if (!same(l[k], b[k])) out[k] = l[k]
  }
  return out
}

interface ItemOpts {
  key?: string
  /** Number fields where both sides' changes add up. */
  sums?: string[]
  /** Nested lists merged by id. */
  lists?: Record<string, ItemOpts>
}

export function mergeList<T extends Item>(base: T[], local: T[], remote: T[], opts: ItemOpts = {}): T[] {
  const key = opts.key ?? 'id'
  const B = new Map(base.map((x) => [x[key], x]))
  const L = new Map(local.map((x) => [x[key], x]))
  const R = new Map(remote.map((x) => [x[key], x]))
  const out: T[] = []
  for (const r of remote) {
    const id = r[key]
    const b = B.get(id)
    const l = L.get(id)
    if (!l) {
      // Deleted here: drop it unless the other side changed it since.
      if (b && same(b, r)) continue
      out.push(r)
      continue
    }
    out.push(mergeFields(b, l, r, opts) as T)
  }
  for (const l of local) {
    const id = l[key]
    if (R.has(id)) continue
    const b = B.get(id)
    // Deleted on the other side: drop it unless it was changed here since.
    if (b && same(b, l)) continue
    out.push(l)
  }
  return out
}

const HOLDING: ItemOpts = { sums: ['quantity'], lists: { trades: {} } }
const BUCKET: ItemOpts = { sums: ['amount'] }
const CARD: ItemOpts = { lists: { payments: {} } }

export function mergeData(base: AppData, local: AppData, remote: AppData): AppData {
  const settings = { ...(mergeFields(base.settings, local.settings, remote.settings, {}) as Settings) }
  for (const k of DEVICE_SETTINGS) (settings as any)[k] = local.settings[k]
  const holdings = mergeList(base.holdings, local.holdings, remote.holdings, HOLDING).map((h) => syncHolding({ ...h }))
  return {
    ...remote,
    onboarded: local.onboarded || remote.onboarded,
    example: same(local.example, base.example) ? remote.example : local.example,
    settings,
    holdings,
    buckets: mergeList(base.buckets, local.buckets, remote.buckets, BUCKET),
    goals: mergeList(base.goals, local.goals, remote.goals),
    snapshots: mergeList(base.snapshots, local.snapshots, remote.snapshots, { key: 'month' }).sort((a, b) => a.month.localeCompare(b.month)),
    expenses: mergeList(base.expenses, local.expenses, remote.expenses),
    cards: mergeList(base.cards, local.cards, remote.cards, CARD),
    quotes: newestQuotes(local, remote),
    fx: newestFx(local, remote)
  }
}

/** Takes the other device's data, keeping this device's preferences and freshest prices. */
export function adoptRemote(local: AppData, remote: AppData): AppData {
  const settings = { ...remote.settings }
  for (const k of DEVICE_SETTINGS) (settings as any)[k] = local.settings[k]
  return { ...remote, settings, quotes: newestQuotes(local, remote), fx: newestFx(local, remote) }
}

function newestQuotes(a: AppData, b: AppData): AppData['quotes'] {
  const out = { ...b.quotes }
  for (const [sym, q] of Object.entries(a.quotes)) if (!out[sym] || q.fetchedAt > out[sym].fetchedAt) out[sym] = q
  return out
}

function newestFx(a: AppData, b: AppData): AppData['fx'] {
  if (!a.fx) return b.fx
  if (!b.fx) return a.fx
  return a.fx.fetchedAt >= b.fx.fetchedAt ? a.fx : b.fx
}
