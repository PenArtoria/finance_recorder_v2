// What the AI is told about your data: only names, currencies and categories, so it
// can match "my bank" or "daily" to the right place. No balances or history.

import type { AppData } from '@shared/types'
import { bankAccounts, linkedAccount } from '../../../windows/src/renderer/src/core/cash'
import { frequentCurrencies, INCOME_CATEGORIES, SPEND_CATEGORIES } from '../../../windows/src/renderer/src/core/spending'
import { isUnits, isValued } from '../../../windows/src/renderer/src/core/trades'

export interface AiContext {
  /** YYYY-MM-DD in the bot's time zone. */
  today: string
  baseCurrency: string
  /** Most-used currencies first. */
  currencies: string[]
  buckets: { ref: string; name: string; currency: string; account?: string }[]
  accounts: { ref: string; name: string; currency: string; bank?: string }[]
  /** Assets valued as a whole (a pension), which income can go into. */
  assets: { ref: string; name: string; currency: string }[]
  holdings: { ref: string; symbol: string; name: string; currency: string }[]
  cards: { ref: string; name: string; currency: string }[]
  spendCategories: { key: string; label: string }[]
  incomeCategories: { key: string; label: string }[]
}

export function buildContext(data: AppData, today: string): AiContext {
  return {
    today,
    baseCurrency: data.settings.baseCurrency,
    currencies: frequentCurrencies(data),
    buckets: data.buckets.map((b) => ({ ref: `bucket:${b.id}`, name: b.name, currency: b.currency, account: linkedAccount(data, b)?.name })),
    accounts: bankAccounts(data).map((a) => ({ ref: `account:${a.id}`, name: a.name, currency: a.currency, bank: a.account || undefined })),
    assets: data.holdings.filter((h) => isValued(h.type)).map((h) => ({ ref: `account:${h.id}`, name: h.name, currency: h.currency })),
    holdings: data.holdings
      .filter((h) => isUnits(h.type))
      .map((h) => ({ ref: h.id, symbol: h.symbol, name: h.name, currency: (h.symbol && data.quotes[h.symbol]?.currency) || h.currency })),
    cards: data.cards.map((c) => ({ ref: c.id, name: c.name, currency: c.currency })),
    spendCategories: SPEND_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES
  }
}
