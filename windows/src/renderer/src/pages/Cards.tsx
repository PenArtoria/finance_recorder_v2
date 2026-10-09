import { Fragment, useMemo, useState } from 'react'
import { CreditCard as CardIcon, Pencil, Plus, Receipt } from 'lucide-react'
import type { CreditCard, Expense } from '@shared/types'
import { daysBetween, nextBill, statementFor, statementsOf, type Statement } from '@/core/cards'
import { convert, formatPct } from '@/core/money'
import { categoryLabel } from '@/core/spending'
import { dateLabel, todayIso } from '@/core/trades'
import { useFmt, usePortfolio } from '@/hooks'
import { useApp } from '@/store'
import { CardDialog, PayDialog } from '@/components/CardDialogs'
import { CategoryIcon, ExpenseDialog } from '@/components/ExpenseDialog'
import { Card, Empty, PageHead, Progress, Tile } from '@/components/ui'
import { ExampleBanner } from './shared'

const dayName = (d: number) => (d === 31 ? 'the last day' : `the ${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`)

export function StatementPill({ s }: { s: Statement }) {
  const today = todayIso()
  if (s.status === 'open') {
    const n = daysBetween(today, s.close)
    return <span className="pill">Open · closes {n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}</span>
  }
  if (s.status === 'paid') return <span className="pill good">Paid</span>
  if (s.status === 'overdue') return <span className="pill bad">Overdue since {dateLabel(s.due, false)}</span>
  const n = daysBetween(today, s.due)
  return <span className="pill warn">Due {n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}</span>
}

