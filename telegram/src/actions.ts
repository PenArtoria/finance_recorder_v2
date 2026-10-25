// What the bot can record, and how each entry changes your data. The changes go
// through Moneta's own logic (../windows/src/renderer/src/core), so balances, linked
// buckets, card budgets and average costs come out exactly as if you had used the app.
//
// An entry goes through three steps:
//   validateActions  checks the shape of what a command or the AI produced,
//   plan             turns names into ids, fills in defaults and describes the result,
//   apply            changes the data (and returns what `undo` needs to reverse it).

import type { AppData, AssetType, CreditCard, Expense, Holding, MoneySource, Quote, Trade } from '@shared/types'
import { ratesOf } from '../../windows/src/renderer/src/core/calc'
import { payCard, owedOn, removePayment, statementsOf } from '../../windows/src/renderer/src/core/cards'
import { bankAccounts, linkedAccount, moveMoney, parseSourceKey, sourceCurrency, sourceExists } from '../../windows/src/renderer/src/core/cash'
import { uid } from '../../windows/src/renderer/src/core/data'
import { convert, formatMoney, formatPrice, formatQty, type Rates } from '../../windows/src/renderer/src/core/money'
import { applyExpense, categoryLabel, frequentCurrencies, INCOME_CATEGORIES, SPEND_CATEGORIES, type SpendCategory } from '../../windows/src/renderer/src/core/spending'
import { isUnits, isValued, syncHolding } from '../../windows/src/renderer/src/core/trades'
import { BotError } from './env'
import { esc, incomeCard, moveCard, setCard, spendCard, tradeCard, type Strings } from './i18n'

/** Written in place of a bucket or account: the money isn't tracked in Moneta. */
export const NONE = 'none'

// Where money comes from or goes is a reference: a name ("Daily"), or once planned,
// a source key ("bucket:<id>", "account:<id>") or NONE.

export interface SpendAction {
  type: 'spend'
  amount: number
  currency?: string
  category?: string
  note?: string
  from?: string
  /** Credit card name or id. */
  card?: string
  /** YYYY-MM-DD */
  date?: string
}

export interface IncomeAction {
  type: 'income'
  amount: number
  currency?: string
  category?: string
  note?: string
  to?: string
  date?: string
}

export interface MoveAction {
  type: 'move'
  amount: number
  currency?: string
  from: string
  to: string
}

export interface TradeAction {
  type: 'buy' | 'sell'
  /** Symbol or name of a holding you have, or for a buy, the ticker of a new one. */
  holding: string
  quantity?: number
  /** Total paid (buy, fees included) or received (sell, after fees). */
  total?: number
  /** Price per unit. Defaults to the last price Moneta fetched. */
  price?: number
  fee?: number
  /** Currency of total, price and fee. Defaults to the holding's. */
  currency?: string
  /** Where the money came from (buy) or went (sell). */
  cash?: string
  date?: string
  /** Sell: every unit you hold. */
  all?: boolean
  /** For a buy of something not in your holdings yet: what Yahoo Finance found for `holding`. */
  candidates?: Candidate[]
}

/** A ticker found on Yahoo Finance, with its current quote, that a buy can add as a new holding. */
export interface Candidate {
  symbol: string
  name: string
  type: AssetType
  exchange: string
  quote: Quote
}

/** `holding` of a planned buy that adds a new holding: this, then the symbol. */
const NEW = 'new:'

/**
 * Says what a balance is now: a bank account, bucket or asset, or what a credit card owes.
 * For when an entry was forgotten and the number in Moneta is out of date.
 */
export interface SetAction {
  type: 'set'
  /** Bank account, bucket, asset or card. Planned: a source key or "card:<id>". */
  target: string
  /** The balance now, or what the card owes now. */
  amount: number
  currency?: string
  /** Set when planned: the day a card correction is dated. */
  date?: string
}

export type Action = SpendAction | IncomeAction | MoveAction | TradeAction | SetAction

/** `target` of a planned card correction: this, then the card's id. */
const CARD = 'card:'

/** A question the bot has to ask before it can go on, answered with a button. */
export interface Ask {
  index: number
  field: 'from' | 'to' | 'cash' | 'card' | 'holding' | 'target'
  /** HTML. */
  question: string
  options: { ref: string; label: string }[]
}

/** What `undo` needs to reverse an applied entry. */
export type Step =
  | { type: 'expense'; id: string }
  | { type: 'trade'; holding: string; trade: string; created?: boolean }
  | { type: 'move'; from: MoneySource; out: number; to: MoneySource; in: number }
  /** A balance set directly: undo takes `delta` off again, keeping anything changed since. */
  | { type: 'set'; source: MoneySource; delta: number }
  /** A card owing less: the correction payments. */
  | { type: 'payments'; card: string; ids: string[] }

export const MAX_ACTIONS = 10
const MAX_OPTIONS = 12

// ---------- validation ----------

const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined)
const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e12 ? v : undefined)
const notNegative = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e12 ? v : undefined)
const code = (v: unknown) => (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined)
const day = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  // Rejects dates that don't exist, such as 2026-02-30.
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) ? v : undefined
}

