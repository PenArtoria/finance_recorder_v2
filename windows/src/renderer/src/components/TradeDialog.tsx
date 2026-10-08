import { useMemo, useState } from 'react'
import type { AppData, Holding, Trade } from '@shared/types'
import { ratesOf } from '@/core/calc'
import { moveMoney, parseSourceKey, sourceCurrency, sourceExists, sourceKey, sourceLabel } from '@/core/cash'
import { uid } from '@/core/data'
import { convert, formatMoney, formatPrice, formatQty, symbolFor, type Rates } from '@/core/money'
import { averageCost, dateLabel, replay, syncHolding, todayIso } from '@/core/trades'
import { useApp } from '@/store'
import { MoneySourceSelect } from './MoneySource'
import { Dialog, Field, NumberInput, Segmented } from './ui'

// Recording a buy or sell. A DCA purchase adds units to the holding at that day's
// price and raises its cost basis; nothing new is created.

export interface TradeDraft {
  side: 'buy' | 'sell'
  date: string
  mode: 'units' | 'amount'
  units: number | null
  total: number | null
  price: number | null
  fee: number | null
  unknownPrice: boolean
  sourceKey: string
}

export function newDraft(price: number | null, side: 'buy' | 'sell' = 'buy'): TradeDraft {
  return { side, date: todayIso(), mode: 'units', units: null, total: null, price, fee: null, unknownPrice: false, sourceKey: '' }
}

export function draftFromTrade(t: Trade): TradeDraft {
  const fee = t.fee ?? 0
  const price = t.amount != null && t.quantity > 0 ? (t.side === 'buy' ? t.amount - fee : t.amount + fee) / t.quantity : null
  return {
    side: t.side,
    date: t.date,
    mode: 'units',
    units: t.quantity,
    total: t.amount,
    price: price != null ? +price.toPrecision(10) : null,
    fee: t.fee ?? null,
    unknownPrice: t.amount == null,
    sourceKey: t.cash ? sourceKey(t.cash) : ''
  }
}

/** Works out units and total from what was typed. */
export function evalDraft(d: TradeDraft): { quantity: number | null; amount: number | null; error: string | null } {
  const fee = d.fee ?? 0
  const sign = d.side === 'buy' ? 1 : -1
  if (d.unknownPrice) {
    if (!d.units || d.units <= 0) return { quantity: null, amount: null, error: 'Enter how many units.' }
    return { quantity: d.units, amount: null, error: null }
  }
  if (!d.price || d.price <= 0) return { quantity: null, amount: null, error: 'Enter the price per unit.' }
  if (d.mode === 'units') {
    if (!d.units || d.units <= 0) return { quantity: null, amount: null, error: 'Enter how many units.' }
    return { quantity: d.units, amount: +(d.units * d.price + sign * fee).toFixed(8), error: null }
  }
  if (!d.total || d.total <= 0) return { quantity: null, amount: null, error: d.side === 'buy' ? 'Enter how much you invested.' : 'Enter how much you received.' }
  const quantity = (d.total - sign * fee) / d.price
  if (quantity <= 0) return { quantity: null, amount: null, error: 'The amount has to be more than the fee.' }
  return { quantity: +quantity.toPrecision(10), amount: d.total, error: null }
}

