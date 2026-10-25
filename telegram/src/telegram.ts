// The few Telegram Bot API calls the bot needs. https://core.telegram.org/bots/api

import type { Env } from './env'

export interface TgUser {
  id: number
  language_code?: string
}

export interface TgMessage {
  message_id: number
  chat: { id: number; type: string }
  from?: TgUser
  text?: string
}

export interface TgCallback {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallback
}

export interface Button {
  text: string
  callback_data: string
}

export type Keyboard = Button[][]

/** Telegram's limit is 4096 characters. */
const MAX_TEXT = 4000

/** The token alone (like 123456789:AA…), even when more of BotFather's message was pasted with it. */
export function botToken(raw: string | undefined): string {
  const text = (raw ?? '').trim()
  return text.match(/\d{5,}:[A-Za-z0-9_-]{30,}/)?.[0] ?? text
}

export async function tg(env: Env, method: string, body: Record<string, unknown>): Promise<any> {
  const base = (env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/+$/, '')
  const res = await fetch(`${base}/bot${botToken(env.TELEGRAM_BOT_TOKEN)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null
  // The URL holds the bot token, so it's left out of the error.
  if (!json?.ok) throw new Error(`Telegram ${method} failed (${res.status}): ${json?.description ?? 'no answer'}`)
  return json.result
}

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text)

export function send(env: Env, chat: number, html: string, keyboard?: Keyboard): Promise<TgMessage> {
  return tg(env, 'sendMessage', {
    chat_id: chat,
    text: clip(html),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {})
  })
}

/** Replaces a message's text and buttons (no keyboard removes them). */
export function edit(env: Env, chat: number, messageId: number, html: string, keyboard: Keyboard = []): Promise<unknown> {
  return tg(env, 'editMessageText', {
    chat_id: chat,
    message_id: messageId,
    text: clip(html),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard }
  })
}

/** Stops the spinner on a pressed button, optionally showing a short notice. */
export function answerCallback(env: Env, id: string, notice?: string): Promise<unknown> {
  return tg(env, 'answerCallbackQuery', { callback_query_id: id, ...(notice ? { text: notice } : {}) })
}

export function typing(env: Env, chat: number): Promise<unknown> {
  return tg(env, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => undefined)
}

/** Lays buttons out `perRow` to a row. */
export function rows(buttons: Button[], perRow = 2): Keyboard {
  const out: Keyboard = []
  for (let i = 0; i < buttons.length; i += perRow) out.push(buttons.slice(i, i + perRow))
  return out
}