/** Checks entries from a command or the AI. Anything unexpected is rejected rather than guessed. */
export function validateActions(raw: unknown): Action[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ACTIONS) throw new BotError('badAction')
  return raw.map(validateOne)
}

function validateOne(r: any): Action {
  const bad = new BotError('badAction')
  if (!r || typeof r !== 'object') throw bad
  if (r.type === 'spend' || r.type === 'income') {
    const amount = positive(r.amount)
    if (!amount) throw bad
    const common = { amount, currency: code(r.currency), category: text(r.category, 40), note: text(r.note), date: day(r.date) }
    return r.type === 'spend' ? { type: 'spend', ...common, from: text(r.from), card: text(r.card) } : { type: 'income', ...common, to: text(r.to) }
  }
  if (r.type === 'move') {
    const amount = positive(r.amount)
    const from = text(r.from)
    const to = text(r.to)
    if (!amount || !from || !to) throw bad
    return { type: 'move', amount, currency: code(r.currency), from, to }
  }
  if (r.type === 'set') {
    const target = text(r.target)
    const amount = notNegative(r.amount)
    if (!target || amount === undefined) throw bad
    return { type: 'set', target, amount, currency: code(r.currency) }
  }
  if (r.type === 'buy' || r.type === 'sell') {
    const holding = text(r.holding, 80)
    if (!holding) throw bad
    return {
      type: r.type,
      holding,
      quantity: positive(r.quantity),
      all: r.type === 'sell' && r.all === true ? true : undefined,
      total: positive(r.total),
      price: positive(r.price),
      fee: positive(r.fee),
      currency: code(r.currency),
      cash: text(r.cash),
      date: day(r.date)
    }
  }
  throw bad
}

// ---------- finding buckets, accounts, holdings and cards by name ----------

interface Option {
  ref: string
  label: string
  names: string[]
  /** A bank account (not a bucket or other asset), with its currency. */
  bank?: string
  /** A credit card. */
  card?: boolean
}

/** Words for "a bank account" rather than a name: "the bank", "my account", "銀行", "戶口"… */
const BANK_WORDS =
  /^(?:(?:the|my|our)\s+)?(?:bank|bank account|bank acc|account|acc|checking|savings)$|^(?:銀行|銀行口座|口座|普通預金|銀行戶口|銀行帳戶|戶口|户口|银行|银行账户|账户|帳戶)$/

/** Words for "my credit card" rather than its name. */
const CARD_WORDS = /^(?:(?:the|my)\s+)?(?:card|credit card|cc|card bill|credit card bill)$|^(?:カード|クレジットカード|クレカ|信用卡|卡)$/

/** Lowercase, full-width letters made normal (Ｄａｉｌｙ → daily), punctuation as spaces. */
const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_\-–—·・.,'’"“”「」()（）]+/g, ' ')
    .trim()

type Found = { ref: string } | { options: Option[] } | null

function find(query: string, options: Option[]): Found {
  const raw = query.trim()
  const byRef = options.find((o) => o.ref === raw || o.ref.slice(o.ref.indexOf(':') + 1) === raw)
  if (byRef) return { ref: byRef.ref }
  const q = norm(raw)
  if (!q) return null
  const pick = (list: Option[]): Found => (list.length === 1 ? { ref: list[0].ref } : list.length > 1 ? { options: list } : null)
  const exact = options.filter((o) => o.names.some((n) => norm(n) === q))
  if (exact.length) return pick(exact)
  return pick(
    options.filter((o) =>
      o.names.some((n) => {
        const m = norm(n)
        return m.length > 0 && (m.includes(q) || (m.length >= 2 && q.includes(m)))
      })
    )
  )
}

/** Buckets, bank accounts (their unassigned money) and, for money coming in, assets such as a pension. */
export function moneyOptions(data: AppData, opts: { bucketsOnly?: boolean; assets?: boolean } = {}): Option[] {
  const out: Option[] = data.buckets.map((b) => {
    const a = linkedAccount(data, b)
    return { ref: `bucket:${b.id}`, label: a ? `${b.name} · ${a.name}` : b.name, names: [b.name] }
  })
  if (opts.bucketsOnly) return out
  for (const a of bankAccounts(data)) out.push({ ref: `account:${a.id}`, label: a.name, names: [a.name, a.account ?? ''], bank: a.currency })
  if (opts.assets) for (const h of data.holdings.filter((x) => isValued(x.type))) out.push({ ref: `account:${h.id}`, label: h.name, names: [h.name] })
  return out
}

export function holdingOptions(data: AppData): Option[] {
  return data.holdings
    .filter((h) => isUnits(h.type))
    .map((h) => ({ ref: h.id, label: h.symbol || h.name, names: [h.symbol, h.symbol.split(/[.\-=]/)[0], h.name] }))
}

/** Whether a name or symbol points at a holding you have (one, or several to choose from). */
export function hasHolding(data: AppData, query: string): boolean {
  return find(query, holdingOptions(data)) !== null
}

export function cardOptions(data: AppData): Option[] {
  return data.cards.map((c) => ({ ref: c.id, label: c.name, names: [c.name, c.issuer ?? ''], card: true }))
}

