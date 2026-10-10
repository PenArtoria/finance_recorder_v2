import { useMemo, useState } from 'react'
import {
  Award,
  Briefcase,
  Bus,
  Ellipsis,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Laptop,
  PiggyBank,
  RotateCcw,
  House,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  Trash2,
  Utensils,
  type LucideIcon
} from 'lucide-react'
import type { Expense } from '@shared/types'
import { ratesOf } from '@/core/calc'
import { parseSourceKey, sourceCurrency, sourceKey, sourceLabel } from '@/core/cash'
import { uid } from '@/core/data'
import { dueFor, statementFor } from '@/core/cards'
import { convert, formatMoney, symbolFor } from '@/core/money'
import { applyExpense, frequentCurrencies, INCOME_CATEGORIES, SPEND_CATEGORIES } from '@/core/spending'
import { dateLabel, todayIso } from '@/core/trades'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { MoneySourceSelect } from './MoneySource'
import { ConfirmDialog, Dialog, Field, NumberInput, Segmented } from './ui'

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  food: Utensils,
  groceries: ShoppingCart,
  transport: Bus,
  shopping: ShoppingBag,
  bills: Receipt,
  housing: House,
  health: HeartPulse,
  fun: Ticket,
  travel: Plane,
  education: GraduationCap,
  gifts: Gift,
  other: Ellipsis,
  salary: Briefcase,
  bonus: Award,
  side: Laptop,
  dividend: PiggyBank,
  refund: RotateCcw,
  'gift-in': Gift,
  'other-in': HandCoins
}

export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICON[category] ?? Ellipsis
  return <Icon size={size} strokeWidth={1.9} aria-hidden />
}

const LAST_SOURCE_KEY = 'moneta.lastSpendSource'
const LAST_CURRENCY_KEY = 'moneta.lastSpendCurrency'
const LAST_CARD_KEY = 'moneta.lastSpendCard'
const LAST_INCOME_KEY = 'moneta.lastIncomeInto'

function remembered(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // only a convenience
  }
}

