import type { AppData, Settings } from '@shared/types'

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: 'USD',
  refreshMinutes: 15,
  theme: 'system',
  hideAmounts: false,
  name: ''
}

export function emptyData(): AppData {
  return {
    version: 1,
    onboarded: false,
    example: false,
    settings: { ...DEFAULT_SETTINGS },
    holdings: [],
    buckets: [],
    goals: [],
    snapshots: [],
    quotes: {},
    fx: null
  }
}

/** Fills in anything missing from a file written by an older version (or edited by hand). */
export function normalizeData(raw: unknown): AppData {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppData>
  const base = emptyData()
  return {
    version: 1,
    onboarded: d.onboarded ?? (Array.isArray(d.holdings) && d.holdings.length > 0),
    example: d.example ?? false,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    holdings: Array.isArray(d.holdings) ? d.holdings : [],
    buckets: Array.isArray(d.buckets) ? d.buckets : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    snapshots: Array.isArray(d.snapshots)
      ? [...d.snapshots].sort((a, b) => a.month.localeCompare(b.month))
      : [],
    quotes: d.quotes && typeof d.quotes === 'object' ? d.quotes : {},
    fx: d.fx ?? null
  }
}

export function uid(prefix = ''): string {
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return prefix + Date.now().toString(36) + rand[0].toString(36) + rand[1].toString(36).slice(0, 4)
}
