// Moneta cloud service (Cloudflare Worker).
//
// - Serves the phone app (static files from ../ios/dist, configured in wrangler.toml).
// - /api/quotes and /api/search fetch Yahoo Finance for the phone, which can't call Yahoo
//   directly from a browser.
// - /api/sync stores one encrypted document per user. Devices encrypt before uploading, so
//   this service only ever sees ciphertext. Writes need the document's auth token, and
//   carry the version they were based on so two devices can't overwrite each other.
// - /api/pair holds an encrypted sync key for 10 minutes so a phone can be linked by typing
//   a short code.

import { fetchQuotes, searchSymbols } from '../../windows/src/main/quotes'

export interface Env {
  DB: D1Database
}

const MAX_BLOB = 4 * 1024 * 1024
const PAIR_TTL_MS = 10 * 60 * 1000
const ID = /^[a-f0-9]{32}$/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400'
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra }
  })
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function bearer(req: Request): string {
  const h = req.headers.get('Authorization') ?? ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}

async function readBody(req: Request): Promise<any | null> {
  const len = Number(req.headers.get('Content-Length') ?? 0)
  if (len > MAX_BLOB) return null
  try {
    const text = await req.text()
    if (text.length > MAX_BLOB) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Short-lived edge cache so many refreshes don't all hit Yahoo. */
async function cached(req: Request, ttl: number, make: () => Promise<Response>): Promise<Response> {
  const cache = caches.default
  const key = new Request(req.url, { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit
  const res = await make()
  if (res.ok) {
    const copy = new Response(res.body, res)
    copy.headers.set('Cache-Control', `public, max-age=${ttl}`)
    await cache.put(key, copy.clone())
    return copy
  }
  return res
}

async function handleSync(req: Request, env: Env, id: string): Promise<Response> {
  const token = bearer(req)
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'unauthorized' }, 401)
  const auth = await sha256(token)
  const row = await env.DB.prepare('SELECT auth, version, blob, updated_at FROM docs WHERE id = ?').bind(id).first<{
    auth: string
    version: number
    blob: string
    updated_at: number
  }>()
  if (row && row.auth !== auth) return json({ error: 'forbidden' }, 403)

  if (req.method === 'GET') {
    if (!row) return json({ error: 'not_found' }, 404)
    return json({ version: row.version, blob: row.blob, updatedAt: row.updated_at })
  }

  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM docs WHERE id = ?').bind(id).run()
    return json({ ok: true })
  }

  // PUT: write the new version only if nobody else wrote since `version`.
  const body = await readBody(req)
  if (!body || typeof body.blob !== 'string' || typeof body.version !== 'number') return json({ error: 'bad_request' }, 400)
  const now = Date.now()
  if (!row) {
    if (body.version !== 0) return json({ error: 'conflict', version: 0 }, 409)
    await env.DB.prepare('INSERT INTO docs (id, auth, version, blob, updated_at) VALUES (?, ?, 1, ?, ?)').bind(id, auth, body.blob, now).run()
    return json({ version: 1, updatedAt: now })
  }
  const res = await env.DB.prepare('UPDATE docs SET blob = ?, version = version + 1, updated_at = ? WHERE id = ? AND auth = ? AND version = ?')
    .bind(body.blob, now, id, auth, body.version)
    .run()
  if (!res.meta.changes) return json({ error: 'conflict', version: row.version }, 409)
  return json({ version: body.version + 1, updatedAt: now })
}

async function handlePair(req: Request, env: Env, id: string): Promise<Response> {
  const now = Date.now()
  await env.DB.prepare('DELETE FROM pairs WHERE expires < ?').bind(now).run()
  if (req.method === 'PUT') {
    const body = await readBody(req)
    if (!body || typeof body.blob !== 'string' || body.blob.length > 4096) return json({ error: 'bad_request' }, 400)
    await env.DB.prepare('INSERT OR REPLACE INTO pairs (id, blob, expires) VALUES (?, ?, ?)').bind(id, body.blob, now + PAIR_TTL_MS).run()
    return json({ ok: true, expires: now + PAIR_TTL_MS })
  }
  if (req.method === 'GET') {
    // One use only: the code stops working once a phone has read it.
    const row = await env.DB.prepare('DELETE FROM pairs WHERE id = ? AND expires >= ? RETURNING blob').bind(id, now).first<{ blob: string }>()
    if (!row) return json({ error: 'not_found' }, 404)
    return json({ blob: row.blob })
  }
  return json({ error: 'method_not_allowed' }, 405)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    try {
      if (url.pathname === '/api/quotes' && req.method === 'GET') {
        const symbols = (url.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40)
        return cached(req, 60, async () => json(await fetchQuotes(symbols)))
      }
      if (url.pathname === '/api/search' && req.method === 'GET') {
        const q = (url.searchParams.get('q') ?? '').slice(0, 80)
        return cached(req, 3600, async () => json(await searchSymbols(q)))
      }
      const sync = url.pathname.match(/^\/api\/sync\/([a-f0-9]+)$/)
      if (sync && ID.test(sync[1]) && ['GET', 'PUT', 'DELETE'].includes(req.method)) return handleSync(req, env, sync[1])
      const pair = url.pathname.match(/^\/api\/pair\/([a-f0-9]+)$/)
      if (pair && ID.test(pair[1])) return handlePair(req, env, pair[1])
      return json({ error: 'not_found' }, 404)
    } catch (err: any) {
      return json({ error: 'server_error', message: String(err?.message ?? err) }, 500)
    }
  }
}
