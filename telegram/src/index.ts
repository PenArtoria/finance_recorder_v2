// Moneta Telegram bot (Cloudflare Worker).
//
// - POST /telegram receives updates from Telegram (checked with the webhook secret).
// - POST /setup registers that webhook and the command menu with Telegram.
//
// A message becomes entries (from a command, or from the AI when one is set up). The
// bot shows what it understood with ✅ / ❌ buttons and only changes your data once
// you confirm. Saved entries get an ↩️ Undo button.

import { answer, hasHolding, MAX_ACTIONS, plan, run, summarize, undo, validateActions, type Action } from './actions'
import { aiConfigured, aiSettings, createParser } from './ai'
import { buildContext } from './ai/context'
import { balances } from './balances'
import { monthOf, monthSummary } from './month'
import { parseCommand } from './commands'
import { allowedUsers, BotError, todayIn, type Env } from './env'
import { esc, LANGS, LANGUAGE_NAMES, MENU, pickLang, struck, withCards, type ErrorKey, type Lang, type Strings } from './i18n'
import { load, lookupSymbols, refreshQuotes, update } from './moneta'
import * as store from './store'
import { answerCallback, edit, rows, send, sendLong, tg, typing, type Keyboard, type TgCallback, type TgMessage, type TgUpdate } from './telegram'

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
    if (req.method === 'POST' && url.pathname === '/try') return tryMessages(req, env)
    return new Response('Not found', { status: 404 })
  }
}

function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b)
}

const menu = (t: Strings) => MENU.map((command) => ({ command, description: t.menu[command] }))

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
    // The default menu, plus translated ones for people whose Telegram is in Japanese or Chinese.
    await tg(env, 'setMyCommands', { commands: menu(pickLang(env.LANGUAGE || 'en')) })
    if (!env.LANGUAGE) {
      await tg(env, 'setMyCommands', { commands: menu(LANGS.ja), language_code: 'ja' })
      await tg(env, 'setMyCommands', { commands: menu(LANGS['zh-Hans']), language_code: 'zh' })
    }
    // Chats that picked a language have their own menu; bring it up to date too.
    for (const { chat, lang } of await store.allLangs(env).catch(() => [])) {
      await tg(env, 'setMyCommands', { commands: menu(pickLang(lang)), scope: { type: 'chat', chat_id: chat } }).catch(() => undefined)
    }
  } catch (err) {
    const message = String((err as Error).message)
    telegram = /\((401|404)\)/.test(message)
      ? 'Telegram doesn’t recognise TELEGRAM_BOT_TOKEN. Set it again with just the token from BotFather (like 123456789:AA…).'
      : message
  }
  let sync = 'ok'
  let data: Awaited<ReturnType<typeof load>>['data'] | null = null
  try {
    data = (await load(env)).data
  } catch (err) {
    sync = errorMessage(err, LANGS.en)
  }

  // With AI on, reads a sample message to check the key, the model and tool calls. A
  // {"message": "..."} body tries your own wording; nothing is saved and no balances are shown.
  const body = (await req.json().catch(() => null)) as { message?: unknown } | null
  const sample = typeof body?.message === 'string' && body.message.trim() ? body.message.trim().slice(0, MAX_INPUT) : 'lunch 1200 yen'
  let ai = 'off'
  let entries: unknown
  let planned: string | undefined
  try {
    const settings = aiSettings(env)
    const parser = createParser(env)
    if (settings && parser && data) {
      const today = todayIn(env)
      const result = await parser.parse(sample, buildContext(data, today))
      if (result.kind === 'actions') {
        ai = `ok (${settings.provider}, ${settings.model})`
        const actions = validateActions(result.actions.slice(0, MAX_ACTIONS))
        await findNewHoldings(env, data, actions)
        entries = actions.map((a) => (a.type === 'buy' && a.candidates ? { ...a, candidates: a.candidates.map((c) => c.symbol) } : a))
        try {
          const p = plan(data, actions, today, LANGS.en)
          planned = p.ask ? `asks: ${p.ask.question}` : 'ok'
        } catch (err) {
          planned = errorMessage(err, LANGS.en)
        }
      } else ai = `${settings.provider} (${settings.model}) answered without an entry: ${result.text.slice(0, 200)}`
    } else if (settings) ai = 'not checked: the sync key has to work first'
  } catch (err) {
    ai = errorMessage(err, LANGS.en)
  }

  const ok = telegram === 'ok' && sync === 'ok' && (ai === 'off' || ai.startsWith('ok'))
  return Response.json({ ok, webhook, telegram, sync, ai, ...(entries ? { sample, entries, plan: planned } : {}) }, { status: ok ? 200 : 502 })
}

