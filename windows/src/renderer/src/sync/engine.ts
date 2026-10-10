import type { AppData } from '@shared/types'
import { normalizeData } from '../core/data'
import { deriveKeys, newPairCode, newSyncKey, open, pairKeys, seal, type SyncKeys } from './crypto'
import { adoptRemote, canonical, mergeData } from './merge'

// Talks to the Moneta cloud service and keeps this device's data in step with the copy
// there. The copy is encrypted here before upload; the service can't read it.

/** Where the Windows app syncs. The phone app is served by the same service and uses relative URLs. */
export const DEFAULT_SERVER = 'https://moneta.moneta-cloud.workers.dev'

const KEY = 'sync.key'
const META = 'sync.meta'

interface Meta {
  /** Server version this device last synced with. */
  version: number
  /** The synced data at that version (canonical form), for three-way merges. */
  base: string | null
  /** The same data, parsed, kept as JSON. */
  baseData: string | null
  lastSync: number | null
}

export interface SyncHost {
  server: string
  kvGet(key: string): Promise<string | null>
  kvSet(key: string, value: string | null): Promise<void>
  getData(): AppData
  /** Replaces the app's data with synced data (saved locally, not marked as a new edit). */
  applyData(data: AppData): void
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

async function call(server: string, path: string, init: RequestInit = {}): Promise<any> {
  let res: Response
  try {
    res = await fetch(server + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  } catch {
    throw new HttpError(0, 'You’re offline. Moneta will sync when you’re back online.')
  }
  const body = await res.json().catch(() => ({}))
  if (res.status === 409) return { conflict: true, ...body }
  if (res.status === 404) return null
  if (!res.ok) throw new HttpError(res.status, body?.message || body?.error || `Sync failed (${res.status})`)
  return body
}

export function isOffline(err: unknown): boolean {
  return err instanceof HttpError && err.status === 0
}

export class SyncEngine {
  private keys: SyncKeys | null = null
  private running: Promise<void> | null = null
  private again = false

  constructor(private host: SyncHost) {}

  async key(): Promise<string | null> {
    return this.host.kvGet(KEY)
  }

  private async meta(): Promise<Meta> {
    try {
      const raw = await this.host.kvGet(META)
      if (raw) return { version: 0, base: null, baseData: null, lastSync: null, ...JSON.parse(raw) }
    } catch {
      // start over
    }
    return { version: 0, base: null, baseData: null, lastSync: null }
  }

  private async keysFor(syncKey: string): Promise<SyncKeys> {
    if (!this.keys) this.keys = await deriveKeys(syncKey)
    return this.keys
  }

  /** Turns sync on with a brand-new key and uploads this device's data. */
  async enable(): Promise<void> {
    await this.host.kvSet(KEY, newSyncKey())
    await this.host.kvSet(META, null)
    this.keys = null
    await this.sync()
  }

  /** Links this device to an existing sync key and replaces its data with the synced copy. */
  async link(syncKey: string): Promise<void> {
    await deriveKeys(syncKey)
    await this.host.kvSet(KEY, syncKey.trim())
    await this.host.kvSet(META, null)
    this.keys = null
    await this.sync({ adopt: true })
  }

  async linkWithCode(code: string): Promise<void> {
    const p = await pairKeys(code)
    const res = await call(this.host.server, `/api/pair/${p.id}`)
    if (!res?.blob) throw new Error('That code didn’t work. It may have expired: make a new one on your computer.')
    const syncKey = await open(p.key, res.blob)
    await this.link(syncKey)
  }

  /** Makes a one-time code (valid 10 minutes) that links another device. */
  async createPairCode(): Promise<{ code: string; expires: number }> {
    const syncKey = await this.key()
    if (!syncKey) throw new Error('Turn on sync first.')
    const code = newPairCode()
    const p = await pairKeys(code)
    const res = await call(this.host.server, `/api/pair/${p.id}`, { method: 'PUT', body: JSON.stringify({ blob: await seal(p.key, syncKey) }) })
    return { code, expires: res?.expires ?? Date.now() + 10 * 60 * 1000 }
  }

  /** Stops syncing on this device; optionally deletes the copy on the server too. */
  async disable(deleteRemote: boolean): Promise<void> {
    const syncKey = await this.key()
    if (syncKey && deleteRemote) {
      const k = await this.keysFor(syncKey)
      await call(this.host.server, `/api/sync/${k.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${k.auth}` } })
    }
    await this.host.kvSet(KEY, null)
    await this.host.kvSet(META, null)
    this.keys = null
  }

  async lastSync(): Promise<number | null> {
    return (await this.meta()).lastSync
  }

  /** Pulls, merges and pushes. Calls made while one is running queue one more pass. */
  sync(opts: { adopt?: boolean } = {}): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.run(opts).finally(() => {
      this.running = null
      if (this.again) {
        this.again = false
        void this.sync()
      }
    })
    return this.running
  }

  private async run(opts: { adopt?: boolean }): Promise<void> {
    const syncKey = await this.key()
    if (!syncKey) return
    const k = await this.keysFor(syncKey)
    const meta = await this.meta()
    const auth = { Authorization: `Bearer ${k.auth}` }

    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await call(this.host.server, `/api/sync/${k.id}`, { headers: auth })
      if (remote && remote.version !== meta.version) {
        const remoteData = normalizeData(JSON.parse(await open(k.key, remote.blob)))
        const local = this.host.getData()
        let next: AppData
        if (opts.adopt || !meta.baseData) next = adoptRemote(local, remoteData)
        else if (canonical(local) === meta.base) next = adoptRemote(local, remoteData)
        else next = mergeData(normalizeData(JSON.parse(meta.baseData)), local, remoteData)
        this.host.applyData(next)
        meta.version = remote.version
        meta.base = canonical(remoteData)
        meta.baseData = JSON.stringify(remoteData)
      }
      if (!remote) {
        if (opts.adopt) throw new Error('No synced data was found for this key.')
        meta.version = 0
        meta.base = null
      }

      const current = this.host.getData()
      if (remote && meta.base === canonical(current)) break
      const res = await call(this.host.server, `/api/sync/${k.id}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ version: meta.version, blob: await seal(k.key, JSON.stringify(current)) })
      })
      if (res?.conflict) continue
      meta.version = res.version
      meta.base = canonical(current)
      meta.baseData = JSON.stringify(current)
      break
    }
    meta.lastSync = Date.now()
    await this.host.kvSet(META, JSON.stringify(meta))
  }

  /** The sync key, for keeping somewhere safe. */
  async exportKey(): Promise<string | null> {
    return this.key()
  }
}
