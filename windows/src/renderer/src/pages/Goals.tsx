import { useMemo, useState } from 'react'
import { Pencil, Plus, Target } from 'lucide-react'
import type { Goal } from '@shared/types'
import { goalProgress, monthLabel } from '@/core/calc'
import { formatPct } from '@/core/money'
import { useFmt, usePortfolio } from '@/hooks'
import { useApp } from '@/store'
import { GoalDialog } from '@/components/GoalDialog'
import { Card, Empty, PageHead, Progress } from '@/components/ui'
import { ExampleBanner, GoalStatusPill } from './shared'

export function Goals() {
  const data = useApp((s) => s.data)
  const p = usePortfolio()
  const fmt = useFmt()
  const [editing, setEditing] = useState<Goal | null>(null)
  const [adding, setAdding] = useState(false)
  const goals = useMemo(() => data.goals.map((g) => goalProgress(g, data, p)), [data, p])

  return (
    <div className="page">
      <PageHead title="Goals" sub="Progress comes straight from your holdings and buckets, so it stays up to date.">
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> New goal
        </button>
      </PageHead>

      <ExampleBanner />

      {goals.length === 0 ? (
        <Card>
          <Empty
            icon={<Target size={22} />}
            title="No goals yet"
            action={
              <button className="btn primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add a goal
              </button>
            }
          >
            A goal can follow your whole net worth, all your cash, one bucket or one holding. Add a target month to see how much you need to put aside each month.
          </Empty>
        </Card>
      ) : (
        <div className="grid-2 even">
          {goals.map((g) => {
            const ccy = g.goal.currency
            return (
              <Card key={g.goal.id} className="goal-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="card-title">{g.goal.name}</div>
                    <div className="card-sub">
                      Tracks {g.sourceLabel}
                      {g.goal.deadline ? ` · by ${monthLabel(g.goal.deadline, 'long')}` : ''}
                    </div>
                  </div>
                  <GoalStatusPill status={g.status} />
                  <button className="icon-btn" onClick={() => setEditing(g.goal)} aria-label={`Edit ${g.goal.name}`}>
                    <Pencil size={15} />
                  </button>
                </div>
                <div className="goal-figures">
                  <span className="big num">{fmt.money(g.current, { currency: ccy })}</span>
                  <span className="muted">of {fmt.money(g.goal.target, { currency: ccy })}</span>
                  <span className="faint" style={{ marginLeft: 'auto' }}>{formatPct(Math.min(g.pct, 9.99), false, 0)}</span>
                </div>
                <Progress value={g.pct} tone={g.status === 'reached' ? 'good' : undefined} />
                <div className="goal-meta">
                  <div>
                    <div className="k">Left to go</div>
                    <div className="v num">{g.remaining != null ? fmt.money(g.remaining, { currency: ccy }) : '—'}</div>
                  </div>
                  <div>
                    <div className="k">{g.goal.deadline ? 'Needed per month' : 'Months to go'}</div>
                    <div className="v num">
                      {g.status === 'reached'
                        ? 'Done'
                        : g.goal.deadline
                          ? g.perMonth != null
                            ? fmt.money(g.perMonth, { currency: ccy })
                            : '—'
                          : g.projected
                            ? `About ${Math.max(1, monthsBetweenNow(g.projected))}`
                            : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="k">Your pace</div>
                    <div className="v num">
                      {g.pace != null ? `${fmt.money(g.pace, { currency: ccy, sign: true })}/mo` : g.goal.source.kind === 'manual' ? 'Updated by hand' : 'Needs a past month'}
                    </div>
                  </div>
                </div>
                {g.status !== 'reached' && g.projected && (
                  <div className="sub-line">At your recent pace you’ll get there around {monthLabel(g.projected, 'long')}.</div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {adding && <GoalDialog onClose={() => setAdding(false)} />}
      {editing && <GoalDialog goal={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function monthsBetweenNow(month: string): number {
  const now = new Date()
  const [y, m] = month.split('-').map(Number)
  return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1))
}
