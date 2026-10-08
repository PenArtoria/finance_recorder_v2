import type { AssetType, FxTable, Quote, QuoteResult, SymbolMatch } from '@shared/types'

// Prices come from Yahoo Finance's public chart endpoint (stocks, ETFs, crypto, FX)
// and exchange rates from open.er-api.com. Both are called from the main process,
// so browser CORS rules don't apply.

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json'
}

const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']

// Some exchanges quote in minor units; convert them to the major currency.
const MINOR_UNITS: Record<string, { code: string; factor: number }> = {
  GBp: { code: 'GBP', factor: 100 },
  GBX: { code: 'GBP', factor: 100 },
  ZAc: { code: 'ZAR', factor: 100 },
  ILA: { code: 'ILS', factor: 100 }
}

async function getJson(url: string, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('Request timed out')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function yahoo(path: string): Promise<any> {
  let lastErr: unknown
  for (const host of YAHOO_HOSTS) {
    try {
      return await getJson(host + path)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Network error')
}

export async function fetchQuote(symbol: string): Promise<Quote> {
  const json = await yahoo(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`
  )
  const result = json?.chart?.result?.[0]
  const meta = result?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    const msg = json?.chart?.error?.description
    throw new Error(msg || 'No price found for this symbol')
  }

  // Previous close = last daily close before the day of the latest price,
  // measured in the exchange's own time zone.
  const offset = Number(meta.gmtoffset) || 0
  const dayOf = (sec: number) => Math.floor((sec + offset) / 86400)
  const timestamps: number[] = result.timestamp ?? []
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []
  const today = dayOf(meta.regularMarketTime ?? Date.now() / 1000)
  let previousClose: number | null = null
  for (let i = timestamps.length - 1; i >= 0; i--) {
    const close = closes[i]
    if (close != null && dayOf(timestamps[i]) < today) {
      previousClose = close
      break
    }
  }
  if (previousClose == null) previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null

  let currency: string = meta.currency || 'USD'
  let price: number = meta.regularMarketPrice
  const minor = MINOR_UNITS[currency]
  if (minor) {
    currency = minor.code
    price /= minor.factor
    if (previousClose != null) previousClose /= minor.factor
  }

  return {
    symbol,
    price,
    previousClose,
    currency,
    name: meta.longName || meta.shortName || undefined,
    exchange: meta.fullExchangeName || meta.exchangeName || undefined,
    instrumentType: meta.instrumentType || undefined,
    marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : undefined,
    fetchedAt: Date.now()
  }
}

export async function fetchQuotes(symbols: string[]): Promise<QuoteResult> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))]
  const out: QuoteResult = { quotes: [], errors: [] }
  let next = 0
  const worker = async () => {
    while (next < unique.length) {
      const symbol = unique[next++]
      try {
        out.quotes.push(await fetchQuote(symbol))
      } catch (err: any) {
        out.errors.push({ symbol, message: err?.message || String(err) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker))
  return out
}

function toAssetType(quoteType: string): AssetType {
  switch (quoteType) {
    case 'EQUITY':
      return 'stock'
    case 'ETF':
      return 'etf'
    case 'MUTUALFUND':
      return 'fund'
    case 'CRYPTOCURRENCY':
      return 'crypto'
    default:
      return 'other'
  }
}

const SEARCHABLE = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY', 'INDEX', 'MONEYMARKET'])

export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const q = query.trim()
  if (!q) return []
  const json = await yahoo(
    `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`
  )
  const quotes: any[] = json?.quotes ?? []
  return quotes
    .filter((x) => x?.symbol && SEARCHABLE.has(x.quoteType))
    .slice(0, 8)
    .map((x) => ({
      symbol: String(x.symbol),
      name: String(x.longname || x.shortname || x.symbol),
      type: toAssetType(x.quoteType),
      exchange: String(x.exchDisp || x.exchange || ''),
      quoteType: String(x.quoteType)
    }))
}

export async function fetchFx(): Promise<FxTable> {
  const json = await getJson('https://open.er-api.com/v6/latest/USD')
  if (json?.result !== 'success' || !json.rates) throw new Error('Exchange rates unavailable')
  return {
    rates: { ...json.rates, USD: 1 },
    fetchedAt: Date.now(),
    updatedAt: json.time_last_update_unix ? json.time_last_update_unix * 1000 : undefined,
    source: 'open.er-api.com'
  }
}