export function Cards() {
  const data = useApp((s) => s.data)
  const p = usePortfolio()
  const fmt = useFmt()
  const [editing, setEditing] = useState<CreditCard | null>(null)
  const [adding, setAdding] = useState(false)
  const [paying, setPaying] = useState<{ card: CreditCard; statement?: Statement } | null>(null)
  const [charge, setCharge] = useState<{ cardId?: string; expense?: Expense } | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      p.cards.map((r) => {
        const statements = statementsOf(data, r.card, p.rates)
        return { ...r, statements, next: nextBill(statements) }
      }),
    [data, p.cards, p.rates]
  )

  const nextDue = rows
    .map((r) => (r.next && r.next.status !== 'open' && r.next.remaining > 0 ? { r, s: r.next } : null))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.s.due.localeCompare(b.s.due))[0]
  const openTotal = rows.reduce((s, r) => {
    const o = r.statements.find((x) => x.status === 'open')
    return s + (o ? convert(o.remaining, r.card.currency, fmt.base, p.rates) ?? 0 : 0)
  }, 0)
  const limits = rows.filter((r) => r.card.limit)
  const available = limits.reduce((s, r) => s + (convert((r.card.limit ?? 0) - r.owed, r.card.currency, fmt.base, p.rates) ?? 0), 0)

  return (
    <div className="page">
      <PageHead title="Credit cards" sub="Card spending comes from the Spending page. Moneta works out each statement, its pay day and what’s owed.">
        {data.cards.length > 0 && (
          <button className="btn" onClick={() => setCharge({ cardId: data.cards[0].id })}>
            <Receipt size={15} /> Add charge
          </button>
        )}
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add card
        </button>
      </PageHead>

      <ExampleBanner />

      {data.cards.length === 0 ? (
        <Card>
          <Empty
            icon={<CardIcon size={22} />}
            title="No credit cards yet"
            action={
              <button className="btn primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add a card
              </button>
            }
          >
            Add a card with its closing day (締め日) and pay day (支払日). When you note spending on it, Moneta groups it into statements, shows when each bill is due and can pay it from your bank account on the day.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Owed on cards" value={fmt.money(p.totals.debt)} foot={`${rows.length} card${rows.length === 1 ? '' : 's'}, lowers your net worth`} />
            <Tile
              label="Next payment"
              value={nextDue ? fmt.money(nextDue.s.remaining, { currency: nextDue.r.card.currency }) : '—'}
              foot={nextDue ? `${nextDue.r.card.name} · ${dateLabel(nextDue.s.due, false)}` : 'Nothing due'}
            />
            <Tile label="On open statements" value={fmt.money(openTotal)} foot="Charged since the last closing day" />
            <Tile label="Credit available" value={limits.length ? fmt.money(available) : '—'} foot={limits.length ? 'Across cards with a limit' : 'Add a limit to see this'} />
          </div>

          {rows.map(({ card, owed, statements }) => {
            const account = data.holdings.find((h) => h.id === card.payFromId)
            const used = card.limit ? owed / card.limit : null
            const shown = statements.slice(0, 6)
            return (
              <Card key={card.id} flush>
                <div className="cc-head">
                  <div className="cc-chip" style={{ background: `var(--s${(card.color % 8) + 1})` }} aria-hidden>
                    <span />
                  </div>
                  <div className="cc-title">
                    <div className="card-title">{card.name}</div>
                    <div className="card-sub">
                      {[card.issuer, `Closes on ${dayName(card.closingDay)}`, `paid on ${dayName(card.dueDay)} ${card.dueMonths === 2 ? 'two months later' : 'of the next month'}`]
                        .filter(Boolean)
                        .join(' · ')}
                      {account ? ` · from ${account.name}${card.autoPay ? ' (automatic)' : ''}` : ''}
                    </div>
                  </div>
                  <div className="actions">
                    <button className="btn sm" onClick={() => setCharge({ cardId: card.id })}>
                      <Plus size={14} /> Charge
                    </button>
                    <button className="btn sm" onClick={() => setPaying({ card })} disabled={owed <= 0}>
                      Pay bill
                    </button>
                    <button className="icon-btn" onClick={() => setEditing(card)} aria-label={`Edit ${card.name}`}>
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>

                <div className="cc-figures">
                  <div>
                    <div className="tile-label">Owed now</div>
                    <div className="bucket-amount">{fmt.money(owed, { currency: card.currency })}</div>
                    {card.currency !== fmt.base && <div className="sub-line">≈ {fmt.money(convert(owed, card.currency, fmt.base, p.rates))}</div>}
                  </div>
                  {card.limit ? (
                    <div className="cc-limit">
                      <Progress value={used ?? 0} />
                      <div className="sub-line num">
                        {formatPct(used, false, 0)} of {fmt.money(card.limit, { currency: card.currency })} limit ·{' '}
                        {fmt.money(card.limit - owed, { currency: card.currency })} available
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Statement</th>
                        <th>Pay day</th>
                        <th className="r">Charged</th>
                        <th className="r">Paid</th>
                        <th className="r">Left to pay</th>
                        <th>Status</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((s) => {
                        const key = `${card.id}:${s.close}`
                        const isOpen = open === key
                        const items = isOpen
                          ? data.expenses.filter((e) => e.cardId === card.id && statementFor(card, e.date) === s.close).sort((a, b) => b.date.localeCompare(a.date))
                          : []
                        return (
                          <Fragment key={s.close}>
                            <tr className="click" onClick={() => setOpen(isOpen ? null : key)}>
                              <td>
                                <div style={{ fontWeight: 560 }}>
                                  {dateLabel(s.start, false)} – {dateLabel(s.close)}
                                </div>
                                <div className="sub-line">{s.count} charge{s.count === 1 ? '' : 's'}</div>
                              </td>
                              <td>{dateLabel(s.due)}</td>
                              <td className="r">{fmt.money(s.charged, { currency: card.currency })}</td>
                              <td className="r">{s.paid ? fmt.money(s.paid, { currency: card.currency }) : <span className="faint">—</span>}</td>
                              <td className="r" style={{ fontWeight: 600 }}>{fmt.money(s.remaining, { currency: card.currency })}</td>
                              <td>
                                <StatementPill s={s} />
                              </td>
                              <td className="r">
                                {(s.status === 'due' || s.status === 'overdue') && (
                                  <button
                                    className="btn sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPaying({ card, statement: s })
                                    }}
                                  >
                                    Pay
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={7} style={{ background: 'var(--surface-2)', whiteSpace: 'normal' }}>
                                  {items.length === 0 ? (
                                    <span className="muted">
                                      {s.charged > 0 ? 'The amount owed when the card was added.' : 'No charges on this statement yet.'}
                                    </span>
                                  ) : (
                                    <div className="list">
                                      {items.map((e) => (
                                        <button key={e.id} className="exp-row" onClick={() => setCharge({ expense: e })}>
                                          <span className="cat-ic">
                                            <CategoryIcon category={e.category} size={15} />
                                          </span>
                                          <span className="grow">
                                            <span className="title">{e.note || categoryLabel(e.category)}</span>
                                            <span className="sub-line">
                                              {dateLabel(e.date, false)} · {categoryLabel(e.category)}
                                            </span>
                                          </span>
                                          <span className="num amt">
                                            {fmt.money(e.cardAmount ?? e.amount, { currency: e.cardAmount != null ? card.currency : e.currency })}
                                            {e.currency !== card.currency && <span className="sub-line">{fmt.money(e.amount, { currency: e.currency })}</span>}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {card.payments.filter((x) => x.statement === s.close).length > 0 && (
                                    <div className="sub-line" style={{ marginTop: 8 }}>
                                      Payments:{' '}
                                      {card.payments
                                        .filter((x) => x.statement === s.close)
                                        .map((x) => `${fmt.money(x.amount, { currency: card.currency })} on ${dateLabel(x.date, false)}${x.auto ? ' (automatic)' : ''}`)
                                        .join(' · ')}
                                    </div>
                                  )}
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
            )
          })}
        </>
      )}

      {adding && <CardDialog onClose={() => setAdding(false)} />}
      {editing && <CardDialog card={editing} onClose={() => setEditing(null)} />}
      {paying && <PayDialog card={paying.card} statement={paying.statement} onClose={() => setPaying(null)} />}
      {charge && <ExpenseDialog expense={charge.expense} cardId={charge.cardId} onClose={() => setCharge(null)} />}
    </div>
  )
}
