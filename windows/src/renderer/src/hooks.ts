import { useEffect, useMemo, useState } from 'react'
import { computePortfolio, type Portfolio } from './core/calc'
import { formatMoney, formatPrice, formatQty, formatShort, type MoneyOptions } from './core/money'
import { useApp } from './store'

export function usePortfolio(): Portfolio {
  const data = useApp((s) => s.data)
  return useMemo(() => computePortfolio(data), [data])
}

/** Formatting helpers bound to the base currency and the "hide amounts" setting. */
export function useFmt() {
  const base = useApp((s) => s.data.settings.baseCurrency)
  const hide = useApp((s) => s.data.settings.hideAmounts)
  return useMemo(
    () => ({
      base,
      hide,
      money: (v: number | null | undefined, opts: MoneyOptions & { currency?: string } = {}) =>
        formatMoney(v, opts.currency ?? base, { hide, ...opts }),
      price: (v: number | null | undefined, currency: string) => formatPrice(v, currency, hide),
      /** Compact amount for charts and calendar cells. */
      short: (v: number | null | undefined, opts: { currency?: string; sign?: boolean; whole?: boolean } = {}) =>
        formatShort(v, opts.currency ?? base, { hide, sign: opts.sign, whole: opts.whole }),
      qty: (v: number) => formatQty(v, hide)
    }),
    [base, hide]
  )
}

/** True when the app is showing its dark palette. */
export function useIsDark(): boolean {
  const theme = useApp((s) => s.data.settings.theme)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return theme === 'dark' || (theme === 'system' && systemDark)
}

export interface ChartColors {
  series: string[]
  none: string
  accent: string
  good: string
  bad: string
  grid: string
  axis: string
  ink: string
  ink2: string
  ink3: string
  surface: string
}

export function applyThemeAttr(theme: 'system' | 'light' | 'dark') {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme)
}

/** Chart libraries need literal colors, so read the theme tokens after each theme switch. */
export function useChartColors(): ChartColors {
  const dark = useIsDark()
  const theme = useApp((s) => s.data.settings.theme)
  return useMemo(() => {
    applyThemeAttr(theme)
    const cs = getComputedStyle(document.documentElement)
    const v = (name: string) => cs.getPropertyValue(name).trim()
    return {
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)),
      none: v('--s-none'),
      accent: v('--accent'),
      good: v('--good'),
      bad: v('--bad'),
      grid: v('--grid'),
      axis: v('--axis'),
      ink: v('--ink'),
      ink2: v('--ink-2'),
      ink3: v('--ink-3'),
      surface: v('--surface')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, theme])
}

export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function timeAgo(ms: number | null, now = Date.now()): string {
  if (!ms) return 'never'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
