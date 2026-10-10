import { useMemo, useState } from 'react'
import { ArrowRight, Plus, ReceiptText, RefreshCw, Target } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABEL, goalProgress, history, monthChange, monthKey, monthLabel } from '@/core/calc'
import { nextBill, statementsOf } from '@/core/cards'
import { byCategory, categoryLabel, dailyIncome, dailyTotals, expensesIn, isIncome } from '@/core/spending'
import { dateLabel, todayIso } from '@/core/trades'
import { formatPct } from '@/core/money'
import { useChartColors, useFmt, usePortfolio } from '@/hooks'
import { useNav } from '@/nav'
import { useApp } from '@/store'
import { AllocationDonut, NetWorthChart } from '@/components/charts'
import { CategoryIcon, ExpenseDialog } from '@/components/ExpenseDialog'
import { HoldingDialog } from '@/components/HoldingDialog'
import { Card, CardHead, Delta, PageHead, Progress, Segmented } from '@/components/ui'
import { StatementPill } from './Cards'
import { ExampleBanner, GoalStatusPill, useGoalFormat } from './shared'

function greeting(name: string) {
  const h = new Date().getHours()
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}

export function Overview() {
  const data = useApp((s) => s.data)
  const prices = useApp((s) => s.prices)
  const refresh = useApp((s) => s.refreshPrices)
  const go = useNav((s) => s.go)
  const p = usePortfolio()
  const fmt = useFmt()
  const colors = useChartColors()
  const gv = useGoalFormat()
  const [range, setRange] = useState<'12' | 'all'>('12')
  const [adding, setAdding] = useState<'investment' | 'bank' | null>(null)
  const [spending, setSpending] = useState(false)

  const points = useMemo(() => history(data, p), [data, p])
  const shownPoints = range === 'all' ? points : points.slice(-13)
  const change = useMemo(() => monthChange(data, p), [data, p])
  const goals = useMemo(() => data.goals.map((g) => goalProgress(g, data, p)), [data, p])

  const slices = CATEGORIES.map((c, i) => ({ key: c, label: CATEGORY_LABEL[c], value: p.totals[c], color: colors.series[i] })).filter(
    (s) => s.value !== 0 || s.key === 'cash' || s.key === 'equities'
  )

  const spent = useMemo(() => {
    const items = expensesIn(data, monthKey()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    const daily = dailyTotals(items, p.base, p.rates)
    return {
      items,
      total: [...daily.values()].reduce((s, v) => s + v, 0),
      income: [...dailyIncome(items, p.base, p.rates).values()].reduce((s, v) => s + v, 0),
      today: daily.get(todayIso()) ?? 0,
      top: byCategory(items, p.base, p.rates)[0]
    }
  }, [data, p.base, p.rates])

  const bills = useMemo(
    () =>
      data.cards
        .map((card) => ({ card, s: nextBill(statementsOf(data, card, p.rates)) }))
        .filter((b): b is { card: typeof b.card; s: NonNullable<typeof b.s> } => !!b.s && b.s.remaining > 0.005)
        .sort((a, b) => a.s.due.localeCompare(b.s.due)),
    [data, p.rates]
  )

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const empty = data.holdings.length === 0 && data.buckets.length === 0

  return (
    <div className="page">
      <PageHead title={greeting(data.settings.name)} sub={`Here’s where your money stands on ${today}.`}>
        <button className="btn ghost" onClick={() => refresh({ forceFx: true })} disabled={prices.loading}>
          <RefreshCw size={15} className={prices.loading ? 'spin' : ''} /> Refresh prices
        </button>
        <button className="btn" onClick={() => setSpending(true)}>
          <ReceiptText size={15} /> Add spending
        </button>
        <button className="btn primary" onClick={() => setAdding('investment')}>
          <Plus size={16} /> Add holding
        </button>
      </PageHead>

      <ExampleBanner />

      <Card>
        <div className="hero">
          <div>
            <div className="hero-label">Net worth · {fmt.base}</div>
            <div className="hero-value">{fmt.money(p.totals.netWorth)}</div>
            <div className="hero-delta">
              {change.delta != null ? (
                <span>
                  <Delta value={change.delta} text={`${fmt.money(change.delta, { sign: true })} (${formatPct(change.pct)})`} />
                  <span className="faint">since end of {monthLabel(change.previousMonth!, 'short')}</span>
                </span>
              ) : (
                <span className="faint">Monthly change shows from next month, or add a past month in History.</span>
              )}
              {p.dayPct != null && Math.abs(p.dayChange) > 0.005 && (
                <span>
                  <Delta value={p.dayChange} text={`${fmt.money(p.dayChange, { sign: true })} (${formatPct(p.dayPct)})`} />
                  <span className="faint">today</span>
                </span>
              )}
            </div>
          </div>
          {change.detailed && change.market != null && change.flow != null ? (
            <div className="split-chips">
              <div className="split-chip">
                <span className="muted">Market moves</span>
                <b className={`num ${change.market >= 0 ? 'good' : 'bad'}`}>{fmt.money(change.market, { sign: true })}</b>
              </div>
              <div className="split-chip">
                <span className="muted">Money added or saved</span>
                <b className="num">{fmt.money(change.flow, { sign: true })}</b>
              </div>
            </div>
          ) : (
            <div className="split-chips">
              <div className="split-chip">
                <span className="muted">Investments</span>
                <b className="num">{fmt.money(p.totals.investments)}</b>
              </div>
              <div className="split-chip">
                <span className="muted">Cash</span>
                <b className="num">{fmt.money(p.totals.cash)}</b>
              </div>
            </div>
          )}
        </div>
      </Card>

      {!empty && (
        <div className="grid-2">
          <Card>
            <CardHead title="Net worth over time" sub="Month-end values; this month updates live">
              <Segmented
                value={range}
                onChange={setRange}
                label="Range"
                options={[
                  { value: '12', label: '12 months' },
                  { value: 'all', label: 'All' }
                ]}
              />
            </CardHead>
            <NetWorthChart points={shownPoints} height={330} />
          </Card>
          <Card>
            <CardHead title="Where your money is" sub={`In ${fmt.base} at today’s prices`} />
            <AllocationDonut slices={slices} centerLabel="net worth" />
          </Card>
        </div>
      )}

      <div className="grid-2 even">
        <Card>
          <CardHead
            title="What changed this month"
            sub={change.previousMonth ? `Compared with the end of ${monthLabel(change.previousMonth, 'long')}` : 'Starts once a previous month is recorded'}
          />
          {change.items.length === 0 ? (
            <p className="muted">
              {change.previousMonth
                ? 'Nothing has changed since last month.'
                : 'Moneta saves your numbers at the end of every month. From next month you’ll see what moved and why.'}
            </p>
          ) : (
            <div className="list">
              {change.items.slice(0, 7).map((it) => (
                <div className="list-row" key={it.key}>
                  <div className="grow">
                    <div className="title">
                      {it.label}
                      {it.isNew && <span className="pill accent" style={{ marginLeft: 8 }}>New</span>}
                      {it.removed && <span className="pill" style={{ marginLeft: 8 }}>Removed</span>}
                    </div>
                    <div className="sub-line">
                      {it.kind === 'category'
                        ? it.sublabel
                        : it.kind === 'card'
                          ? it.removed
                            ? 'Card removed'
                            : it.flow < 0
                              ? 'More charged than paid'
                              : 'Paid down'
                        : it.kind === 'bucket' || it.balance
                          ? Math.abs(it.market) > 0.5
                            ? `Saved ${fmt.money(it.flow, { sign: true })} · exchange rate ${fmt.money(it.market, { sign: true })}`
                            : it.flow >= 0
                              ? 'Saved'
                              : 'Spent or moved out'
                          : it.isNew || it.removed
                            ? it.sublabel
                            : `Price ${fmt.money(it.market, { sign: true })}${Math.abs(it.flow) > 0.5 ? ` · ${it.flow > 0 ? 'bought' : 'sold'} ${fmt.money(Math.abs(it.flow))}` : ''}`}
                    </div>
                  </div>
                  <Delta value={it.delta} text={fmt.money(it.delta, { sign: true })} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
        <Card>
          <CardHead title="Goals">
            <button className="btn ghost sm" onClick={() => go('goals')}>
              All goals <ArrowRight size={14} />
            </button>
          </CardHead>
          {goals.length === 0 ? (
            <div className="list-row" style={{ border: 0 }}>
              <Target size={18} className="faint" />
              <div className="grow muted">Set a goal, such as an emergency fund or a net worth target, and track it here.</div>
              <button className="btn sm" onClick={() => go('goals')}>
                Add goal
              </button>
            </div>
          ) : (
            <div className="list" style={{ gap: 4 }}>
              {goals.slice(0, 4).map((g) => (
                <div key={g.goal.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="grow title" style={{ flex: 1, minWidth: 0, fontWeight: 560 }}>{g.goal.name}</div>
                    <GoalStatusPill status={g.status} />
                  </div>
                  <Progress value={g.pct} tone={g.status === 'reached' ? 'good' : undefined} />
                  <div className="sub-line num">
                    {gv(g, g.current)} of {gv(g, g.goal.target)} · {formatPct(Math.min(g.pct, 9.99), false, 0)}
                    {g.goal.deadline ? ` · by ${monthLabel(g.goal.deadline)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Spending & income" sub={spent.items.length ? `${fmt.money(spent.today)} spent today` : undefined}>
            <button className="btn ghost sm" onClick={() => go('spending')}>
              Calendar <ArrowRight size={14} />
            </button>
          </CardHead>
          {spent.items.length === 0 ? (
            <div className="list-row" style={{ border: 0 }}>
              <ReceiptText size={18} className="faint" />
              <div className="grow muted">Note what you spend each day and it comes out of the bucket you choose.</div>
              <button className="btn sm" onClick={() => setSpending(true)}>
                Add spending
              </button>
            </div>
          ) : (
            <>
              <div className="goal-figures">
                <span className="big num">{fmt.money(spent.total)}</span>
                <span className="muted">
                  spent in {monthLabel(monthKey(), 'long').split(' ')[0]}
                  {spent.top ? ` · most on ${spent.top.label.toLowerCase()}` : ''}
                </span>
                {spent.income > 0 && (
                  <span className="good num" style={{ fontWeight: 560 }}>
                    {fmt.money(spent.income, { sign: true })} income
                  </span>
                )}
              </div>
              <div className="list">
                {spent.items.slice(0, 4).map((e) => (
                  <div className="list-row" key={e.id} style={{ padding: '8px 0' }}>
                    <span className={`cat-ic ${isIncome(e) ? 'in' : ''}`}>
                      <CategoryIcon category={e.category} size={15} />
                    </span>
                    <div className="grow title" style={{ fontWeight: 500 }}>{e.note || categoryLabel(e.category)}</div>
                    <span className={`num ${isIncome(e) ? 'good' : ''}`}>
                      {isIncome(e) ? '+' : '−'}
                      {fmt.money(e.amount, { currency: e.currency })}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {data.cards.length > 0 && (
          <Card>
            <CardHead title="Card bills">
              <button className="btn ghost sm" onClick={() => go('cards')}>
                Cards <ArrowRight size={14} />
              </button>
            </CardHead>
            {bills.length === 0 ? (
              <p className="muted">Nothing owed on your cards.</p>
            ) : (
              <div className="list">
                {bills.map(({ card, s }) => (
                  <div className="list-row" key={card.id} style={{ padding: '8px 0' }}>
                    <i className="key-dot" style={{ background: `var(--s${(card.color % 8) + 1})` }} />
                    <div className="grow">
                      <div className="title" style={{ fontWeight: 560 }}>{card.name}</div>
                      <div className="sub-line">Pay day {dateLabel(s.due, false)}</div>
                    </div>
                    <StatementPill s={s} />
                    <span className="num" style={{ fontWeight: 600, minWidth: 90, textAlign: 'right' }}>
                      {fmt.money(s.remaining, { currency: card.currency })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
        </div>
      </div>

      {empty && (
        <Card>
          <CardHead title="Get started" />
          <div className="grid-3">
            <button className="choice" onClick={() => setAdding('investment')}>
              <div>
                <b>Add an investment</b>
                <span>Stocks, ETFs and crypto with live prices.</span>
              </div>
            </button>
            <button className="choice" onClick={() => setAdding('bank')}>
              <div>
                <b>Add a bank account</b>
                <span>Then split it into buckets: emergency, travel and more.</span>
              </div>
            </button>
            <button className="choice" onClick={() => go('history')}>
              <div>
                <b>Bring in your history</b>
                <span>Import monthly totals from Google Sheets.</span>
              </div>
            </button>
          </div>
        </Card>
      )}

      {adding && <HoldingDialog kind={adding} onClose={() => setAdding(null)} />}
      {spending && <ExpenseDialog onClose={() => setSpending(false)} />}
    </div>
  )
}
