import { describe, expect, it } from 'vitest'
import { exampleData } from '../../windows/src/renderer/src/core/example'
import { deriveKeys, newSyncKey, open, seal } from '../../windows/src/renderer/src/sync/crypto'
import type { Env } from '../src/env'
import { load, refreshQuotes, update } from '../src/moneta'

/** A stand-in for the sync service with the same rules: writes must name the version they're based on. */
async function fakeSync(data: unknown, opts: { raw?: string; maxBlob?: number } = {}) {
  const syncKey = newSyncKey()
  const k = await deriveKeys(syncKey)
  const doc = { version: 1, blob: opts.raw ?? (await seal(k.key, JSON.stringify(data))) }
  const server = {
    doc,
    puts: 0,
    /** Runs once before the next PUT is handled, like another device saving first. */
    beforePut: null as null | (() => Promise<void>),
    async read() {
      return JSON.parse(await open(k.key, doc.blob))
    },
    async write(value: unknown) {
      doc.blob = await seal(k.key, JSON.stringify(value))
      doc.version++
    }
  }
  const fetcher = {
    async fetch(url: string, init: RequestInit = {}) {
      const path = new URL(url).pathname
      if (path === '/api/quotes') {
        const symbols = (new URL(url).searchParams.get('symbols') ?? '').split(',')
        return Response.json({ quotes: symbols.map((symbol) => ({ symbol, price: 1, previousClose: 1, currency: 'USD', fetchedAt: 1 })), errors: [] })
      }
      if (path !== `/api/sync/${k.id}` || (init.headers as Record<string, string>).Authorization !== `Bearer ${k.auth}`) {
        return Response.json({ error: 'forbidden' }, { status: 403 })
      }
      if (!init.method || init.method === 'GET') return Response.json(doc)
      const hook = server.beforePut
      server.beforePut = null
      if (hook) await hook()
      server.puts++
      const body = JSON.parse(String(init.body))
      if (opts.maxBlob && body.blob.length > opts.maxBlob) return Response.json({ error: 'too_large' }, { status: 413 })
      if (body.version !== doc.version) return Response.json({ error: 'conflict', version: doc.version }, { status: 409 })
      doc.blob = body.blob
      doc.version++
      return Response.json({ version: doc.version })
    }
  }
  const env = { MONETA_SYNC_KEY: syncKey, SYNC: fetcher } as unknown as Env
  return { env, server }
}

describe('sync', () => {
  it('decrypts the synced data', async () => {
    const { env } = await fakeSync(exampleData())
    const { version, data } = await load(env)
    expect(version).toBe(1)
    expect(data.buckets.map((b) => b.name)).toContain('Living expenses')
  })

  it('saves a change encrypted, based on the version it read', async () => {
    const { env, server } = await fakeSync(exampleData())
    await update(env, (d) => {
      d.buckets[0].amount = 1
    })
    expect(server.doc.version).toBe(2)
    expect(server.doc.blob).not.toContain('Emergency')
    expect((await server.read()).buckets[0].amount).toBe(1)
  })

  it('makes the change again when another device saved in between', async () => {
    const { env, server } = await fakeSync(exampleData())
    server.beforePut = async () => {
      const other = await server.read()
      other.buckets[1].amount = 999
      await server.write(other)
    }
    let runs = 0
    await update(env, (d) => {
      runs++
      d.buckets[0].amount = 1
    })
    expect(runs).toBe(2)
    expect(server.puts).toBe(2)
    const saved = await server.read()
    expect(saved.buckets[0].amount).toBe(1)
    expect(saved.buckets[1].amount).toBe(999)
  })

  it('says so when the data is too big for the sync service, and changes nothing', async () => {
    const { env, server } = await fakeSync(exampleData(), { maxBlob: 100 })
    const before = server.doc.blob
    await expect(update(env, (d) => void (d.buckets[0].amount = 1))).rejects.toMatchObject({ key: 'dataTooBig' })
    expect(server.doc.blob).toBe(before)
  })

  it('gets current prices for every holding with a symbol', async () => {
    const { env } = await fakeSync(exampleData())
    const { data } = await load(env)
    expect(await refreshQuotes(env, data)).toBe(true)
    expect(data.quotes['VWRA.L']).toMatchObject({ price: 1, fetchedAt: 1 })
    expect(data.quotes['BTC-USD']).toMatchObject({ price: 1 })
  })

  it('won’t touch data from a newer Moneta', async () => {
    const { env } = await fakeSync({ ...exampleData(), version: 99 })
    await expect(load(env)).rejects.toMatchObject({ key: 'newerData' })
  })

  it('says so when the sync key is wrong', async () => {
    const { env } = await fakeSync(exampleData())
    const wrong = { ...env, MONETA_SYNC_KEY: newSyncKey() } as Env
    await expect(load(wrong)).rejects.toMatchObject({ key: 'badSyncKey' })
  })
})
