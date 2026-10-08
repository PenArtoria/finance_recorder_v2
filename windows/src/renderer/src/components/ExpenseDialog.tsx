import { useMemo, useState } from 'react'
import {
  Bus,
  Ellipsis,
  Gift,
  GraduationCap,
  HeartPulse,
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
import { convert, formatMoney, symbolFor } from '@/core/money'
import { applyExpense, SPEND_CATEGORIES } from '@/core/spending'
import { dateLabel, todayIso } from '@/core/trades'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { MoneySourceSelect } from './MoneySource'
import { ConfirmDialog, Dialog, Field, NumberInput } from './ui'

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
  other: Ellipsis
}

export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICON[category] ?? Ellipsis
  return <Icon size={size} strokeWidth={1.9} aria-hidden />
}

const LAST_SOURCE_KEY = 'moneta.lastSpendSource'

function rememberedSource(): string {
  try {
    return localStorage.getItem(LAST_SOURCE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function ExpenseDialog({ expense, date, onClose }: { expense?: Expense; date?: string; onClose: () => void }) {
  const data = useApp((s) => s.data)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const rates = useMemo(() => ratesOf(data), [data])
  const editing = !!expense

  const initialSource = () => {
    if (expense) return expense.source ? sourceKey(expense.source) : ''
    const saved = rememberedSource()
    const src = parseSourceKey(saved)
    if (src && sourceCurrency(data, src)) return saved
    const living = data.buckets.find((b) => /living|daily|spend/i.test(b.name)) ?? data.buckets[0]
    return living ? sourceKey({ kind: 'bucket', id: living.id }) : ''
  }

  const [srcKey, setSrcKey] = useState(initialSource)
  const src = parseSourceKey(srcKey)
  const srcCcy = sourceCurrency(data, src)
  const [ownCurrency, setOwnCurrency] = useState(expense?.currency ?? data.settings.baseCurrency)
  const currency = srcCcy ?? ownCurrency
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null)
  const [category, setCategory] = useState(expense?.category ?? 'food')
  const [day, setDay] = useState(expense?.date ?? date ?? todayIso())
  const [note, setNote] = useState(expense?.note ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // What's left in the source after this entry.
  const remaining = useMemo(() => {
    if (!src || !srcCcy) return null
    const now = src.kind === 'bucket' ? data.buckets.find((b) => b.id === src.id)?.amount : data.holdings.find((h) => h.id === src.id)?.quantity
    if (now == null) return null
    const back = expense && expense.source && sourceKey(expense.source) === srcKey ? convert(expense.amount, expense.currency, srcCcy, rates) ?? 0 : 0
    return now + back - (amount ?? 0)
  }, [src, srcCcy, data, expense, srcKey, amount, rates])

  const valid = amount != null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day)

  const save = () => {
    setTried(true)
    if (!valid || amount == null) return
    const next: Expense = {
      id: expense?.id ?? uid('e'),
      date: day,
      amount,
      currency,
      category,
      note: note.trim() || undefined,
      source: src,
      createdAt: expense?.createdAt ?? Date.now()
    }
    mutate((d) => {
      const r = ratesOf(d)
      const old = expense ? d.expenses.find((e) => e.id === expense.id) : undefined
      if (old) applyExpense(d, old, -1, r)
      applyExpense(d, next, 1, r)
      d.expenses = old ? d.expenses.map((e) => (e.id === old.id ? next : e)) : [...d.expenses, next]
    })
    try {
      localStorage.setItem(LAST_SOURCE_KEY, srcKey)
    } catch {
      // only a convenience
    }
    toast(editing ? 'Spending updated.' : `${formatMoney(amount, currency)} noted for ${dateLabel(day, false)}.`, 'success')
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

  return (
    <>
      <Dialog
        title={editing ? 'Edit spending' : 'Add spending'}
        sub="It comes out of the bucket or account you pick."
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
              {editing ? 'Save' : 'Add spending'}
            </button>
          </>
        }
      >
        <div className="form">
          <div className="form-row">
            <Field label="Amount" error={tried && !(amount && amount > 0) ? 'Enter how much you spent.' : undefined}>
              <NumberInput value={amount} onChange={setAmount} prefix={symbolFor(currency)} placeholder="0.00" autoFocus />
            </Field>
            <Field label="Date">
              <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
          </div>
          <Field label="Category">
            <div className="cat-grid" role="radiogroup" aria-label="Category">
              {SPEND_CATEGORIES.map((c) => (
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
          <Field
              label="Paid from"
              hint={
                remaining != null && src ? (
                  <span className={remaining < 0 ? 'bad' : undefined}>
                    {sourceLabel(data, src)} will have {formatMoney(remaining, srcCcy!)} left.
                  </span>
                ) : (
                  'Nothing is taken from your balances.'
                )
              }
            >
              <MoneySourceSelect value={srcKey} onChange={setSrcKey} noneLabel="Not from a tracked balance (e.g. credit card)" />
          </Field>
          <div className="form-row" style={src ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
            {!src && (
              <Field label="Currency">
                <CurrencySelect value={ownCurrency} onChange={setOwnCurrency} />
              </Field>
            )}
            <Field label="Note (optional)">
              <input className="input" value={note} placeholder="e.g. Lunch with Sam" onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>
      </Dialog>
      {confirmDelete && expense && (
        <ConfirmDialog
          title="Remove this spending?"
          body={expense.source ? `${formatMoney(expense.amount, expense.currency)} goes back to ${sourceLabel(data, expense.source)}.` : 'The entry is removed.'}
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
