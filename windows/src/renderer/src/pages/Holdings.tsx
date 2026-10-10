import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, Landmark, LineChart, Plus, RefreshCw } from 'lucide-react'
import type { Category, Holding } from '@shared/types'
import { CATEGORY_LABEL, TYPE_LABEL, monthChange } from '@/core/calc'
import { formatPct } from '@/core/money'
import { averageCost, isUnits, isValued } from '@/core/trades'
import { timeAgo, useFmt, usePortfolio } from '@/hooks'
import { useApp } from '@/store'
import { HoldingDialog, type HoldingKind } from '@/components/HoldingDialog'
import { TradeDialog } from '@/components/TradeDialog'
import { ExpenseDialog } from '@/components/ExpenseDialog'
import { AssetMark, Card, CardHead, Delta, Empty, PageHead, PctDelta, Segmented, Tile } from '@/components/ui'
import { ExampleBanner } from './shared'

type Filter = 'all' | Exclude<Category, 'cash' | 'other'>

export function Holdings() {
  const data = useApp((s) => s.data)
  const prices = useApp((s) => s.prices)
  const refresh = useApp((s) => s.refreshPrices)
  const p = usePortfolio()
  const fmt = useFmt()
  const [editing, setEditing] = useState<Holding | null>(null)
  const [adding, setAdding] = useState<HoldingKind | null>(null)
  const [buying, setBuying] = useState<Holding | null>(null)
  const [income, setIncome] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const change = useMemo(() => monthChange(data, p), [data, p])
  const monthDelta = useMemo(() => new Map(change.items.filter((i) => i.kind === 'holding').map((i) => [i.key, i])), [change])

  const invest = p.holdings.filter((r) => isUnits(r.holding.type))
  const others = p.holdings.filter((r) => isValued(r.holding.type))
  const rows = invest.filter((r) => filter === 'all' || r.category === filter).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  const shownTotal = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const costRows = invest.filter((r) => r.pnl != null)
  const totalCost = costRows.reduce((s, r) => s + (r.cost ?? 0), 0)
  const totalPnl = costRows.reduce((s, r) => s + (r.pnl ?? 0), 0)
  const bankTotal = p.accounts.reduce((s, a) => s + (a.value ?? 0), 0)
  const unassignedTotal = p.accounts.reduce((s, a) => s + (a.value != null && a.holding.quantity ? (a.unassigned / a.holding.quantity) * a.value : 0), 0)
  const cats = (['equities', 'crypto'] as const).filter((c) => invest.some((r) => r.category === c))
  const errorFor = (sym: string) => prices.errors.find((e) => e.symbol === sym)

  return (
    <div className="page">
      <PageHead
        title="Holdings"
        sub={
          data.settings.refreshMinutes
            ? `Investments, bank accounts and other assets. Prices refresh every ${data.settings.refreshMinutes} minutes while Moneta is open.`
            : 'Investments, bank accounts and other assets. Automatic price refresh is off.'
        }
      >
        <button className="btn" onClick={() => refresh({ forceFx: true })} disabled={prices.loading}>
          <RefreshCw size={15} className={prices.loading ? 'spin' : ''} /> Refresh prices
        </button>
        <button className="btn primary" onClick={() => setAdding('investment')}>
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
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => setAdding('investment')}>
                  <Plus size={16} /> Add an investment
                </button>
                <button className="btn" onClick={() => setAdding('bank')}>
                  <Landmark size={15} /> Add a bank account
                </button>
              </div>
            }
          >
            Add the stocks, ETFs and crypto you own, such as VWRA, RKLB or Bitcoin, and the bank accounts your cash sits in.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Investments" value={fmt.money(p.totals.investments)} foot={`${invest.length} holding${invest.length === 1 ? '' : 's'}`} />
            <Tile
              label="Bank accounts"
              value={fmt.money(bankTotal)}
              foot={p.accounts.length ? `${fmt.money(unassignedTotal)} not in a bucket` : 'None added yet'}
            />
            <Tile
              label="Investments today"
              value={<Delta value={p.dayChange} text={fmt.money(p.dayChange, { sign: true })} size={18} />}
              foot={p.dayPct != null ? formatPct(p.dayPct) : 'Waiting for prices'}
            />
            <Tile
              label="Gain or loss"
              value={totalCost > 0 ? <Delta value={totalPnl} text={fmt.money(totalPnl, { sign: true })} size={18} /> : '—'}
              foot={totalCost > 0 ? `${formatPct(totalPnl / totalCost)} on ${fmt.money(totalCost)} paid` : 'Record what you paid to see this'}
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
            <div className="table-head">
              <div>
                <div className="card-title">Investments</div>
                <div className="card-sub">Select a row to see its buys and sells. Use + to record a new buy.</div>
              </div>
              <div className="actions">
                {cats.length > 1 && (
                  <Segmented
                    value={filter}
                    onChange={setFilter}
                    label="Filter"
                    options={[{ value: 'all' as Filter, label: 'All' }, ...cats.map((c) => ({ value: c as Filter, label: CATEGORY_LABEL[c] }))]}
                  />
                )}
                <button className="btn sm" onClick={() => setAdding('investment')}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
            {invest.length === 0 ? (
              <p className="muted" style={{ padding: '6px 20px 20px' }}>No investments yet.</p>
            ) : (
              <div className="table-wrap hide-sm">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th className="r hide-sm">Units</th>
                      <th className="r hide-sm">Price</th>
                      <th className="r hide-sm">Today</th>
                      <th className="r">Value ({fmt.base})</th>
                      <th className="r hide-sm">This month</th>
                      <th className="r">Gain or loss</th>
                      <th aria-label="Buy more" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const h = r.holding
                      const m = monthDelta.get(h.id)
                      const err = h.symbol ? errorFor(h.symbol) : undefined
                      const avg = averageCost(h)
                      return (
                        <tr key={h.id} className="click" onClick={() => setEditing(h)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(h)}>
                          <td>
                            <div className="asset">
                              <AssetMark symbol={h.symbol} name={h.name} />
                              <div className="asset-text">
                                <span className="asset-sym">
                                  <span className="asset-sym-text">{h.symbol || h.name}</span>
                                  <span className="type-chip">{TYPE_LABEL[h.type]}</span>
                                  {err && <AlertTriangle size={13} className="bad" aria-label={err.message} />}
                                </span>
                                <span className="asset-name hide-sm" title={h.name}>
                                  {h.symbol ? h.name : h.account || 'Price entered by hand'}
                                  {h.symbol && h.account ? ` · ${h.account}` : ''}
                                </span>
                                <span className="asset-name show-sm">
                                  {fmt.qty(h.quantity)} × {fmt.price(r.price, r.priceCurrency)}
                                  {r.dayPct != null ? ` · ${formatPct(r.dayPct)} today` : ''}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="r hide-sm">
                            {fmt.qty(h.quantity)}
                            {h.trades && h.trades.length > 1 && <div className="sub-line">{h.trades.length} trades</div>}
                          </td>
                          <td className="r hide-sm">
                            {fmt.price(r.price, r.priceCurrency)}
                            <div className="sub-line">{r.quote?.fetchedAt ? timeAgo(r.quote.fetchedAt) : h.symbol ? 'not updated yet' : 'manual'}</div>
                          </td>
                          <td className="r hide-sm">
                            <PctDelta value={r.dayPct} />
                            {r.dayChange != null && <div className="sub-line">{fmt.money(r.dayChange, { sign: true })}</div>}
                          </td>
                          <td className="r" style={{ fontWeight: 600 }}>
                            {fmt.money(r.value)}
                            {r.priceCurrency !== fmt.base && r.valueLocal != null && (
                              <div className="sub-line" style={{ fontWeight: 400 }}>{fmt.money(r.valueLocal, { currency: r.priceCurrency })}</div>
                            )}
                          </td>
                          <td className="r hide-sm">
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
                                <div className="sub-line">
                                  {formatPct(r.pnlPct)}
                                  {avg != null ? ` · avg ${fmt.price(avg, h.currency)}` : ''}
                                </div>
                              </>
                            ) : (
                              <span className="faint">—</span>
                            )}
                          </td>
                          <td className="r" style={{ width: 44 }}>
                            <button
                              className="icon-btn buy-btn"
                              title={`Buy more ${h.symbol || h.name}`}
                              aria-label={`Buy more ${h.symbol || h.name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setBuying(h)
                              }}
                            >
                              <Plus size={16} />
                            </button>
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
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {invest.length > 0 && (
              <div className="inv-cards">
                {rows.map((r) => {
                  const h = r.holding
                  const m = monthDelta.get(h.id)
                  const avg = averageCost(h)
                  return (
                    <div key={h.id} className="inv-card" role="button" tabIndex={0} onClick={() => setEditing(h)} onKeyDown={(e) => e.key === 'Enter' && setEditing(h)}>
                      <div className="inv-top">
                        <AssetMark symbol={h.symbol} name={h.name} />
                        <div className="asset-text inv-name">
                          <span className="asset-sym">
                            <span className="asset-sym-text">{h.symbol || h.name}</span>
                          </span>
                          <span className="asset-name">
                            {TYPE_LABEL[h.type]} · {h.symbol ? h.name : h.account || 'Price entered by hand'}
                          </span>
                        </div>
                        <div className="inv-value">
                          <b className="num">{fmt.money(r.value)}</b>
                          {r.pnl != null ? (
                            <Delta value={r.pnl} text={`${fmt.money(r.pnl, { sign: true })} (${formatPct(r.pnlPct, true, 1)})`} size={12} />
                          ) : (
                            <span className="sub-line">No cost recorded</span>
                          )}
                        </div>
                      </div>
                      <div className="inv-stats">
                        <div>
                          <span>Units</span>
                          <b className="num">{fmt.qty(h.quantity)}</b>
                        </div>
                        <div>
                          <span>Price</span>
                          <b className="num">{fmt.price(r.price, r.priceCurrency)}</b>
                        </div>
                        <div>
                          <span>Today</span>
                          <b>
                            <PctDelta value={r.dayPct} />
                          </b>
                        </div>
                        <div>
                          <span>This month</span>
                          <b>{m ? <Delta value={m.delta} text={fmt.short(m.delta, { sign: true })} size={12} /> : <span className="faint">—</span>}</b>
                        </div>
                        <div>
                          <span>Average cost</span>
                          <b className="num">{avg != null ? fmt.price(avg, h.currency) : '—'}</b>
                        </div>
                        <div className="inv-buy">
                          <button
                            className="btn sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setBuying(h)
                            }}
                          >
                            <Plus size={14} /> Buy more
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="inv-total">
                  <span>{filter === 'all' ? 'Total' : CATEGORY_LABEL[filter]}</span>
                  <b className="num">{fmt.money(shownTotal)}</b>
                </div>
              </div>
            )}
          </Card>

          <Card flush>
            <div className="table-head">
              <div>
                <div className="card-title">Bank accounts</div>
                <div className="card-sub">Your buckets split these balances by purpose. Unassigned money isn’t in any bucket yet.</div>
              </div>
              <div className="actions">
                {p.accounts.length > 0 && (
                  <button className="btn sm" onClick={() => setIncome(true)}>
                    <ArrowDownLeft size={14} /> Add income
                  </button>
                )}
                <button className="btn sm" onClick={() => setAdding('bank')}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
            {p.accounts.length === 0 ? (
              <p className="muted" style={{ padding: '6px 20px 20px' }}>
                No bank accounts yet. Add the accounts your cash sits in, then make buckets inside them on the Cash buckets page.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className="r">Balance</th>
                      <th className="r hide-sm">Set aside</th>
                      <th className="r hide-sm">Unassigned</th>
                      <th className="r">Value ({fmt.base})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.accounts.map((a) => {
                      const h = a.holding
                      return (
                        <tr key={h.id} className="click" onClick={() => setEditing(h)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(h)}>
                          <td>
                            <div className="asset">
                              <div className="asset-mark">
                                <Landmark size={16} />
                              </div>
                              <div className="asset-text">
                                <span className="asset-sym">
                                  <span className="asset-sym-text">{h.name}</span>
                                  <span className="type-chip">{TYPE_LABEL[h.type]}</span>
                                </span>
                                <span className="asset-name hide-sm">{[h.account, h.note].filter(Boolean).join(' · ') || h.currency}</span>
                                <span className="asset-name show-sm">{fmt.money(a.unassigned, { currency: h.currency })} not in a bucket</span>
                              </div>
                            </div>
                          </td>
                          <td className="r">{fmt.money(h.quantity, { currency: h.currency })}</td>
                          <td className="r hide-sm">
                            {a.buckets.length ? fmt.money(a.assigned, { currency: h.currency }) : <span className="faint">—</span>}
                            {a.buckets.length > 0 && <div className="sub-line">{a.buckets.length} bucket{a.buckets.length === 1 ? '' : 's'}</div>}
                            {a.reserved > 0.005 && <div className="sub-line">+ {fmt.money(a.reserved, { currency: h.currency })} for card bills</div>}
                          </td>
                          <td className={`r hide-sm ${a.unassigned < -0.005 ? 'bad' : ''}`}>
                            {fmt.money(a.unassigned, { currency: h.currency })}
                            {a.unassigned < -0.005 && <div className="sub-line bad">More set aside than the balance</div>}
                          </td>
                          <td className="r" style={{ fontWeight: 600 }}>{fmt.money(a.value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {others.length > 0 && (
            <Card flush>
              <div className="table-head">
                <div>
                  <div className="card-title">Other assets</div>
                  <div className="card-sub">Valued by hand. Update them when the value changes.</div>
                </div>
                <button className="btn sm" onClick={() => setAdding('asset')}>
                  <Plus size={14} /> Add
                </button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th className="r">Worth</th>
                      <th className="r hide-sm">Gain or loss</th>
                      <th className="r">Value ({fmt.base})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((r) => {
                      const h = r.holding
                      return (
                        <tr key={h.id} className="click" onClick={() => setEditing(h)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(h)}>
                          <td>
                            <div className="asset-text">
                              <span className="asset-sym">
                                <span className="asset-sym-text">{h.name}</span>
                                <span className="type-chip">{TYPE_LABEL[h.type]}</span>
                              </span>
                              {h.note && <span className="asset-name">{h.note}</span>}
                            </div>
                          </td>
                          <td className="r">{fmt.money(r.valueLocal, { currency: h.currency })}</td>
                          <td className="r hide-sm">{r.pnl != null ? <Delta value={r.pnl} text={fmt.money(r.pnl, { sign: true })} size={13} /> : <span className="faint">—</span>}</td>
                          <td className="r" style={{ fontWeight: 600 }}>{fmt.money(r.value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {others.length === 0 && (
            <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding('asset')}>
              + Add property, a pension or another asset
            </button>
          )}

          {invest.some((r) => (r.value ?? 0) > 0) && (
            <Card>
              <CardHead title="Allocation by investment" sub={`Share of your ${fmt.short(p.totals.investments)} invested`} />
              <div className="list">
                {invest
                  .filter((r) => r.value != null && r.value > 0)
                  .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
                  .map((r) => (
                    <div className="alloc-row" key={r.holding.id}>
                      <span className="title">{r.holding.symbol || r.holding.name}</span>
                      <div className="alloc-track">
                        <div className="hbar" style={{ width: `${Math.max(0.5, r.weight * 100)}%` }} />
                      </div>
                      <span className="num faint">{formatPct(r.weight, false, 1)}</span>
                      <span className="num" style={{ fontWeight: 560 }}>{fmt.money(r.value)}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </>
      )}

      {adding && <HoldingDialog kind={adding} onClose={() => setAdding(null)} />}
      {editing && <HoldingDialog holding={editing} onClose={() => setEditing(null)} />}
      {buying && <TradeDialog holding={buying} onClose={() => setBuying(null)} />}
      {income && <ExpenseDialog kind="income" onClose={() => setIncome(false)} />}
    </div>
  )
}