/** What a balance can be set on: buckets, bank accounts, assets such as a pension, and cards. */
export function setOptions(data: AppData): Option[] {
  return [...moneyOptions(data, { assets: true }), ...data.cards.map((c) => ({ ref: CARD + c.id, label: `💳 ${c.name}`, names: [c.name, c.issuer ?? ''], card: true }))]
}

/** Thrown while planning when the bot has to ask which one was meant. */
class NeedChoice {
  constructor(public ask: Ask) {}
}

interface PickContext {
  index: number
  field: Ask['field']
  t: Strings
  /** The entry's currency, to choose between bank accounts. */
  currency?: string
}

/** The ref a name points to. Several matches, or none, become a question with buttons. */
function pickRef(query: string, options: Option[], c: PickContext): string {
  const found = find(query, options)
  if (found && 'ref' in found) return found.ref
  // "From the bank": the bank account, or the one in the entry's currency.
  const banks = options.filter((o) => o.bank)
  if (banks.length && BANK_WORDS.test(norm(query))) {
    const same = banks.filter((o) => o.bank === c.currency)
    if (same.length === 1) return same[0].ref
    const list = same.length ? same : banks
    if (list.length === 1) return list[0].ref
    throw new NeedChoice({ index: c.index, field: c.field, question: esc(c.t.whichBank), options: list.slice(0, MAX_OPTIONS).map(({ ref, label }) => ({ ref, label })) })
  }
  // "My card": the credit card, if there's one.
  const cards = options.filter((o) => o.card)
  if (cards.length && CARD_WORDS.test(norm(query))) {
    if (cards.length === 1) return cards[0].ref
    throw new NeedChoice({ index: c.index, field: c.field, question: esc(c.t.whichCard), options: cards.slice(0, MAX_OPTIONS).map(({ ref, label }) => ({ ref, label })) })
  }
  if (!found && c.field === 'holding') {
    // The bot can't add a holding: that needs the symbol, type and currency.
    throw new BotError('noHolding', { query: esc(query), names: esc(options.map((o) => o.label).slice(0, MAX_OPTIONS).join(', ')) })
  }
  const list = found ? found.options : options
  if (!list.length) throw new BotError('badAction')
  throw new NeedChoice({
    index: c.index,
    field: c.field,
    question: found ? c.t.whichOne(esc(query)) : c.t.cantFind(esc(query)),
    options: list.slice(0, MAX_OPTIONS).map(({ ref, label }) => ({ ref, label }))
  })
}

function askFor(options: Option[], none: string, c: PickContext, question: string): string {
  if (!options.length) return NONE
  throw new NeedChoice({
    index: c.index,
    field: c.field,
    question: esc(question),
    options: [...options.slice(0, MAX_OPTIONS).map(({ ref, label }) => ({ ref, label })), { ref: NONE, label: none }]
  })
}

// ---------- defaults: "same as last time" ----------

const keyOf = (s: MoneySource) => `${s.kind}:${s.id}`

/** The most recently created item. On a tie the later one in the list wins, since new entries are appended. */
function newest<T>(list: T[], createdAt: (x: T) => number): T | undefined {
  let best: T | undefined
  for (const x of list) if (best === undefined || createdAt(x) >= createdAt(best)) best = x
  return best
}

function lastSpend(data: AppData): { from?: string; card?: string } | null {
  const e = newest(
    data.expenses.filter((x) => (x.kind ?? 'spend') === 'spend' && (x.source ? sourceExists(data, x.source) : !!x.cardId)),
    (x) => x.createdAt
  )
  if (!e) return null
  const card = e.cardId && data.cards.some((c) => c.id === e.cardId) ? e.cardId : undefined
  return { from: e.source ? keyOf(e.source) : NONE, card }
}

/** The currency of your last spending (or income), as Moneta remembers it; else your most used one. */
function usualCurrency(data: AppData, kind: 'spend' | 'income'): string | undefined {
  const e = newest(
    data.expenses.filter((x) => (x.kind ?? 'spend') === kind),
    (x) => x.createdAt
  )
  return e?.currency ?? frequentCurrencies(data)[0]
}

function lastCardBucket(data: AppData, cardId: string): string | undefined {
  const e = newest(
    data.expenses.filter((x) => x.cardId === cardId && x.source?.kind === 'bucket' && sourceExists(data, x.source)),
    (x) => x.createdAt
  )
  return e?.source ? keyOf(e.source) : undefined
}

function lastIncome(data: AppData): string | undefined {
  const e = newest(
    data.expenses.filter((x) => x.kind === 'income' && x.source && sourceExists(data, x.source)),
    (x) => x.createdAt
  )
  return e?.source ? keyOf(e.source) : undefined
}

/** The account used for this holding's last trade, else for the last trade of any holding. */
function lastTradeCash(data: AppData, holdingId: string): string | undefined {
  const used = data.holdings.flatMap((h) => (h.trades ?? []).filter((t) => t.cash && sourceExists(data, t.cash)).map((t) => ({ h, t })))
  const hit = newest(
    used.filter(({ h }) => h.id === holdingId),
    ({ t }) => t.createdAt
  ) ?? newest(used, ({ t }) => t.createdAt)
  return hit?.t.cash ? keyOf(hit.t.cash) : undefined
}

