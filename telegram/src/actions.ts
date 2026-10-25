// What the bot can record, and how each entry changes your data. The changes go
// through Moneta's own logic (../windows/src/renderer/src/core), so balances, linked
// buckets, card budgets and average costs come out exactly as if you had used the app.
//
// An entry goes through three steps:
//   validateActions  checks the shape of what a command or the AI produced,
//   plan             turns names into ids, fills in defaults and describes the result,
//   apply            changes the data (and returns what `undo` needs to reverse it).

import type { AppData, CreditCard, Expense, Holding, MoneySource, Trade } from '@shared/types'
import { ratesOf } from '../../windows/src/renderer/src/core/calc'
import { bankAccounts, linkedAccount, moveMoney, parseSourceKey, sourceCurrency, sourceExists, sourceLabel, unassignedIn } from '../../windows/src/renderer/src/core/cash'
import { uid } from '../../windows/src/renderer/src/core/data'
import { convert, formatMoney, formatPrice, formatQty, type Rates } from '../../windows/src/renderer/src/core/money'
import { applyExpense, categoryLabel, INCOME_CATEGORIES, SPEND_CATEGORIES, type SpendCategory } from '../../windows/src/renderer/src/core/spending'
import { isUnits, isValued, syncHolding } from '../../windows/src/renderer/src/core/trades'
import { BotError } from './env'
import { esc, type Strings } from './i18n'

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
  /** Symbol or name of a holding you already have. */
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
}

export type Action = SpendAction | IncomeAction | MoveAction | TradeAction

/** A question the bot has to ask before it can go on, answered with a button. */
export interface Ask {
  index: number
  field: 'from' | 'to' | 'cash' | 'card' | 'holding'
  /** HTML. */
  question: string
  options: { ref: string; label: string }[]
}

/** What `undo` needs to reverse an applied entry. */
export type Step =
  | { type: 'expense'; id: string }
  | { type: 'trade'; holding: string; trade: string }
  | { type: 'move'; from: MoneySource; out: number; to: MoneySource; in: number }

export const MAX_ACTIONS = 10
const MAX_OPTIONS = 12

// ---------- validation ----------

const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined)
const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e12 ? v : undefined)
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
  if (r.type === 'buy' || r.type === 'sell') {
    const holding = text(r.holding, 80)
    if (!holding) throw bad
    return {
      type: r.type,
      holding,
      quantity: positive(r.quantity),
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
}

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
  for (const a of bankAccounts(data)) out.push({ ref: `account:${a.id}`, label: a.name, names: [a.name, a.account ?? ''] })
  if (opts.assets) for (const h of data.holdings.filter((x) => isValued(x.type))) out.push({ ref: `account:${h.id}`, label: h.name, names: [h.name] })
  return out
}

export function holdingOptions(data: AppData): Option[] {
  return data.holdings
    .filter((h) => isUnits(h.type))
    .map((h) => ({ ref: h.id, label: h.symbol || h.name, names: [h.symbol, h.symbol.split(/[.\-=]/)[0], h.name] }))
}

export function cardOptions(data: AppData): Option[] {
  return data.cards.map((c) => ({ ref: c.id, label: c.name, names: [c.name, c.issuer ?? ''] }))
}

/** Thrown while planning when the bot has to ask which one was meant. */
class NeedChoice {
  constructor(public ask: Ask) {}
}

interface PickContext {
  index: number
  field: Ask['field']
  t: Strings
}

