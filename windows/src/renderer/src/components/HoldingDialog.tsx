import { useMemo, useState } from 'react'
import { Loader2, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import type { AssetType, Holding, Quote, SymbolMatch, Trade } from '@shared/types'
import { ratesOf, TYPE_LABEL } from '@/core/calc'
import { uid } from '@/core/data'
import { formatMoney, formatPrice, formatQty, symbolFor } from '@/core/money'
import { averageCost, isBalance, isValued, syncHolding } from '@/core/trades'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { SymbolSearch } from './SymbolSearch'
import { buildTrade, evalDraft, newDraft, tradeSummary, TradeDialog, TradeFields, undoTradeCash, type TradeDraft } from './TradeDialog'
import { ConfirmDialog, Dialog, Field, NumberInput, Segmented } from './ui'

export type HoldingKind = 'investment' | 'bank' | 'asset'

export const kindOf = (t: AssetType): HoldingKind => (isBalance(t) ? 'bank' : isValued(t) ? 'asset' : 'investment')

const INVEST_TYPES: AssetType[] = ['stock', 'etf', 'fund', 'crypto', 'bond']
const ASSET_TYPES: AssetType[] = ['property', 'pension', 'other']

function TypeSelect({ value, types, onChange }: { value: AssetType; types: AssetType[]; onChange: (t: AssetType) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as AssetType)}>
      {types.map((t) => (
        <option key={t} value={t}>
          {TYPE_LABEL[t]}
        </option>
      ))}
    </select>
  )
}

