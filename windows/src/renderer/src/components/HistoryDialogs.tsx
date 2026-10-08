import { useMemo, useState } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import type { Snapshot } from '@shared/types'
import { addMonths, CATEGORIES, CATEGORY_LABEL, monthKey, monthLabel, ratesOf } from '@/core/calc'
import { guessRole, parseCsv, ROLE_LABEL, rowsToMonths, snapshotFromImport, type ColumnRole } from '@/core/csv'
import { convert, formatMoney, symbolFor } from '@/core/money'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { ConfirmDialog, Dialog, Field, NumberInput } from './ui'

/** Add or edit one past month's totals by hand. */
export function MonthDialog({ snapshot, onClose }: { snapshot?: Snapshot; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const base = useApp((s) => s.data.settings.baseCurrency)
  const existing = useApp((s) => s.data.snapshots)
  const editing = !!snapshot
  const current = monthKey()

  // Default to the most recent past month that has no numbers yet.
  const firstFree = useMemo(() => {
    const taken = new Set(existing.map((s) => s.month))
    for (let i = 1; i < 240; i++) {
      const m = addMonths(current, -i)
      if (!taken.has(m)) return m
    }
    return addMonths(current, -1)
  }, [existing, current])

  const [month, setMonth] = useState(snapshot?.month ?? firstFree)
  const [currency, setCurrency] = useState(snapshot?.base ?? base)
  const [values, setValues] = useState<Record<string, number | null>>({
    equities: snapshot?.totals.equities ?? null,
    crypto: snapshot?.totals.crypto ?? null,
    cash: snapshot?.totals.cash ?? null,
    other: snapshot?.totals.other ?? null
  })
  const [note, setNote] = useState(snapshot?.note ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const total = CATEGORIES.reduce((s, c) => s + (values[c] ?? 0), 0)
  const clash = !editing && existing.some((s) => s.month === month)
  const monthOk = /^\d{4}-\d{2}$/.test(month) && month < current
  const anyValue = CATEGORIES.some((c) => values[c] != null)
  const hadDetail = !!snapshot?.holdings?.length

  const save = () => {
    setTried(true)
    if (!monthOk || !anyValue) return
    const snap: Snapshot = {
      month,
      updatedAt: Date.now(),
      base: currency,
      totals: {
        equities: values.equities ?? 0,
        crypto: values.crypto ?? 0,
        cash: values.cash ?? 0,
        other: values.other ?? 0,
        netWorth: total
      },
      source: 'manual',
      note: note.trim() || undefined
    }
    mutate((d) => {
      d.snapshots = d.snapshots.filter((s) => s.month !== month && s.month !== snapshot?.month)
      d.snapshots.push(snap)
      d.snapshots.sort((a, b) => a.month.localeCompare(b.month))
      d.onboarded = true
    })
    toast(`${monthLabel(month, 'long')} saved.`, 'success')
    onClose()
  }

  const remove = () => {
    if (!snapshot) return
    mutate((d) => {
      d.snapshots = d.snapshots.filter((s) => s.month !== snapshot.month)
    })
    toast(`${monthLabel(snapshot.month, 'long')} removed.`, 'info')
    onClose()
  }

  return (
    <>
      <Dialog
        title={editing ? `Edit ${monthLabel(snapshot!.month, 'long')}` : 'Add a past month'}
        sub="Type the totals from your old spreadsheet. Use month-end values."
        onClose={onClose}
        footer={
          <>
            {editing && (
              <button className="btn ghost danger left" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> Remove month
              </button>
            )}
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              Save month
            </button>
          </>
        }
      >
        <div className="form">
          <div className="form-row">
            <Field
              label="Month"
              error={tried && !monthOk ? 'Pick a month before this one. The current month is recorded automatically.' : undefined}
              hint={clash ? 'This month already has numbers. Saving replaces them.' : undefined}
            >
              <input className="input" type="month" value={month} max={current} disabled={editing} onChange={(e) => setMonth(e.target.value)} />
            </Field>
            <Field label="Currency of these numbers">
              <CurrencySelect value={currency} onChange={setCurrency} />
            </Field>
          </div>
          <div className="form-row">
            {CATEGORIES.map((c) => (
              <Field key={c} label={CATEGORY_LABEL[c]}>
                <NumberInput value={values[c]} onChange={(v) => setValues((s) => ({ ...s, [c]: v }))} prefix={symbolFor(currency)} placeholder="0" allowNegative />
              </Field>
            ))}
          </div>
          {tried && !anyValue && <div style={{ color: 'var(--bad)', fontSize: 12 }}>Enter at least one amount.</div>}
          <div className="split-chip">
            <span>Net worth</span>
            <b className="num">{formatMoney(total, currency)}</b>
          </div>
          {hadDetail && <p className="faint" style={{ fontSize: 12.5 }}>Saving replaces the per-holding detail recorded for this month with these totals.</p>}
          <Field label="Note (optional)">
            <input className="input" value={note} placeholder="e.g. Bonus month" onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Dialog>
      {confirmDelete && snapshot && (
        <ConfirmDialog
          title={`Remove ${monthLabel(snapshot.month, 'long')}?`}
          body="This month's numbers are deleted from your history."
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

const ROLES: ColumnRole[] = ['ignore', 'month', 'equities', 'crypto', 'cash', 'other', 'netWorth']

/** Imports monthly totals from a CSV (File → Download → CSV in Google Sheets) or pasted cells. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const data = useApp((s) => s.data)
  const base = data.settings.baseCurrency
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [roles, setRoles] = useState<ColumnRole[]>([])
  const [currency, setCurrency] = useState(base)
  const [replace, setReplace] = useState(false)

  const rows = useMemo(() => (text.trim() ? parseCsv(text) : []), [text])
  const hasHeader = rows.length > 0 && rows[0].some((c) => c.trim() && !/^[\d\s$€£¥,.\-()%/]+$/.test(c.trim()))
  const headers = rows.length ? (hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`)) : []

  const load = (content: string, name = '') => {
    setText(content)
    setFileName(name)
    const parsed = parseCsv(content)
    if (!parsed.length) return setRoles([])
    const head = parsed[0]
    const guessed = head.map(guessRole)
    if (!guessed.includes('month')) guessed[0] = 'month'
    setRoles(guessed)
  }

  const { parsed, skipped } = useMemo(() => rowsToMonths(rows, roles, hasHeader), [rows, roles, hasHeader])
  const current = monthKey()
  const usable = parsed.filter((p) => p.month < current)
  const existing = new Set(data.snapshots.map((s) => s.month))
  const willWrite = usable.filter((p) => replace || !existing.has(p.month))

  const pickFile = async () => {
    const res = await window.api.importFile([{ name: 'Spreadsheet (CSV)', extensions: ['csv', 'tsv', 'txt'] }])
    if (res) load(res.content, res.name)
  }

  const doImport = () => {
    if (!willWrite.length) return
    mutate((d) => {
      const months = new Set(willWrite.map((p) => p.month))
      d.snapshots = d.snapshots.filter((s) => !months.has(s.month))
      d.snapshots.push(...willWrite.map((p) => snapshotFromImport(p, currency)))
      d.snapshots.sort((a, b) => a.month.localeCompare(b.month))
      d.onboarded = true
    })
    toast(`Imported ${willWrite.length} month${willWrite.length === 1 ? '' : 's'}.`, 'success')
    onClose()
  }

  const rates = ratesOf(data)
  const inBase = (v: number) => convert(v, currency, base, rates)

  return (
    <Dialog
      wide
      title="Import history"
      sub="Bring in month-by-month totals from Google Sheets or Excel."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={doImport} disabled={!willWrite.length}>
            {willWrite.length ? `Import ${willWrite.length} month${willWrite.length === 1 ? '' : 's'}` : 'Import'}
          </button>
        </>
      }
    >
      <div className="form">
        {!rows.length && (
          <>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              <li>In Google Sheets, open your tracking sheet and choose File → Download → Comma-separated values (.csv).</li>
              <li>Pick that file below, or copy the cells (with the header row) and paste them in the box.</li>
              <li>The sheet needs one row per month, with a date column and columns such as Stocks, Crypto, Cash or Total.</li>
            </ol>
            <div className="actions">
              <button className="btn" onClick={pickFile}>
                <FileUp size={15} /> Choose CSV file…
              </button>
            </div>
            <Field label="Or paste cells here">
              <textarea className="input" rows={6} placeholder={'Month\tStocks\tCrypto\tCash\nJan 2025\t32,000\t4,100\t15,500'} onChange={(e) => load(e.target.value)} />
            </Field>
          </>
        )}

        {rows.length > 0 && (
          <>
            <div className="split-chip">
              <span>{fileName || 'Pasted cells'} · {rows.length - (hasHeader ? 1 : 0)} rows</span>
              <button
                className="btn sm"
                onClick={() => {
                  setText('')
                  setRoles([])
                  setFileName('')
                }}
              >
                Start over
              </button>
            </div>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>What is in each column?</div>
              <div className="mapping">
                {headers.map((h, i) => (
                  <div className="field" key={i}>
                    <div className="col-name" title={h}>{h || `Column ${i + 1}`}</div>
                    <select
                      className="select"
                      value={roles[i] ?? 'ignore'}
                      onChange={(e) => setRoles((r) => {
                        const next = headers.map((_, j) => r[j] ?? 'ignore')
                        next[i] = e.target.value as ColumnRole
                        return next
                      })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-row">
              <Field label="Currency of the numbers">
                <CurrencySelect value={currency} onChange={setCurrency} />
              </Field>
              <Field label="Months already in Moneta">
                <select className="select" value={replace ? 'replace' : 'skip'} onChange={(e) => setReplace(e.target.value === 'replace')}>
                  <option value="skip">Keep what is there</option>
                  <option value="replace">Replace with the imported numbers</option>
                </select>
              </Field>
            </div>

            {!roles.includes('month') ? (
              <p className="bad">Mark one column as “Month / date”.</p>
            ) : parsed.length === 0 ? (
              <p className="bad">No rows could be read. Check that the month column has dates such as 2025-01, Jan 2025 or 31/01/2025.</p>
            ) : (
              <div className="card flush">
                <div className="table-wrap" style={{ maxHeight: 260 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        {CATEGORIES.map((c) => (
                          <th key={c} className="r">{CATEGORY_LABEL[c]}</th>
                        ))}
                        <th className="r">Net worth</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((p) => {
                        const future = p.month >= current
                        const kept = !replace && existing.has(p.month)
                        return (
                          <tr key={p.month} style={{ opacity: future || kept ? 0.5 : 1 }}>
                            <td>{monthLabel(p.month)}</td>
                            {CATEGORIES.map((c) => (
                              <td key={c} className="r">{p.totals[c] ? formatMoney(p.totals[c], currency) : '—'}</td>
                            ))}
                            <td className="r" style={{ fontWeight: 600 }}>
                              {formatMoney(p.totals.netWorth, currency)}
                              {currency !== base && inBase(p.totals.netWorth) != null && (
                                <div className="sub-line">{formatMoney(inBase(p.totals.netWorth), base)}</div>
                              )}
                            </td>
                            <td className="faint" style={{ fontSize: 12 }}>
                              {future ? 'Current month, skipped' : kept ? 'Already there' : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {skipped > 0 && <p className="faint" style={{ fontSize: 12.5 }}>{skipped} row{skipped === 1 ? '' : 's'} without a readable month or amount will be skipped.</p>}
          </>
        )}
      </div>
    </Dialog>
  )
}
