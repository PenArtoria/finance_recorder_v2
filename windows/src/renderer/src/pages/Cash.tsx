import { useMemo, useState } from 'react'
import { ArrowLeftRight, Pencil, Plus, Wallet } from 'lucide-react'
import type { CashBucket } from '@shared/types'
import { monthChange } from '@/core/calc'
import { formatPct } from '@/core/money'
import { useChartColors, useFmt, usePortfolio } from '@/hooks'
import { useApp } from '@/store'
import { AdjustDialog, BucketDialog, TransferDialog } from '@/components/BucketDialogs'
import { AllocationDonut } from '@/components/charts'
import { Card, CardHead, Delta, Empty, PageHead, Progress } from '@/components/ui'
import { ExampleBanner } from './shared'

export function Cash() {
  const data = useApp((s) => s.data)
  const p = usePortfolio()
  const fmt = useFmt()
  const colors = useChartColors()
  const [editing, setEditing] = useState<CashBucket | null>(null)
  const [adding, setAdding] = useState(false)
  const [adjusting, setAdjusting] = useState<CashBucket | null>(null)
  const [moving, setMoving] = useState<string | null | undefined>(undefined)

  const change = useMemo(() => monthChange(data, p), [data, p])
  const bucketDelta = useMemo(() => new Map(change.items.filter((i) => i.kind === 'bucket').map((i) => [i.key, i])), [change])

  const slices = p.buckets.map((r) => ({
    key: r.bucket.id,
    label: r.bucket.name,
    value: r.value ?? 0,
    color: colors.series[r.bucket.color % 8]
  }))

  return (
    <div className="page">
      <PageHead title="Cash buckets" sub="Give every dollar a job. Split your cash by what it’s for.">
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

      {data.buckets.length === 0 ? (
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
            Make a bucket for each purpose, such as an emergency fund, living expenses or a trip. Each one can have its own currency and target.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid-2">
            <Card>
              <CardHead title="Total cash" sub={`${data.buckets.length} bucket${data.buckets.length === 1 ? '' : 's'}, shown in ${fmt.base}`} />
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
            </Card>
            <Card>
              <CardHead title="How it’s split" />
              <AllocationDonut slices={slices} centerLabel="cash" />
            </Card>
          </div>

          <div className="grid-3">
            {p.buckets.map((r) => {
              const b = r.bucket
              const d = bucketDelta.get(b.id)
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
                      {b.currency !== fmt.base && r.value != null ? `≈ ${fmt.money(r.value)} · ` : ''}
                      {d ? (
                        <span className={d.delta >= 0 ? 'good' : 'bad'}>
                          {fmt.money(d.delta, { sign: true })} this month
                        </span>
                      ) : change.previousMonth ? (
                        'No change this month'
                      ) : (
                        b.note || 'Cash'
                      )}
                    </div>
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
            <button className="choice" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 180, borderStyle: 'dashed' }} onClick={() => setAdding(true)}>
              <div className="ic">
                <Plus size={18} />
              </div>
              <div>
                <b>New bucket</b>
                <span>Set money aside for something</span>
              </div>
            </button>
          </div>
        </>
      )}

      {adding && <BucketDialog onClose={() => setAdding(false)} />}
      {editing && <BucketDialog bucket={editing} onClose={() => setEditing(null)} />}
      {adjusting && <AdjustDialog bucket={adjusting} onClose={() => setAdjusting(null)} />}
      {moving !== undefined && <TransferDialog fromId={moving ?? undefined} onClose={() => setMoving(undefined)} />}
    </div>
  )
}
