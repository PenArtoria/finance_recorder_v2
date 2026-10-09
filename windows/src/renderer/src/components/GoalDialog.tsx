import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Goal, GoalSource } from '@shared/types'
import { addMonths, monthKey } from '@/core/calc'
import { uid } from '@/core/data'
import { formatQty, symbolFor } from '@/core/money'
import { isUnits } from '@/core/trades'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { ConfirmDialog, Dialog, Field, NumberInput, Segmented } from './ui'

type Kind = GoalSource['kind']
type MoneyKind = Exclude<Kind, 'units'>

const KIND_LABEL: Record<MoneyKind, string> = {
  netWorth: 'My net worth',
  investments: 'All my investments',
  equities: 'Stocks & funds',
  crypto: 'Crypto',
  cash: 'All my cash',
  bucket: 'One cash bucket',
  holding: 'One holding',
  manual: 'An amount I update by hand'
}

export function GoalDialog({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const base = useApp((s) => s.data.settings.baseCurrency)
  const buckets = useApp((s) => s.data.buckets)
  const holdings = useApp((s) => s.data.holdings)
  const editing = !!goal

  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState<number | null>(goal?.target ?? null)
  const [currency, setCurrency] = useState(goal?.currency ?? base)
  const [hasDeadline, setHasDeadline] = useState(goal ? !!goal.deadline : true)
  const [deadline, setDeadline] = useState(goal?.deadline ?? addMonths(monthKey(), 12))
  const unitHoldings = holdings.filter((h) => isUnits(h.type))
  const [goalType, setGoalType] = useState<'money' | 'units'>(goal?.source.kind === 'units' ? 'units' : 'money')
  const [kind, setKind] = useState<MoneyKind>(goal && goal.source.kind !== 'units' ? goal.source.kind : 'netWorth')
  const [bucketId, setBucketId] = useState(goal?.source.kind === 'bucket' ? goal.source.id : buckets[0]?.id ?? '')
  const [holdingId, setHoldingId] = useState(goal?.source.kind === 'holding' ? goal.source.id : holdings[0]?.id ?? '')
  const [unitId, setUnitId] = useState(goal?.source.kind === 'units' ? goal.source.id : unitHoldings[0]?.id ?? '')
  const unitHolding = unitHoldings.find((h) => h.id === unitId)
  const [manual, setManual] = useState<number | null>(goal?.source.kind === 'manual' ? goal.source.current : 0)
  const [note, setNote] = useState(goal?.note ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sourceOk = goalType === 'units' ? !!unitHolding : (kind !== 'bucket' || bucketId) && (kind !== 'holding' || holdingId)
  const valid = name.trim() && target && target > 0 && sourceOk && (!hasDeadline || /^\d{4}-\d{2}$/.test(deadline))

  const save = () => {
    setTried(true)
    if (!valid) return
    const source: GoalSource =
      goalType === 'units'
        ? { kind: 'units', id: unitId }
        : kind === 'bucket'
        ? { kind, id: bucketId }
        : kind === 'holding'
          ? { kind, id: holdingId }
          : kind === 'manual'
            ? { kind, current: manual ?? 0 }
            : { kind }
    const next: Goal = {
      id: goal?.id ?? uid('g'),
      name: name.trim(),
      target: target ?? 0,
      currency: goalType === 'units' ? unitHolding?.currency ?? currency : currency,
      deadline: hasDeadline ? deadline : null,
      source,
      note: note.trim() || undefined,
      createdAt: goal?.createdAt ?? Date.now()
    }
    mutate((d) => {
      const i = d.goals.findIndex((g) => g.id === next.id)
      if (i >= 0) d.goals[i] = next
      else d.goals.push(next)
      d.onboarded = true
    })
    toast(editing ? 'Goal updated.' : 'Goal added.', 'success')
    onClose()
  }

  const remove = () => {
    if (!goal) return
    mutate((d) => {
      d.goals = d.goals.filter((g) => g.id !== goal.id)
    })
    toast('Goal removed.', 'info')
    onClose()
  }

  return (
    <>
      <Dialog
        title={editing ? 'Edit goal' : 'New goal'}
        sub="Progress updates by itself from your holdings and buckets."
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
              {editing ? 'Save changes' : 'Add goal'}
            </button>
          </>
        }
      >
        <div className="form">
          <Segmented
            value={goalType}
            onChange={setGoalType}
            label="Goal type"
            options={[
              { value: 'money', label: 'An amount of money' },
              { value: 'units', label: 'Units of an ETF or stock' }
            ]}
          />
          <Field label="Goal" error={tried && !name.trim() ? 'Name the goal.' : undefined}>
            <input
              className="input"
              value={name}
              autoFocus={!editing}
              placeholder={goalType === 'units' ? 'e.g. Own 100 VWRA' : 'e.g. First $100k, House deposit'}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {goalType === 'units' && (
            <>
              <Field label="Holding" error={tried && !unitHolding ? 'Add the ETF or stock on the Holdings page first.' : undefined}>
                <select className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  {unitHoldings.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.symbol ? `${h.symbol} · ${h.name}` : h.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Target units"
                hint={unitHolding ? `You own ${formatQty(unitHolding.quantity)} now. Buys you record with Buy more count toward it.` : undefined}
                error={tried && !(target && target > 0) ? 'Enter how many units you want to own.' : undefined}
              >
                <NumberInput value={target} onChange={setTarget} placeholder="e.g. 100" />
              </Field>
            </>
          )}
          {goalType === 'money' && (
          <div className="form-row">
            <Field label="Target amount" error={tried && !(target && target > 0) ? 'Enter a target above 0.' : undefined}>
              <NumberInput value={target} onChange={setTarget} prefix={symbolFor(currency)} placeholder="0" />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} />
            </Field>
          </div>
          )}
          {goalType === 'money' && (
          <Field label="What counts toward it">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as MoneyKind)}>
              {(Object.keys(KIND_LABEL) as MoneyKind[]).map((k) => (
                <option key={k} value={k} disabled={(k === 'bucket' && !buckets.length) || (k === 'holding' && !holdings.length)}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          )}
          {goalType === 'money' && kind === 'bucket' && (
            <Field label="Bucket">
              <select className="select" value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {goalType === 'money' && kind === 'holding' && (
            <Field label="Holding">
              <select className="select" value={holdingId} onChange={(e) => setHoldingId(e.target.value)}>
                {holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.symbol ? `${h.symbol} · ${h.name}` : h.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {goalType === 'money' && kind === 'manual' && (
            <Field label="Saved so far">
              <NumberInput value={manual} onChange={setManual} prefix={symbolFor(currency)} />
            </Field>
          )}
          <div className="form-row" style={{ alignItems: 'end' }}>
            <Field label="Target date">
              <select className="select" value={hasDeadline ? 'yes' : 'no'} onChange={(e) => setHasDeadline(e.target.value === 'yes')}>
                <option value="yes">By a month</option>
                <option value="no">No deadline</option>
              </select>
            </Field>
            {hasDeadline && (
              <Field label="Month" error={tried && !/^\d{4}-\d{2}$/.test(deadline) ? 'Pick a month.' : undefined}>
                <input className="input" type="month" value={deadline} min={monthKey()} onChange={(e) => setDeadline(e.target.value)} />
              </Field>
            )}
          </div>
          <Field label="Note (optional)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Dialog>
      {confirmDelete && goal && (
        <ConfirmDialog title={`Remove “${goal.name}”?`} body="Only the goal is removed. Your holdings and buckets stay as they are." confirmLabel="Remove" onConfirm={remove} onClose={() => setConfirmDelete(false)} />
      )}
    </>
  )
}
