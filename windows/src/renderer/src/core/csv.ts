import type { Snapshot, SnapshotTotals } from '@shared/types'
import { parseNumber } from './money'

// Import monthly history exported from Google Sheets / Excel (CSV or pasted TSV),
// and export history back to CSV.

export type ColumnRole = 'ignore' | 'month' | 'equities' | 'crypto' | 'cash' | 'other' | 'netWorth'

export const ROLE_LABEL: Record<ColumnRole, string> = {
  ignore: 'Ignore',
  month: 'Month / date',
  equities: 'Stocks & funds',
  crypto: 'Crypto',
  cash: 'Cash',
  other: 'Other',
  netWorth: 'Net worth (total)'
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function guessRole(header: string): ColumnRole {
  const h = header.toLowerCase()
  if (/month|date|period|日期|月份|時間/.test(h)) return 'month'
  if (/net ?worth|total|sum|資產淨值|總/.test(h)) return 'netWorth'
  if (/crypto|btc|bitcoin|coin|eth|加密|幣/.test(h)) return 'crypto'
  if (/cash|saving|bank|deposit|現金|存款|儲蓄/.test(h)) return 'cash'
  if (/stock|equit|etf|share|fund|invest|portfolio|股|基金|投資/.test(h)) return 'equities'
  if (/other|其他/.test(h)) return 'other'
  return 'ignore'
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
}

const pad = (m: number) => String(m).padStart(2, '0')
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)
const valid = (y: number, m: number) => (y >= 1950 && y <= 2200 && m >= 1 && m <= 12 ? `${y}-${pad(m)}` : null)

/** Detects whether slash dates in a column are day-first (31/1/2025) or month-first (1/31/2025). */
export function detectDayFirst(values: string[]): boolean {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
    if (!m) continue
    if (Number(m[1]) > 12) return true
    if (Number(m[2]) > 12) return false
  }
  return true
}

export function parseMonthCell(input: string, dayFirst = true): string | null {
  const s = input.trim()
  if (!s) return null
  let m: RegExpMatchArray | null
  // 2025-01, 2025/1, 2025-01-31, 2025.1.31
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/))) return valid(+m[1], +m[2])
  // 2025年1月
  if ((m = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月/))) return valid(+m[1], +m[2])
  // 31/1/2025 or 1/31/2025
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    const month = dayFirst ? +m[2] : +m[1]
    return valid(fullYear(+m[3]), month)
  }
  // 01/2025, 1-2025
  if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) return valid(+m[2], +m[1])
  // Jan 2025, January-25, Jan/2025
  if ((m = s.match(/^([A-Za-z]{3,9})\.?[\s/,-]*'?(\d{2,4})$/))) {
    const mm = MONTH_NAMES[m[1].slice(0, 4).toLowerCase()] ?? MONTH_NAMES[m[1].slice(0, 3).toLowerCase()]
    return mm ? valid(fullYear(+m[2]), mm) : null
  }
  // 2025 Jan
  if ((m = s.match(/^(\d{4})[\s/-]+([A-Za-z]{3,9})$/))) {
    const mm = MONTH_NAMES[m[2].slice(0, 3).toLowerCase()]
    return mm ? valid(+m[1], mm) : null
  }
  // 31 Jan 2025
  if ((m = s.match(/^\d{1,2}[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})$/))) {
    const mm = MONTH_NAMES[m[1].slice(0, 3).toLowerCase()]
    return mm ? valid(fullYear(+m[2]), mm) : null
  }
  return null
}

export interface ParsedRow {
  month: string
  totals: SnapshotTotals
}

export function rowsToMonths(rows: string[][], roles: ColumnRole[], hasHeader: boolean): { parsed: ParsedRow[]; skipped: number } {
  const body = hasHeader ? rows.slice(1) : rows
  const monthCol = roles.indexOf('month')
  if (monthCol < 0) return { parsed: [], skipped: body.length }
  const dayFirst = detectDayFirst(body.map((r) => r[monthCol] ?? ''))
  const byMonth = new Map<string, ParsedRow>()
  let skipped = 0
  for (const r of body) {
    const month = parseMonthCell(r[monthCol] ?? '', dayFirst)
    if (!month) {
      skipped++
      continue
    }
    const t: SnapshotTotals = { equities: 0, crypto: 0, cash: 0, other: 0, netWorth: 0 }
    let anyValue = false
    let hasNet = false
    roles.forEach((role, i) => {
      if (role === 'ignore' || role === 'month') return
      const n = parseNumber(r[i] ?? '')
      if (n == null) return
      anyValue = true
      if (role === 'netWorth') hasNet = true
      t[role] += n
    })
    if (!anyValue) {
      skipped++
      continue
    }
    if (!hasNet) t.netWorth = t.equities + t.crypto + t.cash + t.other
    // Later rows for the same month (e.g. weekly entries) win: the month-end value.
    byMonth.set(month, { month, totals: t })
  }
  return { parsed: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)), skipped }
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function snapshotFromImport(row: ParsedRow, base: string, source: Snapshot['source'] = 'import'): Snapshot {
  return { month: row.month, updatedAt: Date.now(), base, totals: row.totals, source }
}
