# Moneta for Windows

A desktop app for tracking investments, bank accounts, cash buckets, daily spending, credit cards, goals and
month-by-month net worth.
(Earlier versions were called Nest Egg.)

## Install

Run `release\Moneta-Setup-<version>.exe`. The installer isn't code-signed, so Windows SmartScreen may say
"Windows protected your PC". Choose **More info → Run anyway**. Installing Moneta replaces an installed Nest Egg,
and the first start copies its data across. The old `%APPDATA%\Nest Egg` folder is left untouched as a backup.

## What it does

- **Holdings**: investments with live prices from Yahoo Finance (VWRA.L, VALL.L, RKLB, BTC-USD, 2800.HK …), bank accounts and
  fixed deposits, and assets you value yourself (property, pension). Each investment keeps its buys and sells.
  **Buy more** (the + on each row) records a DCA purchase at that day's price and updates the units and average cost.
  Adding a ticker you already own records a buy on that holding instead of creating a second one.
- **Cash buckets**: split the money in your bank accounts by purpose. A bucket inside an account is counted once, as part
  of that account. Unassigned money is whatever isn't in a bucket yet.
- **Spending & income**: note what you spend each day in any currency, with a category. The currencies you use most are listed
  first, and each entry is converted to your main currency at that day's exchange rate. Paid in cash or by bank, it comes
  out of the bucket you pick (and its bank account). Income (salary, dividends, refunds…) is noted the same way and paid
  into a bank account, a bucket or another asset. A month calendar shows each day's income and spending, with the day's
  entries and a breakdown by category.
- **Credit cards**: give each card its closing day (締め日), pay day (支払日) and the account that pays it. Card spending
  is grouped into statements with their pay days, the bill is set aside in that account, and on the pay day Moneta can
  record the payment automatically.
- **Goals**: track net worth, cash, one bucket or one holding against a target and month, or a number of units of an
  ETF or stock (e.g. own 100 VWRA).
- **Monthly history**: the current month is saved automatically and frozen when the month ends. Past months can be typed
  in or imported from a Google Sheets CSV export.
- **Currencies**: 166 currencies. Totals are shown in your main currency (Settings), and everything else keeps its own.

## Your data

Everything is stored in one file, `moneta-data.json`, in `%APPDATA%\Moneta` by default, and a daily copy is kept in its
`backups` folder for 30 days. **Settings → Move to another folder** can put it in OneDrive or iCloud Drive for backup and
for sharing between two computers. Moneta reloads automatically when the synced file changes.

## Develop

Requires Node.js 22.12 or newer.

```bash
npm install
npx install-electron
npm run dev        # run with hot reload
npm run typecheck
npm run dist       # build release\Moneta-Setup-<version>.exe
```

## Layout

```
src/shared/       data types shared by every part of the app
src/main/         Electron main process: data file, backups, price and FX requests, Nest Egg migration
src/preload/      the small API the window is allowed to call
src/renderer/src/
  core/           platform-independent logic: money, trades and cost basis, cash moves, spending,
                  credit card statements, monthly change, goals, CSV import, data migrations
  components/     dialogs, charts, inputs
  pages/          Overview, Holdings, Cash, Spending, Cards, Goals, History, Settings, Welcome
```

`src/renderer/src/core` and `src/shared` have no Electron or DOM dependencies, so an iOS version can reuse them.