// ---------- planning ----------

function category(input: string | undefined, list: SpendCategory[], fallback: string): string {
  if (!input) return fallback
  const q = norm(input)
  const hit =
    list.find((c) => c.key === q || norm(c.label) === q) ??
    (q.length >= 3 ? list.find((c) => norm(c.label).split(' ').some((w) => w.startsWith(q))) : undefined)
  return hit?.key ?? fallback
}

function checkRate(from: string, to: (string | null | undefined)[], rates: Rates) {
  for (const c of to) {
    if (c && c !== from && convert(1, from, c, rates) == null) throw new BotError('noRate', { currency: esc(rates[from] ? c : from) })
  }
}

function holdingCurrency(data: AppData, h: Holding): string {
  return h.symbol ? data.quotes[h.symbol]?.currency ?? h.currency : h.currency
}

function livePrice(data: AppData, h: Holding): number | null {
  const p = h.symbol ? data.quotes[h.symbol]?.price : h.manualPrice
  return p != null && p > 0 ? p : null
}

function resolve(data: AppData, a: Action, index: number, today: string, t: Strings): Action {
  const rates = ratesOf(data)
  const base = data.settings.baseCurrency
  const at = { index, t }

  if (a.type === 'spend') {
    let { from, card } = a
    if (!from && !card) ({ from, card } = lastSpend(data) ?? {})
    let theCard: CreditCard | undefined
    if (card && card !== NONE) {
      const id = pickRef(card, cardOptions(data), { ...at, field: 'card' })
      theCard = data.cards.find((c) => c.id === id)
    }
    // A card charge: the bucket this card's last charge used, or no bucket.
    if (!from && theCard) from = lastCardBucket(data, theCard.id) ?? NONE
    if (!from) from = askFor(moneyOptions(data), t.notTracked, { ...at, field: 'from' }, t.askFrom)
    else if (from !== NONE) from = pickRef(from, moneyOptions(data), { ...at, field: 'from', currency: a.currency })
    // A card charge only lowers a bucket's budget; the bank pays the bill later.
    if (theCard && from.startsWith('account:')) from = NONE
    const srcCcy = sourceCurrency(data, parseSourceKey(from))
    // A named card or account sets the currency; otherwise it's the one you used last, as in Moneta.
    const named = (a.card && a.card !== NONE ? theCard?.currency : undefined) ?? (a.from && a.from !== NONE ? srcCcy : undefined)
    const currency = a.currency ?? named ?? usualCurrency(data, 'spend') ?? theCard?.currency ?? srcCcy ?? base
    checkRate(currency, [srcCcy, theCard?.currency], rates)
    return {
      type: 'spend',
      amount: a.amount,
      currency,
      category: category(a.category, SPEND_CATEGORIES, 'other'),
      note: a.note,
      from,
      card: theCard?.id,
      date: a.date ?? today
    }
  }

  if (a.type === 'income') {
    let to = a.to ?? lastIncome(data)
    if (!to) to = askFor(moneyOptions(data, { assets: true }), t.notTracked, { ...at, field: 'to' }, t.askTo)
    else if (to !== NONE) to = pickRef(to, moneyOptions(data, { assets: true }), { ...at, field: 'to', currency: a.currency })
    const destCcy = sourceCurrency(data, parseSourceKey(to))
    const currency = a.currency ?? (a.to && a.to !== NONE ? destCcy : undefined) ?? usualCurrency(data, 'income') ?? destCcy ?? base
    checkRate(currency, [destCcy], rates)
    return {
      type: 'income',
      amount: a.amount,
      currency,
      category: category(a.category, INCOME_CATEGORIES, 'other-in'),
      note: a.note,
      to,
      date: a.date ?? today
    }
  }

  if (a.type === 'move') {
    const from = pickRef(a.from, moneyOptions(data), { ...at, field: 'from', currency: a.currency })
    const to = pickRef(a.to, moneyOptions(data, { assets: true }), { ...at, field: 'to', currency: a.currency })
    if (from === to) throw new BotError('sameSource')
    const fromCcy = sourceCurrency(data, parseSourceKey(from))
    const toCcy = sourceCurrency(data, parseSourceKey(to))
    const currency = a.currency ?? fromCcy ?? base
    checkRate(currency, [fromCcy, toCcy], rates)
    return { type: 'move', amount: a.amount, currency, from, to }
  }

  if (a.type === 'set') {
    const target = pickRef(a.target, setOptions(data), { ...at, field: 'target', currency: a.currency })
    const card = target.startsWith(CARD) ? data.cards.find((c) => CARD + c.id === target) : undefined
    const ccy = card ? card.currency : sourceCurrency(data, parseSourceKey(target))
    const currency = a.currency ?? ccy ?? base
    checkRate(currency, [ccy], rates)
    return { type: 'set', target, amount: a.amount, currency, date: today }
  }

  // buy or sell: of a holding you have, or a buy that adds a new one
  let h: Holding | undefined
  let create: Candidate | undefined
  if (a.type === 'buy' && (a.holding.startsWith(NEW) || !hasHolding(data, a.holding))) {
    if (!a.candidates?.length) throw new BotError('noSymbol', { query: esc(a.holding.replace(NEW, '')) })
    create = pickCandidate(a, index, t)
    // The same ticker may be held already, under a name that didn't match.
    h = data.holdings.find((x) => isUnits(x.type) && x.symbol.toUpperCase() === create!.symbol.toUpperCase())
    if (h) create = undefined
  } else {
    const id = pickRef(a.holding, holdingOptions(data), { ...at, field: 'holding' })
    h = data.holdings.find((x) => x.id === id)!
  }
  const label = h ? h.symbol || h.name : create!.symbol
  const hc = h ? holdingCurrency(data, h) : create!.quote.currency
  const given = a.currency ?? hc
  checkRate(given, [hc], rates)
  const inHolding = (v: number | undefined) => (v == null ? undefined : convert(v, given, hc, rates)!)
  const fee = inHolding(a.fee) ?? 0
  const sign = a.type === 'buy' ? 1 : -1
  let quantity: number
  let total: number
  let price: number
  const wanted = a.quantity ?? (a.type === 'sell' && a.all && h ? h.quantity : undefined)
  if (wanted && a.total) {
    quantity = wanted
    total = inHolding(a.total)!
    price = (total - sign * fee) / quantity
  } else {
    const p = inHolding(a.price) ?? (h ? livePrice(data, h) : create!.quote.price || null)
    if (!p) throw new BotError('noPrice', { holding: esc(label) })
    price = p
    if (wanted) {
      quantity = wanted
      total = quantity * price + sign * fee
    } else if (a.total) {
      total = inHolding(a.total)!
      quantity = +((total - sign * fee) / price).toPrecision(10)
    } else throw new BotError('needQuantity')
  }
  if (!(quantity > 0) || !(total > 0)) throw new BotError('needQuantity')
  if (a.type === 'sell' && h && quantity > h.quantity + 1e-9) throw new BotError('notEnoughUnits', { have: formatQty(h.quantity), holding: esc(label) })

  let cash = a.cash ?? lastTradeCash(data, h?.id ?? '')
  if (!cash) cash = askFor(moneyOptions(data), t.noCash, { ...at, field: 'cash' }, t.askCash(a.type))
  else if (cash !== NONE) cash = pickRef(cash, moneyOptions(data), { ...at, field: 'cash', currency: given })
  checkRate(hc, [sourceCurrency(data, parseSourceKey(cash))], rates)

  return {
    type: a.type,
    holding: h ? h.id : NEW + create!.symbol,
    ...(create ? { candidates: [create] } : {}),
    quantity,
    total: +total.toFixed(8),
    price: +price.toPrecision(10),
    fee: fee || undefined,
    currency: hc,
    cash,
    date: a.date ?? today
  }
}

