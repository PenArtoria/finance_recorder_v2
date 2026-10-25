// Reads and writes your Moneta data through the sync service, the same way the
// Windows and phone apps do: download, decrypt, change, encrypt, upload. The upload
// carries the version it was based on, so if another device saved in between, the
// bot loads the new copy and makes its change again.

import type { AppData } from '@shared/types'
import { DATA_VERSION, normalizeData } from '../../windows/src/renderer/src/core/data'
import { deriveKeys, open, seal, type SyncKeys } from '../../windows/src/renderer/src/sync/crypto'
import { BotError, type Env } from './env'

let keyCache: { syncKey: string; keys: SyncKeys } | null = null

export async function keysOf(env: Env): Promise<SyncKeys> {
  const syncKey = (env.MONETA_SYNC_KEY ?? '').trim()
  if (!syncKey) throw new BotError('noSyncKey')
  if (keyCache?.syncKey === syncKey) return keyCache.keys
  let keys: SyncKeys
  try {
    keys = await deriveKeys(syncKey)
  } catch {
    throw new BotError('badSyncKey')
  }
  keyCache = { syncKey, keys }
  return keys
}

async function call(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const k = await keysOf(env)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${k.auth}` }
  try {
    if (env.SYNC) return await env.SYNC.fetch(`https://moneta${path}`, { ...init, headers })
    if (!env.SYNC_URL) throw new BotError('noSyncService')
    return await fetch(env.SYNC_URL.replace(/\/+$/, '') + path, { ...init, headers })
  } catch (err) {
    if (err instanceof BotError) throw err
    throw new BotError('syncOffline')
  }
}

export interface Loaded {
  version: number
  data: AppData
}

export async function load(env: Env): Promise<Loaded> {
  const k = await keysOf(env)
  const res = await call(env, `/api/sync/${k.id}`)
  if (res.status === 404) throw new BotError('noData')
  if (res.status === 401 || res.status === 403) throw new BotError('badSyncKey')
  if (!res.ok) throw new BotError('syncFailed', { status: String(res.status) })
  const body = (await res.json()) as { version: number; blob: string }
  let raw: { version?: number }
  try {
    raw = JSON.parse(await open(k.key, body.blob))
  } catch {
    throw new BotError('badSyncKey')
  }
  // Written by a newer Moneta than this bot was built from: saving could drop what it added.
  if (typeof raw.version === 'number' && raw.version > DATA_VERSION) throw new BotError('newerData')
  return { version: body.version, data: normalizeData(raw) }
}

/** Loads the data, lets `change` edit it and saves it. Returns what `change` returned. */
export async function update<T>(env: Env, change: (data: AppData) => T): Promise<T> {
  const k = await keysOf(env)
  for (let attempt = 0; attempt < 4; attempt++) {
    const { version, data } = await load(env)
    const result = change(data)
    const res = await call(env, `/api/sync/${k.id}`, {
      method: 'PUT',
      body: JSON.stringify({ version, blob: await seal(k.key, JSON.stringify(data)) })
    })
    if (res.status === 409) continue
    // The sync service keeps at most 2 MB (encrypted and compressed) per person.
    if (res.status === 413) throw new BotError('dataTooBig')
    if (!res.ok) throw new BotError('syncFailed', { status: String(res.status) })
    return result
  }
  throw new BotError('syncBusy')
}

/** Encrypts the bot's own notes (pending entries, undo history) with the sync key. */
export async function sealNote(env: Env, value: unknown): Promise<string> {
  return seal((await keysOf(env)).key, JSON.stringify(value))
}

export async function openNote<T>(env: Env, blob: string): Promise<T> {
  return JSON.parse(await open((await keysOf(env)).key, blob)) as T
}
