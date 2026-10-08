import { useMemo, useState } from 'react'
import { AlertTriangle, LineChart, Plus, RefreshCw } from 'lucide-react'
import type { Category, Holding } from '@shared/types'
import { CATEGORY_LABEL, TYPE_LABEL, monthChange } from '@/core/calc'
import { formatPct } from '@/core/money'
import { timeAgo, useFmt, usePortfolio } from '@/hooks'
import { useApp } from '@/store'
import { HoldingDialog } from '@/components/HoldingDialog'
import { AssetMark, Card, CardHead, Delta, Empty, PageHead, PctDelta, Segmented, Tile } from '@/components/ui'
import { ExampleBanner } from './shared'

type Filter = 'all' | Exclude<Category, 'cash'>

export function Investments() {
  const data = useApp((s) => s.data)
  const prices = useApp((s) => s.prices)
  const refresh = useApp((s) => s.refreshPrices)
  const p = usePortfolio()
  const fmt = useFmt()
  const [editing, setEditing] = useState<Holding | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const change = useMemo(() => monthChange(data, p), [data, p])
  const monthDelta = useMemo(() => new Map(change.items.filter((i) => i.kind === 'holding').map((i) => [i.key, i])), [change])

  const rows = p.holdings
    .filter((r) => filter === 'all' || r.category === filter)
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  const shownTotal = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const costRows = p.holdings.filter((r) => r.pnl != null)
  const totalCost = costRows.reduce((s, r) => s + (r.cost ?? 0), 0)
  const totalPnl = costRows.reduce((s, r) => s + (r.pnl ?? 0), 0)
  const cats = (['equities', 'crypto', 'other'] as const).filter((c) => p.holdings.some((r) => r.category === c))

  const errorFor = (sym: string) => prices.errors.find((e) => e.symbol === sym)

  return (
    <div className="page">
      <PageHead
        title="Investments"
        sub={
          data.settings.refreshMinutes
            ? `Prices refresh every ${data.settings.refreshMinutes} minutes while Nest Egg is open.`
            : 'Automatic price refresh is off. Use Refresh prices to update.'
        }
      >
        <button className="btn" onClick={() => refresh({ forceFx: true })} disabled={prices.loading}>
          <RefreshCw size={15} className={prices.loading ? 'spin' : ''} /> Refresh prices
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add holding
        </button>
      </PageHead>

      <ExampleBanner />

      {data.holdings.length === 0 ? (
        <Card>
          <Empty
            icon={<LineChart size={22} />}
            title="No holdings yet"
            action={
              <button className="btn primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add your first holding
              </button>
            }
          >
            Add the stocks, ETFs and crypto you own, such as VWRA, RKLB or Bitcoin. Prices update by themselves.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Invested" value={fmt.money(p.totals.investments)} foot={`${p.holdings.length} holding${p.holdings.length === 1 ? '' : 's'}`} />
            <Tile
              label="Today"
              value={<Delta value={p.dayChange} text={fmt.money(p.dayChange, { sign: true })} size={18} />}
              foot={p.dayPct != null ? formatPct(p.dayPct) : 'Waiting for prices'}
            />
            <Tile
              label="This month"
              value={
                change.byCategory ? (
                  <Delta
                    value={change.byCategory.equities + change.byCategory.crypto + change.byCategory.other}
                    text={fmt.money(change.byCategory.equities + change.byCategory.crypto + change.byCategory.other, { sign: true })}
                    size={18}
                  />
                ) : (
                  '—'
                )
              }
              foot={change.previousMonth ? 'Includes buys and sells' : 'Starts next month'}
            />
            <Tile
              label="Gain or loss"
              value={totalCost > 0 ? <Delta value={totalPnl} text={fmt.money(totalPnl, { sign: true })} size={18} /> : '—'}
              foot={totalCost > 0 ? `${formatPct(totalPnl / totalCost)} on ${fmt.money(totalCost)} paid` : 'Add what you paid to see this'}
            />
          </div>

          {(p.missingFx.length > 0 || prices.errors.length > 0) && (
            <div className="banner warn">
              <AlertTriangle size={17} />
              <div className="grow">
                {prices.errors.length > 0 && !prices.offline && <>No price found for {prices.errors.map((e) => e.symbol).join(', ')}. Check the symbol in the holding. </>}
                {prices.offline && <>Couldn’t reach the price service. Showing the last prices saved. </>}
                {p.missingFx.length > 0 && <>No exchange rate yet for {p.missingFx.join(', ')}.</>}
              </div>
            </div>
          )}

          <Card flush>
            <div style={{ padding: '16px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="card-title">Holdings</div>
              {cats.length > 1 && (
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  label="Filter"
                  options={[{ value: 'all' as Filter, label: 'All' }, ...cats.map((c) => ({ value: c as Filter, label: CATEGORY_LABEL[c] }))]}
                />
              )}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="r">Quantity</th>
                    <th className="r">Price</th>
                    <th className="r">Today</th>
                    <th className="r">Value ({fmt.base})</th>
                    <th className="r">This month</th>
                    <th className="r">Gain or loss</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const h = r.holding
                    const m = monthDelta.get(h.id)
                    const err = h.symbol ? errorFor(h.symbol) : undefined
                    return (
                      <tr key={h.id} className="click" onClick={() => setEditing(h)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(h)}>
                        <td>
                          <div className="asset">
                            <AssetMark symbol={h.symbol} name={h.name} />
                            <div className="asset-text">
                              <span className="asset-sym">
                                {h.symbol || h.name}
                                <span className="type-chip">{TYPE_LABEL[h.type]}</span>
                                {err && <AlertTriangle size={13} className="bad" aria-label={err.message} />}
                              </span>
                              <span className="asset-name" title={h.name}>
                                {h.symbol ? h.name : h.account || 'Price entered by hand'}
                                {h.symbol && h.account ? ` · ${h.account}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="r">{fmt.qty(h.quantity)}</td>
                        <td className="r">
                          {fmt.price(r.price, r.priceCurrency)}
                          <div className="sub-line">{r.quote?.fetchedAt ? timeAgo(r.quote.fetchedAt) : h.symbol ? 'not updated yet' : 'manual'}</div>
                        </td>
                        <td className="r">
                          <PctDelta value={r.dayPct} />
                          {r.dayChange != null && <div className="sub-line">{fmt.money(r.dayChange, { sign: true })}</div>}
                        </td>
                        <td className="r" style={{ fontWeight: 600 }}>
                          {fmt.money(r.value)}
                          {r.priceCurrency !== fmt.base && r.valueLocal != null && (
                            <div className="sub-line" style={{ fontWeight: 400 }}>{fmt.money(r.valueLocal, { currency: r.priceCurrency })}</div>
                          )}
                        </td>
                        <td className="r">
                          {m ? (
                            <>
                              <Delta value={m.delta} text={fmt.money(m.delta, { sign: true })} size={13} />
                              {!m.isNew && Math.abs(m.flow) > 0.5 && <div className="sub-line">{m.flow > 0 ? 'incl. buys' : 'incl. sells'}</div>}
                            </>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                        <td className="r">
                          {r.pnl != null ? (
                            <>
                              <Delta value={r.pnl} text={fmt.money(r.pnl, { sign: true })} size={13} />
                              <div className="sub-line">{formatPct(r.pnlPct)}</div>
                            </>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{filter === 'all' ? 'Total' : CATEGORY_LABEL[filter]}</td>
                    <td />
                    <td />
                    <td />
                    <td className="r">{fmt.money(shownTotal)}</td>
                    <td />
                    <td className="r faint" style={{ fontWeight: 400 }}>
                      {filter !== 'all' && p.totals.investments > 0 ? `${formatPct(shownTotal / p.totals.investments, false, 1)} of investments` : ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card>
            <CardHead title="Allocation by holding" sub={`Share of your ${fmt.money(p.totals.investments, { compact: true })} invested`} />
            <div className="list">
              {p.holdings
                .filter((r) => r.value != null && r.value > 0)
                .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
                .map((r) => (
                  <div className="list-row" key={r.holding.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 160px) 1fr 64px 110px', gap: 14 }}>
                    <span className="title">{r.holding.symbol || r.holding.name}</span>
                    <div style={{ background: 'var(--surface-2)', borderRadius: 4 }}>
                      <div className="hbar" style={{ width: `${Math.max(0.5, r.weight * 100)}%` }} />
                    </div>
                    <span className="num faint" style={{ textAlign: 'right' }}>{formatPct(r.weight, false, 1)}</span>
                    <span className="num" style={{ textAlign: 'right', fontWeight: 560 }}>{fmt.money(r.value)}</span>
                  </div>
                ))}
            </div>
          </Card>
        </>
      )}

      {adding && <HoldingDialog onClose={() => setAdding(false)} />}
      {editing && <HoldingDialog holding={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
