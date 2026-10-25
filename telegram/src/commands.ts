// Slash commands, which work without any AI:
//
//   /spend 1200 JPY lunch #food from Daily card Visa on 2026-10-24
//   /income 300000 salary #salary to SMBC
//   /move 700 USD from Wise to IBKR
//   /buy 3 VWRA at 140 fee 2 from IBKR      /buy VWRA for 500 from IBKR
//   /sell 1 RKLB at 70 to IBKR
//
// Keywords are English so they're the same for everyone; names and notes can be in
// any language.

import type { Action } from './actions'

export type EntryCommand = 'spend' | 'income' | 'move' | 'buy' | 'sell'

export type Command =
  | { kind: 'help' | 'balances' | 'undo' | 'unknown' }
  | { kind: 'actions'; actions: Action[] }
  | { kind: 'usage'; command: EntryCommand }

/** Parses a message starting with "/". Returns null for anything else. */
export function parseCommand(text: string, today: string): Command | null {
  const m = text.trim().match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i)
  if (!m) return null
  const name = m[1].toLowerCase()
  const rest = (m[2] ?? '').trim()
  switch (name) {
    case 'start':
    case 'help':
      return { kind: 'help' }
    case 'balances':
    case 'balance':
      return { kind: 'balances' }
    case 'undo':
      return { kind: 'undo' }
    case 'spend':
    case 'income':
    case 'move':
    case 'buy':
    case 'sell': {
      const action = parseEntry(name, rest.split(/\s+/).filter(Boolean), today)
      return action ? { kind: 'actions', actions: [action] } : { kind: 'usage', command: name }
    }
    default:
      return { kind: 'unknown' }
  }
}

// ---------- amounts ----------

const PREFIXES: [RegExp, string][] = [
  [/^hk\$/i, 'HKD'],
  [/^us\$/i, 'USD'],
  [/^nt\$/i, 'TWD'],
  [/^s\$/i, 'SGD'],
  [/^a\$/i, 'AUD'],
  [/^c\$/i, 'CAD'],
  [/^\$/, 'USD'],
  [/^[¥￥]/, 'JPY'],
  [/^€/, 'EUR'],
  [/^£/, 'GBP'],
  [/^₩/, 'KRW']
]
const SUFFIXES: [RegExp, string][] = [
  [/円$/, 'JPY'],
  [/(?:元|块)$/, 'CNY']
]
/** Currency codes accepted in lowercase too. Others need capitals, so words like "top" or "cup" stay words. */
const COMMON = new Set(['USD', 'JPY', 'HKD', 'EUR', 'GBP', 'CNY', 'TWD', 'KRW', 'SGD', 'AUD', 'CAD', 'CHF'])

const isCode = (tok: string | undefined) => !!tok && /^[A-Za-z]{3}$/.test(tok) && (tok === tok.toUpperCase() || COMMON.has(tok.toUpperCase()))

