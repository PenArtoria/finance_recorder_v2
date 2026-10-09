import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, FileUp, History as HistoryIcon, Plus } from 'lucide-react'
import type { Snapshot } from '@shared/types'
import { CATEGORIES, CATEGORY_LABEL, history, monthLabel, snapshotFactor } from '@/core/calc'
import { toCsv } from '@/core/csv'
import { formatPct } from '@/core/money'
import { useFmt, usePortfolio } from '@/hooks'
import { useApp } from '@/store'
import { CategoryStack, ChangeBars } from '@/components/charts'
import { ImportDialog, MonthDialog } from '@/components/HistoryDialogs'
import { Card, CardHead, Delta, Empty, PageHead, Segmented } from '@/components/ui'
import { ExampleBanner } from './shared'

export function History() {
  const data = useApp((s) => s.data)
  const toast = useApp((s) => s.toast)
  const p = usePortfolio()
  const fmt = useFmt()
  const [range, setRange] = useState<'12' | '24' | 'all'>('12')
  const [importing, setImporting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Snapshot | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const points = useMemo(() => history(data, p), [data, p])
  const shown = range === 'all' ? points : points.slice(-(Number(range) + 1))
  const anyDebt = points.some((pt) => (pt.totals.debt ?? 0) > 0.005)
  const rows = points
    .map((pt, i) => {
      const prev = i > 0 ? points[i - 1].totals.netWorth : null
      const change = prev != null ? pt.totals.netWorth - prev : null
      return { ...pt, change, pct: prev ? (change ?? 0) / prev : null }
    })
    .reverse()

  const exportCsv = async () => {
    const header = ['Month', ...CATEGORIES.map((c) => `${CATEGORY_LABEL[c]} (${fmt.base})`), `Card debt (${fmt.base})`, `Net worth (${fmt.base})`, 'Change', 'Change %']
    const body = rows
      .slice()
      .reverse()
      .map((r) => [
        r.month,
        ...CATEGORIES.map((c) => r.totals[c].toFixed(2)),
        (r.totals.debt ?? 0).toFixed(2),
        r.totals.netWorth.toFixed(2),
        r.change != null ? r.change.toFixed(2) : '',
        r.pct != null ? (r.pct * 100).toFixed(2) : ''
      ])
    const path = await window.api.exportFile({
      defaultName: `moneta-history-${new Date().toISOString().slice(0, 10)}.csv`,
      content: toCsv([header, ...body]),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (path) toast('History exported.', 'success')
  }

  return (
    <div className="page">
      <PageHead title="Monthly history" sub="Each month is saved on its own from your live numbers. The current month keeps updating until it ends.">
        <button className="btn" onClick={() => setImporting(true)}>
          <FileUp size={15} /> Import from Google Sheets
        </button>
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus size={15} /> Add past month
        </button>
        {points.length > 0 && (
          <button className="btn ghost" onClick={exportCsv}>
            <Download size={15} /> Export CSV
          </button>
        )}
      </PageHead>

      <ExampleBanner />

      {points.length === 0 ? (
        <Card>
          <Empty
            icon={<HistoryIcon size={22} />}
            title="No history yet"
            action={
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => setImporting(true)}>
                  <FileUp size={15} /> Import from Google Sheets
                </button>
                <button className="btn" onClick={() => setAdding(true)}>
                  Add a month by hand
                </button>
              </div>
            }
          >
            Once you add holdings or cash, this month is recorded automatically. You can also bring in the months you tracked in your spreadsheet.
          </Empty>
        </Card>
      ) : (
        <>
          <Card>
            <CardHead title="Net worth by month" sub={`Split by type, in ${fmt.base}`}>
              <Segmented
                value={range}
                onChange={setRange}
                label="Range"
                options={[
                  { value: '12', label: '12 months' },
                  { value: '24', label: '24 months' },
                  { value: 'all', label: 'All' }
                ]}
              />
            </CardHead>
            <CategoryStack points={shown} />
          </Card>

          <Card>
            <CardHead title="Change each month" sub="Market moves plus money you added or took out" />
            <ChangeBars points={shown} />
          </Card>

          <Card flush>
            <div style={{ padding: '16px 20px 6px' }}>
              <div className="card-title">Month by month</div>
              <div className="card-sub">Select a past month to see its holdings or edit its numbers.</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    {CATEGORIES.map((c) => (
                      <th key={c} className="r">{CATEGORY_LABEL[c]}</th>
                    ))}
                    {anyDebt && <th className="r">Cards</th>}
                    <th className="r">Net worth</th>
                    <th className="r">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const detail = r.snapshot?.holdings?.length || r.snapshot?.buckets?.length
                    const isOpen = open === r.month
                    return (
                      <Fragment key={r.month}>
                        <tr
                          className="click"
                          tabIndex={0}
                          onClick={() => (r.live ? setOpen(isOpen ? null : r.month) : detail ? setOpen(isOpen ? null : r.month) : r.snapshot && setEditing(r.snapshot))}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLElement).click()}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {detail || r.live ? (isOpen ? <ChevronDown size={14} className="faint" /> : <ChevronRight size={14} className="faint" />) : <span style={{ width: 14 }} />}
                              <span style={{ fontWeight: 560 }}>{monthLabel(r.month)}</span>
                              {r.live && <span className="pill accent">Live</span>}
                              {r.source === 'manual' && <span className="pill">Typed in</span>}
                              {r.source === 'import' && <span className="pill">Imported</span>}
                            </div>
                          </td>
                          {CATEGORIES.map((c) => (
                            <td key={c} className="r">{r.totals[c] ? fmt.money(r.totals[c]) : <span className="faint">—</span>}</td>
                          ))}
                          {anyDebt && <td className="r">{r.totals.debt ? fmt.money(-r.totals.debt) : <span className="faint">—</span>}</td>}
                          <td className="r" style={{ fontWeight: 600 }}>{fmt.money(r.totals.netWorth)}</td>
                          <td className="r">
                            {r.change != null ? (
                              <>
                                <Delta value={r.change} text={fmt.money(r.change, { sign: true })} size={13} />
                                <div className="sub-line">{formatPct(r.pct)}</div>
                              </>
                            ) : (
                              <span className="faint">—</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={anyDebt ? 8 : 7} style={{ background: 'var(--surface-2)', whiteSpace: 'normal' }}>
                              <MonthDetail snapshot={r.live ? undefined : r.snapshot} live={r.live} onEdit={() => r.snapshot && !r.live && setEditing(r.snapshot)} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {adding && <MonthDialog onClose={() => setAdding(false)} />}
      {editing && <MonthDialog snapshot={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MonthDetail({ snapshot, live, onEdit }: { snapshot?: Snapshot; live: boolean; onEdit: () => void }) {
  const fmt = useFmt()
  const p = usePortfolio()
  if (live) {
    return (
      <div className="muted" style={{ padding: '4px 0' }}>
        This month is still running. Its numbers follow your live holdings and buckets, and are kept as they are on the last day you open Moneta this month.
      </div>
    )
  }
  if (!snapshot) return null
  const f = snapshotFactor(snapshot, fmt.base, p.rates)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, padding: '4px 0' }}>
      {snapshot.holdings && snapshot.holdings.length > 0 && (
        <div>
          <div className="field-label" style={{ marginBottom: 4 }}>Holdings</div>
          <div className="list">
            {snapshot.holdings.map((h) => (
              <div className="list-row" key={h.id} style={{ padding: '6px 0' }}>
                <div className="grow">
                  <div className="title">{h.symbol || h.name}</div>
                  <div className="sub-line">
                    {fmt.qty(h.quantity)} × {fmt.price(h.price, h.currency)}
                  </div>
                </div>
                <span className="num">{fmt.money(h.value * f)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {snapshot.buckets && snapshot.buckets.length > 0 && (
        <div>
          <div className="field-label" style={{ marginBottom: 4 }}>Cash buckets</div>
          <div className="list">
            {snapshot.buckets.map((b) => (
              <div className="list-row" key={b.id} style={{ padding: '6px 0' }}>
                <div className="grow title">{b.name}</div>
                <span className="num">{fmt.money(b.amount, { currency: b.currency })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button className="btn sm" onClick={onEdit}>
          Edit this month’s totals
        </button>
      </div>
    </div>
  )
}
