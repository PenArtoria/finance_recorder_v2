import type { AppData, Holding, Settings, Snapshot, Trade } from '@shared/types'
import { isoFromMs, isUnits, syncHolding } from './trades'

export const DATA_VERSION = 2

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: 'USD',
  refreshMinutes: 15,
  theme: 'system',
  hideAmounts: false,
  name: ''
}

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    onboarded: false,
    example: false,
    settings: { ...DEFAULT_SETTINGS },
    holdings: [],
    buckets: [],
    goals: [],
    snapshots: [],
    expenses: [],
    quotes: {},
    fx: null
  }
}

/** Fills in anything missing from a file written by an older version (or edited by hand). */
export function normalizeData(raw: unknown): AppData {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppData>
  const base = emptyData()
  const data: AppData = {
    version: DATA_VERSION,
    onboarded: d.onboarded ?? (Array.isArray(d.holdings) && d.holdings.length > 0),
    example: d.example ?? false,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    holdings: Array.isArray(d.holdings) ? d.holdings : [],
    buckets: Array.isArray(d.buckets) ? d.buckets : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    snapshots: Array.isArray(d.snapshots)
      ? [...d.snapshots].sort((a, b) => a.month.localeCompare(b.month))
      : [],
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
    quotes: d.quotes && typeof d.quotes === 'object' ? d.quotes : {},
    fx: d.fx ?? null
  }
  for (const h of data.holdings) {
    if (isUnits(h.type) && !h.trades) h.trades = [startingTrade(h)]
    syncHolding(h)
  }
  mergeDuplicateHoldings(data)
  return data
}

/** Turns a holding from before trades existed into a single opening buy. */
function startingTrade(h: Holding): Trade {
  return {
    id: uid('t'),
    date: isoFromMs(h.createdAt || Date.now()),
    side: 'buy',
    quantity: h.quantity,
    amount: h.cost != null && h.cost > 0 ? h.cost : null,
    note: 'Starting position',
    createdAt: h.createdAt || Date.now()
  }
}

/**
 * One ticker, one holding. Earlier versions created a second row when the same
 * ticker was added again; fold those into the first, keeping every buy.
 */
export function mergeDuplicateHoldings(data: AppData) {
  const keepBySymbol = new Map<string, Holding>()
  const replaced = new Map<string, string>()
  const kept: Holding[] = []
  for (const h of data.holdings) {
    const key = h.symbol && isUnits(h.type) ? h.symbol.toUpperCase() : ''
    const keep = key ? keepBySymbol.get(key) : undefined
    if (!keep) {
      if (key) keepBySymbol.set(key, h)
      kept.push(h)
      continue
    }
    keep.trades = [...(keep.trades ?? []), ...(h.trades ?? [])]
    if (!keep.account && h.account) keep.account = h.account
    if (h.note && h.note !== keep.note) keep.note = keep.note ? `${keep.note} · ${h.note}` : h.note
    syncHolding(keep)
    replaced.set(h.id, keep.id)
  }
  if (!replaced.size) return
  data.holdings = kept
  for (const g of data.goals) {
    if (g.source.kind === 'holding' && replaced.has(g.source.id)) g.source = { kind: 'holding', id: replaced.get(g.source.id)! }
  }
  data.snapshots = data.snapshots.map((s) => mergeSnapshotHoldings(s, replaced))
}

function mergeSnapshotHoldings(s: Snapshot, replaced: Map<string, string>): Snapshot {
  if (!s.holdings) return s
  const out: NonNullable<Snapshot['holdings']> = []
  for (const h of s.holdings) {
    const id = replaced.get(h.id) ?? h.id
    const into = out.find((x) => x.id === id)
    if (into) {
      into.quantity += h.quantity
      into.value += h.value
    } else out.push({ ...h, id })
  }
  return { ...s, holdings: out }
}

export function uid(prefix = ''): string {
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return prefix + Date.now().toString(36) + rand[0].toString(36) + rand[1].toString(36).slice(0, 4)
}