/** The ticker a buy of something new means. Several close matches become a question. */
function pickCandidate(a: TradeAction, index: number, t: Strings): Candidate {
  const list = a.candidates ?? []
  const chosen = list.find((c) => NEW + c.symbol === a.holding)
  if (chosen) return chosen
  const q = norm(a.holding)
  const exact = list.filter((c) => norm(c.symbol) === q)
  if (exact.length === 1) return exact[0]
  const base = list.filter((c) => norm(c.symbol.split(/[.\-=]/)[0]) === q)
  if (base.length === 1) return base[0]
  if (list.length === 1) return list[0]
  throw new NeedChoice({
    index,
    field: 'holding',
    question: t.whichStock(esc(a.holding)),
    options: list.slice(0, MAX_OPTIONS).map((c) => ({ ref: NEW + c.symbol, label: `${c.symbol} · ${c.name.slice(0, 40)}${c.exchange ? ` (${c.exchange})` : ''}` }))
  })
}

export type Planned = { actions: Action[]; lines: string[]; ask?: undefined } | { actions: Action[]; ask: Ask; lines?: undefined }

/**
 * Resolves names and defaults, tries the entries on a copy of the data and describes
 * them (HTML). Returns a question instead when something is unclear.
 */
export function plan(data: AppData, input: Action[], today: string, t: Strings): Planned {
  const actions: Action[] = []
  for (let i = 0; i < input.length; i++) {
    try {
      actions.push(resolve(data, input[i], i, today, t))
    } catch (err) {
      if (err instanceof NeedChoice) return { actions: [...actions, ...input.slice(i)], ask: err.ask }
      throw err
    }
  }
  return { actions, lines: run(structuredClone(data), actions, today, t).lines }
}

/** Sets the answer to a question on the entry it was about. */
export function answer(actions: Action[], ask: Ask, ref: string): Action[] {
  return actions.map((a, i) => (i === ask.index ? ({ ...a, [ask.field]: ref } as Action) : a))
}

// ---------- applying and undoing ----------

function sourceOf(d: AppData, ref: string | undefined): MoneySource | null {
  if (!ref || ref === NONE) return null
  const s = parseSourceKey(ref)
  if (!s || !sourceExists(d, s)) throw new BotError('gone')
  return s
}

/**
 * Applies planned entries one by one and describes each (HTML) with the balance left
 * after it. Throws if something they use was deleted since planning.
 */
