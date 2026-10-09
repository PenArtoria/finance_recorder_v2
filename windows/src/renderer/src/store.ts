import { create } from 'zustand'
import type { AppData, DataInfo, QuoteError } from '@shared/types'
import { runAutoPay } from './core/cards'
import { computePortfolio, ratesOf, withLiveSnapshot } from './core/calc'
import { emptyData, normalizeData, uid } from './core/data'
import { formatMoney } from './core/money'
import { dateLabel } from './core/trades'

const api = window.api

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
}

interface PriceStatus {
  loading: boolean
  lastRun: number | null
  errors: QuoteError[]
  fxError: string | null
  offline: boolean
}

interface State {
  status: 'loading' | 'ready' | 'error'
  loadError: string | null
  data: AppData
  info: DataInfo | null
  prices: PriceStatus
  toasts: Toast[]
  saveError: string | null
  init(): Promise<void>
  /** Applies a change to a copy of the data, refreshes this month's snapshot and saves. */
  mutate(fn: (draft: AppData) => void): void
  replace(data: AppData): void
  reloadFromDisk(): Promise<void>
  refreshPrices(opts?: { silent?: boolean; forceFx?: boolean }): Promise<void>
  /** Pays card bills that reached their pay day, for cards set to pay automatically. */
  autoPayCards(): void
  toast(text: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
  setInfo(info: DataInfo): void
}

const FX_MAX_AGE = 6 * 60 * 60 * 1000

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaveAt = 0
let toastId = 1

function finalize(data: AppData): AppData {
  const p = computePortfolio(data)
  const snapshots = withLiveSnapshot(data, p)
  return snapshots === data.snapshots ? data : { ...data, snapshots }
}

export const useApp = create<State>((set, get) => {
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saveTimer = null
      try {
        await api.saveData(get().data)
        lastSaveAt = Date.now()
        if (get().saveError) set({ saveError: null })
      } catch (err: any) {
        set({ saveError: err?.message || 'Could not save' })
        get().toast('Could not save your data. Check that the data folder is available.', 'error')
      }
    }, 400)
  }

  return {
    status: 'loading',
    loadError: null,
    data: emptyData(),
    info: null,
    prices: { loading: false, lastRun: null, errors: [], fxError: null, offline: false },
    toasts: [],
    saveError: null,

    async init() {
      try {
        const res = await api.loadData()
        const data = res.data ? normalizeData(res.data) : emptyData()
        set({ data: finalize(data), info: res.info, status: 'ready' })
        get().autoPayCards()
        api.onExternalChange(() => {
          // Ignore the echo of our own save; reload when another device changed the file.
          if (saveTimer || Date.now() - lastSaveAt < 4000) return
          get().reloadFromDisk()
        })
      } catch (err: any) {
        set({ status: 'error', loadError: err?.message || String(err) })
      }
    },

    mutate(fn) {
      const draft = structuredClone(get().data)
      fn(draft)
      set({ data: finalize(draft) })
      scheduleSave()
    },

    replace(data) {
      set({ data: finalize(normalizeData(data)) })
      scheduleSave()
    },

    async reloadFromDisk() {
      try {
        const res = await api.loadData()
        if (res.data) {
          set({ data: finalize(normalizeData(res.data)), info: res.info })
          get().toast('Loaded changes made on another device.', 'info')
        }
      } catch {
        // keep what we have
      }
    },

    async refreshPrices(opts = {}) {
      const { data, prices } = get()
      if (prices.loading) return
      set({ prices: { ...prices, loading: true } })
      const symbols = [...new Set(data.holdings.map((h) => h.symbol).filter(Boolean))]
      const needFx = opts.forceFx || !data.fx || Date.now() - data.fx.fetchedAt > FX_MAX_AGE

      const [quotesRes, fxRes] = await Promise.allSettled([
        symbols.length ? api.fetchQuotes(symbols) : Promise.resolve({ quotes: [], errors: [] }),
        needFx ? api.fetchFx() : Promise.resolve(null)
      ])

      const errors: QuoteError[] = []
      let fxError: string | null = null
      let offline = false
      if (quotesRes.status === 'rejected') {
        offline = true
        errors.push({ symbol: '*', message: String(quotesRes.reason?.message ?? quotesRes.reason) })
      } else {
        errors.push(...quotesRes.value.errors)
        if (symbols.length && quotesRes.value.quotes.length === 0 && quotesRes.value.errors.length === symbols.length) {
          offline = quotesRes.value.errors.every((e) => /fetch failed|timed out|ENOTFOUND|network/i.test(e.message))
        }
      }
      if (fxRes.status === 'rejected') fxError = String(fxRes.reason?.message ?? fxRes.reason)

      get().mutate((d) => {
        if (quotesRes.status === 'fulfilled') {
          for (const q of quotesRes.value.quotes) {
            d.quotes[q.symbol] = q
            for (const h of d.holdings) if (h.symbol === q.symbol) h.currency = q.currency
          }
        }
        if (fxRes.status === 'fulfilled' && fxRes.value) d.fx = fxRes.value
      })

      set({ prices: { loading: false, lastRun: Date.now(), errors, fxError, offline } })
      get().autoPayCards()
      if (!opts.silent) {
        if (offline) get().toast('Prices could not be updated. Check your internet connection.', 'error')
        else if (errors.length) get().toast(`No price for ${errors.map((e) => e.symbol).join(', ')}.`, 'error')
        else get().toast('Prices updated.', 'success')
      }
    },

    autoPayCards() {
      const { data } = get()
      if (!data.cards.some((c) => c.autoPay && c.payFromId)) return
      const draft = structuredClone(data)
      const done = runAutoPay(draft, ratesOf(draft), () => uid('p'))
      if (!done.length) return
      set({ data: finalize(draft) })
      scheduleSave()
      for (const p of done) get().toast(`${p.card}: ${formatMoney(p.amount, p.currency)} paid automatically on ${dateLabel(p.date, false)}.`, 'info')
    },

    toast(text, kind = 'info') {
      const id = toastId++
      set({ toasts: [...get().toasts, { id, text, kind }] })
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500)
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) })
    },

    setInfo(info) {
      set({ info })
    }
  }
})