export function ExpenseDialog({
  expense,
  date,
  cardId,
  kind,
  onClose
}: {
  expense?: Expense
  date?: string
  cardId?: string
  /** Start as spending (default) or income. */
  kind?: 'spend' | 'income'
  onClose: () => void
}) {
  const data = useApp((s) => s.data)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const rates = useMemo(() => ratesOf(data), [data])
  const base = data.settings.baseCurrency
  const editing = !!expense
  const frequent = useMemo(() => frequentCurrencies(data), [data])

  const defaultBucket = () => {
    const living = data.buckets.find((b) => /living|daily|spend|生活/i.test(b.name)) ?? data.buckets[0]
    return living ? sourceKey({ kind: 'bucket', id: living.id }) : ''
  }
  const initialSource = () => {
    if (expense) return expense.source ? sourceKey(expense.source) : ''
    const saved = remembered(LAST_SOURCE_KEY)
    const src = parseSourceKey(saved)
    return src && sourceCurrency(data, src) ? saved : defaultBucket()
  }
  const initialCard = () => {
    if (expense?.cardId) return expense.cardId
    if (cardId) return cardId
    const saved = remembered(LAST_CARD_KEY)
    return data.cards.some((c) => c.id === saved) ? saved : data.cards[0]?.id ?? ''
  }
  const initialCurrency = () => {
    if (expense) return expense.currency
    const saved = remembered(LAST_CURRENCY_KEY)
    return saved && /^[A-Z]{3}$/.test(saved) ? saved : frequent[0] ?? base
  }

  const [entryKind, setEntryKind] = useState<'spend' | 'income'>(expense ? (expense.kind === 'income' ? 'income' : 'spend') : kind ?? 'spend')
  const income = entryKind === 'income'
  const [method, setMethod] = useState<'cash' | 'card'>(expense ? (expense.cardId ? 'card' : 'cash') : cardId ? 'card' : 'cash')
  const initialInto = () => {
    const saved = remembered(LAST_INCOME_KEY)
    const src = parseSourceKey(saved)
    if (src && sourceCurrency(data, src)) return saved
    const account = data.holdings.find((h) => h.type === 'cash' || h.type === 'deposit')
    return account ? sourceKey({ kind: 'account', id: account.id }) : defaultBucket()
  }
  const [srcKey, setSrcKey] = useState(() => (!expense && kind === 'income' ? initialInto() : initialSource()))
  const [card, setCard] = useState(initialCard)
  const [currency, setCurrency] = useState(initialCurrency)
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null)
  const [category, setCategory] = useState(expense?.category ?? (kind === 'income' ? 'salary' : 'food'))
  const categories = income ? INCOME_CATEGORIES : SPEND_CATEGORIES

  const switchKind = (k: 'spend' | 'income') => {
    setEntryKind(k)
    const list = k === 'income' ? INCOME_CATEGORIES : SPEND_CATEGORIES
    if (!list.some((c) => c.key === category)) setCategory(list[0].key)
    if (!expense) setSrcKey(k === 'income' ? initialInto() : initialSource())
  }
  const [day, setDay] = useState(expense?.date ?? date ?? todayIso())
  const [note, setNote] = useState(expense?.note ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const byCard = !income && method === 'card'
  const theCard = byCard ? data.cards.find((c) => c.id === card) : undefined
  // With a card, the source is only the bucket whose budget it uses.
  const src = parseSourceKey(srcKey)
  const effectiveSrc = byCard && src?.kind !== 'bucket' ? null : src
  const srcCcy = sourceCurrency(data, effectiveSrc)

  const inSrc = amount != null && srcCcy ? convert(amount, currency, srcCcy, rates) : null
  const inBaseNow = amount != null ? convert(amount, currency, base, rates) : null
  const inCard = amount != null && theCard ? convert(amount, currency, theCard.currency, rates) : null

  // What's left in the bucket or account after this entry.
  const remaining = useMemo(() => {
    if (!effectiveSrc || !srcCcy || inSrc == null) return null
    const holding = effectiveSrc.kind === 'account' ? data.holdings.find((h) => h.id === effectiveSrc.id) : undefined
    const now =
      effectiveSrc.kind === 'bucket'
        ? data.buckets.find((b) => b.id === effectiveSrc.id)?.amount
        : holding && (holding.type === 'property' || holding.type === 'pension' || holding.type === 'other')
          ? holding.manualPrice ?? 0
          : holding?.quantity
    if (now == null) return null
    // When editing, take the entry's old effect off first.
    const sameSource = expense?.source && sourceKey(expense.source) === sourceKey(effectiveSrc)
    const old = sameSource ? convert(expense!.amount, expense!.currency, srcCcy, rates) ?? 0 : 0
    const undo = expense?.kind === 'income' ? -old : old
    return now + undo + (income ? inSrc : -inSrc)
  }, [effectiveSrc, srcCcy, inSrc, data, expense, rates, income])

  const valid = amount != null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day) && (!byCard || !!theCard)

  const save = () => {
    setTried(true)
    if (!valid || amount == null) return
    // Keep the original day's exchange rate unless the amount or currency changed.
    const unchanged = expense && expense.amount === amount && expense.currency === currency
    const next: Expense = {
      id: expense?.id ?? uid('e'),
      ...(income ? { kind: 'income' as const } : {}),
      date: day,
      amount,
      currency,
      category,
      note: note.trim() || undefined,
      source: effectiveSrc,
      cardId: income ? null : theCard?.id ?? null,
      createdAt: expense?.createdAt ?? Date.now()
    }
    const usd = unchanged && expense?.usd != null ? expense.usd : convert(amount, currency, 'USD', rates)
    if (usd != null) next.usd = +usd.toFixed(6)
    if (theCard && !income) {
      const keep = unchanged && expense?.cardId === theCard.id && expense.cardAmount != null
      next.cardAmount = keep ? expense!.cardAmount : +(convert(amount, currency, theCard.currency, rates) ?? amount).toFixed(6)
    }
    mutate((d) => {
      const r = ratesOf(d)
      const old = expense ? d.expenses.find((e) => e.id === expense.id) : undefined
      if (old) applyExpense(d, old, -1, r)
      applyExpense(d, next, 1, r)
      d.expenses = old ? d.expenses.map((e) => (e.id === old.id ? next : e)) : [...d.expenses, next]
    })
    remember(LAST_CURRENCY_KEY, currency)
    if (income) remember(LAST_INCOME_KEY, srcKey)
    else if (byCard) remember(LAST_CARD_KEY, card)
    else remember(LAST_SOURCE_KEY, srcKey)
    toast(
      editing
        ? income
          ? 'Income updated.'
          : 'Spending updated.'
        : `${income ? 'Income of ' : ''}${formatMoney(amount, currency)} noted for ${dateLabel(day, false)}.`,
      'success'
    )
    onClose()
  }

  const remove = () => {
    if (!expense) return
    mutate((d) => {
      const old = d.expenses.find((e) => e.id === expense.id)
      if (old) applyExpense(d, old, -1, ratesOf(d))
      d.expenses = d.expenses.filter((e) => e.id !== expense.id)
    })
    toast('Spending removed.', 'info')
    onClose()
  }

  const statement = theCard ? statementFor(theCard, day) : null
  const conversion =
    amount && currency !== base && inBaseNow != null ? `≈ ${formatMoney(inBaseNow, base)} at today’s rate` : null

  return (
    <>
      <Dialog
        title={editing ? (income ? 'Edit income' : 'Edit spending') : income ? 'Add income' : 'Add spending'}
        sub={
          income
            ? 'Salary, dividends, refunds… in any currency. It’s converted for you and added where you pick.'
            : 'Any currency. It’s converted for you and comes out of the bucket you pick.'
        }
        onClose={onClose}
        footer={
          <>
            {editing && (
              <button className="btn ghost danger left" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> Remove
              </button>
            )}
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              {editing ? 'Save' : income ? 'Add income' : 'Add spending'}
            </button>
          </>
        }
      >
        <div className="form">
          <Segmented
            value={entryKind}
            onChange={switchKind}
            label="Money out or in"
            options={[
              { value: 'spend', label: 'Spending' },
              { value: 'income', label: 'Income' }
            ]}
          />
          <div className="form-row">
            <Field label="Amount" hint={conversion ?? undefined} error={tried && !(amount && amount > 0) ? 'Enter how much you spent.' : undefined}>
              <NumberInput value={amount} onChange={setAmount} prefix={symbolFor(currency)} placeholder="0" autoFocus />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} suggested={frequent} />
            </Field>
          </div>
          <Field label="Category">
            <div className="cat-grid" role="radiogroup" aria-label="Category">
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={category === c.key}
                  className={`cat-chip ${category === c.key ? 'on' : ''}`}
                  onClick={() => setCategory(c.key)}
                >
                  <CategoryIcon category={c.key} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </Field>
          {!income && (
          <Segmented
            value={method}
            onChange={setMethod}
            label="Paid with"
            options={[
              { value: 'cash', label: 'Cash or bank' },
              { value: 'card', label: 'Credit card' }
            ]}
          />
          )}
          {!byCard && (
            <Field
              label={income ? 'Paid into' : 'Taken from'}
              hint={
                remaining != null && effectiveSrc ? (
                  <span className={remaining < 0 ? 'bad' : undefined}>
                    {currency !== srcCcy && inSrc != null ? `${formatMoney(inSrc, srcCcy!)} · ` : ''}
                    {sourceLabel(data, effectiveSrc)} will have {formatMoney(remaining, srcCcy!)}
                    {income ? '.' : ' left.'}
                  </span>
                ) : effectiveSrc ? (
                  income ? `Goes into ${sourceLabel(data, effectiveSrc)}.` : `Comes out of ${sourceLabel(data, effectiveSrc)}.`
                ) : income ? (
                  'No balance changes.'
                ) : (
                  'Nothing is taken from your balances.'
                )
              }
            >
              <MoneySourceSelect
                value={srcKey}
                onChange={setSrcKey}
                assets={income}
                noneLabel={income ? 'Not into a tracked balance' : 'Not from a tracked balance'}
              />
            </Field>
          )}
          {byCard && (
            <div className="form-row">
              <Field
                label="Card"
                error={tried && !theCard ? 'Add a credit card on the Credit cards page first.' : undefined}
                hint={
                  theCard && statement
                    ? `${inCard != null && currency !== theCard.currency ? `${formatMoney(inCard, theCard.currency)} · ` : ''}On the statement closing ${dateLabel(statement, false)}, paid ${dateLabel(dueFor(theCard, statement), false)}.`
                    : undefined
                }
              >
                {data.cards.length ? (
                  <select className="select" value={card} onChange={(e) => setCard(e.target.value)}>
                    {data.cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="input" disabled value="No cards yet" />
                )}
              </Field>
              <Field
                label="Budget from bucket"
                hint={
                  remaining != null && effectiveSrc
                    ? `${sourceLabel(data, effectiveSrc)} will have ${formatMoney(remaining, srcCcy!)} left. The bank pays on pay day.`
                    : effectiveSrc
                      ? `Uses the budget in ${sourceLabel(data, effectiveSrc)}. The bank pays on pay day.`
                      : 'No bucket is lowered.'
                }
              >
                <select className="select" value={src?.kind === 'bucket' ? srcKey : ''} onChange={(e) => setSrcKey(e.target.value)}>
                  <option value="">Don’t use a bucket</option>
                  {data.buckets.map((b) => (
                    <option key={b.id} value={sourceKey({ kind: 'bucket', id: b.id })}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <div className="form-row">
            <Field label="Date">
              <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Note (optional)">
              <input className="input" value={note} placeholder={income ? 'e.g. October salary' : 'e.g. Lunch, Amazon order'} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>
      </Dialog>
      {confirmDelete && expense && (
        <ConfirmDialog
          title={expense.kind === 'income' ? 'Remove this income?' : 'Remove this spending?'}
          body={
            expense.kind === 'income'
              ? expense.source
                ? `${formatMoney(expense.amount, expense.currency)} comes back out of ${sourceLabel(data, expense.source)}.`
                : 'The entry is removed.'
              : expense.cardId
              ? 'The charge is removed from the card' + (expense.source ? ` and its budget goes back to ${sourceLabel(data, expense.source)}.` : '.')
              : expense.source
                ? `${formatMoney(expense.amount, expense.currency)} goes back to ${sourceLabel(data, expense.source)}.`
                : 'The entry is removed.'
          }
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
