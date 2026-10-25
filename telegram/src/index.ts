// Moneta Telegram bot (Cloudflare Worker).
//
// - POST /telegram receives updates from Telegram (checked with the webhook secret).
// - POST /setup registers that webhook and the command menu with Telegram.
//
// A message becomes entries (from a command, or from the AI when one is set up). The
// bot shows what it understood with ✅ / ❌ buttons and only changes your data once
// you confirm. Saved entries get an ↩️ Undo button.

import { answer, balances, MAX_ACTIONS, plan, run, undo, validateActions, type Action } from './actions'
import { aiConfigured, createParser } from './ai'
import { buildContext } from './ai/context'
import { parseCommand } from './commands'
import { allowedUsers, BotError, todayIn, type Env } from './env'
import { esc, LANGS, MENU, pickLang, type ErrorKey, type Strings } from './i18n'
import { load, update } from './moneta'
import * as store from './store'
import { answerCallback, edit, rows, send, tg, typing, type Keyboard, type TgCallback, type TgMessage, type TgUpdate } from './telegram'

/** Longest message the bot reads. */
const MAX_INPUT = 1000

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/telegram') {
      if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.TELEGRAM_WEBHOOK_SECRET)) {
        return new Response('unauthorized', { status: 401 })
      }
      const body = (await req.json().catch(() => null)) as TgUpdate | null
      // Answer Telegram straight away so it doesn't send the update again; the work carries on.
      if (body) ctx.waitUntil(handle(env, body))
      return new Response('ok')
    }
    if (req.method === 'POST' && url.pathname === '/setup') return setup(req, env, url)
    return new Response('Not found', { status: 404 })
  }
}

function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b)
}

// ---------- setup ----------

async function setup(req: Request, env: Env, url: URL): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!sameSecret(auth.startsWith('Bearer ') ? auth.slice(7) : null, env.TELEGRAM_WEBHOOK_SECRET)) {
    return Response.json({ ok: false, error: 'Send the webhook secret as "Authorization: Bearer <secret>".' }, { status: 401 })
  }
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET)) {
    return Response.json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET must be 16-256 letters, digits, _ or -.' }, { status: 400 })
  }
  const webhook = `${url.origin}/telegram`

  // Checks the bot token and the sync key, and says which one is wrong.
  let telegram = 'ok'
  try {
    await tg(env, 'setWebhook', {
      url: webhook,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    })
    const menu = (t: Strings) => MENU.map((command) => ({ command, description: t.menu[command] }))
    // The default menu, plus translated ones for people whose Telegram is in Japanese or Chinese.
    await tg(env, 'setMyCommands', { commands: menu(pickLang(env.LANGUAGE, 'en')) })
    if (!env.LANGUAGE) {
      await tg(env, 'setMyCommands', { commands: menu(LANGS.ja), language_code: 'ja' })
      await tg(env, 'setMyCommands', { commands: menu(LANGS['zh-Hans']), language_code: 'zh' })
    }
  } catch (err) {
    const message = String((err as Error).message)
    telegram = /\((401|404)\)/.test(message)
      ? 'Telegram doesn’t recognise TELEGRAM_BOT_TOKEN. Set it again with just the token from BotFather (like 123456789:AA…).'
      : message
  }
  let sync = 'ok'
  try {
    await load(env)
  } catch (err) {
    sync = err instanceof BotError ? errorText(err, LANGS.en) : String((err as Error).message)
  }
  const ok = telegram === 'ok' && sync === 'ok'
  return Response.json({ ok, webhook, telegram, sync }, { status: ok ? 200 : 502 })
}

// ---------- updates ----------

async function handle(env: Env, update: TgUpdate): Promise<void> {
  try {
    await store.cleanup(env)
    if (update.message) await onMessage(env, update.message)
    else if (update.callback_query) await onButton(env, update.callback_query)
  } catch (err) {
    console.error('update failed:', err instanceof Error ? err.message : err)
  }
}

function errorText(err: unknown, t: Strings): string {
  if (err instanceof BotError) return (t.errors[err.key as ErrorKey] ?? t.errors.generic)(err.params)
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  return t.errors.generic({})
}

async function onMessage(env: Env, msg: TgMessage): Promise<void> {
  if (msg.chat.type !== 'private' || !msg.from) return
  const t = pickLang(env.LANGUAGE, msg.from.language_code)
  const chat = msg.chat.id
  const allowed = allowedUsers(env)
  if (!allowed.has(msg.from.id)) {
    // Until someone is allowed, tell whoever writes their id so the owner can add theirs.
    if (!allowed.size) await send(env, chat, t.privateBot(String(msg.from.id)))
    return
  }
  try {
    await respond(env, chat, t, (msg.text ?? '').trim())
  } catch (err) {
    await send(env, chat, errorText(err, t))
  }
}

