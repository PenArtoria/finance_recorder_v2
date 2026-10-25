// The bot's own notes in D1. Entries waiting for ✅ / ❌ (30 minutes) and saved entries
// that can be undone (7 days) are encrypted with the sync key; each chat's language isn't.

import type { Action, Ask, Step } from './actions'
import type { Turn } from './ai'
import type { Env } from './env'
import { openNote, sealNote } from './moneta'

const PENDING_MS = 30 * 60 * 1000
const UNDO_MS = 7 * 24 * 60 * 60 * 1000

export interface Pending {
  actions: Action[]
  ask?: Ask
  /** The entries as shown (HTML), to cross out if cancelled. */
  lines?: string[]
}

export interface Saved {
  steps: Step[]
  /** The entries as shown when saved (HTML). */
  lines: string[]
  /** The confirmation message, so /undo can update it. */
  messageId?: number
}

/** Short random id. It goes into button data, which Telegram limits to 64 bytes. */
function newId(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const RECENT_MS = 10 * 60 * 1000

export async function cleanup(env: Env): Promise<void> {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM pending WHERE expires < ?').bind(now),
    env.DB.prepare('DELETE FROM undo WHERE expires < ?').bind(now),
    env.DB.prepare('DELETE FROM recent WHERE expires < ?').bind(now)
  ])
}

/** Keeps the AI's questions (and the messages they answered) for the chat's next message. */
export async function putRecent(env: Env, chat: number, turns: Turn[]): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO recent (chat, blob, expires) VALUES (?, ?, ?)')
    .bind(chat, await sealNote(env, turns), Date.now() + RECENT_MS)
    .run()
}

/** Reads and forgets the AI's last questions to the chat, if they're still fresh. */
export async function takeRecent(env: Env, chat: number): Promise<Turn[] | null> {
  const row = await env.DB.prepare('DELETE FROM recent WHERE chat = ? AND expires >= ? RETURNING blob').bind(chat, Date.now()).first<{ blob: string }>()
  return row ? openNote<Turn[]>(env, row.blob) : null
}

export async function putPending(env: Env, chat: number, p: Pending): Promise<string> {
  const id = newId()
  await env.DB.prepare('INSERT INTO pending (id, chat, blob, expires) VALUES (?, ?, ?, ?)')
    .bind(id, chat, await sealNote(env, p), Date.now() + PENDING_MS)
    .run()
  return id
}

/** Reads and removes a pending entry, so pressing a button twice can't save it twice. */
export async function takePending(env: Env, chat: number, id: string): Promise<Pending | null> {
  const row = await env.DB.prepare('DELETE FROM pending WHERE id = ? AND chat = ? AND expires >= ? RETURNING blob')
    .bind(id, chat, Date.now())
    .first<{ blob: string }>()
  return row ? openNote<Pending>(env, row.blob) : null
}

export async function putSaved(env: Env, chat: number, s: Saved): Promise<string> {
  const id = newId()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO undo (id, chat, blob, created, expires) VALUES (?, ?, ?, ?, ?)')
    .bind(id, chat, await sealNote(env, s), now, now + UNDO_MS)
    .run()
  return id
}

/** Reads and removes a saved entry: the given one, or the newest. */
export async function takeSaved(env: Env, chat: number, id?: string): Promise<Saved | null> {
  const now = Date.now()
  const row = id
    ? await env.DB.prepare('DELETE FROM undo WHERE id = ? AND chat = ? AND expires >= ? RETURNING blob').bind(id, chat, now).first<{ blob: string }>()
    : await env.DB.prepare(
        'DELETE FROM undo WHERE id = (SELECT id FROM undo WHERE chat = ? AND expires >= ? ORDER BY created DESC LIMIT 1) RETURNING blob'
      )
        .bind(chat, now)
        .first<{ blob: string }>()
  return row ? openNote<Saved>(env, row.blob) : null
}

/** The language a chat picked with /language, if any. */
export async function getLang(env: Env, chat: number): Promise<string | null> {
  const row = await env.DB.prepare('SELECT lang FROM prefs WHERE chat = ?').bind(chat).first<{ lang: string }>()
  return row?.lang ?? null
}

/** Every chat's chosen language. */
export async function allLangs(env: Env): Promise<{ chat: number; lang: string }[]> {
  const { results } = await env.DB.prepare('SELECT chat, lang FROM prefs').all<{ chat: number; lang: string }>()
  return results
}

/** Saves a chat's language; null goes back to following Telegram. */
export async function setLang(env: Env, chat: number, lang: string | null): Promise<void> {
  if (lang) await env.DB.prepare('INSERT OR REPLACE INTO prefs (chat, lang) VALUES (?, ?)').bind(chat, lang).run()
  else await env.DB.prepare('DELETE FROM prefs WHERE chat = ?').bind(chat).run()
}
