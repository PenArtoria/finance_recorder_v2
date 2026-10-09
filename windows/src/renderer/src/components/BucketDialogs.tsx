import { useMemo, useState } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'
import type { CashBucket } from '@shared/types'
import { bankAccounts, linkedAccount, moveMoney, unassignedIn } from '@/core/cash'
import { uid } from '@/core/data'
import { convert, formatMoney, symbolFor } from '@/core/money'
import { ratesOf } from '@/core/calc'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { ConfirmDialog, Dialog, Field, NumberInput, Segmented } from './ui'

export const BUCKET_SUGGESTIONS = ['Emergency fund', 'Living expenses', 'Travel', 'Investment reserve', 'Big purchase', 'Gifts']

export function BucketDialog({ bucket, onClose }: { bucket?: CashBucket; onClose: () => void }) {
  const data = useApp((s) => s.data)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const rates = useMemo(() => ratesOf(data), [data])
  const accounts = bankAccounts(data)
  const editing = !!bucket
  const [name, setName] = useState(bucket?.name ?? '')
  const [accountId, setAccountId] = useState<string>(bucket ? bucket.accountId ?? '' : accounts[0]?.id ?? '')
  const account = accounts.find((a) => a.id === accountId)
  const [ownCurrency, setOwnCurrency] = useState(bucket?.currency ?? data.settings.baseCurrency)
  const currency = account ? account.currency : ownCurrency
  const [amount, setAmount] = useState<number | null>(bucket?.amount ?? null)
  const [target, setTarget] = useState<number | null>(bucket?.target ?? null)
  const [color, setColor] = useState(bucket?.color ?? data.buckets.length % 8)
  const [note, setNote] = useState(bucket?.note ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Money in the account not yet given to any bucket (this bucket's current share counts as free).
  const free = account
    ? unassignedIn(data, account.id, rates) + (bucket && bucket.accountId === account.id ? bucket.amount : 0)
    : null
  const valid = name.trim().length > 0 && amount != null

  const save = () => {
    setTried(true)
    if (!valid) return
    const next: CashBucket = {
      id: bucket?.id ?? uid('b'),
      name: name.trim(),
      amount: amount ?? 0,
      currency,
      accountId: account ? account.id : null,
      target: target && target > 0 ? target : null,
      color,
      note: note.trim() || undefined,
      createdAt: bucket?.createdAt ?? Date.now()
    }
    mutate((d) => {
      const i = d.buckets.findIndex((b) => b.id === next.id)
      if (i >= 0) d.buckets[i] = next
      else d.buckets.push(next)
      d.onboarded = true
    })
    toast(editing ? `${next.name} updated.` : `${next.name} added.`, 'success')
    onClose()
  }

  const remove = () => {
    if (!bucket) return
    mutate((d) => {
      d.buckets = d.buckets.filter((b) => b.id !== bucket.id)
      d.goals = d.goals.filter((g) => !(g.source.kind === 'bucket' && g.source.id === bucket.id))
    })
    toast(`${bucket.name} removed.`, 'info')
    onClose()
  }

  const linkedNow = bucket ? linkedAccount(data, bucket) : undefined

  return (
    <>
      <Dialog
        title={editing ? `Edit ${bucket?.name}` : 'New cash bucket'}
        sub="A bucket is money set aside for one purpose, such as an emergency fund or a trip."
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
              {editing ? 'Save changes' : 'Add bucket'}
            </button>
          </>
        }
      >
        <div className="form">
          <Field label="Name" error={tried && !name.trim() ? 'Give the bucket a name.' : undefined}>
            <input className="input" value={name} autoFocus={!editing} placeholder="e.g. Emergency fund" onChange={(e) => setName(e.target.value)} />
          </Field>
          {!editing && !name && (
            <div className="swatches">
              {BUCKET_SUGGESTIONS.map((s) => (
                <button key={s} className="pill pill-btn" onClick={() => setName(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <Field
            label="Where is this money kept?"
            hint={
              account
                ? `It’s part of ${account.name}, so it’s counted once, inside that account.`
                : accounts.length
                  ? 'Counted as cash on its own, e.g. cash in your wallet.'
                  : 'Add your bank accounts on the Holdings page to keep buckets inside them.'
            }
          >
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
              <option value="">Not in a tracked account (cash, wallet…)</option>
            </select>
          </Field>
          <div className="form-row">
            <Field label="Currency" hint={account ? 'Same as the account.' : undefined}>
              {account ? <input className="input" value={currency} disabled /> : <CurrencySelect value={ownCurrency} onChange={setOwnCurrency} />}
            </Field>
            <Field
              label="Amount set aside"
              error={tried && amount == null ? 'Enter the amount, even if it is 0.' : undefined}
              hint={free != null ? `${formatMoney(free, currency)} of ${account!.name} isn’t in a bucket yet.` : undefined}
            >
              <NumberInput value={amount} onChange={setAmount} prefix={symbolFor(currency)} placeholder="0.00" />
            </Field>
          </div>
          {free != null && amount != null && amount > free + 0.005 && (
            <div className="banner warn">
              <div className="grow">
                That’s {formatMoney(amount - free, currency)} more than {account!.name} has free. Update the account balance on the Holdings page if it has grown.
              </div>
            </div>
          )}
          <Field label="Target (optional)" hint="Shows a progress bar toward this amount.">
            <NumberInput value={target} onChange={setTarget} prefix={symbolFor(currency)} placeholder="0.00" />
          </Field>
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
      </Dialog>
      {confirmDelete && bucket && (
        <ConfirmDialog
          title={`Remove ${bucket.name}?`}
          body={
            linkedNow
              ? `Its ${formatMoney(bucket.amount, bucket.currency)} goes back to unassigned money in ${linkedNow.name}. Your balance doesn’t change.`
              : 'The bucket and its amount are removed from your cash. Past months keep their recorded values.'
          }
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

export function AdjustDialog({ bucket, onClose }: { bucket: CashBucket; onClose: () => void }) {
  const data = useApp((s) => s.data)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const rates = useMemo(() => ratesOf(data), [data])
  const account = linkedAccount(data, bucket)
  const [side, setSide] = useState<'add' | 'take'>('add')
  const [amount, setAmount] = useState<number | null>(null)
  // For a bucket inside an account: does the money also enter or leave the bank?
  const [newMoney, setNewMoney] = useState(false)
  const [leftBank, setLeftBank] = useState(true)
  const touchesBank = account ? (side === 'add' ? newMoney : leftBank) : false
  const delta = (side === 'add' ? 1 : -1) * (amount ?? 0)
  const after = bucket.amount + delta
  const free = account ? unassignedIn(data, account.id, rates) : null

  const save = () => {
    if (!amount) return
    mutate((d) => {
      if (touchesBank || !account) moveMoney(d, { kind: 'bucket', id: bucket.id }, delta, ratesOf(d))
      else {
        const b = d.buckets.find((x) => x.id === bucket.id)
        if (b) b.amount = +(b.amount + delta).toFixed(8)
      }
    })
    toast(`${bucket.name}: ${formatMoney(after, bucket.currency)}`, 'success')
    onClose()
  }

  return (
    <Dialog
      title={bucket.name}
      sub={`Now ${formatMoney(bucket.amount, bucket.currency)}${account ? ` · kept in ${account.name}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!amount}>
            {side === 'add' ? 'Add money' : 'Take out'}
          </button>
        </>
      }
    >
      <div className="form">
        <Segmented
          value={side}
          onChange={setSide}
          label="Direction"
          options={[
            { value: 'add', label: 'Add money' },
            { value: 'take', label: 'Take out' }
          ]}
        />
        <Field label="Amount" hint={account && side === 'add' && !newMoney && free != null ? `${formatMoney(free, bucket.currency)} unassigned in ${account.name}.` : undefined}>
          <NumberInput value={amount} onChange={setAmount} prefix={symbolFor(bucket.currency)} autoFocus placeholder="0.00" />
        </Field>
        {account && side === 'add' && (
          <label className="check">
            <input type="checkbox" checked={newMoney} onChange={(e) => setNewMoney(e.target.checked)} />
            This is new money paid into {account.name} (e.g. salary). Leave it off to use unassigned money.
          </label>
        )}
        {account && side === 'take' && (
          <label className="check">
            <input type="checkbox" checked={leftBank} onChange={(e) => setLeftBank(e.target.checked)} />
            The money left {account.name} (spent or withdrawn). Turn it off to move it back to unassigned.
          </label>
        )}
        <p className="muted">
          New balance <b className="num" style={{ color: after < 0 ? 'var(--bad)' : 'var(--ink)' }}>{formatMoney(after, bucket.currency)}</b>
          {account && touchesBank && amount ? (
            <>
              {' '}· {account.name} becomes <b className="num">{formatMoney(account.quantity + (convert(delta, bucket.currency, account.currency, rates) ?? delta), account.currency)}</b>
            </>
          ) : null}
        </p>
        <p className="faint" style={{ fontSize: 12.5 }}>To note down day-to-day spending, use the Spending page instead. It keeps a dated record.</p>
      </div>
    </Dialog>
  )
}

export function TransferDialog({ fromId, onClose }: { fromId?: string; onClose: () => void }) {
  const data = useApp((s) => s.data)
  const buckets = data.buckets
  const rates = useMemo(() => ratesOf(data), [data])
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const [from, setFrom] = useState(fromId ?? buckets[0]?.id ?? '')
  const [to, setTo] = useState(buckets.find((b) => b.id !== (fromId ?? buckets[0]?.id))?.id ?? '')
  const [amount, setAmount] = useState<number | null>(null)
  const A = buckets.find((b) => b.id === from)
  const B = buckets.find((b) => b.id === to)
  const received = A && B && amount ? convert(amount, A.currency, B.currency, rates) : null
  const valid = A && B && A.id !== B.id && amount && amount > 0 && received != null
  const accA = A ? linkedAccount(data, A) : undefined
  const accB = B ? linkedAccount(data, B) : undefined

  const save = () => {
    if (!valid || !A || !B || received == null || !amount) return
    // Each side moves its own account's balance too, so a move inside one account cancels out.
    mutate((d) => {
      const r = ratesOf(d)
      moveMoney(d, { kind: 'bucket', id: A.id }, -amount, r)
      moveMoney(d, { kind: 'bucket', id: B.id }, received, r)
    })
    toast(`Moved ${formatMoney(amount, A.currency)} from ${A.name} to ${B.name}.`, 'success')
    onClose()
  }

  return (
    <Dialog
      title="Move money between buckets"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!valid}>
            Move money
          </button>
        </>
      }
    >
      <div className="form">
        <div className="transfer-row">
          <Field label="From">
            <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({formatMoney(b.amount, b.currency)})
                </option>
              ))}
            </select>
          </Field>
          <ArrowRight size={18} className="faint" style={{ marginBottom: 10 }} />
          <Field label="To">
            <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Amount" error={A && B && A.id === B.id ? 'Choose two different buckets.' : undefined}>
          <NumberInput value={amount} onChange={setAmount} prefix={A ? symbolFor(A.currency) : ''} autoFocus placeholder="0.00" />
        </Field>
        {A && B && A.currency !== B.currency && amount ? (
          <p className="muted">
            {received != null ? (
              <>
                {B.name} receives <b className="num">{formatMoney(received, B.currency)}</b> at today’s rate.
              </>
            ) : (
              <>No exchange rate for {A.currency} → {B.currency} yet. Refresh prices first.</>
            )}
          </p>
        ) : null}
        {accA?.id !== accB?.id && (accA || accB) && amount ? (
          <p className="faint" style={{ fontSize: 12.5 }}>
            The money also moves between accounts: {accA ? accA.name : 'cash on its own'} → {accB ? accB.name : 'cash on its own'}.
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