export function HoldingDialog({ holding, kind: initialKind = 'investment', onClose }: { holding?: Holding; kind?: HoldingKind; onClose: () => void }) {
  const data = useApp((s) => s.data)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const base = data.settings.baseCurrency
  const editing = !!holding
  // Read the live copy so trade changes made from this dialog show up straight away.
  const live = holding ? data.holdings.find((h) => h.id === holding.id) ?? holding : undefined

  const [kind, setKind] = useState<HoldingKind>(holding ? kindOf(holding.type) : initialKind)
  const [ticker, setTicker] = useState(holding ? !!holding.symbol : true)
  const [symbol, setSymbol] = useState(holding?.symbol ?? '')
  const [name, setName] = useState(holding?.name ?? '')
  const [type, setType] = useState<AssetType>(holding?.type ?? 'stock')
  const [currency, setCurrency] = useState(holding?.currency ?? base)
  const [manualPrice, setManualPrice] = useState<number | null>(holding?.manualPrice ?? null)
  const [balance, setBalance] = useState<number | null>(holding && isBalance(holding.type) ? holding.quantity : null)
  const [cost, setCost] = useState<number | null>(holding && isValued(holding.type) ? holding.cost ?? null : null)
  const [account, setAccount] = useState(holding?.account ?? '')
  const [note, setNote] = useState(holding?.note ?? '')
  const [quote, setQuote] = useState<Quote | null>(holding?.symbol ? data.quotes[holding.symbol] ?? null : null)
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'error'>('idle')
  const [lookupError, setLookupError] = useState('')
  const [typedSymbol, setTypedSymbol] = useState('')
  const [draft, setDraft] = useState<TradeDraft>(() => newDraft(null))
  const [tried, setTried] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tradeDialog, setTradeDialog] = useState<{ side: 'buy' | 'sell'; trade?: Trade } | null>(null)
  const [removeTrade, setRemoveTrade] = useState<Trade | null>(null)

  // Adding a ticker you already own records a buy on that holding instead of a second row.
  const existing = !editing && ticker && symbol ? data.holdings.find((h) => h.symbol.toUpperCase() === symbol.toUpperCase()) : undefined
  const priceCurrency = quote?.currency ?? currency
  const linkedBuckets = holding ? data.buckets.filter((b) => b.accountId === holding.id) : []

  const loadQuote = async (sym: string) => {
    setLookup('loading')
    try {
      const res = await window.api.fetchQuotes([sym])
      const q = res.quotes[0]
      if (!q) throw new Error(res.errors[0]?.message || 'No price found')
      setQuote(q)
      setCurrency(q.currency)
      setName((n) => n || q.name || sym)
      setDraft((d) => ({ ...d, price: q.price }))
      setLookup('idle')
    } catch (err: any) {
      setQuote(null)
      setLookup('error')
      setLookupError(err?.message || 'No price found')
    }
  }

  const pick = (m: SymbolMatch) => {
    setSymbol(m.symbol)
    setName(m.name)
    setType(m.type === 'other' ? 'stock' : m.type)
    loadQuote(m.symbol)
  }

  const applyTyped = () => {
    const s = typedSymbol.trim().toUpperCase()
    if (!s) return
    setSymbol(s)
    setName('')
    loadQuote(s)
  }

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (kind === 'investment') {
      if (ticker && !symbol) e.symbol = 'Pick an asset first.'
      if (!ticker && !name.trim()) e.name = 'Give it a name.'
      if (!ticker && manualPrice == null) e.price = 'Enter the current price.'
      if (!editing) {
        const r = evalDraft(draft)
        if (r.error) e.trade = r.error
      }
    } else {
      if (!name.trim()) e.name = kind === 'bank' ? 'Name the account.' : 'Give it a name.'
      if (kind === 'bank' && balance == null) e.balance = 'Enter the balance, even if it is 0.'
      if (kind === 'asset' && manualPrice == null) e.price = 'Enter what it is worth now.'
    }
    return e
  }, [kind, ticker, symbol, name, manualPrice, editing, draft, balance])
  const valid = Object.keys(errors).length === 0

  const save = () => {
    setTried(true)
    if (!valid) return
    let message = ''
    mutate((d) => {
      const rates = ratesOf(d)
      if (existing) {
        const h = d.holdings.find((x) => x.id === existing.id)!
        const t = buildTrade(d, draft, quote?.currency ?? h.currency, rates)
        if (!t) return
        h.trades = [...(h.trades ?? []), t]
        syncHolding(h)
        if (quote) d.quotes[h.symbol] = quote
        message = `Added ${formatQty(t.quantity)} units to ${h.symbol}.`
        return
      }
      const now = Date.now()
      let next: Holding
      if (kind === 'investment') {
        next = {
          id: holding?.id ?? uid('h'),
          symbol: ticker ? symbol : '',
          name: name.trim() || symbol,
          type,
          quantity: holding?.quantity ?? 0,
          currency: ticker ? priceCurrency : currency,
          manualPrice: ticker ? null : manualPrice,
          account: account.trim() || undefined,
          note: note.trim() || undefined,
          trades: live?.trades ?? [],
          createdAt: holding?.createdAt ?? now
        }
        if (!editing) {
          const t = buildTrade(d, draft, next.currency, rates)
          if (!t) return
          next.trades = [t]
        }
        syncHolding(next)
        if (quote && next.symbol) d.quotes[next.symbol] = quote
      } else if (kind === 'bank') {
        next = {
          id: holding?.id ?? uid('a'),
          symbol: '',
          name: name.trim(),
          type: type === 'deposit' ? 'deposit' : 'cash',
          quantity: balance ?? 0,
          currency,
          account: account.trim() || undefined,
          note: note.trim() || undefined,
          createdAt: holding?.createdAt ?? now
        }
      } else {
        next = {
          id: holding?.id ?? uid('h'),
          symbol: '',
          name: name.trim(),
          type: ASSET_TYPES.includes(type) ? type : 'other',
          quantity: 1,
          currency,
          manualPrice,
          cost: cost && cost > 0 ? cost : null,
          costQuantity: cost && cost > 0 ? 1 : 0,
          account: account.trim() || undefined,
          note: note.trim() || undefined,
          createdAt: holding?.createdAt ?? now
        }
      }
      const i = d.holdings.findIndex((h) => h.id === next.id)
      if (i >= 0) d.holdings[i] = next
      else d.holdings.push(next)
      d.onboarded = true
      message = editing ? `${next.symbol || next.name} updated.` : `${next.symbol || next.name} added.`
    })
    if (message) toast(message, 'success')
    onClose()
  }

  const remove = () => {
    if (!holding) return
    mutate((d) => {
      d.holdings = d.holdings.filter((h) => h.id !== holding.id)
      d.goals = d.goals.filter((g) => !(g.source.kind === 'holding' && g.source.id === holding.id))
      for (const b of d.buckets) if (b.accountId === holding.id) b.accountId = null
    })
    toast(`${holding.symbol || holding.name} removed.`, 'info')
    onClose()
  }

  const deleteTrade = (t: Trade) => {
    if (!holding) return
    mutate((d) => {
      const h = d.holdings.find((x) => x.id === holding.id)
      if (!h?.trades) return
      undoTradeCash(d, t, ratesOf(d))
      h.trades = h.trades.filter((x) => x.id !== t.id)
      syncHolding(h)
    })
    toast('Trade removed.', 'info')
  }

  const title = editing
    ? `Edit ${holding?.symbol || holding?.name}`
    : kind === 'bank'
      ? 'Add a bank account'
      : kind === 'asset'
        ? 'Add another asset'
        : 'Add an investment'
  const sub = editing
    ? kind === 'investment'
      ? 'Record buys and sells below. Units and cost basis follow from them.'
      : kind === 'bank'
        ? 'Update the balance whenever you check your bank.'
        : 'Update the value whenever it changes.'
    : kind === 'bank'
      ? 'Current, savings or fixed-deposit accounts. Your buckets can then split this money by purpose.'
      : kind === 'asset'
        ? 'Property, a pension pot, or anything else you value as a whole.'
        : 'Stocks, ETFs and crypto get live prices. Funds without a ticker take a price you enter.'

  const trades = [...(live?.trades ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const avg = live ? averageCost(live) : null

  return (
    <>
      <Dialog
        wide={kind === 'investment'}
        title={title}
        sub={sub}
        onClose={onClose}
        footer={
          <>
            {editing && (
              <button className="btn ghost danger left" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> Remove
              </button>
            )}
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={tried && !valid}>
              {editing ? 'Save changes' : existing ? `Add to ${existing.symbol}` : kind === 'bank' ? 'Add account' : kind === 'asset' ? 'Add asset' : 'Add investment'}
            </button>
          </>
        }
      >
        <div className="form">
          {!editing && (
            <Segmented
              value={kind}
              onChange={(k) => {
                setKind(k)
                setType(k === 'bank' ? 'cash' : k === 'asset' ? 'property' : 'stock')
                setTried(false)
              }}
              label="What are you adding"
              options={[
                { value: 'investment', label: 'Investment' },
                { value: 'bank', label: 'Bank account' },
                { value: 'asset', label: 'Other asset' }
              ]}
            />
          )}

          {kind === 'investment' && (
            <>
              {!editing && (
                <Segmented
                  value={ticker ? 'ticker' : 'manual'}
                  onChange={(v) => setTicker(v === 'ticker')}
                  label="Price source"
                  options={[
                    { value: 'ticker', label: 'Has a ticker (live price)' },
                    { value: 'manual', label: 'No ticker, I enter the price' }
                  ]}
                />
              )}

              {ticker && !symbol && (
                <>
                  <Field label="Find the asset" hint="London-listed ETFs end in .L (VWRA.L), Hong Kong stocks in .HK (2800.HK), crypto in -USD (BTC-USD).">
                    <SymbolSearch onPick={pick} autoFocus />
                  </Field>
                  <div className="form-row" style={{ alignItems: 'end' }}>
                    <Field label="Or type the exact Yahoo Finance symbol">
                      <input
                        className="input"
                        value={typedSymbol}
                        placeholder="e.g. VWRA.L"
                        onChange={(e) => setTypedSymbol(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyTyped()}
                      />
                    </Field>
                    <div>
                      <button className="btn" onClick={applyTyped} disabled={!typedSymbol.trim()}>
                        Use this symbol
                      </button>
                    </div>
                  </div>
                  {tried && errors.symbol && <div className="error-text">{errors.symbol}</div>}
                </>
              )}

              {ticker && symbol && (
                <div className="picked">
                  <div className="picked-text">
                    <div className="picked-sym">{symbol}</div>
                    <div className="picked-name">{name || quote?.name || 'Looking up…'}</div>
                  </div>
                  <div className="picked-side">
                    {lookup === 'loading' && <Loader2 size={15} className="spin" />}
                    {lookup === 'error' && <span className="bad">{lookupError}</span>}
                    {quote && lookup === 'idle' && (
                      <span className="num">
                        {formatPrice(quote.price, quote.currency)}
                        {quote.exchange ? <span className="faint"> · {quote.exchange}</span> : null}
                      </span>
                    )}
                    {!editing && (
                      <button
                        className="btn sm"
                        onClick={() => {
                          setSymbol('')
                          setQuote(null)
                          setLookup('idle')
                        }}
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>
              )}

              {existing && (
                <div className="banner">
                  <div className="grow">
                    You already own <b className="num">{formatQty(existing.quantity)}</b> units of {existing.symbol}. This is recorded as a new buy on that holding, and its
                    cost basis is updated.
                  </div>
                </div>
              )}

              {!ticker && (
                <>
                  <Field label="Name" error={tried ? errors.name : undefined}>
                    <input className="input" value={name} placeholder="e.g. MPF Growth Fund" autoFocus={!editing} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <div className="form-row">
                    <Field label="Currency">
                      <CurrencySelect value={currency} onChange={setCurrency} />
                    </Field>
                    <Field label="Price per unit now" hint="Update it whenever you check." error={tried ? errors.price : undefined}>
                      <NumberInput
                        value={manualPrice}
                        onChange={(v) => {
                          setManualPrice(v)
                          if (!editing) setDraft((d) => ({ ...d, price: d.price ?? v }))
                        }}
                        prefix={symbolFor(currency)}
                        placeholder="0.00"
                      />
                    </Field>
                  </div>
                </>
              )}

              {(!ticker || symbol) && !existing && (
                <div className="form-row">
                  <Field label="Type">
                    <TypeSelect value={type} types={INVEST_TYPES} onChange={setType} />
                  </Field>
                  {ticker ? (
                    <Field label="Display name">
                      <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                  ) : (
                    <Field label="Account (optional)">
                      <input className="input" value={account} placeholder="e.g. IBKR, HSBC" onChange={(e) => setAccount(e.target.value)} />
                    </Field>
                  )}
                </div>
              )}

              {!editing && (!ticker || symbol) && (
                <div className="subcard">
                  <div className="field-label">{existing ? 'This buy' : 'Your purchase'}</div>
                  <TradeFields
                    draft={draft}
                    onChange={setDraft}
                    currency={ticker ? priceCurrency : currency}
                    livePrice={ticker ? quote?.price ?? null : manualPrice}
                    allowSell={false}
                    allowUnknown={!existing}
                    showErrors={tried}
                  />
                  {!existing && (
                    <p className="faint" style={{ fontSize: 12.5 }}>
                      Bought it over several months? Enter the total you hold now with your average price, or record each buy later with Buy more.
                    </p>
                  )}
                </div>
              )}

              {editing && live && (
                <div className="subcard">
                  <div className="subcard-head">
                    <div>
                      <div className="field-label">Position</div>
                      <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
                        {formatQty(live.quantity)} units
                        {avg != null && <span className="muted" style={{ fontWeight: 400 }}> · average cost {formatPrice(avg, live.currency)}</span>}
                      </div>
                      {live.cost != null && (
                        <div className="sub-line">
                          Cost basis {formatMoney(live.cost, live.currency)}
                          {(live.costQuantity ?? live.quantity) < live.quantity - 1e-9
                            ? ` for ${formatQty(live.costQuantity ?? 0)} units. The other ${formatQty(live.quantity - (live.costQuantity ?? 0))} have no recorded price.`
                            : ''}
                        </div>
                      )}
                    </div>
                    <div className="actions">
                      <button className="btn sm" onClick={() => setTradeDialog({ side: 'sell' })}>
                        <Minus size={14} /> Sell
                      </button>
                      <button className="btn sm primary" onClick={() => setTradeDialog({ side: 'buy' })}>
                        <Plus size={14} /> Buy more
                      </button>
                    </div>
                  </div>
                  <div className="list">
                    {trades.length === 0 && <p className="faint">No trades yet.</p>}
                    {trades.map((t) => (
                      <div className="list-row" key={t.id} style={{ padding: '8px 0' }}>
                        <span className={`pill ${t.side === 'buy' ? 'good' : 'warn'}`}>{t.side === 'buy' ? 'Buy' : 'Sell'}</span>
                        <div className="grow">
                          <div className="title num" style={{ fontWeight: 500 }}>{tradeSummary(t, live.currency)}</div>
                          {(t.note || t.cash) && (
                            <div className="sub-line">
                              {[t.note, t.cash ? `${t.side === 'buy' ? 'paid from' : 'paid into'} cash, ${formatMoney(t.cash.amount, t.cash.currency)}` : ''].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                        <span className="num" style={{ fontWeight: 560 }}>{t.amount != null ? formatMoney(t.amount, live.currency) : <span className="faint">price unknown</span>}</span>
                        <button className="icon-btn" onClick={() => setTradeDialog({ side: t.side, trade: t })} aria-label="Edit trade">
                          <Pencil size={14} />
                        </button>
                        <button className="icon-btn" onClick={() => setRemoveTrade(t)} aria-label="Remove trade">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!ticker || symbol) && !existing && (
                <div className="form-row">
                  {ticker && (
                    <Field label="Account (optional)">
                      <input className="input" value={account} placeholder="e.g. IBKR, HSBC, Binance" onChange={(e) => setAccount(e.target.value)} />
                    </Field>
                  )}
                  <Field label="Note (optional)">
                    <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                </div>
              )}
            </>
          )}

          {kind === 'bank' && (
            <>
              <Field label="Account name" error={tried ? errors.name : undefined}>
                <input className="input" value={name} autoFocus={!editing} placeholder="e.g. HSBC Everyday, Wise USD" onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="form-row">
                <Field label="Kind">
                  <select className="select" value={type === 'deposit' ? 'deposit' : 'cash'} onChange={(e) => setType(e.target.value as AssetType)}>
                    <option value="cash">Current or savings account</option>
                    <option value="deposit">Fixed deposit</option>
                  </select>
                </Field>
                <Field label="Bank (optional)">
                  <input className="input" value={account} placeholder="e.g. HSBC" onChange={(e) => setAccount(e.target.value)} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Currency" hint={linkedBuckets.length ? 'Buckets use this account’s currency, so it can’t change while they’re linked.' : undefined}>
                  {linkedBuckets.length ? <input className="input" value={currency} disabled /> : <CurrencySelect value={currency} onChange={setCurrency} />}
                </Field>
                <Field label="Balance now" error={tried ? errors.balance : undefined}>
                  <NumberInput value={balance} onChange={setBalance} prefix={symbolFor(currency)} placeholder="0.00" allowNegative />
                </Field>
              </div>
              {linkedBuckets.length > 0 && balance != null && (
                <div className="split-chip">
                  <span className="muted">
                    In buckets: {linkedBuckets.map((b) => `${b.name} ${formatMoney(b.amount, b.currency)}`).join(' · ')}
                  </span>
                  <b className="num">{formatMoney(balance - linkedBuckets.reduce((s, b) => s + b.amount, 0), currency)} unassigned</b>
                </div>
              )}
              <Field label="Note (optional)">
                <input className="input" value={note} placeholder="e.g. Matures in March" onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          )}

          {kind === 'asset' && (
            <>
              <Field label="Name" error={tried ? errors.name : undefined}>
                <input className="input" value={name} autoFocus={!editing} placeholder="e.g. Flat in Tai Koo, MPF" onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="form-row">
                <Field label="Type">
                  <TypeSelect value={ASSET_TYPES.includes(type) ? type : 'property'} types={ASSET_TYPES} onChange={setType} />
                </Field>
                <Field label="Currency">
                  <CurrencySelect value={currency} onChange={setCurrency} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Worth now" error={tried ? errors.price : undefined}>
                  <NumberInput value={manualPrice} onChange={setManualPrice} prefix={symbolFor(currency)} placeholder="0.00" />
                </Field>
                <Field label="What you paid (optional)">
                  <NumberInput value={cost} onChange={setCost} prefix={symbolFor(currency)} placeholder="0.00" />
                </Field>
              </div>
              <Field label="Note (optional)">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </Dialog>

      {tradeDialog && live && <TradeDialog holding={live} side={tradeDialog.side} trade={tradeDialog.trade} onClose={() => setTradeDialog(null)} />}
      {removeTrade && (
        <ConfirmDialog
          title="Remove this trade?"
          body={`${tradeSummary(removeTrade, live?.currency ?? currency)}. Units and cost basis are recalculated${removeTrade.cash ? ', and the cash goes back where it came from' : ''}.`}
          confirmLabel="Remove trade"
          onConfirm={() => deleteTrade(removeTrade)}
          onClose={() => setRemoveTrade(null)}
        />
      )}
      {confirmDelete && holding && (
        <ConfirmDialog
          title={`Remove ${holding.symbol || holding.name}?`}
          body={
            linkedBuckets.length
              ? `${linkedBuckets.length} bucket${linkedBuckets.length === 1 ? ' is' : 's are'} kept in this account. They stay, as cash on their own. Past months keep their values.`
              : 'It disappears from your holdings. Past months keep the value it had then. Goals that track only this holding are removed too.'
          }
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