/** A number like 1200, 1,200 or 12.5. */
function number(tok: string): number | null {
  const s = tok.normalize('NFKC')
  if (!/^(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/.test(s)) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

interface Money {
  amount: number
  currency?: string
  /** Tokens used. */
  used: number
}

/** Reads an amount from the start of `tokens`: "1200", "¥1200", "1200円", "1200jpy", "USD 700", "700 USD". */
function money(tokens: string[]): Money | null {
  let i = 0
  let currency: string | undefined
  if (isCode(tokens[0]) && tokens[1]) {
    currency = tokens[0].toUpperCase()
    i = 1
  }
  let tok = (tokens[i] ?? '').normalize('NFKC')
  for (const [re, c] of PREFIXES) {
    if (re.test(tok)) {
      currency ??= c
      tok = tok.replace(re, '')
      break
    }
  }
  for (const [re, c] of SUFFIXES) {
    if (re.test(tok)) {
      currency ??= c
      tok = tok.replace(re, '')
      break
    }
  }
  const glued = tok.match(/^(.*\d)([A-Za-z]{3})$/)
  if (glued && isCode(glued[2])) {
    currency ??= glued[2].toUpperCase()
    tok = glued[1]
  }
  const amount = number(tok)
  if (amount == null) return null
  i++
  if (!currency && isCode(tokens[i])) {
    currency = tokens[i].toUpperCase()
    i++
  }
  return { amount, currency, used: i }
}

// ---------- dates ----------

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "today", "yesterday", "2026-10-24", "10-24", "10/24" or a day of this month ("24"). */
export function parseDate(words: string[], today: string): string | null {
  const w = words.join(' ').trim().toLowerCase()
  if (w === 'today') return today
  if (w === 'yesterday') return shiftDay(today, -1)
  let m = w.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  const year = today.slice(0, 4)
  const month = today.slice(5, 7)
  let iso: string | null = null
  if (m) iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  else if ((m = w.match(/^(\d{1,2})[-/.](\d{1,2})$/))) iso = `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  else if ((m = w.match(/^(\d{1,2})$/))) iso = `${year}-${month}-${m[1].padStart(2, '0')}`
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) ? iso : null
}

// ---------- entries ----------

/** Splits words at keywords: "lunch from Daily card Visa" → head ["lunch"], from ["Daily"], card ["Visa"]. */
function split(tokens: string[], keywords: string[]): { head: string[]; parts: Record<string, string[]> } {
  const head: string[] = []
  const parts: Record<string, string[]> = {}
  let current: string[] = head
  for (const tok of tokens) {
    const k = tok.toLowerCase()
    if (keywords.includes(k)) {
      current = parts[k] = []
      continue
    }
    current.push(tok)
  }
  return { head, parts }
}

const joined = (words: string[] | undefined) => (words?.length ? words.join(' ') : undefined)

/** Pulls "#food" out of the note words. */
function tags(words: string[]): { note?: string; category?: string } {
  const tag = words.find((w) => /^#\S/.test(w))
  return { note: joined(words.filter((w) => !/^#\S/.test(w))), category: tag?.slice(1) }
}

function parseEntry(name: EntryCommand, tokens: string[], today: string): Action | null {
  if (name === 'buy' || name === 'sell') return parseTrade(name, tokens, today)

  const m = money(tokens)
  if (!m) return null
  const rest = tokens.slice(m.used)

  if (name === 'move') {
    const { parts } = split(rest, ['from', 'to'])
    const from = joined(parts.from)
    const to = joined(parts.to)
    return from && to ? { type: 'move', amount: m.amount, currency: m.currency, from, to } : null
  }

  const keywords = name === 'spend' ? ['from', 'card', 'on'] : ['to', 'into', 'on']
  const { head, parts } = split(rest, keywords)
  let date: string | undefined
  if (parts.on) {
    const d = parseDate(parts.on, today)
    if (!d) return null
    date = d
  }
  const { note, category } = tags(head)
  if (name === 'spend') {
    if ('from' in parts && !parts.from.length) return null
    if ('card' in parts && !parts.card.length) return null
    return { type: 'spend', amount: m.amount, currency: m.currency, category, note, from: joined(parts.from), card: joined(parts.card), date }
  }
  const to = parts.to ?? parts.into
  if (to && !to.length) return null
  return { type: 'income', amount: m.amount, currency: m.currency, category, note, to: joined(to), date }
}

function parseTrade(side: 'buy' | 'sell', tokens: string[], today: string): Action | null {
  const { head, parts } = split(tokens, ['at', 'fee', 'for', 'from', 'to', 'on'])
  let currency: string | undefined
  const amountOf = (words: string[] | undefined): number | undefined | null => {
    if (!words) return undefined
    const m = money(words)
    if (!m || m.used !== words.length) return null
    currency ??= m.currency
    return m.amount
  }
  const price = amountOf(parts.at)
  const fee = amountOf(parts.fee)
  const total = amountOf(parts.for)
  if (price === null || fee === null || total === null) return null

  // "3 VWRA" or just "VWRA" when the total is given with "for".
  const quantity = head.length > 1 ? number(head[0]) : null
  const holding = joined(quantity != null ? head.slice(1) : head)
  if (!holding || (quantity == null && total == null)) return null

  let date: string | undefined
  if (parts.on) {
    const d = parseDate(parts.on, today)
    if (!d) return null
    date = d
  }
  const cash = joined(side === 'buy' ? parts.from ?? parts.to : parts.to ?? parts.from)
  return { type: side, holding, quantity: quantity ?? undefined, total, price, fee, currency, cash, date }
}