export function TradeFields({
  draft,
  onChange,
  currency,
  livePrice,
  allowSell = true,
  allowUnknown = false,
  showErrors
}: {
  draft: TradeDraft
  onChange: (d: TradeDraft) => void
  currency: string
  livePrice: number | null
  allowSell?: boolean
  allowUnknown?: boolean
  showErrors: boolean
}) {
  const data = useApp((s) => s.data)
  const rates = useMemo(() => ratesOf(data), [data])
  const set = (patch: Partial<TradeDraft>) => onChange({ ...draft, ...patch })
  const r = evalDraft(draft)
  const buy = draft.side === 'buy'
  const sym = symbolFor(currency)
  const src = parseSourceKey(draft.sourceKey)
  const srcCcy = sourceCurrency(data, src)
  const srcAmount = r.amount != null && srcCcy ? convert(r.amount, currency, srcCcy, rates) : null

  return (
    <div className="form">
      {allowSell && (
        <Segmented
          value={draft.side}
          onChange={(side) => set({ side })}
          label="Buy or sell"
          options={[
            { value: 'buy', label: 'Bought' },
            { value: 'sell', label: 'Sold' }
          ]}
        />
      )}

      {!draft.unknownPrice && (
        <Segmented
          value={draft.mode}
          onChange={(mode) => set({ mode })}
          label="Enter by"
          options={[
            { value: 'units', label: 'I know the units' },
            { value: 'amount', label: buy ? 'I know the amount invested' : 'I know the amount received' }
          ]}
        />
      )}

      <div className="form-row">
        {draft.mode === 'units' || draft.unknownPrice ? (
          <Field label={buy ? 'Units bought' : 'Units sold'}>
            <NumberInput value={draft.units} onChange={(units) => set({ units })} placeholder="0" autoFocus />
          </Field>
        ) : (
          <Field label={buy ? 'Amount invested' : 'Amount received'} hint={buy ? 'Fee included' : 'After the fee'}>
            <NumberInput value={draft.total} onChange={(total) => set({ total })} prefix={sym} placeholder="0.00" autoFocus />
          </Field>
        )}
        {!draft.unknownPrice && (
          <Field
            label="Price per unit"
            hint={
              livePrice != null && draft.price !== livePrice ? (
                <button type="button" className="link-btn" onClick={() => set({ price: livePrice })}>
                  Use today’s price {formatPrice(livePrice, currency)}
                </button>
              ) : livePrice != null ? (
                'Today’s price. Change it to what you actually paid.'
              ) : undefined
            }
          >
            <NumberInput value={draft.price} onChange={(price) => set({ price })} prefix={sym} placeholder="0.00" />
          </Field>
        )}
      </div>

      <div className="form-row">
        <Field label="Date">
          <input className="input" type="date" value={draft.date} max={todayIso()} onChange={(e) => set({ date: e.target.value || todayIso() })} />
        </Field>
        {!draft.unknownPrice && (
          <Field label="Fee (optional)">
            <NumberInput value={draft.fee} onChange={(fee) => set({ fee })} prefix={sym} placeholder="0.00" />
          </Field>
        )}
      </div>

      {!draft.unknownPrice && (
        <Field label={buy ? 'Paid from' : 'Money went to'} hint={buy ? 'Pick a bucket or account to take the money out of it.' : undefined}>
          <MoneySourceSelect value={draft.sourceKey} onChange={(sourceKey) => set({ sourceKey })} noneLabel="Don’t change my cash" />
        </Field>
      )}

      {allowUnknown && (
        <label className="check">
          <input type="checkbox" checked={draft.unknownPrice} onChange={(e) => set({ unknownPrice: e.target.checked })} />
          I don’t know what I paid
        </label>
      )}

      {showErrors && r.error ? (
        <div className="error-text">{r.error}</div>
      ) : r.quantity != null ? (
        <div className="split-chip">
          <span className="muted">
            {buy ? 'Buying' : 'Selling'} {formatQty(r.quantity)} units
            {r.amount != null ? ` at ${formatPrice(draft.price, currency)}` : ''}
            {srcAmount != null && src && sourceExists(data, src)
              ? ` · ${buy ? 'takes' : 'adds'} ${formatMoney(srcAmount, srcCcy!)} ${buy ? 'from' : 'to'} ${sourceLabel(data, src)}`
              : ''}
          </span>
          {r.amount != null && <b className="num">{formatMoney(r.amount, currency)}</b>}
        </div>
      ) : null}
    </div>
  )
}

/** Puts a trade's cash back where it came from (used when editing or removing it). */
export function undoTradeCash(draft: AppData, t: Trade, rates: Rates) {
  if (!t.cash) return
  moveMoney(draft, t.cash, t.side === 'buy' ? t.cash.amount : -t.cash.amount, rates)
}

/** Builds the trade from a draft and moves its cash. Returns null when the draft isn't valid. */
export function buildTrade(draft: AppData, d: TradeDraft, holdingCurrency: string, rates: Rates, existing?: Trade): Trade | null {
  const r = evalDraft(d)
  if (r.error || r.quantity == null) return null
  const t: Trade = {
    id: existing?.id ?? uid('t'),
    date: d.date,
    side: d.side,
    quantity: r.quantity,
    amount: r.amount,
    ...(d.fee && !d.unknownPrice ? { fee: d.fee } : {}),
    ...(existing?.note ? { note: existing.note } : {}),
    createdAt: existing?.createdAt ?? Date.now()
  }
  const src = d.unknownPrice ? null : parseSourceKey(d.sourceKey)
  const srcCcy = sourceCurrency(draft, src)
  if (src && srcCcy && r.amount != null) {
    const amount = convert(r.amount, holdingCurrency, srcCcy, rates) ?? r.amount
    moveMoney(draft, src, d.side === 'buy' ? -amount : amount, rates)
    t.cash = { ...src, amount: +amount.toFixed(8), currency: srcCcy }
  }
  return t
}

