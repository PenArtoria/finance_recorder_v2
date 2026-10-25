// Slash commands, which work without any AI:
//
//   /spend 1200 JPY lunch #food from Daily card Visa on 2026-10-24
//   /income 300000 salary #salary to SMBC
//   /move 700 USD from Wise to IBKR
//   /buy 3 VWRA at 140 fee 2 from IBKR      /buy VWRA for 500 from IBKR
//   /sell 1 RKLB at 70 to IBKR               /sell all RKLB
//   /set SMBC 512300                         /set Visa 45000
//
// Amounts can be written 1200, 1,200, ¥1200, 1200円, 3万, 120k or 1.2m, with a currency
// code (JPY, usd) or word (yen, dollars) before or after.
//
// Keywords are English so they're the same for everyone; names and notes can be in
// any language.

import type { Action } from './actions'

export type EntryCommand = 'spend' | 'income' | 'move' | 'buy' | 'sell' | 'set'

export type Command =
  | { kind: 'help' | 'balances' | 'undo' | 'language' | 'unknown' }
  | { kind: 'month'; arg: string }
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
    case 'language':
    case 'lang':
      return { kind: 'language' }
    case 'month':
    case 'spending':
    case 'summary':
      return { kind: 'month', arg: rest }
    case 'spend':
    case 'income':
    case 'move':
    case 'buy':
    case 'sell':
    case 'set': {
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

/** Currency words after an amount, in the bot's languages. */
const WORDS: Record<string, string> = {
  yen: 'JPY',
  dollar: 'USD',
  dollars: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  pound: 'GBP',
  pounds: 'GBP',
  yuan: 'CNY',
  rmb: 'CNY',
  'ドル': 'USD',
  '美元': 'USD',
  '美金': 'USD',
  '日圓': 'JPY',
  '日元': 'JPY',
  '港幣': 'HKD',
  '港币': 'HKD',
  '港元': 'HKD',
  '人民幣': 'CNY',
  '人民币': 'CNY'
}

const isCode = (tok: string | undefined) => !!tok && /^[A-Za-z]{3}$/.test(tok) && (tok === tok.toUpperCase() || COMMON.has(tok.toUpperCase()))
const currencyWord = (tok: string | undefined) => (tok ? WORDS[tok.toLowerCase()] : undefined)

/** 120k, 1.2m, 3万, 5千, 1億. */
const MULTIPLIERS: Record<string, number> = { k: 1e3, m: 1e6, '千': 1e3, '万': 1e4, '萬': 1e4, '億': 1e8, '亿': 1e8 }

/** A number like 1200, 1,200, 12.5, 120k or 3万. Zero only when `zero` is set. */
function number(tok: string, zero = false): number | null {
  let s = tok.normalize('NFKC')
  let times = 1
  const suffix = s.match(/^(.*\d)(k|m|千|万|萬|億|亿)$/i)
  if (suffix) {
    s = suffix[1]
    times = MULTIPLIERS[suffix[2].toLowerCase()]
  }
  if (!/^(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/.test(s)) return null
  const n = +(Number(s.replace(/,/g, '')) * times).toPrecision(12)
  return Number.isFinite(n) && (n > 0 || (zero && n === 0)) ? n : null
}

interface Money {
  amount: number
  currency?: string
  /** Tokens used. */
  used: number
}

/** Reads an amount from the start of `tokens`: "1200", "¥1200", "1200円", "1200jpy", "USD 700", "700 USD", "700 dollars". */
function money(tokens: string[], zero = false): Money | null {
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
  const amount = number(tok, zero)
  if (amount == null) return null
  i++
  if (!currency && isCode(tokens[i])) {
    currency = tokens[i].toUpperCase()
    i++
  } else if (!currency && currencyWord(tokens[i])) {
    currency = currencyWord(tokens[i])
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
  if (name === 'set') return parseSet(tokens)

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

  // "3 VWRA", "all RKLB" (sell), or just "VWRA" when the total is given with "for".
  const all = side === 'sell' && head.length > 1 && head[0].toLowerCase() === 'all'
  const quantity = head.length > 1 && !all ? number(head[0]) : null
  const holding = joined(quantity != null || all ? head.slice(1) : head)
  if (!holding || (quantity == null && total == null && !all)) return null

  let date: string | undefined
  if (parts.on) {
    const d = parseDate(parts.on, today)
    if (!d) return null
    date = d
  }
  const cash = joined(side === 'buy' ? parts.from ?? parts.to : parts.to ?? parts.from)
  return { type: side, holding, quantity: quantity ?? undefined, all: all || undefined, total, price, fee, currency, cash, date }
}

/** "/set SMBC 512300", "/set Japan trip to 12000 HKD", "/set Visa 0": the name, then the amount. */
function parseSet(tokens: string[]): Action | null {
  for (const n of [2, 1]) {
    if (tokens.length <= n) continue
    const m = money(tokens.slice(-n), true)
    if (!m || m.used !== n) continue
    let name = tokens.slice(0, -n)
    if (name.length > 1 && ['to', 'is', '=', 'now'].includes(name[name.length - 1].toLowerCase())) name = name.slice(0, -1)
    return { type: 'set', target: name.join(' '), amount: m.amount, currency: m.currency }
  }
  return null
}