/** The ref a name points to. Several matches, or none, become a question with buttons. */
function pickRef(query: string, options: Option[], c: PickContext): string {
  const found = find(query, options)
  if (found && 'ref' in found) return found.ref
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
    if (!from) from = askFor(moneyOptions(data, { bucketsOnly: !!theCard }), t.notTracked, { ...at, field: 'from' }, t.askFrom)
    else if (from !== NONE) from = pickRef(from, moneyOptions(data), { ...at, field: 'from' })
    // A card charge only lowers a bucket's budget; the bank pays the bill later.
    if (theCard && from.startsWith('account:')) from = NONE
    const srcCcy = sourceCurrency(data, parseSourceKey(from))
    const currency = a.currency ?? theCard?.currency ?? srcCcy ?? base
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
    else if (to !== NONE) to = pickRef(to, moneyOptions(data, { assets: true }), { ...at, field: 'to' })
    const destCcy = sourceCurrency(data, parseSourceKey(to))
    const currency = a.currency ?? destCcy ?? base
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
    const from = pickRef(a.from, moneyOptions(data), { ...at, field: 'from' })
    const to = pickRef(a.to, moneyOptions(data, { assets: true }), { ...at, field: 'to' })
    if (from === to) throw new BotError('sameSource')
    const fromCcy = sourceCurrency(data, parseSourceKey(from))
    const toCcy = sourceCurrency(data, parseSourceKey(to))
    const currency = a.currency ?? fromCcy ?? base
    checkRate(currency, [fromCcy, toCcy], rates)
    return { type: 'move', amount: a.amount, currency, from, to }
  }

  // buy or sell
  const id = pickRef(a.holding, holdingOptions(data), { ...at, field: 'holding' })
  const h = data.holdings.find((x) => x.id === id)!
  const hc = holdingCurrency(data, h)
  const given = a.currency ?? hc
  checkRate(given, [hc], rates)
  const inHolding = (v: number | undefined) => (v == null ? undefined : convert(v, given, hc, rates)!)
  const fee = inHolding(a.fee) ?? 0
  const sign = a.type === 'buy' ? 1 : -1
  let quantity: number
  let total: number
  let price: number
  if (a.quantity && a.total) {
    quantity = a.quantity
    total = inHolding(a.total)!
    price = (total - sign * fee) / quantity
  } else {
    const p = inHolding(a.price) ?? livePrice(data, h)
    if (!p) throw new BotError('noPrice', { holding: esc(h.symbol || h.name) })
    price = p
    if (a.quantity) {
      quantity = a.quantity
      total = quantity * price + sign * fee
    } else if (a.total) {
      total = inHolding(a.total)!
      quantity = +((total - sign * fee) / price).toPrecision(10)
    } else throw new BotError('needQuantity')
  }
  if (!(quantity > 0) || !(total > 0)) throw new BotError('needQuantity')
  if (a.type === 'sell' && quantity > h.quantity + 1e-9) throw new BotError('notEnoughUnits', { have: formatQty(h.quantity), holding: esc(h.symbol || h.name) })

  let cash = a.cash ?? lastTradeCash(data, h.id)
  if (!cash) cash = askFor(moneyOptions(data), t.noCash, { ...at, field: 'cash' }, t.askCash(a.type))
  else if (cash !== NONE) cash = pickRef(cash, moneyOptions(data), { ...at, field: 'cash' })
  checkRate(hc, [sourceCurrency(data, parseSourceKey(cash))], rates)

  return {
    type: a.type,
    holding: h.id,
    quantity,
    total: +total.toFixed(8),
    price: +price.toPrecision(10),
    fee: fee || undefined,
    currency: hc,
    cash,
    date: a.date ?? today
  }
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
    steps.push(applyOne(draft, a, now + i))
    lines.push(describe(draft, a, today, t))
  })
  return { steps, lines }
}

function applyOne(d: AppData, a: Action, now: number): Step {
  const rates = ratesOf(d)

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

  const h = d.holdings.find((x) => x.id === a.holding)
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
  return { type: 'trade', holding: h.id, trade: t.id }
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
    } else {
      moveMoney(d, s.from, s.out, rates)
      moveMoney(d, s.to, -s.in, rates)
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

/** One entry as HTML, using the data after it was applied for the balances left. */
function describe(d: AppData, a: Action, today: string, t: Strings): string {
  const src = (ref: string | undefined) => (ref && ref !== NONE ? parseSourceKey(ref) : null)
  const label = (s: MoneySource | null) => (s ? esc(sourceLabel(d, s)) : undefined)
  const left = (s: MoneySource | null) => {
    const v = s ? balanceOf(d, s) : undefined
    return v ? esc(v) : undefined
  }

  if (a.type === 'spend') {
    const s = src(a.from)
    return t.spend({
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
    return t.income({
      amount: esc(formatMoney(a.amount, a.currency!)),
      category: esc(categoryLabel(a.category!)),
      note: a.note ? esc(a.note) : undefined,
      to: label(s),
      date: dateText(a.date!, today, t),
      left: left(s)
    })
  }
  if (a.type === 'move') {
    const to = src(a.to)!
    const toCcy = sourceCurrency(d, to)
    const got = toCcy && toCcy !== a.currency ? convert(a.amount, a.currency!, toCcy, ratesOf(d)) : null
    return t.move({
      amount: esc(formatMoney(a.amount, a.currency!)),
      from: label(src(a.from))!,
      to: label(to)!,
      received: got != null ? esc(formatMoney(got, toCcy!)) : undefined
    })
  }
  const h = d.holdings.find((x) => x.id === a.holding)!
  const s = src(a.cash)
  return t.trade({
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

/** Buckets and bank accounts with their balances, as HTML. */
export function balances(data: AppData, t: Strings): string {
  const rates = ratesOf(data)
  const out: string[] = [`<b>${esc(t.balances)}</b>`]
  if (data.buckets.length) {
    out.push('', `<b>${esc(t.buckets)}</b>`)
    for (const b of data.buckets) {
      const a = linkedAccount(data, b)
      out.push(`• ${esc(b.name)}${a ? ` <i>(${esc(a.name)})</i>` : ''}: ${esc(formatMoney(b.amount, b.currency))}`)
    }
  }
  const accounts = bankAccounts(data)
  if (accounts.length) {
    out.push('', `<b>${esc(t.accounts)}</b>`)
    for (const a of accounts) {
      const free = unassignedIn(data, a.id, rates)
      const split = Math.abs(free - a.quantity) > 0.005
      out.push(`• ${esc(a.name)}: ${esc(formatMoney(a.quantity, a.currency))}${split ? ` · ${esc(t.unassigned(formatMoney(free, a.currency)))}` : ''}`)
    }
  }
  return out.length > 1 ? out.join('\n') : esc(t.noBalances)
}
