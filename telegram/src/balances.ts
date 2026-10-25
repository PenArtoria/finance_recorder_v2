// /balances: net worth, investments, bank accounts, buckets, other assets and cards.
// The numbers come from Moneta's own portfolio code, so they match the app.

import type { AppData } from '@shared/types'
import { computePortfolio } from '../../windows/src/renderer/src/core/calc'
import { formatMoney, formatPct, formatQty } from '../../windows/src/renderer/src/core/money'
import { isUnits, isValued } from '../../windows/src/renderer/src/core/trades'
import { esc, type Strings } from './i18n'

export interface BalanceOptions {
  /** Prices were just fetched, rather than taken from the last sync. */
  live: boolean
  /** For the time the prices are from. */
  timeZone?: string
}

/** The /balances message (HTML). */
export function balances(data: AppData, t: Strings, opts: BalanceOptions): string {
  const p = computePortfolio(data)
  const base = p.base
  const money = (v: number | null | undefined, ccy: string, sign = false) => esc(formatMoney(v, ccy, { sign }))
  const out: string[] = []

  const section = (icon: string, title: string, total: number | null, lines: string[]) => {
    if (lines.length) out.push('', `${icon} <b>${esc(title)}</b>${total != null ? ` · ${money(total, base)}` : ''}`, ...lines)
  }

  const investments = p.holdings.filter((r) => isUnits(r.holding.type)).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  section(
    '📊',
    t.bal.investments,
    p.totals.investments,
    investments.map((r) => {
      const h = r.holding
      const gain = r.pnlPct != null ? ` (${esc(formatPct(r.pnlPct, true, 1))})` : ''
      return `• <b>${esc(h.symbol || h.name)}</b> ×${esc(formatQty(h.quantity))} — ${r.valueLocal != null ? money(r.valueLocal, r.priceCurrency) : '—'}${gain}`
    })
  )

  section(
    '🏦',
    t.bal.accounts,
    p.accounts.reduce((s, a) => s + (a.value ?? 0), 0),
    p.accounts.flatMap((a) => {
      const h = a.holding
      const lines = [`• ${esc(h.name)} — <b>${money(h.quantity, h.currency)}</b>`]
      if ((a.buckets.length || a.reserved > 0.005) && Math.abs(a.unassigned) > 0.005) lines.push(`   ↳ ${esc(t.bal.notInBucket(formatMoney(a.unassigned, h.currency)))}`)
      return lines
    })
  )

  section(
    '🪣',
    t.bal.buckets,
    null,
    p.buckets.map((r) => {
      const b = r.bucket
      const target = b.target ? ` ${esc(t.bal.target(formatMoney(b.target, b.currency)))}` : ''
      const where = r.account ? ` <i>· ${esc(r.account.name)}</i>` : ''
      return `• ${esc(b.name)} — <b>${money(b.amount, b.currency)}</b>${target}${where}`
    })
  )

  const assets = p.holdings.filter((r) => isValued(r.holding.type))
  section(
    '🏠',
    t.bal.assets,
    assets.reduce((s, r) => s + (r.value ?? 0), 0),
    assets.map((r) => `• ${esc(r.holding.name)} — <b>${r.valueLocal != null ? money(r.valueLocal, r.priceCurrency) : '—'}</b>`)
  )

  const cards = p.cards.filter((c) => c.owed > 0.005)
  section(
    '💳',
    t.bal.cards,
    -p.totals.debt,
    cards.map((c) => `• ${esc(c.card.name)} — <b>${money(c.owed, c.card.currency)}</b> ${esc(t.bal.owed)}`)
  )

  if (!out.length) return esc(t.bal.empty)

  const head = [`💼 <b>${esc(t.bal.netWorth)}: ${money(p.totals.netWorth, base)}</b>`]
  if (p.dayPct != null && Math.abs(p.dayChange) >= 0.005) {
    head.push(`${p.dayChange >= 0 ? '📈' : '📉'} ${esc(t.bal.today)}: ${money(p.dayChange, base, true)} (${esc(formatPct(p.dayPct, true, 1))})`)
  }

  const when = opts.live
    ? t.bal.livePrices
    : p.oldestQuote
      ? t.bal.prices(
          new Intl.DateTimeFormat(t.locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: opts.timeZone || 'UTC' }).format(
            new Date(p.oldestQuote)
          )
        )
      : null
  const foot = investments.length && when ? ['', `<i>${esc(when)}</i>`] : []
  return [...head, ...out, ...foot].join('\n')
}