export function TradeDialog({
  holding,
  trade,
  side = 'buy',
  onClose
}: {
  holding: Holding
  trade?: Trade
  side?: 'buy' | 'sell'
  onClose: () => void
}) {
  const quotes = useApp((s) => s.data.quotes)
  const mutate = useApp((s) => s.mutate)
  const toast = useApp((s) => s.toast)
  const live = holding.symbol ? quotes[holding.symbol]?.price ?? null : holding.manualPrice ?? null
  const currency = holding.symbol ? quotes[holding.symbol]?.currency ?? holding.currency : holding.currency
  const [draft, setDraft] = useState<TradeDraft>(() => (trade ? draftFromTrade(trade) : newDraft(live, side)))
  const [tried, setTried] = useState(false)
  const label = holding.symbol || holding.name

  // Preview the position after this trade.
  const r = evalDraft(draft)
  const preview = useMemo(() => {
    if (r.quantity == null) return null
    const others = (holding.trades ?? []).filter((t) => t.id !== trade?.id)
    return replay([...others, { id: 'p', date: draft.date, side: draft.side, quantity: r.quantity, amount: r.amount, createdAt: Date.now() }])
  }, [holding.trades, trade?.id, draft.date, draft.side, r.quantity, r.amount])
  const avgAfter = preview && preview.cost != null && preview.costQuantity > 0 ? preview.cost / preview.costQuantity : null

  const save = () => {
    setTried(true)
    if (r.error) return
    let ok = false
    mutate((d) => {
      const rates = ratesOf(d)
      const h = d.holdings.find((x) => x.id === holding.id)
      if (!h) return
      h.trades = h.trades ?? []
      const old = trade ? h.trades.find((t) => t.id === trade.id) : undefined
      if (old) undoTradeCash(d, old, rates)
      const t = buildTrade(d, draft, currency, rates, old)
      if (!t) return
      h.trades = old ? h.trades.map((x) => (x.id === old.id ? t : x)) : [...h.trades, t]
      syncHolding(h)
      ok = true
    })
    if (!ok) return
    toast(trade ? 'Trade updated.' : `${draft.side === 'buy' ? 'Buy' : 'Sale'} of ${label} recorded.`, 'success')
    onClose()
  }

  const avgNow = averageCost(holding)

  return (
    <Dialog
      title={trade ? `Edit trade · ${label}` : draft.side === 'buy' ? `Buy more ${label}` : `Sell ${label}`}
      sub={
        <>
          You own {formatQty(holding.quantity)} units
          {avgNow != null ? `, average cost ${formatPrice(avgNow, currency)}` : ''}.
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            {trade ? 'Save trade' : draft.side === 'buy' ? 'Record buy' : 'Record sale'}
          </button>
        </>
      }
    >
      <TradeFields draft={draft} onChange={setDraft} currency={currency} livePrice={live} allowUnknown={!!trade && trade.amount == null} showErrors={tried} />
      {preview && (
        <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>
          After this you’ll own <b className="num" style={{ color: 'var(--ink)' }}>{formatQty(preview.quantity)}</b> units
          {avgAfter != null ? (
            <>
              {' '}at an average cost of <b className="num" style={{ color: 'var(--ink)' }}>{formatPrice(avgAfter, currency)}</b>
            </>
          ) : null}
          .
        </p>
      )}
    </Dialog>
  )
}

export function tradeSummary(t: Trade, currency: string): string {
  const fee = t.fee ?? 0
  const per = t.amount != null && t.quantity > 0 ? (t.side === 'buy' ? t.amount - fee : t.amount + fee) / t.quantity : null
  return `${dateLabel(t.date)} · ${formatQty(t.quantity)} units${per != null ? ` at ${formatPrice(per, currency)}` : ''}`
}
