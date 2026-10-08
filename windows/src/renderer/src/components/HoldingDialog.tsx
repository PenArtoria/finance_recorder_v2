import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import type { AssetType, Holding, Quote, SymbolMatch } from '@shared/types'
import { TYPE_LABEL } from '@/core/calc'
import { uid } from '@/core/data'
import { formatPrice, symbolFor } from '@/core/money'
import { useApp } from '@/store'
import { CurrencySelect } from './CurrencySelect'
import { SymbolSearch } from './SymbolSearch'
import { ConfirmDialog, Dialog, Field, NumberInput, Segmented } from './ui'

type Mode = 'ticker' | 'manual'

export function HoldingDialog({ holding, onClose }: { holding?: Holding; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const base = useApp((s) => s.data.settings.baseCurrency)
  const quotes = useApp((s) => s.data.quotes)
  const editing = !!holding

  const [mode, setMode] = useState<Mode>(holding && !holding.symbol ? 'manual' : 'ticker')
  const [symbol, setSymbol] = useState(holding?.symbol ?? '')
  const [name, setName] = useState(holding?.name ?? '')
  const [type, setType] = useState<AssetType>(holding?.type ?? 'stock')
  const [currency, setCurrency] = useState(holding?.currency ?? base)
  const [quantity, setQuantity] = useState<number | null>(holding?.quantity ?? null)
  const [cost, setCost] = useState<number | null>(holding?.cost ?? null)
  const [manualPrice, setManualPrice] = useState<number | null>(holding?.manualPrice ?? null)
  const [account, setAccount] = useState(holding?.account ?? '')
  const [note, setNote] = useState(holding?.note ?? '')
  const [quote, setQuote] = useState<Quote | null>(holding?.symbol ? quotes[holding.symbol] ?? null : null)
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'error'>('idle')
  const [lookupError, setLookupError] = useState('')
  const [typedSymbol, setTypedSymbol] = useState('')
  const [tradeQty, setTradeQty] = useState<number | null>(null)
  const [tradeAmount, setTradeAmount] = useState<number | null>(null)
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tried, setTried] = useState(false)

  const loadQuote = async (sym: string) => {
    setLookup('loading')
    try {
      const res = await window.api.fetchQuotes([sym])
      const q = res.quotes[0]
      if (!q) throw new Error(res.errors[0]?.message || 'No price found')
      setQuote(q)
      setCurrency(q.currency)
      if (!name && q.name) setName(q.name)
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

  const qtyOk = quantity != null && quantity >= 0
  const nameOk = mode === 'manual' ? name.trim().length > 0 : symbol.length > 0
  const priceOk = mode === 'ticker' || manualPrice != null
  const valid = qtyOk && nameOk && priceOk

  const applyTrade = () => {
    if (!tradeQty || tradeQty <= 0 || quantity == null) return
    if (tradeSide === 'buy') {
      setQuantity(+(quantity + tradeQty).toPrecision(12))
      if (tradeAmount != null) setCost((cost ?? 0) + tradeAmount)
    } else {
      const sold = Math.min(tradeQty, quantity)
      const left = +(quantity - sold).toPrecision(12)
      if (cost != null && quantity > 0) setCost(cost * (left / quantity))
      setQuantity(left)
    }
    setTradeQty(null)
    setTradeAmount(null)
  }

  const save = () => {
    setTried(true)
    if (!valid) return
    const next: Holding = {
      id: holding?.id ?? uid('h'),
      symbol: mode === 'ticker' ? symbol : '',
      name: name.trim() || symbol,
      type,
      quantity: quantity ?? 0,
      currency,
      cost: cost ?? null,
      manualPrice: mode === 'manual' ? manualPrice : null,
      account: account.trim() || undefined,
      note: note.trim() || undefined,
      createdAt: holding?.createdAt ?? Date.now()
    }
    mutate((d) => {
      const i = d.holdings.findIndex((h) => h.id === next.id)
      if (i >= 0) d.holdings[i] = next
      else d.holdings.push(next)
      if (quote && next.symbol) d.quotes[next.symbol] = quote
      d.onboarded = true
    })
    toast(editing ? `${next.symbol || next.name} updated.` : `${next.symbol || next.name} added.`, 'success')
    onClose()
  }

  const remove = () => {
    if (!holding) return
    mutate((d) => {
      d.holdings = d.holdings.filter((h) => h.id !== holding.id)
      d.goals = d.goals.filter((g) => !(g.source.kind === 'holding' && g.source.id === holding.id))
    })
    toast(`${holding.symbol || holding.name} removed.`, 'info')
    onClose()
  }

  const valuePreview =
    quantity != null && (mode === 'ticker' ? quote?.price : manualPrice) != null
      ? quantity * ((mode === 'ticker' ? quote?.price : manualPrice) as number)
      : null

  return (
    <>
      <Dialog
        title={editing ? `Edit ${holding?.symbol || holding?.name}` : 'Add a holding'}
        sub={editing ? 'Change the amount you own, or record a buy or sell.' : 'Stocks, ETFs and crypto get live prices. Anything else can be added by hand.'}
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
              {editing ? 'Save changes' : 'Add holding'}
            </button>
          </>
        }
      >
        <div className="form">
          {!editing && (
            <Segmented
              value={mode}
              onChange={setMode}
              label="Holding kind"
              options={[
                { value: 'ticker', label: 'Has a ticker (live price)' },
                { value: 'manual', label: 'Enter price myself' }
              ]}
            />
          )}

          {mode === 'ticker' && (
            <>
              {!symbol ? (
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
                  {tried && !symbol && <div className="error" style={{ color: 'var(--bad)', fontSize: 12 }}>Pick an asset first.</div>}
                </>
              ) : (
                <div className="split-chip" style={{ alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{symbol}</div>
                    <div className="faint" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name || quote?.name || 'Looking up…'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {lookup === 'loading' && <Loader2 size={15} className="spin" />}
                    {lookup === 'error' && <span className="bad" style={{ fontSize: 12.5 }}>{lookupError}</span>}
                    {quote && lookup === 'idle' && (
                      <span className="num" style={{ fontWeight: 560 }}>
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
              {symbol && (
                <div className="form-row">
                  <Field label="Type">
                    <select className="select" value={type} onChange={(e) => setType(e.target.value as AssetType)}>
                      {(Object.keys(TYPE_LABEL) as AssetType[]).map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Display name">
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                </div>
              )}
            </>
          )}

          {mode === 'manual' && (
            <>
              <Field label="Name" error={tried && !name.trim() ? 'Give it a name.' : undefined}>
                <input className="input" value={name} placeholder="e.g. MPF, private fund, gold coins" autoFocus={!editing} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="form-row">
                <Field label="Type">
                  <select className="select" value={type} onChange={(e) => setType(e.target.value as AssetType)}>
                    {(Object.keys(TYPE_LABEL) as AssetType[]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Currency">
                  <CurrencySelect value={currency} onChange={setCurrency} />
                </Field>
              </div>
              <Field label="Price per unit" hint="Update it whenever you check the value." error={tried && manualPrice == null ? 'Enter a price.' : undefined}>
                <NumberInput value={manualPrice} onChange={setManualPrice} prefix={symbolFor(currency)} placeholder="0.00" />
              </Field>
            </>
          )}

          {(mode === 'manual' || symbol) && (
            <>
              <div className="form-row">
                <Field label="Quantity you own" error={tried && !qtyOk ? 'Enter how many units you own.' : undefined}>
                  <NumberInput value={quantity} onChange={setQuantity} placeholder="0" />
                </Field>
                <Field label="Total cost (optional)" hint="What you paid in total, for profit and loss.">
                  <NumberInput value={cost} onChange={setCost} prefix={symbolFor(currency)} placeholder="0.00" />
                </Field>
              </div>
              {valuePreview != null && (
                <div className="faint" style={{ fontSize: 13 }}>
                  Worth about <b className="num" style={{ color: 'var(--ink)' }}>{formatPrice(valuePreview, mode === 'ticker' ? quote?.currency ?? currency : currency)}</b> at the current price.
                </div>
              )}

              {editing && (
                <div className="card" style={{ padding: 14, background: 'var(--surface-2)', boxShadow: 'none' }}>
                  <div className="field-label" style={{ marginBottom: 10 }}>Record a buy or sell</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Segmented
                      value={tradeSide}
                      onChange={setTradeSide}
                      label="Buy or sell"
                      options={[
                        { value: 'buy', label: 'Bought' },
                        { value: 'sell', label: 'Sold' }
                      ]}
                    />
                    <div style={{ width: 120 }}>
                      <NumberInput value={tradeQty} onChange={setTradeQty} placeholder="Units" />
                    </div>
                    {tradeSide === 'buy' && (
                      <div style={{ width: 150 }}>
                        <NumberInput value={tradeAmount} onChange={setTradeAmount} placeholder="Paid" prefix={symbolFor(currency)} />
                      </div>
                    )}
                    <button className="btn sm" onClick={applyTrade} disabled={!tradeQty}>
                      Apply
                    </button>
                  </div>
                  <div className="hint faint" style={{ fontSize: 12, marginTop: 8 }}>
                    Updates the quantity and total cost above. Save to keep it.
                  </div>
                </div>
              )}

              <div className="form-row">
                <Field label="Account (optional)">
                  <input className="input" value={account} placeholder="e.g. IBKR, HSBC, Binance" onChange={(e) => setAccount(e.target.value)} />
                </Field>
                <Field label="Note (optional)">
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </div>
      </Dialog>
      {confirmDelete && holding && (
        <ConfirmDialog
          title={`Remove ${holding.symbol || holding.name}?`}
          body="It disappears from your holdings. Past months keep the value it had then. Goals that track only this holding are removed too."
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