async function respond(env: Env, chat: number, t: Strings, text: string): Promise<void> {
  if (!text) return void (await send(env, chat, esc(t.onlyText)))
  if (text.length > MAX_INPUT) throw new BotError('tooLong')
  const today = todayIn(env)

  const cmd = parseCommand(text, today)
  if (cmd) {
    switch (cmd.kind) {
      case 'help':
      case 'unknown':
        return void (await send(env, chat, t.help(aiConfigured(env))))
      case 'balances':
        return void (await send(env, chat, balances((await load(env)).data, t)))
      case 'undo':
        return undoLatest(env, chat, t)
      case 'usage':
        return void (await send(env, chat, t.usage[cmd.command]))
      case 'actions':
        return propose(env, chat, t, validateActions(cmd.actions), today)
    }
  }

  const ai = createParser(env)
  if (!ai) return void (await send(env, chat, t.noAi))
  void typing(env, chat)
  const { data } = await load(env)
  let result
  try {
    result = await ai.parse(text, buildContext(data, today))
  } catch (err) {
    if (err instanceof BotError) throw err
    console.error('AI failed:', err instanceof Error ? err.message : err)
    throw new BotError('aiFailed')
  }
  if (result.kind === 'reply') return void (await send(env, chat, esc(result.text.slice(0, 1000))))
  const actions = validateActions(result.actions.slice(0, MAX_ACTIONS))
  return propose(env, chat, t, actions, today, data)
}

/**
 * Shows the entries with ✅ / ❌, or the question that has to be answered first.
 * With `messageId`, updates that message instead of sending a new one.
 */
async function propose(env: Env, chat: number, t: Strings, actions: Action[], today: string, data?: Parameters<typeof plan>[0], messageId?: number): Promise<void> {
  data ??= (await load(env)).data
  const p = plan(data, actions, today, t)
  const id = await store.putPending(env, chat, { actions: p.actions, ask: p.ask })
  let text: string
  let keyboard: Keyboard
  if (p.ask) {
    text = p.ask.question
    keyboard = rows(p.ask.options.map((o, i) => ({ text: o.label, callback_data: `pick:${id}:${i}` })))
    keyboard.push([{ text: t.cancel, callback_data: `no:${id}` }])
  } else {
    text = `${p.lines.join('\n\n')}\n\n<b>${esc(t.confirm)}</b>`
    keyboard = [[{ text: t.save, callback_data: `ok:${id}` }, { text: t.cancel, callback_data: `no:${id}` }]]
  }
  if (messageId) await edit(env, chat, messageId, text, keyboard)
  else await send(env, chat, text, keyboard)
}

// ---------- buttons ----------

async function onButton(env: Env, q: TgCallback): Promise<void> {
  const msg = q.message
  if (!msg || !allowedUsers(env).has(q.from.id)) return void (await answerCallback(env, q.id))
  const t = pickLang(env.LANGUAGE, q.from.language_code)
  const chat = msg.chat.id
  const [kind, id = '', extra] = (q.data ?? '').split(':')
  let notice: string | undefined
  try {
    if (kind === 'ok') notice = await confirm(env, chat, msg.message_id, t, id)
    else if (kind === 'no') {
      if (await store.takePending(env, chat, id)) await edit(env, chat, msg.message_id, esc(t.cancelled))
    } else if (kind === 'pick') notice = await pick(env, chat, msg.message_id, t, id, Number(extra))
    else if (kind === 'undo') notice = await undoSaved(env, chat, msg.message_id, t, id)
  } catch (err) {
    await edit(env, chat, msg.message_id, errorText(err, t)).catch(() => send(env, chat, errorText(err, t)))
  }
  await answerCallback(env, q.id, notice).catch(() => undefined)
}

/** Saves a pending entry. Returns a notice when it's gone (already saved, cancelled or expired). */
async function confirm(env: Env, chat: number, messageId: number, t: Strings, id: string): Promise<string | undefined> {
  const p = await store.takePending(env, chat, id)
  if (!p || p.ask) return t.expired
  const today = todayIn(env)
  // Applied to the newest data; if another device saved first, it's applied again to that.
  const { steps, lines } = await update(env, (data) => run(data, p.actions, today, t))
  // The entry is saved even if keeping its undo note fails, so that mustn't look like an error.
  const undoId = await store.putSaved(env, chat, { steps, lines, messageId }).catch((err) => {
    console.error('could not keep undo:', err instanceof Error ? err.message : err)
    return null
  })
  await edit(env, chat, messageId, `${lines.join('\n\n')}\n\n<b>${esc(t.saved)}</b>`, undoId ? [[{ text: t.undo, callback_data: `undo:${undoId}` }]] : [])
  return undefined
}

async function pick(env: Env, chat: number, messageId: number, t: Strings, id: string, index: number): Promise<string | undefined> {
  const p = await store.takePending(env, chat, id)
  const option = p?.ask?.options[index]
  if (!p?.ask || !option) return t.expired
  await propose(env, chat, t, answer(p.actions, p.ask, option.ref), todayIn(env), undefined, messageId)
  return undefined
}

const struck = (lines: string[]) => lines.map((l) => `<s>${l}</s>`).join('\n\n')

async function undoSaved(env: Env, chat: number, messageId: number, t: Strings, id: string): Promise<string | undefined> {
  const s = await store.takeSaved(env, chat, id)
  if (!s) return t.nothingToUndo
  await update(env, (data) => undo(data, s.steps))
  await edit(env, chat, messageId, `${struck(s.lines)}\n\n<b>${esc(t.undone)}</b>`)
  return undefined
}

async function undoLatest(env: Env, chat: number, t: Strings): Promise<void> {
  const s = await store.takeSaved(env, chat)
  if (!s) return void (await send(env, chat, esc(t.nothingToUndo)))
  await update(env, (data) => undo(data, s.steps))
  if (s.messageId) await edit(env, chat, s.messageId, `${struck(s.lines)}\n\n<b>${esc(t.undone)}</b>`).catch(() => undefined)
  await send(env, chat, `${struck(s.lines)}\n\n<b>${esc(t.undone)}</b>`)
}
