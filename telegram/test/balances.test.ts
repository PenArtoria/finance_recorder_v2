import { describe, expect, it } from 'vitest'
import { exampleData } from '../../windows/src/renderer/src/core/example'
import { balances } from '../src/balances'
import { LANGS } from '../src/i18n'

// Moneta's example data: VWRA.L, VALL.L, RKLB and BTC, HSBC and Wise accounts with buckets, a Visa card.

describe('/balances', () => {
  const text = balances(exampleData(), LANGS.en, { live: true })

  it('starts with net worth', () => {
    expect(text.split('\n')[0]).toMatch(/^💼 <b>Net worth: \$[\d,.]+<\/b>$/)
  })

  it('lists investments with units, value and gain, biggest first', () => {
    const lines = text.split('\n')
    const start = lines.findIndex((l) => l.startsWith('📊 <b>Investments</b>'))
    expect(start).toBeGreaterThan(0)
    const rows = lines.slice(start + 1, lines.indexOf('', start))
    expect(rows.map((r) => r.match(/<b>([^<]+)<\/b>/)![1])).toEqual(['VWRA.L', 'RKLB', 'BTC-USD', 'VALL.L'])
    expect(rows[0]).toMatch(/^• <b>VWRA\.L<\/b> ×85 — \$16,413\.50 \([+−-][\d.]+%\)$/)
  })

  it('shows bank accounts with what isn’t in a bucket, buckets with targets, and cards', () => {
    expect(text).toContain('🏦 <b>Bank accounts</b>')
    expect(text).toContain('• HSBC Everyday — <b>HK$46,000.00</b>')
    expect(text).toMatch(/↳ HK\$[\d,.]+ not in a bucket/)
    expect(text).not.toContain('$0.00 not in a bucket')
    expect(text).toContain('• Japan trip — <b>HK$12,000.00</b> of HK$23,000.00 <i>· HSBC Everyday</i>')
    expect(text).toMatch(/💳 <b>Credit cards<\/b> · −\$[\d,.]+\n• Visa Signature — <b>HK\$[\d,.]+<\/b> owed/)
  })

  it('says where the prices come from', () => {
    expect(text.endsWith('<i>Live prices</i>')).toBe(true)
    const d = exampleData()
    for (const q of Object.values(d.quotes)) q.fetchedAt = Date.UTC(2026, 9, 25, 5, 30)
    expect(balances(d, LANGS.en, { live: false, timeZone: 'Asia/Tokyo' })).toContain('<i>Prices from 25 Oct, 14:30</i>')
  })

  it('is translated', () => {
    expect(balances(exampleData(), LANGS.ja, { live: true })).toContain('💼 <b>純資産')
    expect(balances(exampleData(), LANGS['zh-Hant'], { live: true })).toContain('🏦 <b>銀行戶口</b>')
  })

  it('explains when there is nothing yet', () => {
    const d = exampleData()
    d.holdings = []
    d.buckets = []
    d.cards = []
    expect(balances(d, LANGS.en, { live: false })).toBe(LANGS.en.bal.empty)
  })
})
