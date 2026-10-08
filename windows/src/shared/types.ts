// Data model shared by the main process (storage, network) and the UI.
// Kept free of Electron and DOM imports so a future iOS build can reuse it.

export type AssetType = 'stock' | 'etf' | 'fund' | 'crypto' | 'bond' | 'other'
export type Category = 'equities' | 'crypto' | 'cash' | 'other'

export interface Quote {
  symbol: string
  /** Latest price in `currency` major units (pence are converted to pounds). */
  price: number
  previousClose: number | null
  currency: string
  name?: string
  exchange?: string
  instrumentType?: string
  /** Exchange timestamp of `price`, epoch ms. */
  marketTime?: number
  fetchedAt: number
}

export interface QuoteError {
  symbol: string
  message: string
}

export interface QuoteResult {
  quotes: Quote[]
  errors: QuoteError[]
}

export interface SymbolMatch {
  symbol: string
  name: string
  type: AssetType
  exchange: string
  quoteType: string
}

/** Exchange rates as "units of currency per 1 USD". */
export interface FxTable {
  rates: Record<string, number>
  fetchedAt: number
  /** When the provider last updated the rates, epoch ms. */
  updatedAt?: number
  source: string
}

export interface Holding {
  id: string
  /** Yahoo Finance symbol, e.g. VWRA.L, RKLB, BTC-USD. Empty for manual assets. */
  symbol: string
  name: string
  type: AssetType
  quantity: number
  /** Currency the asset is priced in. */
  currency: string
  /** Total amount paid, in `currency`. Optional. */
  cost?: number | null
  /** Price for assets without a symbol, in `currency`. */
  manualPrice?: number | null
  account?: string
  note?: string
  createdAt: number
}

export interface CashBucket {
  id: string
  name: string
  amount: number
  currency: string
  target?: number | null
  color: number
  note?: string
  createdAt: number
}

export type GoalSource =
  | { kind: 'netWorth' }
  | { kind: 'investments' }
  | { kind: 'equities' }
  | { kind: 'crypto' }
  | { kind: 'cash' }
  | { kind: 'bucket'; id: string }
  | { kind: 'holding'; id: string }
  | { kind: 'manual'; current: number }

export interface Goal {
  id: string
  name: string
  target: number
  currency: string
  /** Target month, YYYY-MM. */
  deadline?: string | null
  source: GoalSource
  note?: string
  createdAt: number
}

export interface SnapshotHolding {
  id: string
  symbol: string
  name: string
  type: AssetType
  quantity: number
  price: number
  currency: string
  /** Value in the snapshot's base currency. */
  value: number
}

export interface SnapshotBucket {
  id: string
  name: string
  amount: number
  currency: string
  value: number
}

export interface SnapshotTotals {
  equities: number
  crypto: number
  cash: number
  other: number
  netWorth: number
}

export interface Snapshot {
  /** YYYY-MM */
  month: string
  updatedAt: number
  /** Currency the totals and values are stored in. */
  base: string
  totals: SnapshotTotals
  holdings?: SnapshotHolding[]
  buckets?: SnapshotBucket[]
  /** USD-based rates at the time of the snapshot, used to show it in another currency. */
  fx?: Record<string, number>
  source: 'auto' | 'manual' | 'import'
  note?: string
}

export interface Settings {
  baseCurrency: string
  /** Minutes between automatic price refreshes. 0 turns it off. */
  refreshMinutes: number
  theme: 'system' | 'light' | 'dark'
  hideAmounts: boolean
  name: string
}

export interface AppData {
  version: 1
  onboarded: boolean
  /** True while the example portfolio is loaded. */
  example: boolean
  settings: Settings
  holdings: Holding[]
  buckets: CashBucket[]
  goals: Goal[]
  snapshots: Snapshot[]
  quotes: Record<string, Quote>
  fx: FxTable | null
}

export interface DataInfo {
  file: string
  dir: string
  isDefault: boolean
}

export interface LoadResult {
  data: AppData | null
  info: DataInfo
}

export interface FileFilter {
  name: string
  extensions: string[]
}
