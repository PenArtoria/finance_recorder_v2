// Every currency the exchange-rate feed supports (ISO 4217, plus a few
// territory pounds and offshore yuan). Names come from the system locale.

export const CURRENCY_CODES = (
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN ' +
  'BZD CAD CDF CHF CLF CLP CNH CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP FOK ' +
  'GBP GEL GGP GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS IMP INR IQD IRR ISK JEP JMD JOD ' +
  'JPY KES KGS KHR KID KMF KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU ' +
  'MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB ' +
  'RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TVD ' +
  'TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XDR XOF XPF YER ZAR ZMW ZWG ZWL'
).split(' ')

export const POPULAR_CURRENCIES = ['USD', 'HKD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'AUD', 'CAD', 'CHF', 'TWD', 'KRW']

const EXTRA_NAMES: Record<string, string> = {
  CNH: 'Chinese Yuan (offshore)',
  FOK: 'Faroese Króna',
  GGP: 'Guernsey Pound',
  IMP: 'Manx Pound',
  JEP: 'Jersey Pound',
  KID: 'Kiribati Dollar',
  TVD: 'Tuvaluan Dollar',
  XCG: 'Caribbean Guilder',
  ZWG: 'Zimbabwe Gold',
  XDR: 'Special Drawing Rights'
}

let displayNames: Intl.DisplayNames | null = null
try {
  displayNames = new Intl.DisplayNames(['en'], { type: 'currency' })
} catch {
  displayNames = null
}

export function currencyName(code: string): string {
  if (EXTRA_NAMES[code]) return EXTRA_NAMES[code]
  try {
    const name = displayNames?.of(code)
    if (name && name !== code) return name.replace(/^./, (c) => c.toUpperCase())
  } catch {
    // unknown code
  }
  return code
}

export function allCurrencies(extra: string[] = []): string[] {
  const set = new Set([...CURRENCY_CODES, ...extra.filter((c) => /^[A-Z]{3}$/.test(c))])
  return [...set].sort()
}
