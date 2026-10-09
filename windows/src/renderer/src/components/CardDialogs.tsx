import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { CreditCard } from '@shared/types'
import { closeIn, dueFor, payCard, statementsOf, type Statement } from '@/core/cards'
import { bankAccounts } from '@/core/cash'
import { monthKey, ratesOf } from '@/core/calc'
import { uid } from '@/core/data'
import { convert, formatMoney, symbolFor } from '@/core/money'
import { frequentCurrencies } from '@/core/spending'
import { dateLabel, todayIso } from '@/core/trades'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { ConfirmDialog, Dialog, Field, NumberInput, Segmented, Toggle } from './ui'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const dayName = (d: number) => (d === 31 ? 'Last day of the month' : `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`)

export function CardDialog({ card, onClose }: { card?: CreditCard; onClose: () => void }) {
  const data = useApp((s) => s.data)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const accounts = bankAccounts(data)
  const editing = !!card

  const [name, setName] = useState(card?.name ?? '')
  const [issuer, setIssuer] = useState(card?.issuer ?? '')
  const [currency, setCurrency] = useState(card?.currency ?? frequentCurrencies(data)[0] ?? data.settings.baseCurrency)
  const [limit, setLimit] = useState<number | null>(card?.limit ?? null)
  const [closingDay, setClosingDay] = useState(card?.closingDay ?? 15)
  const [dueDay, setDueDay] = useState(card?.dueDay ?? 10)
  const [dueMonths, setDueMonths] = useState(card?.dueMonths ?? 1)
  const [payFromId, setPayFromId] = useState(card?.payFromId ?? accounts.find((a) => a.currency === currency)?.id ?? accounts[0]?.id ?? '')
  const [autoPay, setAutoPay] = useState(card?.autoPay ?? true)
  const [opening, setOpening] = useState<number | null>(card?.opening ?? null)
  const [color, setColor] = useState(card?.color ?? (data.cards.length + 3) % 8)
  const [note, setNote] = useState(card?.note ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Preview the dates for the statement open right now.
  const preview = useMemo(() => {
    const c = { closingDay, dueDay, dueMonths } as CreditCard
    const today = todayIso()
    const thisClose = closeIn(c, monthKey())
    const close = today <= thisClose ? thisClose : closeIn(c, nextMonth(monthKey()))
    return { close, due: dueFor(c, close) }
  }, [closingDay, dueDay, dueMonths])

  const valid = name.trim().length > 0
  const charges = card ? data.expenses.filter((e) => e.cardId === card.id).length : 0

  const save = () => {
    setTried(true)
    if (!valid) return
    const next: CreditCard = {
      id: card?.id ?? uid('c'),
      name: name.trim(),
      issuer: issuer.trim() || undefined,
      currency,
      limit: limit && limit > 0 ? limit : null,
      closingDay,
      dueDay,
      dueMonths,
      payFromId: payFromId || null,
      autoPay: !!payFromId && autoPay,
      opening: opening && opening > 0 ? opening : null,
      openingDate: card?.openingDate ?? todayIso(),
      payments: card?.payments ?? [],
      color,
      note: note.trim() || undefined,
      createdAt: card?.createdAt ?? Date.now()
    }
    mutate((d) => {
      const i = d.cards.findIndex((c) => c.id === next.id)
      if (i >= 0) d.cards[i] = next
      else d.cards.push(next)
      d.onboarded = true
    })
    toast(editing ? `${next.name} updated.` : `${next.name} added.`, 'success')
    onClose()
  }

  const remove = () => {
    if (!card) return
    mutate((d) => {
      d.cards = d.cards.filter((c) => c.id !== card.id)
      // Keep the spending, just without the card.
      for (const e of d.expenses) if (e.cardId === card.id) e.cardId = null
    })
    toast(`${card.name} removed.`, 'info')
    onClose()
  }

  return (
    <>
      <Dialog
        title={editing ? `Edit ${card?.name}` : 'Add a credit card'}
        sub="Moneta works out each statement, its pay day and what’s owed from the spending you note."
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
              {editing ? 'Save changes' : 'Add card'}
            </button>
          </>
        }
      >
        <div className="form">
          <div className="form-row">
            <Field label="Card name" error={tried && !name.trim() ? 'Name the card.' : undefined}>
              <input className="input" value={name} autoFocus={!editing} placeholder="e.g. Rakuten Card" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Issuer (optional)">
              <input className="input" value={issuer} placeholder="e.g. Rakuten, SMBC" onChange={(e) => setIssuer(e.target.value)} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Billing currency" hint={charges ? 'Charges already noted keep their converted amounts.' : undefined}>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </Field>
            <Field label="Credit limit (optional)">
              <NumberInput value={limit} onChange={setLimit} prefix={symbolFor(currency)} placeholder="0" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Statement closes on (締め日)">
              <select className="select" value={closingDay} onChange={(e) => setClosingDay(Number(e.target.value))}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {dayName(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bill is paid on (支払日)">
              <div className="inline-pair">
                <select className="select" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {dayName(d)}
                    </option>
                  ))}
                </select>
                <select className="select" value={dueMonths} onChange={(e) => setDueMonths(Number(e.target.value))}>
                  <option value={1}>of next month</option>
                  <option value={2}>of the month after</option>
                </select>
              </div>
            </Field>
          </div>
          <div className="split-chip">
            <span className="muted">This statement closes {dateLabel(preview.close)} and is paid {dateLabel(preview.due)}.</span>
          </div>
          <Field
            label="Paid from (引き落とし口座)"
            hint={
              accounts.length
                ? 'Card spending is set aside in this account until pay day, so it isn’t counted as free money.'
                : 'Add your bank account on the Holdings page to set the bill aside and pay it automatically.'
            }
          >
            <select className="select" value={payFromId} onChange={(e) => setPayFromId(e.target.value)}>
              <option value="">Not linked to an account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </Field>
          {payFromId && (
            <div className="setting-row" style={{ padding: 0, border: 0 }}>
              <div className="text">
                <b>Pay automatically on pay day</b>
                <span>On the pay day, Moneta records the payment and lowers the account balance, like the bank’s auto-debit.</span>
              </div>
              <Toggle on={autoPay} onChange={setAutoPay} label="Pay automatically" />
            </div>
          )}
          <Field label={editing ? 'Owed when you added the card' : 'Owed now, not yet paid (optional)'} hint="Spending you noted before adding the card, or charges you don’t want to enter one by one.">
            <NumberInput value={opening} onChange={setOpening} prefix={symbolFor(currency)} placeholder="0" />
          </Field>
          <div className="form-row">
            <Field label="Colour">
              <div className="swatches">
                {Array.from({ length: 8 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`swatch ${color === i ? 'on' : ''}`}
                    style={{ background: `var(--s${i + 1})` }}
                    aria-label={`Colour ${i + 1}`}
                    onClick={() => setColor(i)}
                  />
                ))}
              </div>
            </Field>
            <Field label="Note (optional)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>
      </Dialog>
      {confirmDelete && card && (
        <ConfirmDialog
          title={`Remove ${card.name}?`}
          body={charges ? `The card and its payments are removed. Its ${charges} charge${charges === 1 ? ' stays' : 's stay'} in your spending, without a card.` : 'The card and its payments are removed.'}
          confirmLabel="Remove card"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function PayDialog({ card, statement, onClose }: { card: CreditCard; statement?: Statement; onClose: () => void }) {
  const data = useApp((s) => s.data)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const rates = useMemo(() => ratesOf(data), [data])
  const statements = useMemo(() => statementsOf(data, card, rates), [data, card, rates])
  const unpaid = statements.filter((s) => s.remaining > 0.005)
  const first = statement ?? unpaid.filter((s) => s.status !== 'open').pop() ?? unpaid[0] ?? statements[0]
  const [close, setClose] = useState(first?.close ?? '')
  const chosen = statements.find((s) => s.close === close)
  const [kind, setKind] = useState<'full' | 'other'>('full')
  const [other, setOther] = useState<number | null>(null)
  const [date, setDate] = useState(todayIso())
  const [fromId, setFromId] = useState(card.payFromId ?? '')
  const accounts = bankAccounts(data)
  const amount = kind === 'full' ? chosen?.remaining ?? 0 : other ?? 0
  const from = accounts.find((a) => a.id === fromId)
  const out = from && amount ? convert(amount, card.currency, from.currency, rates) : null

  const save = () => {
    if (!chosen || amount <= 0) return
    mutate((d) => {
      payCard(d, card.id, { date, amount, fromAccountId: fromId || null, statement: chosen.close }, ratesOf(d), uid('p'))
    })
    toast(`Paid ${formatMoney(amount, card.currency)} on ${card.name}.`, 'success')
    onClose()
  }

  return (
    <Dialog
      title={`Pay ${card.name}`}
      sub="Records a bill payment. If you pick an account, its balance goes down too."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!chosen || amount <= 0}>
            Record payment
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Statement">
          <select className="select" value={close} onChange={(e) => setClose(e.target.value)}>
            {statements.map((s) => (
              <option key={s.close} value={s.close}>
                Closes {dateLabel(s.close)} · due {dateLabel(s.due, false)} · {formatMoney(s.remaining, card.currency)} left
              </option>
            ))}
          </select>
        </Field>
        <Segmented
          value={kind}
          onChange={setKind}
          label="Amount"
          options={[
            { value: 'full', label: `The full ${formatMoney(chosen?.remaining ?? 0, card.currency)}` },
            { value: 'other', label: 'Another amount' }
          ]}
        />
        {kind === 'other' && (
          <Field label="Amount paid">
            <NumberInput value={other} onChange={setOther} prefix={symbolFor(card.currency)} autoFocus placeholder="0" />
          </Field>
        )}
        <div className="form-row">
          <Field label="Paid on">
            <input className="input" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value || todayIso())} />
          </Field>
          <Field label="Paid from">
            <select className="select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Don’t change any balance</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {from && out != null && amount > 0 && (
          <p className="muted">
            {from.name} goes down by <b className="num">{formatMoney(out, from.currency)}</b>.
          </p>
        )}
      </div>
    </Dialog>
  )
}
