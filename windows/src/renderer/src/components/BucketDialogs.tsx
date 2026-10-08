import { useMemo, useState } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'
import type { CashBucket } from '@shared/types'
import { uid } from '@/core/data'
import { convert, formatMoney, symbolFor } from '@/core/money'
import { ratesOf } from '@/core/calc'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { ConfirmDialog, Dialog, Field, NumberInput, Segmented } from './ui'

export const BUCKET_SUGGESTIONS = ['Emergency fund', 'Living expenses', 'Travel', 'Investment reserve', 'Big purchase', 'Gifts']

export function BucketDialog({ bucket, onClose }: { bucket?: CashBucket; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const base = useApp((s) => s.data.settings.baseCurrency)
  const count = useApp((s) => s.data.buckets.length)
  const editing = !!bucket
  const [name, setName] = useState(bucket?.name ?? '')
  const [currency, setCurrency] = useState(bucket?.currency ?? base)
  const [amount, setAmount] = useState<number | null>(bucket?.amount ?? null)
  const [target, setTarget] = useState<number | null>(bucket?.target ?? null)
  const [color, setColor] = useState(bucket?.color ?? count % 8)
  const [note, setNote] = useState(bucket?.note ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const valid = name.trim().length > 0 && amount != null

  const save = () => {
    setTried(true)
    if (!valid) return
    const next: CashBucket = {
      id: bucket?.id ?? uid('b'),
      name: name.trim(),
      amount: amount ?? 0,
      currency,
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

  return (
    <>
      <Dialog
        title={editing ? `Edit ${bucket?.name}` : 'New cash bucket'}
        sub="A bucket is money set aside for one purpose."
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
                <button key={s} className="pill" style={{ border: 0, cursor: 'pointer' }} onClick={() => setName(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="form-row">
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} />
            </Field>
            <Field label="Amount now" error={tried && amount == null ? 'Enter the amount, even if it is 0.' : undefined}>
              <NumberInput value={amount} onChange={setAmount} prefix={symbolFor(currency)} placeholder="0.00" />
            </Field>
          </div>
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
            <input className="input" value={note} placeholder="e.g. HSBC savings account" onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Dialog>
      {confirmDelete && bucket && (
        <ConfirmDialog
          title={`Remove ${bucket.name}?`}
          body="The bucket and its amount are removed from your cash. Past months keep their recorded values."
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

export function AdjustDialog({ bucket, onClose }: { bucket: CashBucket; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const [side, setSide] = useState<'add' | 'take'>('add')
  const [amount, setAmount] = useState<number | null>(null)
  const after = bucket.amount + (side === 'add' ? 1 : -1) * (amount ?? 0)

  const save = () => {
    if (!amount) return
    mutate((d) => {
      const b = d.buckets.find((x) => x.id === bucket.id)
      if (b) b.amount = +after.toFixed(8)
    })
    toast(`${bucket.name}: ${formatMoney(after, bucket.currency)}`, 'success')
    onClose()
  }

  return (
    <Dialog
      title={bucket.name}
      sub={`Now ${formatMoney(bucket.amount, bucket.currency)}`}
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
        <Field label="Amount">
          <NumberInput value={amount} onChange={setAmount} prefix={symbolFor(bucket.currency)} autoFocus placeholder="0.00" />
        </Field>
        <p className="muted">
          New balance <b className="num" style={{ color: after < 0 ? 'var(--bad)' : 'var(--ink)' }}>{formatMoney(after, bucket.currency)}</b>
        </p>
      </div>
    </Dialog>
  )
}

export function TransferDialog({ fromId, onClose }: { fromId?: string; onClose: () => void }) {
  const buckets = useApp((s) => s.data.buckets)
  const data = useApp((s) => s.data)
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

  const save = () => {
    if (!valid || !A || !B || received == null || !amount) return
    mutate((d) => {
      const a = d.buckets.find((x) => x.id === A.id)
      const b = d.buckets.find((x) => x.id === B.id)
      if (a && b) {
        a.amount = +(a.amount - amount).toFixed(8)
        b.amount = +(b.amount + received).toFixed(8)
      }
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'end' }}>
          <Field label="From">
            <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({formatMoney(b.amount, b.currency)})
                </option>
              ))}
            </select>
          </Field>
          <ArrowRight size={18} style={{ marginBottom: 10, color: 'var(--ink-3)' }} />
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
      </div>
    </Dialog>
  )
}