// ---------- trying messages ----------

/**
 * POST /try with {"messages": ["lunch 1200 yen", …]} and the webhook secret: shows what the
 * AI and the bot make of each message. Nothing is saved, and no balances are shown.
 */
async function tryMessages(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!sameSecret(auth.startsWith('Bearer ') ? auth.slice(7) : null, env.TELEGRAM_WEBHOOK_SECRET)) return new Response('unauthorized', { status: 401 })
  const body = (await req.json().catch(() => null)) as { messages?: unknown } | null
  const messages = Array.isArray(body?.messages) ? body!.messages.filter((m): m is string => typeof m === 'string').slice(0, 20) : []
  const parser = createParser(env)
  if (!parser) return Response.json({ error: 'AI is off' }, { status: 400 })
  const { data } = await load(env)
  const today = todayIn(env)
  const results = []
  for (const message of messages) {
    try {
      const result = await parser.parse(message, buildContext(data, today))
      if (result.kind === 'reply') {
        results.push({ message, reply: result.text })
        continue
      }
      const actions = validateActions(result.actions.slice(0, MAX_ACTIONS))
      await findNewHoldings(env, data, actions)
      try {
        const p = plan(data, actions, today, LANGS.en)
        results.push(
          p.ask
            ? { message, ai: actions.map((a) => summarize(data, a)), asks: p.ask.question, options: p.ask.options.map((o) => o.label) }
            : { message, entries: p.actions.map((a) => summarize(data, a)) }
        )
      } catch (err) {
        results.push({ message, ai: actions.map((a) => summarize(data, a)), error: errorMessage(err, LANGS.en) })
      }
    } catch (err) {
      results.push({ message, error: errorMessage(err, LANGS.en) })
    }
  }
  return Response.json({ today, results })
}

// ---------- updates ----------

async function handle(env: Env, update: TgUpdate): Promise<void> {
  try {
    // Housekeeping only: a failure here mustn't stop the message.
    await store.cleanup(env).catch((err) => console.error('cleanup failed:', err instanceof Error ? err.message : err))
    if (update.message) await onMessage(env, update.message)
    else if (update.callback_query) await onButton(env, update.callback_query)
  } catch (err) {
    console.error('update failed:', err instanceof Error ? err.message : err)
  }
}

/** The chat's /language choice, else LANGUAGE, else the person's Telegram language. */
async function langFor(env: Env, chat: number, telegramCode: string | undefined): Promise<Strings> {
  const saved = await store.getLang(env, chat).catch(() => null)
  return pickLang(saved || env.LANGUAGE || telegramCode)
}

function errorMessage(err: unknown, t: Strings): string {
  if (err instanceof BotError) return (t.errors[err.key as ErrorKey] ?? t.errors.generic)(err.params)
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  return t.errors.generic({})
}

const errorText = (err: unknown, t: Strings) => `⚠️ ${errorMessage(err, t)}`

async function onMessage(env: Env, msg: TgMessage): Promise<void> {
  if (msg.chat.type !== 'private' || !msg.from) return
  const chat = msg.chat.id
  const allowed = allowedUsers(env)
  if (!allowed.has(msg.from.id)) {
    // Until someone is allowed, tell whoever writes their id so the owner can add theirs.
    if (!allowed.size) await send(env, chat, pickLang(env.LANGUAGE || msg.from.language_code).privateBot(String(msg.from.id)))
    return
  }
  const t = await langFor(env, chat, msg.from.language_code)
  try {
    await respond(env, chat, t, (msg.text ?? '').trim(), msg.from.language_code)
  } catch (err) {
    await send(env, chat, errorText(err, t))
  }
}

