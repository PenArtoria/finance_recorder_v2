// End-to-end encryption for sync. Every device holds one random sync key; from it we
// derive the document id, an auth token for the server and an AES-GCM key. The server
// only ever receives ciphertext. Pairing codes let a phone fetch the sync key once.

const enc = new TextEncoder()
const dec = new TextDecoder()

export function b64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

type Bytes = Uint8Array<ArrayBuffer>

export function fromB64u(text: string): Bytes {
  const s = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export function newSyncKey(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(32)))
}

export function isSyncKey(text: string): boolean {
  try {
    return fromB64u(text.trim()).length === 32
  } catch {
    return false
  }
}

export interface SyncKeys {
  id: string
  auth: string
  key: CryptoKey
}

export async function deriveKeys(syncKey: string): Promise<SyncKeys> {
  const raw = fromB64u(syncKey)
  if (raw.length !== 32) throw new Error('That sync key isn’t valid.')
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey'])
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('moneta'), info: enc.encode(info) })
  const id = hex(await crypto.subtle.deriveBits(params('id'), base, 128))
  const auth = hex(await crypto.subtle.deriveBits(params('auth'), base, 256))
  const key = await crypto.subtle.deriveKey(params('enc'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { id, auth, key }
}

async function pipe(bytes: Bytes, stream: CompressionStream | DecompressionStream): Promise<Bytes> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream as unknown as TransformStream<Bytes, Bytes>))
  return new Uint8Array(await out.arrayBuffer())
}

const canCompress = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

/** Encrypts text. Format: [1, compressed?, iv(12), ciphertext], base64url. */
export async function seal(key: CryptoKey, text: string): Promise<string> {
  let body: Bytes = enc.encode(text)
  let flag = 0
  if (canCompress) {
    body = await pipe(body, new CompressionStream('gzip'))
    flag = 1
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body))
  const out = new Uint8Array(2 + iv.length + ct.length)
  out.set([1, flag], 0)
  out.set(iv, 2)
  out.set(ct, 14)
  return b64u(out)
}

export async function open(key: CryptoKey, blob: string): Promise<string> {
  const data = fromB64u(blob)
  if (data[0] !== 1) throw new Error('This synced data was written by a newer version of Moneta.')
  const iv = data.slice(2, 14)
  let body: Bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data.slice(14)))
  if (data[1] === 1) {
    if (!canCompress) throw new Error('This device can’t read compressed sync data. Update iOS to 16.4 or later.')
    body = await pipe(body, new DecompressionStream('gzip'))
  }
  return dec.decode(body)
}

// ---------- pairing codes ----------

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function newPairCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function formatPairCode(code: string): string {
  const c = normalizePairCode(code)
  return `${c.slice(0, 4)}-${c.slice(4)}`
}

export function normalizePairCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .split('')
    .filter((c) => ALPHABET.includes(c))
    .join('')
}

/** A pairing code becomes a lookup id and an AES key. Slow on purpose, so codes can't be guessed offline. */
export async function pairKeys(code: string): Promise<{ id: string; key: CryptoKey }> {
  const c = normalizePairCode(code)
  if (c.length !== 8) throw new Error('The code has 8 letters and numbers.')
  const base = await crypto.subtle.importKey('raw', enc.encode(c), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('moneta-pair'), iterations: 200000 }, base, 384)
  )
  const key = await crypto.subtle.importKey('raw', bits.slice(16), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return { id: hex(bits.slice(0, 16).buffer), key }
}
