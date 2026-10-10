// Currency conversion and number formatting.

export type Rates = Record<string, number>

/** Converts using USD-based rates (units per 1 USD). Returns null when a rate is missing. */
export function convert(amount: number, from: string, to: string, rates: Rates | undefined): number | null {
  if (!Number.isFinite(amount)) return null
  if (from === to) return amount
  const rFrom = rates?.[from]
  const rTo = rates?.[to]
  if (!rFrom || !rTo) return null
  return (amount / rFrom) * rTo
}

const fmtCache = new Map<string, Intl.NumberFormat>()

function formatter(key: string, make: () => Intl.NumberFormat) {
  let f = fmtCache.get(key)
  if (!f) {
    f = make()
    fmtCache.set(key, f)
  }
  return f
}

const MASK = '••••'

export interface MoneyOptions {
  compact?: boolean
  sign?: boolean
  hide?: boolean
  decimals?: number
}

/** Fraction digits shown for a currency: its usual digits (JPY 0, USD 2), never more than 2 (CLF has 4). */
function currencyDigits(currency: string): number {
  try {
    return Math.min(2, new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2)
  } catch {
    return 2
  }
}

export function formatMoney(value: number | null | undefined, currency: string, opts: MoneyOptions = {}): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = opts.sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  if (opts.hide) return `${sign}${symbolFor(currency)}${MASK}`
  const abs = Math.abs(value)
  const compact = opts.compact && abs >= 10000
  const digits = opts.decimals ?? (compact ? 1 : abs >= 100000 ? 0 : currencyDigits(currency))
  const key = `${currency}|${compact}|${digits}`
  let text: string
  try {
    text = formatter(key, () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'symbol',
        notation: compact ? 'compact' : 'standard',
        minimumFractionDigits: compact ? 0 : digits,
        maximumFractionDigits: digits
      })
    ).format(abs)
  } catch {
    text = `${currency} ${abs.toLocaleString('en-US', { maximumFractionDigits: digits })}`
  }
  return sign + text
}

export function symbolFor(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol'
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency + ' '
  }
}

/** Prices keep more precision than totals (a $0.3412 coin, a $193.10 ETF). */
export function formatPrice(value: number | null | undefined, currency: string, hide = false): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (hide) return `${symbolFor(currency)}${MASK}`
  const abs = Math.abs(value)
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return formatMoney(value, currency, { decimals })
}

export function formatPct(value: number | null | undefined, sign = true, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const s = sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  return `${s}${Math.abs(value * 100).toFixed(decimals)}%`
}

export function formatQty(value: number, hide = false): string {
  if (hide) return MASK
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const max = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8
  return value.toLocaleString('en-US', { maximumFractionDigits: max })
}

export function formatAxis(value: number, currency: string): string {
  return formatShort(value, currency)
}

/**
 * A short amount for tight spaces (chart labels, calendar cells): $53.8K, ¥1.2M, CLF 223.
 * Large values use K/M; small ones keep a decimal or two only when they matter.
 */
export function formatShort(value: number | null | undefined, currency: string, opts: { hide?: boolean; sign?: boolean; whole?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = opts.sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  if (opts.hide) return `${sign}${symbolFor(currency)}••`
  const abs = Math.abs(value)
  // `whole` drops cents below 1,000 (calendar cells): $25, $1.2K.
  const digits = Math.min(currencyDigits(currency), abs >= 1000 ? 1 : opts.whole || abs >= 100 ? 0 : abs >= 10 ? 1 : 2)
  try {
    return (
      sign +
      formatter(`short|${currency}|${digits}|${abs >= 1000}`, () =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          currencyDisplay: 'symbol',
          notation: abs >= 1000 ? 'compact' : 'standard',
          minimumFractionDigits: 0,
          maximumFractionDigits: digits
        })
      ).format(abs)
    )
  } catch {
    return `${sign}${currency} ${Math.round(abs).toLocaleString('en-US')}`
  }
}

/** Parses user-typed numbers like "1,234.5", "$1 234", "(500)". */
export function parseNumber(input: string): number | null {
  if (input == null) return null
  let s = String(input).trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[−–]/g, '-').replace(/[^\d.\-eE]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  }
  const n = Number(s)
  if (!Number.isFinite(n) || s === '') return null
  return negative ? -n : n
}
