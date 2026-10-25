// Pieces every provider uses: reading the record tool's arguments, and HTTP calls
// with errors turned into messages the person chatting understands.

import { BotError } from '../env'
import { esc } from '../i18n'
import type { AiResult } from './types'

/** Telegram's update keeps running for about 30 seconds after the bot answers it. */
export const TIMEOUT_MS = 25_000

/** The record tool's arguments, whose `actions` may be split over several calls. */
export function fromCalls(calls: unknown[], text: string): AiResult {
  if (calls.length) {
    const actions = calls.flatMap((c) => {
      const a = (c as { actions?: unknown } | null)?.actions
      return Array.isArray(a) ? a : []
    })
    if (!actions.length) throw new BotError('badAction')
    return { kind: 'actions', actions }
  }
  if (text.trim()) return { kind: 'reply', text: text.trim() }
  throw new BotError('aiFailed')
}

/** Tool arguments arrive as a JSON string from OpenAI-style APIs. */
export function parseArguments(json: unknown): unknown {
  if (typeof json !== 'string') return json
  try {
    return JSON.parse(json)
  } catch {
    throw new BotError('badAction')
  }
}

export async function postJson(url: string, apiKey: string, body: unknown, model: string, headers: Record<string, string> = {}): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch {
    throw new BotError('aiBusy')
  }
  const json = (await res.json().catch(() => null)) as { error?: unknown } | null
  if (res.ok) return json
  const info = JSON.stringify(json?.error ?? json ?? '').slice(0, 300)
  console.error(`AI request failed (${res.status}): ${info}`)
  throw httpError(res.status, info, model)
}

/** Companies word their errors differently; the status code does most of the work. */
export function httpError(status: number, info: string, model: string): BotError {
  if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(info))) return new BotError('aiKey')
  if (status === 402 || /insufficient[ _](quota|balance|credits?)/i.test(info)) return new BotError('aiCredit')
  if (status === 404 || /model[ _]not[ _]found|model .*(does not|doesn't) exist/i.test(info)) return new BotError('aiModel', { model: esc(model) })
  if (status === 429 || status >= 500) return new BotError('aiBusy')
  return new BotError('aiFailed')
}
