# Moneta

A personal finance tracker: investments with live prices, bank accounts, cash buckets, daily spending and income, credit cards,
goals and month-by-month net worth, in any currency.

| Folder | Platform | Status |
|---|---|---|
| [`windows/`](windows/) | Windows desktop app (Electron + React) | Working |
| [`ios/`](ios/) | iPhone home-screen app (PWA) using the same screens | Working |
| [`cloud/`](cloud/) | Cloudflare Worker: hosts the phone app, fetches prices, stores encrypted sync data | Working |

See [`windows/README.md`](windows/README.md) for features, building the installer and where data is stored.

Prices come from Yahoo Finance and exchange rates from open.er-api.com. For tracking only, not financial advice.