export function run(draft: AppData, actions: Action[], today: string, t: Strings, now = Date.now()): { steps: Step[]; lines: string[] } {
  const steps: Step[] = []
  const lines: string[] = []
  actions.forEach((a, i) => {
    const step = applyOne(draft, a, now + i)
    steps.push(step)
    lines.push(describe(draft, a, step, today, t))
  })
  return { steps, lines }
}

/** A bucket's amount, an account's balance or an asset's value, in its currency. */
function balanceValue(d: AppData, s: MoneySource): number {
  if (s.kind === 'bucket') return d.buckets.find((b) => b.id === s.id)?.amount ?? 0
  const h = d.holdings.find((x) => x.id === s.id)
  return h ? (isValued(h.type) ? h.manualPrice ?? 0 : h.quantity) : 0
}

/** Changes one balance only. Unlike moveMoney, a bucket's bank account stays as it is. */
function adjustBalance(d: AppData, s: MoneySource, delta: number) {
  const fix = (n: number) => +n.toFixed(8)
  if (s.kind === 'bucket') {
    const b = d.buckets.find((x) => x.id === s.id)
    if (b) b.amount = fix(b.amount + delta)
    return
  }
  const h = d.holdings.find((x) => x.id === s.id)
  if (!h) return
  if (isValued(h.type)) h.manualPrice = fix((h.manualPrice ?? 0) + delta)
  else h.quantity = fix(h.quantity + delta)
}

function applySet(d: AppData, a: SetAction, now: number, rates: Rates): Step {
  if (a.target.startsWith(CARD)) {
    const card = d.cards.find((c) => CARD + c.id === a.target)
    if (!card) throw new BotError('gone')
    const target = convert(a.amount, a.currency!, card.currency, rates)
    if (target == null) throw new BotError('noRate', { currency: esc(a.currency!) })
    const delta = +(target - owedOn(d, card, rates)).toFixed(8)
    if (delta > 0.005) {
      // Owing more: the forgotten spending, as one card charge.
      const e: Expense = {
        id: uid('e'),
        date: a.date!,
        amount: delta,
        currency: card.currency,
        category: 'other',
        note: CORRECTION_NOTE,
        source: null,
        cardId: card.id,
        cardAmount: delta,
        createdAt: now
      }
      const usd = convert(delta, card.currency, 'USD', rates)
      if (usd != null) e.usd = +usd.toFixed(6)
      d.expenses = [...d.expenses, e]
      return { type: 'expense', id: e.id }
    }
    const ids: string[] = []
    if (delta < -0.005) {
      // Owing less: payments that no bank account made, oldest bill first.
      let left = -delta
      for (const st of statementsOf(d, card, rates, a.date).filter((x) => x.remaining > 0.005).reverse()) {
        if (left <= 0.005) break
        const p = payCard(d, card.id, { date: a.date!, amount: Math.min(left, st.remaining), fromAccountId: null, statement: st.close }, rates, uid('p'))
        if (p) {
          ids.push(p.id)
          left = +(left - p.amount).toFixed(8)
        }
      }
    }
    return { type: 'payments', card: card.id, ids }
  }
  const src = sourceOf(d, a.target)!
  const target = convert(a.amount, a.currency!, sourceCurrency(d, src)!, rates)
  if (target == null) throw new BotError('noRate', { currency: esc(a.currency!) })
  const delta = +(target - balanceValue(d, src)).toFixed(8)
  adjustBalance(d, src, delta)
  return { type: 'set', source: src, delta }
}

/** The note on a card charge that a correction adds. Kept in English, like Moneta. */
const CORRECTION_NOTE = 'Balance correction'