async function respond(env: Env, chat: number, t: Strings, text: string, telegramCode: string | undefined): Promise<void> {
  if (!text) return void (await send(env, chat, esc(t.onlyText)))
  if (text.length > MAX_INPUT) throw new BotError('tooLong')
  const today = todayIn(env)

  const cmd = parseCommand(text, today)
  if (cmd) {
    // A command moves on from whatever the AI last asked.
    if (aiConfigured(env)) await store.takeRecent(env, chat).catch(() => null)
    switch (cmd.kind) {
      case 'help':
      case 'unknown':
        return sendLong(env, chat, t.help(aiConfigured(env)))
      case 'balances': {
        void typing(env, chat)
        const { data } = await load(env)
        const live = await refreshQuotes(env, data)
        return sendLong(env, chat, balances(data, t, { live, timeZone: env.TIMEZONE }))
      }
      case 'month': {
        const month = monthOf(cmd.arg, today)
        if (!month) return void (await send(env, chat, t.help(aiConfigured(env))))
        return sendLong(env, chat, monthSummary((await load(env)).data, month, today, t))
      }
      case 'undo':
        return undoLatest(env, chat, t)
      case 'language':
        return showLanguages(env, chat, t, telegramCode)
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
  // If the AI asked something last time, this message is the answer.
  const earlier = (await store.takeRecent(env, chat).catch(() => null)) ?? []
  let result
  try {
    result = await ai.parse(text, buildContext(data, today), earlier)
  } catch (err) {
    if (err instanceof BotError) throw err
    console.error('AI failed:', err instanceof Error ? err.message : err)
    throw new BotError('aiFailed')
  }
  if (result.kind === 'reply') {
    const reply = result.text.slice(0, 1000)
    await store.putRecent(env, chat, [...earlier, { user: text, assistant: reply }].slice(-3)).catch(() => undefined)
    return void (await send(env, chat, `💬 ${esc(reply)}`))
  }
  const actions = validateActions(result.actions.slice(0, MAX_ACTIONS))
  return propose(env, chat, t, actions, today, data)
}

/**
 * Shows the entries with ✅ / ❌, or the question that has to be answered first.
 * With `messageId`, updates that message instead of sending a new one.
 */
async function propose(env: Env, chat: number, t: Strings, actions: Action[], today: string, data?: Parameters<typeof plan>[0], messageId?: number): Promise<void> {
  data ??= (await load(env)).data
  await findNewHoldings(env, data, actions)
  const p = plan(data, actions, today, t)
  const id = await store.putPending(env, chat, { actions: p.actions, ask: p.ask, lines: p.lines })
  let text: string
  let keyboard: Keyboard
  if (p.ask) {
    text = `❓ <b>${p.ask.question}</b>`
    keyboard = rows(p.ask.options.map((o, i) => ({ text: o.label, callback_data: `pick:${id}:${i}` })))
    keyboard.push([{ text: t.cancel, callback_data: `no:${id}` }])
  } else {
    text = withCards(`📝 <b>${esc(t.confirm)}</b>`, p.lines)
    keyboard = [[{ text: t.save, callback_data: `ok:${id}` }, { text: t.cancel, callback_data: `no:${id}` }]]
  }
  if (messageId) await show(env, chat, messageId, text, keyboard)
  else await send(env, chat, text, keyboard)
}

/** For buys of something not in your holdings yet, finds the ticker so it can be added. */
async function findNewHoldings(env: Env, data: Parameters<typeof plan>[0], actions: Action[]): Promise<void> {
  await Promise.all(
    actions.map(async (a) => {
      if (a.type !== 'buy' || a.candidates || a.holding.startsWith('new:') || hasHolding(data, a.holding)) return
      a.candidates = await lookupSymbols(env, a.holding)
    })
  )
}

// ---------- language ----------

async function showLanguages(env: Env, chat: number, t: Strings, telegramCode: string | undefined): Promise<void> {
  const saved = (await store.getLang(env, chat).catch(() => null)) as Lang | null
  const current = saved
    ? LANGUAGE_NAMES[saved] ?? saved
    : `${t.language.auto} · ${LANGUAGE_NAMES[pickLang(env.LANGUAGE || telegramCode).lang]}, ${t.language.fromTelegram(telegramCode || '?')}`
  const mark = (on: boolean, label: string) => (on ? `✓ ${label}` : label)
  const keyboard = rows((Object.keys(LANGUAGE_NAMES) as Lang[]).map((l) => ({ text: mark(saved === l, LANGUAGE_NAMES[l]), callback_data: `lang:${l}` })))
  keyboard.push([{ text: mark(!saved, `🔄 ${t.language.auto}`), callback_data: 'lang:auto' }])
  await send(env, chat, `🌐 <b>${esc(t.language.title)}</b>\n${esc(t.language.now(current))}`, keyboard)
}

async function setLanguage(env: Env, chat: number, messageId: number, choice: string, telegramCode: string | undefined): Promise<void> {
  const lang = choice in LANGUAGE_NAMES ? (choice as Lang) : null
  if (!lang && choice !== 'auto') return
  await store.setLang(env, chat, lang)
  const t = lang ? LANGS[lang] : pickLang(env.LANGUAGE || telegramCode)
  // This chat's command menu follows the choice too.
  const scope = { type: 'chat', chat_id: chat }
  await (lang ? tg(env, 'setMyCommands', { commands: menu(t), scope }) : tg(env, 'deleteMyCommands', { scope })).catch((err) =>
    console.error('could not set the menu:', err instanceof Error ? err.message : err)
  )
  await show(env, chat, messageId, `🌐 ${esc(t.language.set)}`)
}

/**
 * Updates a message, or sends a new one when it can't be edited any more (Telegram stops
 * that after 48 hours), so a result that was saved is always shown.
 */
async function show(env: Env, chat: number, messageId: number, html: string, keyboard: Keyboard = []): Promise<void> {
  try {
    await edit(env, chat, messageId, html, keyboard)
  } catch (err) {
    console.error('could not edit, sending instead:', err instanceof Error ? err.message : err)
    await send(env, chat, html, keyboard.length ? keyboard : undefined)
  }
}

// ---------- buttons ----------

async function onButton(env: Env, q: TgCallback): Promise<void> {
  const msg = q.message
  if (!msg || !allowedUsers(env).has(q.from.id)) return void (await answerCallback(env, q.id))
  const chat = msg.chat.id
  const t = await langFor(env, chat, q.from.language_code)
  const [kind, id = '', extra] = (q.data ?? '').split(':')
  let notice: string | undefined
  try {
    if (kind === 'ok') notice = await confirm(env, chat, msg.message_id, t, id)
    else if (kind === 'no') await cancel(env, chat, msg.message_id, t, id)
    else if (kind === 'pick') notice = await pick(env, chat, msg.message_id, t, id, Number(extra))
    else if (kind === 'undo') notice = await undoSaved(env, chat, msg.message_id, t, id)
    else if (kind === 'lang') await setLanguage(env, chat, msg.message_id, id, q.from.language_code)
  } catch (err) {
    await show(env, chat, msg.message_id, errorText(err, t)).catch(() => undefined)
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
  await show(env, chat, messageId, withCards(`✅ <b>${esc(t.saved)}</b>`, lines), undoId ? [[{ text: t.undo, callback_data: `undo:${undoId}` }]] : [])
  return undefined
}

async function cancel(env: Env, chat: number, messageId: number, t: Strings, id: string): Promise<void> {
  const p = await store.takePending(env, chat, id)
  if (!p) return
  const status = `❌ <b>${esc(t.cancelled)}</b>`
  await show(env, chat, messageId, p.lines?.length && !p.ask ? withCards(status, p.lines.map(struck)) : status)
}

async function pick(env: Env, chat: number, messageId: number, t: Strings, id: string, index: number): Promise<string | undefined> {
  const p = await store.takePending(env, chat, id)
  const option = p?.ask?.options[index]
  if (!p?.ask || !option) return t.expired
  await propose(env, chat, t, answer(p.actions, p.ask, option.ref), todayIn(env), undefined, messageId)
  return undefined
}

const undoneText = (t: Strings, lines: string[]) => withCards(`↩️ <b>${esc(t.undone)}</b>`, lines.map(struck))

async function undoSaved(env: Env, chat: number, messageId: number, t: Strings, id: string): Promise<string | undefined> {
  const s = await store.takeSaved(env, chat, id)
  if (!s) return t.nothingToUndo
  await update(env, (data) => undo(data, s.steps))
  await show(env, chat, messageId, undoneText(t, s.lines))
  return undefined
}

async function undoLatest(env: Env, chat: number, t: Strings): Promise<void> {
  const s = await store.takeSaved(env, chat)
  if (!s) return void (await send(env, chat, esc(t.nothingToUndo)))
  await update(env, (data) => undo(data, s.steps))
  if (s.messageId) await edit(env, chat, s.messageId, undoneText(t, s.lines)).catch(() => undefined)
  await send(env, chat, undoneText(t, s.lines))
}
