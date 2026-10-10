import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, Landmark, Pencil, Plus, Wallet } from 'lucide-react'
import type { CashBucket } from '@shared/types'
import { monthChange, previousSnapshot } from '@/core/calc'
import { convert, formatPct } from '@/core/money'
import { useChartColors, useFmt, usePortfolio } from '@/hooks'
import { useNav } from '@/nav'
import { useApp } from '@/store'
import { AdjustDialog, BucketDialog, TransferDialog } from '@/components/BucketDialogs'
import { AllocationDonut } from '@/components/charts'
import { ExpenseDialog } from '@/components/ExpenseDialog'
import { HoldingDialog } from '@/components/HoldingDialog'
import { Card, CardHead, Delta, Empty, PageHead, Progress } from '@/components/ui'
import { ExampleBanner } from './shared'

export function Cash() {
  const data = useApp((s) => s.data)
  const go = useNav((s) => s.go)
  const p = usePortfolio()
  const fmt = useFmt()
  const colors = useChartColors()
  const [editing, setEditing] = useState<CashBucket | null>(null)
  const [adding, setAdding] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [adjusting, setAdjusting] = useState<CashBucket | null>(null)
  const [moving, setMoving] = useState<string | null | undefined>(undefined)
  const [income, setIncome] = useState(false)

  const change = useMemo(() => monthChange(data, p), [data, p])
  const prev = useMemo(() => previousSnapshot(data), [data])

  // Unassigned money across all accounts, in the base currency.
  const unassigned = p.accounts.reduce((s, a) => s + (convert(a.unassigned, a.holding.currency, fmt.base, p.rates) ?? 0), 0)
  const reserved = p.accounts.reduce((s, a) => s + (convert(a.reserved, a.holding.currency, fmt.base, p.rates) ?? 0), 0)
  const slices = [
    ...p.buckets.map((r) => ({ key: r.bucket.id, label: r.bucket.name, value: r.value ?? 0, color: colors.series[r.bucket.color % 8] })),
    ...(reserved > 0.005 ? [{ key: 'cards', label: 'For card bills', value: reserved, color: colors.ink3 }] : []),
    ...(unassigned > 0.005 ? [{ key: 'unassigned', label: 'Not in a bucket', value: unassigned, color: colors.none }] : [])
  ]

  return (
    <div className="page">
      <PageHead title="Cash buckets" sub="Give every dollar a job. Buckets split the money in your bank accounts by what it’s for.">
        {(data.buckets.length > 0 || p.accounts.length > 0) && (
          <button className="btn" onClick={() => setIncome(true)}>
            <ArrowDownLeft size={15} /> Add income
          </button>
        )}
        {data.buckets.length > 1 && (
          <button className="btn" onClick={() => setMoving(null)}>
            <ArrowLeftRight size={15} /> Move money
          </button>
        )}
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> New bucket
        </button>
      </PageHead>

      <ExampleBanner />

      {p.accounts.length === 0 && (
        <div className="banner">
          <Landmark size={17} />
          <div className="grow">Add your bank accounts first, then keep each bucket inside one. Your money is then counted once, and spending lowers the account too.</div>
          <button className="btn sm" onClick={() => setAddingAccount(true)}>
            Add bank account
          </button>
        </div>
      )}

      {data.buckets.length === 0 && p.accounts.length === 0 ? (
        <Card>
          <Empty
            icon={<Wallet size={22} />}
            title="No cash buckets yet"
            action={
              <button className="btn primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Create a bucket
              </button>
            }
          >
            Make a bucket for each purpose, such as an emergency fund, living expenses or a trip. Each one can have a target.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid-2 even">
            <Card>
              <CardHead
                title="Total cash"
                sub={`${p.accounts.length} account${p.accounts.length === 1 ? '' : 's'} and ${data.buckets.length} bucket${data.buckets.length === 1 ? '' : 's'}, in ${fmt.base}`}
              />
              <div className="hero-value" style={{ fontSize: 40 }}>{fmt.money(p.totals.cash)}</div>
              <div className="hero-delta">
                {change.byCategory ? (
                  <span>
                    <Delta value={change.byCategory.cash} text={fmt.money(change.byCategory.cash, { sign: true })} />
                    <span className="faint">this month</span>
                  </span>
                ) : (
                  <span className="faint">Monthly change starts next month.</span>
                )}
                {p.totals.netWorth > 0 && <span className="faint">{formatPct(p.totals.cash / p.totals.netWorth, false, 1)} of your net worth</span>}
              </div>
              {p.accounts.length > 0 && (
                <div className="acct-list">
                  {p.accounts.map((a) => {
                    const bal = a.holding.quantity
                    return (
                      <div key={a.holding.id} className="acct">
                        <div className="acct-top">
                          <span className="title">{a.holding.name}</span>
                          <span className="num">{fmt.money(bal, { currency: a.holding.currency })}</span>
                        </div>
                        <div className="acct-bar" aria-hidden>
                          {a.buckets.map((b) => (
                            <span key={b.id} style={{ flexGrow: Math.max(0, b.amount), background: `var(--s${(b.color % 8) + 1})` }} />
                          ))}
                          {a.reserved > 0 && <span className="reserved" style={{ flexGrow: a.reserved }} />}
                          {a.unassigned > 0 && <span style={{ flexGrow: a.unassigned, background: 'var(--s-none)' }} />}
                        </div>
                        <div className="sub-line">
                          {a.buckets.length ? `${a.buckets.length} bucket${a.buckets.length === 1 ? '' : 's'} · ` : ''}
                          {a.reserved > 0.005 ? `${fmt.money(a.reserved, { currency: a.holding.currency })} for card bills · ` : ''}
                          <span className={a.unassigned < -0.005 ? 'bad' : undefined}>
                            {a.unassigned < -0.005
                              ? `${fmt.money(-a.unassigned, { currency: a.holding.currency })} more set aside than the balance`
                              : `${fmt.money(a.unassigned, { currency: a.holding.currency })} not in a bucket`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
            <Card>
              <CardHead title="How it’s split" />
              <AllocationDonut slices={slices} centerLabel="cash" />
            </Card>
          </div>

          <div className="grid-3">
            {p.buckets.map((r) => {
              const b = r.bucket
              const before = prev?.buckets?.find((x) => x.id === b.id)
              const delta = before ? b.amount - (convert(before.amount, before.currency, b.currency, p.rates) ?? before.amount) : null
              return (
                <Card key={b.id} className="bucket">
                  <div className="bucket-top">
                    <i className="key-dot" style={{ background: `var(--s${(b.color % 8) + 1})`, width: 12, height: 12, borderRadius: 4 }} />
                    <span className="bucket-name" title={b.name}>{b.name}</span>
                    <button className="icon-btn" onClick={() => setEditing(b)} aria-label={`Edit ${b.name}`}>
                      <Pencil size={15} />
                    </button>
                  </div>
                  <div>
                    <div className="bucket-amount">{fmt.money(b.amount, { currency: b.currency })}</div>
                    <div className="sub-line">
                      {r.account ? `In ${r.account.name}` : 'Cash on its own'}
                      {b.currency !== fmt.base && r.value != null ? ` · ≈ ${fmt.money(r.value)}` : ''}
                    </div>
                    {delta != null && Math.abs(delta) > 0.005 && (
                      <div className={`sub-line ${delta >= 0 ? 'good' : 'bad'}`}>{fmt.money(delta, { currency: b.currency, sign: true })} this month</div>
                    )}
                  </div>
                  {r.progress != null && b.target ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Progress value={r.progress} tone={r.progress >= 1 ? 'good' : undefined} />
                      <div className="sub-line num">
                        {formatPct(Math.min(r.progress, 9.99), false, 0)} of {fmt.money(b.target, { currency: b.currency })}
                        {r.progress < 1 && ` · ${fmt.money(b.target - b.amount, { currency: b.currency })} to go`}
                      </div>
                    </div>
                  ) : (
                    <div className="sub-line">No target set</div>
                  )}
                  <div className="bucket-actions">
                    <button className="btn sm" onClick={() => setAdjusting(b)}>
                      Add or take out
                    </button>
                    {data.buckets.length > 1 && (
                      <button className="btn sm ghost" onClick={() => setMoving(b.id)}>
                        <ArrowLeftRight size={14} /> Move
                      </button>
                    )}
                  </div>
                </Card>
              )
            })}
            <button className="choice new-bucket" onClick={() => setAdding(true)}>
              <div className="ic">
                <Plus size={18} />
              </div>
              <div>
                <b>New bucket</b>
                <span>Set money aside for something</span>
              </div>
            </button>
          </div>

          <p className="faint" style={{ fontSize: 13 }}>
            Day-to-day spending comes out of these buckets.{' '}
            <button className="link-btn" onClick={() => go('spending')}>
              Open Spending
            </button>
          </p>
        </>
      )}

      {adding && <BucketDialog onClose={() => setAdding(false)} />}
      {addingAccount && <HoldingDialog kind="bank" onClose={() => setAddingAccount(false)} />}
      {editing && <BucketDialog bucket={editing} onClose={() => setEditing(null)} />}
      {adjusting && <AdjustDialog bucket={adjusting} onClose={() => setAdjusting(null)} />}
      {moving !== undefined && <TransferDialog fromId={moving ?? undefined} onClose={() => setMoving(undefined)} />}
      {income && <ExpenseDialog kind="income" onClose={() => setIncome(false)} />}
    </div>
  )
}
