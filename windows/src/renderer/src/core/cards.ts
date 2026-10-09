import type { AppData, CardPayment, CreditCard } from '@shared/types'
import { convert, type Rates } from './money'
import { daysInMonth, todayIso } from './trades'

// Credit cards: what you've charged, when each statement closes and when it's paid.
// Charges are spending entries with a card. A statement covers the days after the
// previous closing date up to and including its own closing date, and is paid
// `dueMonths` later on `dueDay` (e.g. 15th close, 10th of next month).

const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`
}

function dayIn(month: string, day: number): string {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`
}

/** Closing date of the statement that closes in `month`. */
export function closeIn(card: CreditCard, month: string): string {
  return dayIn(month, card.closingDay)
}

/** Closing date of the statement a charge on `date` belongs to. */
export function statementFor(card: CreditCard, date: string): string {
  const month = date.slice(0, 7)
  const close = closeIn(card, month)
  return date <= close ? close : closeIn(card, shiftMonth(month, 1))
}

export function dueFor(card: CreditCard, close: string): string {
  return dayIn(shiftMonth(close.slice(0, 7), card.dueMonths || 1), card.dueDay)
}

function dayAfter(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + 1)
  return todayIso(t)
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export interface Charge {
  date: string
  amount: number
  expenseId?: string
}

export function chargesOf(data: AppData, card: CreditCard, rates: Rates): Charge[] {
  const out: Charge[] = data.expenses
    .filter((e) => e.cardId === card.id)
    .map((e) => ({ date: e.date, amount: e.cardAmount ?? convert(e.amount, e.currency, card.currency, rates) ?? e.amount, expenseId: e.id }))
  if (card.opening && card.opening > 0) out.push({ date: card.openingDate ?? todayIso(new Date(card.createdAt)), amount: card.opening })
  return out
}

export type StatementStatus = 'open' | 'due' | 'overdue' | 'paid'

export interface Statement {
  /** First day covered. */
  start: string
  /** Closing date; also the statement's id. */
  close: string
  due: string
  charged: number
  paid: number
  remaining: number
  count: number
  status: StatementStatus
}

/** Every statement with a charge or payment, plus the one open now. Newest first. */
export function statementsOf(data: AppData, card: CreditCard, rates: Rates, today = todayIso()): Statement[] {
  const map = new Map<string, { charged: number; paid: number; count: number }>()
  const touch = (close: string) => {
    let s = map.get(close)
    if (!s) map.set(close, (s = { charged: 0, paid: 0, count: 0 }))
    return s
  }
  for (const c of chargesOf(data, card, rates)) {
    const s = touch(statementFor(card, c.date))
    s.charged += c.amount
    s.count++
  }
  for (const p of card.payments) touch(p.statement).paid += p.amount
  touch(statementFor(card, today))

  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([close, s]) => {
      const prevClose = closeIn(card, shiftMonth(close.slice(0, 7), -1))
      const due = dueFor(card, close)
      const remaining = Math.max(0, +(s.charged - s.paid).toFixed(8))
      const status: StatementStatus =
        close >= today ? 'open' : remaining <= 0.005 ? 'paid' : due < today ? 'overdue' : 'due'
      return { start: dayAfter(prevClose), close, due, charged: s.charged, paid: s.paid, remaining, count: s.count, status }
    })
}

/** Total still owed on the card, in its currency. */
export function owedOn(data: AppData, card: CreditCard, rates: Rates): number {
  const charged = chargesOf(data, card, rates).reduce((s, c) => s + c.amount, 0)
  const paid = card.payments.reduce((s, p) => s + p.amount, 0)
  return Math.max(0, +(charged - paid).toFixed(8))
}

/** The next bill to pay: the oldest closed statement with money left, or else the open one. */
export function nextBill(statements: Statement[]): Statement | undefined {
  const unpaid = statements.filter((s) => s.status === 'due' || s.status === 'overdue')
  if (unpaid.length) return unpaid[unpaid.length - 1]
  return statements.find((s) => s.status === 'open')
}

/** Card money waiting to be paid from a bank account, in that account's currency. */
export function reservedFor(data: AppData, accountId: string, rates: Rates): number {
  const a = data.holdings.find((h) => h.id === accountId)
  if (!a) return 0
  return data.cards
    .filter((c) => c.payFromId === accountId)
    .reduce((s, c) => s + (convert(owedOn(data, c, rates), c.currency, a.currency, rates) ?? 0), 0)
}

/** Records a bill payment and takes it out of the paying account. */
export function payCard(
  draft: AppData,
  cardId: string,
  p: { date: string; amount: number; fromAccountId?: string | null; statement: string; auto?: boolean },
  rates: Rates,
  id: string
): CardPayment | null {
  const card = draft.cards.find((c) => c.id === cardId)
  if (!card || p.amount <= 0) return null
  const account = p.fromAccountId ? draft.holdings.find((h) => h.id === p.fromAccountId) : undefined
  const payment: CardPayment = { id, date: p.date, amount: +p.amount.toFixed(8), statement: p.statement, createdAt: Date.now() }
  if (p.auto) payment.auto = true
  if (account) {
    const out = convert(p.amount, card.currency, account.currency, rates) ?? p.amount
    account.quantity = +(account.quantity - out).toFixed(8)
    payment.fromAccountId = account.id
    payment.accountAmount = +out.toFixed(8)
  }
  card.payments.push(payment)
  return payment
}

export function removePayment(draft: AppData, cardId: string, paymentId: string) {
  const card = draft.cards.find((c) => c.id === cardId)
  const p = card?.payments.find((x) => x.id === paymentId)
  if (!card || !p) return
  const account = p.fromAccountId ? draft.holdings.find((h) => h.id === p.fromAccountId) : undefined
  if (account && p.accountAmount) account.quantity = +(account.quantity + p.accountAmount).toFixed(8)
  card.payments = card.payments.filter((x) => x.id !== paymentId)
}

/**
 * On or after each pay day, pays the statement from its account for cards set to pay
 * automatically. Returns what it paid so the app can say so.
 */
export function runAutoPay(draft: AppData, rates: Rates, makeId: () => string, today = todayIso()): { card: string; amount: number; currency: string; date: string }[] {
  const done: { card: string; amount: number; currency: string; date: string }[] = []
  for (const card of draft.cards) {
    if (!card.autoPay || !card.payFromId || !draft.holdings.some((h) => h.id === card.payFromId)) continue
    const bills = statementsOf(draft, card, rates, today)
      .filter((s) => s.status !== 'open' && s.remaining > 0.005 && s.due <= today)
      .reverse()
    for (const s of bills) {
      const p = payCard(draft, card.id, { date: s.due, amount: s.remaining, fromAccountId: card.payFromId, statement: s.close, auto: true }, rates, makeId())
      if (p) done.push({ card: card.name, amount: p.amount, currency: card.currency, date: s.due })
    }
  }
  return done
}