function applyOne(d: AppData, a: Action, now: number): Step {
  const rates = ratesOf(d)
  if (a.type === 'set') return applySet(d, a, now, rates)

  if (a.type === 'spend' || a.type === 'income') {
    const src = sourceOf(d, a.type === 'spend' ? a.from : a.to)
    const card = a.type === 'spend' && a.card ? d.cards.find((c) => c.id === a.card) : undefined
    if (a.type === 'spend' && a.card && !card) throw new BotError('gone')
    const e: Expense = {
      id: uid('e'),
      ...(a.type === 'income' ? { kind: 'income' as const } : {}),
      date: a.date!,
      amount: a.amount,
      currency: a.currency!,
      category: a.category!,
      note: a.note || undefined,
      source: src,
      cardId: card?.id ?? null,
      createdAt: now
    }
    const usd = convert(a.amount, a.currency!, 'USD', rates)
    if (usd != null) e.usd = +usd.toFixed(6)
    if (card) e.cardAmount = +(convert(a.amount, a.currency!, card.currency, rates) ?? a.amount).toFixed(6)
    applyExpense(d, e, 1, rates)
    d.expenses = [...d.expenses, e]
    return { type: 'expense', id: e.id }
  }

  if (a.type === 'move') {
    const from = sourceOf(d, a.from)!
    const to = sourceOf(d, a.to)!
    const out = convert(a.amount, a.currency!, sourceCurrency(d, from)!, rates)
    const got = convert(a.amount, a.currency!, sourceCurrency(d, to)!, rates)
    if (out == null || got == null) throw new BotError('noRate', { currency: esc(a.currency!) })
    // Each side moves its own account's balance too, as in Moneta's transfer dialog.
    moveMoney(d, from, -out, rates)
    moveMoney(d, to, got, rates)
    return { type: 'move', from, out, to, in: got }
  }

  let h = d.holdings.find((x) => x.id === a.holding)
  let created = false
  if (!h && a.holding.startsWith(NEW)) {
    const c = a.candidates?.find((x) => NEW + x.symbol === a.holding)
    if (!c) throw new BotError('gone')
    // Added by another device, or by an earlier entry in the same message.
    h = d.holdings.find((x) => isUnits(x.type) && x.symbol.toUpperCase() === c.symbol.toUpperCase())
    if (!h) {
      // Like adding a ticker in Moneta: the holding starts empty and the buy fills it.
      h = { id: uid('h'), symbol: c.symbol, name: c.name, type: c.type, quantity: 0, currency: c.quote.currency, manualPrice: null, trades: [], createdAt: now }
      d.holdings = [...d.holdings, h]
      created = true
    }
    d.quotes[c.symbol] = c.quote
  }
  if (!h) throw new BotError('gone')
  const t: Trade = {
    id: uid('t'),
    date: a.date!,
    side: a.type,
    quantity: a.quantity!,
    amount: a.total!,
    ...(a.fee ? { fee: a.fee } : {}),
    createdAt: now
  }
  const src = sourceOf(d, a.cash)
  if (src) {
    const srcCcy = sourceCurrency(d, src)!
    const amount = convert(a.total!, a.currency!, srcCcy, rates)
    if (amount == null) throw new BotError('noRate', { currency: esc(a.currency!) })
    moveMoney(d, src, a.type === 'buy' ? -amount : amount, rates)
    t.cash = { ...src, amount: +amount.toFixed(8), currency: srcCcy }
  }
  h.trades = [...(h.trades ?? []), t]
  syncHolding(h)
  return { type: 'trade', holding: h.id, trade: t.id, ...(created ? { created: true } : {}) }
}

/** Reverses applied entries. Ones already removed in Moneta are skipped. Returns how many were undone. */
export function undo(d: AppData, steps: Step[]): number {
  const rates = ratesOf(d)
  let done = 0
  for (const s of [...steps].reverse()) {
    if (s.type === 'expense') {
      const e = d.expenses.find((x) => x.id === s.id)
      if (!e) continue
      applyExpense(d, e, -1, rates)
      d.expenses = d.expenses.filter((x) => x.id !== s.id)
    } else if (s.type === 'trade') {
      const h = d.holdings.find((x) => x.id === s.holding)
      const t = h?.trades?.find((x) => x.id === s.trade)
      if (!h || !t) continue
      if (t.cash) moveMoney(d, t.cash, t.side === 'buy' ? t.cash.amount : -t.cash.amount, rates)
      h.trades = h.trades!.filter((x) => x.id !== s.trade)
      syncHolding(h)
      // A holding the bot added goes again when its only trade is undone.
      if (s.created && !h.trades.length) d.holdings = d.holdings.filter((x) => x.id !== h.id)
    } else if (s.type === 'move') {
      moveMoney(d, s.from, s.out, rates)
      moveMoney(d, s.to, -s.in, rates)
    } else if (s.type === 'set') {
      if (!sourceExists(d, s.source)) continue
      adjustBalance(d, s.source, -s.delta)
    } else {
      for (const id of s.ids) removePayment(d, s.card, id)
    }
    done++
  }
  return done
}

// ---------- describing ----------

function balanceOf(d: AppData, src: MoneySource): string | undefined {
  if (src.kind === 'bucket') {
    const b = d.buckets.find((x) => x.id === src.id)
    return b ? formatMoney(b.amount, b.currency) : undefined
  }
  const a = d.holdings.find((x) => x.id === src.id)
  if (!a) return undefined
  return formatMoney(isValued(a.type) ? a.manualPrice ?? 0 : a.quantity, a.currency)
}

