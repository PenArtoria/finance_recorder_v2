import { describe, expect, it } from 'vitest'
import { LANGS, pickLang, spendCard, struck, tradeCard, withCards } from '../src/i18n'

describe('pickLang', () => {
  it('follows the code it is given', () => {
    expect(pickLang('en').lang).toBe('en')
    expect(pickLang(undefined).lang).toBe('en')
    expect(pickLang('ja').lang).toBe('ja')
    expect(pickLang('zh-hans').lang).toBe('zh-Hans')
    expect(pickLang('zh-hant').lang).toBe('zh-Hant')
    expect(pickLang('zh-TW').lang).toBe('zh-Hant')
    expect(pickLang('zh-Hant').lang).toBe('zh-Hant')
    expect(pickLang('fr').lang).toBe('en')
  })
})

describe('cards', () => {
  const t = LANGS.en

  it('lays an entry out as one labelled row per line', () => {
    const html = spendCard(t, { amount: '¥1,200', category: 'Food &amp; drink', note: 'lunch', from: 'Daily (SMBC)', date: 'Today', left: '¥23,400' })
    expect(html).toBe('<blockquote>💸 <b>Spend ¥1,200</b>\nFood &amp; drink · “lunch”\nFrom: Daily (SMBC)\nLeft: ¥23,400\nDate: Today</blockquote>')
  })

  it('leaves out rows that don’t apply', () => {
    const card = spendCard(t, { amount: '$5', category: 'Other', card: 'Visa', date: 'Today' })
    expect(card).toContain('Card: Visa')
    expect(card).not.toContain('From:')
    const trade = tradeCard(t, { side: 'sell', quantity: '1', holding: 'RKLB', price: '$70', total: '$70', date: 'Today' })
    expect(trade).toContain('📉 <b>Sell 1 RKLB</b>')
    expect(trade).toContain('No cash moved')
    expect(trade).not.toContain('Fee:')
  })

  it('crosses a card out inside its box', () => {
    const card = spendCard(t, { amount: '$5', category: 'Other', date: 'Today' })
    expect(struck(card)).toMatch(/^<blockquote><s>💸[\s\S]*<\/s><\/blockquote>$/)
    expect(withCards('✅ <b>Saved</b>', [card, card])).toBe(`✅ <b>Saved</b>\n\n${card}\n${card}`)
  })

  it('uses each language’s labels and quotes', () => {
    expect(spendCard(LANGS.ja, { amount: '¥1,200', category: 'Food', note: 'ランチ', from: 'Daily', date: '今日' })).toContain('「ランチ」\n支払元：Daily')
  })
})
