// /month: what you spent and earned in a month, by category, with the latest entries.
// Totals are in your main currency at each day's exchange rate, as in Moneta.

import type { AppData } from '@shared/types'
import { ratesOf } from '../../windows/src/renderer/src/core/calc'
import { formatMoney } from '../../windows/src/renderer/src/core/money'
import { byCategory, categoryLabel, expensesIn, inBase, isIncome } from '../../windows/src/renderer/src/core/spending'
import { dateText } from './actions'
import { esc, type Strings } from './i18n'

const LATEST = 8

/** "YYYY-MM" for "", "last" or "2026-09"; null when it isn't a month. */
export function monthOf(arg: string, today: string): string | null {
  const a = arg.trim().toLowerCase()
  if (!a || a === 'this') return today.slice(0, 7)
  if (a === 'last' || a === 'previous') {
    const [y, m] = today.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 2, 1))
    return d.toISOString().slice(0, 7)
  }
  const m = a.match(/^(\d{4})-(\d{1,2})$/)
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2].padStart(2, '0')}` : null
}

/** The /month message (HTML). */
export function monthSummary(data: AppData, month: string, today: string, t: Strings): string {
  const base = data.settings.baseCurrency
  const rates = ratesOf(data)
  const entries = expensesIn(data, month)
  const title = new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  if (!entries.length) return `📅 <b>${esc(title)}</b>\n${esc(t.month.none)}`

  const total = (kind: 'spend' | 'income') => entries.filter((e) => isIncome(e) === (kind === 'income')).reduce((s, e) => s + inBase(e, base, rates), 0)
  const money = (v: number, c = base) => esc(formatMoney(v, c))
  const out = [
    `📅 <b>${esc(title)}</b>`,
    `💸 ${esc(t.month.spent)}: <b>${money(total('spend'))}</b>`,
    `💰 ${esc(t.month.income)}: <b>${money(total('income'))}</b>`
  ]
  const cats = byCategory(entries, base, rates, 'spend')
  if (cats.length) out.push('', `📊 <b>${esc(t.month.byCategory)}</b>`, ...cats.map((c) => `• ${esc(c.label)} — <b>${money(c.total)}</b> <i>(${c.count})</i>`))

  const latest = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, LATEST)
  out.push(
    '',
    `🕘 <b>${esc(t.month.latest)}</b>`,
    ...latest.map((e) => {
      const what = [categoryLabel(e.category), e.note && t.quote(e.note)].filter(Boolean).join(' · ')
      return `• ${esc(dateText(e.date, today, t))} · ${esc(what)} — <b>${isIncome(e) ? '+' : ''}${money(e.amount, e.currency)}</b>`
    })
  )
  return out.join('\n')
}