export function dateText(iso: string, today: string, t: Strings): string {
  if (iso === today) return t.today
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  if (iso.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric'
  return new Intl.DateTimeFormat(t.locale, opts).format(new Date(`${iso}T00:00:00Z`))
}

/** A bucket with the account it sits in, or an account. */
function placeName(d: AppData, s: MoneySource): string {
  if (s.kind === 'account') return d.holdings.find((h) => h.id === s.id)?.name ?? '?'
  const b = d.buckets.find((x) => x.id === s.id)
  if (!b) return '?'
  const a = linkedAccount(d, b)
  return a ? `${b.name} (${a.name})` : b.name
}

/** One entry as a card (HTML), using the data after it was applied for the balance left. */
function describe(d: AppData, a: Action, step: Step, today: string, t: Strings): string {
  const src = (ref: string | undefined) => (ref && ref !== NONE ? parseSourceKey(ref) : null)
  const label = (s: MoneySource | null) => (s ? esc(placeName(d, s)) : undefined)
  const left = (s: MoneySource | null) => {
    const v = s ? balanceOf(d, s) : undefined
    return v ? esc(v) : undefined
  }

  if (a.type === 'spend') {
    const s = src(a.from)
    return spendCard(t, {
      amount: esc(formatMoney(a.amount, a.currency!)),
      category: esc(categoryLabel(a.category!)),
      note: a.note ? esc(a.note) : undefined,
      from: label(s),
      card: a.card ? esc(d.cards.find((c) => c.id === a.card)?.name ?? '') : undefined,
      date: dateText(a.date!, today, t),
      left: left(s)
    })
  }
  if (a.type === 'income') {
    const s = src(a.to)
    return incomeCard(t, {
      amount: esc(formatMoney(a.amount, a.currency!)),
      category: esc(categoryLabel(a.category!)),
      note: a.note ? esc(a.note) : undefined,
      to: label(s),
      date: dateText(a.date!, today, t),
      left: left(s)
    })
  }
  if (a.type === 'set') return describeSet(d, a, step, t)
  if (a.type === 'move') {
    const to = src(a.to)!
    const toCcy = sourceCurrency(d, to)
    const got = toCcy && toCcy !== a.currency ? convert(a.amount, a.currency!, toCcy, ratesOf(d)) : null
    return moveCard(t, {
      amount: esc(formatMoney(a.amount, a.currency!)),
      from: label(src(a.from))!,
      to: label(to)!,
      received: got != null ? esc(formatMoney(got, toCcy!)) : undefined
    })
  }
  const h = d.holdings.find((x) => x.id === a.holding) ?? d.holdings.find((x) => NEW + x.symbol === a.holding)!
  const s = src(a.cash)
  return tradeCard(t, {
    newName: a.holding.startsWith(NEW) ? esc(h.name) : undefined,
    side: a.type,
    quantity: esc(formatQty(a.quantity!)),
    holding: esc(h.symbol || h.name),
    price: esc(formatPrice(a.price!, a.currency!)),
    fee: a.fee ? esc(formatMoney(a.fee, a.currency!)) : undefined,
    total: esc(formatMoney(a.total!, a.currency!)),
    cash: label(s),
    date: dateText(a.date!, today, t),
    left: left(s)
  })
}

function describeSet(d: AppData, a: SetAction, step: Step, t: Strings): string {
  const rates = ratesOf(d)
  if (a.target.startsWith(CARD)) {
    const card = d.cards.find((c) => CARD + c.id === a.target)!
    const now = owedOn(d, card, rates)
    const delta =
      step.type === 'expense'
        ? d.expenses.find((e) => e.id === step.id)?.cardAmount ?? 0
        : step.type === 'payments'
          ? -card.payments.filter((p) => step.ids.includes(p.id)).reduce((s, p) => s + p.amount, 0)
          : 0
    return setCard(t, {
      name: esc(`💳 ${card.name}`),
      was: esc(formatMoney(now - delta, card.currency)),
      now: esc(formatMoney(now, card.currency)),
      change: Math.abs(delta) > 0.005 ? esc(formatMoney(delta, card.currency, { sign: true })) : undefined,
      owed: true,
      note: delta > 0.005 ? t.setNotes.charge : delta < -0.005 ? t.setNotes.payment : t.setNotes.same
    })
  }
  const s = parseSourceKey(a.target)!
  const ccy = sourceCurrency(d, s)!
  const delta = step.type === 'set' ? step.delta : 0
  const now = balanceValue(d, s)
  const b = s.kind === 'bucket' ? d.buckets.find((x) => x.id === s.id) : undefined
  const account = b ? linkedAccount(d, b) : undefined
  return setCard(t, {
    name: esc(placeName(d, s)),
    was: esc(formatMoney(now - delta, ccy)),
    now: esc(formatMoney(now, ccy)),
    change: Math.abs(delta) > 0.005 ? esc(formatMoney(delta, ccy, { sign: true })) : undefined,
    owed: false,
    note: account ? t.setNotes.bucket(esc(account.name)) : Math.abs(delta) > 0.005 ? undefined : t.setNotes.same
  })
}

/** A planned entry with names instead of ids and no balances, for checking what the bot understood. */
export function summarize(data: AppData, a: Action): Record<string, unknown> {
  const place = (ref: string | undefined) => {
    if (!ref || ref === NONE) return ref
    if (ref.startsWith(CARD)) return data.cards.find((c) => CARD + c.id === ref)?.name ?? ref
    const src = parseSourceKey(ref)
    return src ? placeName(data, src) : ref
  }
  const out: Record<string, unknown> = { ...a }
  if (a.type === 'spend') Object.assign(out, { from: place(a.from), card: a.card && data.cards.find((c) => c.id === a.card)?.name })
  if (a.type === 'income') out.to = place(a.to)
  if (a.type === 'move') Object.assign(out, { from: place(a.from), to: place(a.to) })
  if (a.type === 'set') out.target = place(a.target)
  if (a.type === 'buy' || a.type === 'sell') {
    out.holding = a.holding.startsWith(NEW) ? a.holding : data.holdings.find((h) => h.id === a.holding)?.symbol ?? a.holding
    out.cash = place(a.cash)
    delete out.candidates
  }
  return out
}
