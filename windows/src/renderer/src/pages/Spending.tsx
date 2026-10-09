import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CreditCard, Plus, ReceiptText } from 'lucide-react'
import type { Expense } from '@shared/types'
import { addMonths, monthKey, monthLabel } from '@/core/calc'
import { sourceLabel } from '@/core/cash'
import { formatPct } from '@/core/money'
import { byCategory, categoryLabel, dailyTotals, daysInMonth, expensesIn, inBase } from '@/core/spending'
import { dateLabel, todayIso } from '@/core/trades'
import { useFmt, usePortfolio } from '@/hooks'
import { useApp } from '@/store'
import { CategoryIcon, ExpenseDialog } from '@/components/ExpenseDialog'
import { Card, CardHead, Empty, PageHead, Tile } from '@/components/ui'
import { ExampleBanner } from './shared'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${WEEKDAY_LONG[new Date(y, m - 1, d).getDay()]} ${dateLabel(iso, false)}`
}

export function Spending() {
  const data = useApp((s) => s.data)
  const p = usePortfolio()
  const fmt = useFmt()
  const today = todayIso()
  const [month, setMonth] = useState(monthKey())
  const [selected, setSelected] = useState(today)
  const [dialog, setDialog] = useState<{ expense?: Expense; date?: string } | null>(null)

  const items = useMemo(() => expensesIn(data, month).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), [data, month])
  const daily = useMemo(() => dailyTotals(items, fmt.base, p.rates), [items, fmt.base, p.rates])
  const cats = useMemo(() => byCategory(items, fmt.base, p.rates), [items, fmt.base, p.rates])
  const prevItems = useMemo(() => expensesIn(data, addMonths(month, -1)), [data, month])
  const total = [...daily.values()].reduce((s, v) => s + v, 0)
  const prevTotal = prevItems.reduce((s, e) => s + inBase(e, fmt.base, p.rates), 0)
  const max = Math.max(0, ...daily.values())
  const isCurrent = month === monthKey()
  const elapsed = isCurrent ? Number(today.slice(8)) : month < monthKey() ? daysInMonth(month) : 0
  const biggest = [...daily.entries()].sort((a, b) => b[1] - a[1])[0]

  // Same point last month, so the comparison is fair mid-month.
  const prevSoFar = isCurrent
    ? prevItems.filter((e) => Number(e.date.slice(8)) <= elapsed).reduce((s, e) => s + inBase(e, fmt.base, p.rates), 0)
    : prevTotal

  const [y, m] = month.split('-').map(Number)
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  ]
  while (cells.length % 7) cells.push(null)

  const daySel = selected.startsWith(month) ? selected : null
  const dayItems = daySel ? items.filter((e) => e.date === daySel) : []
  const byDay = useMemo(() => {
    const groups = new Map<string, Expense[]>()
    for (const e of items) groups.set(e.date, [...(groups.get(e.date) ?? []), e])
    return [...groups.entries()]
  }, [items])

  const go = (n: number) => {
    const next = addMonths(month, n)
    setMonth(next)
    setSelected(next === monthKey() ? today : `${next}-01`)
  }

  const shade = (v: number) => (max > 0 && v > 0 ? 8 + Math.round((v / max) * 40) : 0)
  const noBuckets = data.buckets.length === 0 && !data.holdings.some((h) => h.type === 'cash' || h.type === 'deposit')

  return (
    <div className="page">
      <PageHead title="Spending" sub="Note what you spend each day. It comes out of the bucket you choose.">
        <div className="month-nav">
          <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous month">
            <ChevronLeft size={17} />
          </button>
          <span>{monthLabel(month, 'long')}</span>
          <button className="icon-btn" onClick={() => go(1)} aria-label="Next month" disabled={isCurrent}>
            <ChevronRight size={17} />
          </button>
        </div>
        <button className="btn primary" onClick={() => setDialog({ date: daySel ?? today })}>
          <Plus size={16} /> Add spending
        </button>
      </PageHead>

      <ExampleBanner />

      {noBuckets && (
        <div className="banner">
          <div className="grow">Spending can come out of a cash bucket or bank account. Add them on the Cash buckets and Holdings pages, or note spending without one.</div>
        </div>
      )}

      <div className="tiles">
        <Tile label={`Spent in ${monthLabel(month, 'short').split(' ')[0]}`} value={fmt.money(total)} foot={`${items.length} entr${items.length === 1 ? 'y' : 'ies'}`} />
        <Tile label="Daily average" value={elapsed ? fmt.money(total / elapsed) : '—'} foot={elapsed ? `Over ${elapsed} day${elapsed === 1 ? '' : 's'}` : 'Month not started'} />
        <Tile label="Biggest day" value={biggest ? fmt.money(biggest[1]) : '—'} foot={biggest ? longDate(biggest[0]) : 'No spending yet'} />
        <Tile
          label={isCurrent ? 'Same point last month' : 'Previous month'}
          value={fmt.money(prevSoFar)}
          foot={prevSoFar > 0 ? `This month: ${formatPct(total / prevSoFar - 1, true, 0)}` : 'Nothing noted'}
        />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title={monthLabel(month, 'long')} sub={`Daily totals in ${fmt.base}. Pick a day to see what you spent.`}>
            <div className="heat-key" aria-hidden>
              <span>Less</span>
              {[0, 14, 28, 48].map((s) => (
                <i key={s} style={{ background: s ? `color-mix(in srgb, var(--accent) ${s}%, var(--surface))` : 'var(--surface-2)' }} />
              ))}
              <span>More</span>
            </div>
          </CardHead>
          <div className="cal">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-wd">
                {d}
              </div>
            ))}
            {cells.map((iso, i) => {
              if (!iso) return <div key={`x${i}`} className="cal-cell empty" />
              const v = daily.get(iso) ?? 0
              const s = shade(v)
              const future = iso > today
              return (
                <button
                  key={iso}
                  className={`cal-cell ${iso === today ? 'today' : ''} ${iso === daySel ? 'sel' : ''} ${future ? 'future' : ''}`}
                  style={s ? { background: `color-mix(in srgb, var(--accent) ${s}%, var(--surface))` } : undefined}
                  onClick={() => setSelected(iso)}
                  onDoubleClick={() => !future && setDialog({ date: iso })}
                  aria-label={`${longDate(iso)}: ${v ? fmt.money(v) : 'nothing spent'}`}
                  aria-pressed={iso === daySel}
                >
                  <span className="cal-day">{Number(iso.slice(8))}</span>
                  {v > 0 && <span className="cal-amt num">{fmt.money(v, { compact: true, decimals: v >= 1000 ? undefined : 0 })}</span>}
                </button>
              )
            })}
          </div>
        </Card>

        <Card>
          {daySel ? (
            <>
              <CardHead title={longDate(daySel)} sub={daily.get(daySel) ? `Spent ${fmt.money(daily.get(daySel))}` : 'Nothing noted'}>
                {daySel <= today && (
                  <button className="btn sm" onClick={() => setDialog({ date: daySel })}>
                    <Plus size={14} /> Add
                  </button>
                )}
              </CardHead>
              {dayItems.length === 0 ? (
                <p className="muted">{daySel > today ? 'This day hasn’t happened yet.' : 'No spending noted for this day. Double-click a day in the calendar to add one quickly.'}</p>
              ) : (
                <div className="list">
                  {dayItems.map((e) => (
                    <ExpenseRow key={e.id} e={e} onClick={() => setDialog({ expense: e })} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Pick a day in the calendar.</p>
          )}
        </Card>
      </div>

      {items.length === 0 ? (
        <Card>
          <Empty
            icon={<ReceiptText size={22} />}
            title={`Nothing noted in ${monthLabel(month, 'long')}`}
            action={
              <button className="btn primary" onClick={() => setDialog({ date: isCurrent ? today : `${month}-01` })}>
                <Plus size={16} /> Add spending
              </button>
            }
          >
            Each entry has a date, an amount and a category, and comes out of a bucket such as Living expenses.
          </Empty>
        </Card>
      ) : (
        <div className="grid-2 even">
          <Card>
            <CardHead title="By category" sub={`${monthLabel(month, 'long')}, in ${fmt.base}`} />
            <div className="list">
              {cats.map((c) => (
                <div className="cat-row" key={c.key}>
                  <span className="cat-ic">
                    <CategoryIcon category={c.key} size={15} />
                  </span>
                  <span className="title">{c.label}</span>
                  <div className="cat-track">
                    <div className="hbar" style={{ width: `${Math.max(1, (c.total / (cats[0]?.total || 1)) * 100)}%` }} />
                  </div>
                  <span className="num faint">{formatPct(total ? c.total / total : 0, false, 0)}</span>
                  <span className="num" style={{ fontWeight: 560 }}>{fmt.money(c.total)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Day by day" sub="Newest first" />
            <div className="day-list">
              {byDay.map(([iso, list]) => (
                <div key={iso} className="day-group">
                  <button className="day-head" onClick={() => setSelected(iso)}>
                    <span>{longDate(iso)}</span>
                    <b className="num">{fmt.money(daily.get(iso))}</b>
                  </button>
                  {list.map((e) => (
                    <ExpenseRow key={e.id} e={e} compact onClick={() => setDialog({ expense: e })} />
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {dialog && <ExpenseDialog expense={dialog.expense} date={dialog.date} onClose={() => setDialog(null)} />}
    </div>
  )
}

function ExpenseRow({ e, onClick, compact = false }: { e: Expense; onClick: () => void; compact?: boolean }) {
  const data = useApp((s) => s.data)
  const fmt = useFmt()
  const p = usePortfolio()
  return (
    <button className={`exp-row ${compact ? 'compact' : ''}`} onClick={onClick}>
      <span className="cat-ic">
        <CategoryIcon category={e.category} size={15} />
        {e.cardId && (
          <span className="card-badge" title="Paid by card">
            <CreditCard size={9} strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span className="grow">
        <span className="title">{e.note || categoryLabel(e.category)}</span>
        <span className="sub-line">
          {e.note ? `${categoryLabel(e.category)} · ` : ''}
          {e.cardId
            ? `${data.cards.find((c) => c.id === e.cardId)?.name ?? 'Card'}${e.source ? ` · ${sourceLabel(data, e.source)}` : ''}`
            : sourceLabel(data, e.source)}
        </span>
      </span>
      <span className="num amt">
        −{fmt.money(e.amount, { currency: e.currency })}
        {e.currency !== fmt.base && !compact && <span className="sub-line">{fmt.money(inBase(e, fmt.base, p.rates))}</span>}
      </span>
    </button>
  )
}
