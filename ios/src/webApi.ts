// The phone app's platform layer: the same API the Windows app gets from Electron,
// implemented with browser features. Data lives in IndexedDB on the phone; prices
// come through the Moneta cloud service (Yahoo can't be called from a browser).

import type { MonetaApi } from '../../windows/src/preload/index.d'
import type { AppData, DataInfo, FileFilter, QuoteResult, SymbolMatch } from '../../windows/src/shared/types'
import { fetchFx } from '../../windows/src/main/quotes'

declare const __APP_VERSION__: string

const DB_NAME = 'moneta'
const STORE = 'kv'
let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    t.oncomplete = () => resolve(req.result as T)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

const idbGet = <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key))
const idbPut = (key: string, value: unknown) => tx<void>('readwrite', (s) => s.put(value, key))
const idbDel = (key: string) => tx<void>('readwrite', (s) => s.delete(key))

const INFO: DataInfo = { file: 'Stored on this device', dir: '', isDefault: true }

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

function pickFile(filters: FileFilter[]): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',')
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { name: file.name, content: await file.text() } : null)
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

async function saveFile(name: string, content: string): Promise<string | null> {
  const file = new File([content], name, { type: name.endsWith('.json') ? 'application/json' : 'text/csv' })
  // On iPhone the share sheet offers Save to Files, AirDrop and so on.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return name
    } catch {
      return null
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return name
}

const api: MonetaApi = {
  platform: 'web',
  kvGet: async (key) => (await idbGet<string>(`kv:${key}`)) ?? null,
  kvSet: async (key, value) => (value == null ? idbDel(`kv:${key}`) : idbPut(`kv:${key}`, value)),
  loadData: async () => ({ data: (await idbGet<AppData>('data')) ?? null, info: INFO }),
  saveData: async (data) => {
    await idbPut('data', data)
    return { savedAt: Date.now() }
  },
  dataInfo: async () => INFO,
  openDataFolder: async () => '',
  chooseDataFolder: async () => null,
  resetDataFolder: async () => INFO,
  fetchQuotes: (symbols) => getJson<QuoteResult>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`),
  searchSymbols: (query) => getJson<SymbolMatch[]>(`/api/search?q=${encodeURIComponent(query)}`),
  fetchFx: () => fetchFx(),
  exportFile: ({ defaultName, content }) => saveFile(defaultName, content),
  importFile: (filters) => pickFile(filters),
  setTheme: (dark) => {
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#262624' : '#faf9f5')
  },
  appInfo: async () => ({ version: __APP_VERSION__, platform: 'web' }),
  onExternalChange: () => () => {}
}

window.api = api
