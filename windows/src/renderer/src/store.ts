import { create } from 'zustand'
import type { AppData, DataInfo, QuoteError } from '@shared/types'
import { runAutoPay } from './core/cards'
import { computePortfolio, ratesOf, withLiveSnapshot } from './core/calc'
import { emptyData, normalizeData, uid } from './core/data'
import { formatMoney } from './core/money'
import { dateLabel } from './core/trades'
import { DEFAULT_SERVER, isOffline, SyncEngine } from './sync/engine'

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

export interface SyncStatus {
  enabled: boolean
  state: 'off' | 'idle' | 'syncing' | 'offline' | 'error'
  lastSync: number | null
  error: string | null
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
  sync: SyncStatus
  /** Syncs now (pull, merge, push). Quiet unless something goes wrong. */
  syncNow(): Promise<void>
  enableSync(): Promise<void>
  /** Links this device with a pairing code or a full sync key. */
  linkSync(codeOrKey: string): Promise<void>
  disableSync(deleteRemote: boolean): Promise<void>
  createPairCode(): Promise<{ code: string; expires: number }>
  exportSyncKey(): Promise<string | null>
}

const FX_MAX_AGE = 6 * 60 * 60 * 1000

let saveTimer: ReturnType<typeof setTimeout> | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let lastSaveAt = 0
let lastSyncAttempt = 0
let toastId = 1

function finalize(data: AppData): AppData {
  const p = computePortfolio(data)
  const snapshots = withLiveSnapshot(data, p)
  return snapshots === data.snapshots ? data : { ...data, snapshots }
}

export const useApp = create<State>((set, get) => {
  const engine = new SyncEngine({
    server: api.platform === 'web' ? '' : DEFAULT_SERVER,
    kvGet: (k) => api.kvGet(k),
    kvSet: (k, v) => api.kvSet(k, v),
    getData: () => get().data,
    applyData: (d) => {
      set({ data: finalize(normalizeData(d)) })
      saveNow()
    }
  })

  const scheduleSync = (ms = 2500) => {
    if (!get().sync.enabled) return
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      syncTimer = null
      void get().syncNow()
    }, ms)
  }

  const saveNow = async () => {
    try {
      await api.saveData(get().data)
      lastSaveAt = Date.now()
      if (get().saveError) set({ saveError: null })
    } catch (err: any) {
      set({ saveError: err?.message || 'Could not save' })
      get().toast('Could not save your data.', 'error')
    }
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saveTimer = null
      await saveNow()
      scheduleSync()
    }, 400)
  }

  // Sync when the app comes back into view, and every minute while it's open.
  const onWake = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSyncAttempt > 15000) void get().syncNow()
  }

  return {
    status: 'loading',
    loadError: null,
    data: emptyData(),
    info: null,
    prices: { loading: false, lastRun: null, errors: [], fxError: null, offline: false },
    toasts: [],
    saveError: null,
    sync: { enabled: false, state: 'off', lastSync: null, error: null },

    async init() {
      try {
        const res = await api.loadData()
        const data = res.data ? normalizeData(res.data) : emptyData()
        set({ data: finalize(data), info: res.info, status: 'ready' })
        get().autoPayCards()
        if (await engine.key()) {
          set({ sync: { enabled: true, state: 'idle', lastSync: await engine.lastSync(), error: null } })
          void get().syncNow()
        }
        window.addEventListener('focus', onWake)
        document.addEventListener('visibilitychange', onWake)
        setInterval(() => document.visibilityState === 'visible' && get().sync.enabled && get().syncNow(), 60000)
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

    async syncNow() {
      if (!get().sync.enabled) return
      lastSyncAttempt = Date.now()
      set({ sync: { ...get().sync, state: 'syncing' } })
      try {
        await engine.sync()
        set({ sync: { enabled: true, state: 'idle', lastSync: Date.now(), error: null } })
      } catch (err: any) {
        set({ sync: { ...get().sync, state: isOffline(err) ? 'offline' : 'error', error: err?.message || String(err) } })
      }
    },

    async enableSync() {
      set({ sync: { enabled: true, state: 'syncing', lastSync: null, error: null } })
      try {
        await engine.enable()
        set({ sync: { enabled: true, state: 'idle', lastSync: Date.now(), error: null } })
      } catch (err: any) {
        await engine.disable(false).catch(() => {})
        set({ sync: { enabled: false, state: 'off', lastSync: null, error: err?.message || String(err) } })
        throw err
      }
    },

    async linkSync(codeOrKey) {
      const text = codeOrKey.trim()
      set({ sync: { enabled: true, state: 'syncing', lastSync: null, error: null } })
      try {
        if (text.replace(/[\s-]/g, '').length <= 10) await engine.linkWithCode(text)
        else await engine.link(text)
        set({ sync: { enabled: true, state: 'idle', lastSync: Date.now(), error: null } })
        if (!get().data.onboarded) get().mutate((d) => void (d.onboarded = true))
      } catch (err: any) {
        await engine.disable(false).catch(() => {})
        set({ sync: { enabled: false, state: 'off', lastSync: null, error: null } })
        throw err
      }
    },

    async disableSync(deleteRemote) {
      await engine.disable(deleteRemote)
      set({ sync: { enabled: false, state: 'off', lastSync: null, error: null } })
    },

    createPairCode() {
      return engine.createPairCode()
    },

    exportSyncKey() {
      return engine.exportKey()
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
