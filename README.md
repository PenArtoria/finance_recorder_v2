# Moneta

A personal finance tracker: investments with live prices, bank accounts, cash buckets, daily spending, credit cards,
goals and month-by-month net worth, in any currency.

| Folder | Platform | Status |
|---|---|---|
| [`windows/`](windows/) | Windows desktop app (Electron + React) | Working |
| `ios/` | iPhone | Planned |

See [`windows/README.md`](windows/README.md) for features, building the installer and where data is stored.

Your financial data is never part of this repository. It lives in one file on your computer
(`%APPDATA%\Moneta\moneta-data.json` on Windows).

Prices come from Yahoo Finance and exchange rates from open.er-api.com. For tracking only, not financial advice.
