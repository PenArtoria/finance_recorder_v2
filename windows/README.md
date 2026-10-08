# Nest Egg for Windows

A desktop app for tracking investments (stocks, ETFs, crypto), cash buckets, goals and month-by-month net worth.

## Install

Run `release\Nest-Egg-Setup-1.0.0.exe`. The installer isn't code-signed, so Windows SmartScreen may say
"Windows protected your PC". Choose **More info → Run anyway**. Nest Egg then appears in the Start menu
and on the desktop.

## What it does

- **Investments**: add holdings by searching Yahoo Finance (VWRA.L, VALL.L, RKLB, BTC-USD, 2800.HK …).
  Prices refresh every 15 minutes while the app is open. Assets without a ticker can be added with a price you enter yourself.
- **Cash buckets**: split cash by purpose, each in its own currency with an optional target. Add, take out or move money between buckets.
- **Goals**: track net worth, all cash, one bucket or one holding against a target and month, with the amount needed per month and your recent pace.
- **Monthly history**: the current month is saved automatically from live numbers and frozen when the month ends.
  Past months can be typed in or imported from a Google Sheets CSV export.
- **Currencies**: 166 currencies. Totals are shown in your main currency (Settings), and each holding or bucket keeps its own.

## Your data

Everything is stored in one file, `nest-egg-data.json`, in `%APPDATA%\Nest Egg` by default, and a daily copy is kept in its
`backups` folder for 30 days. **Settings → Move to another folder** can put it in OneDrive or iCloud Drive for backup and for
sharing between two computers. Nest Egg reloads automatically when the synced file changes.

## Develop

Requires Node.js 22.12 or newer.

```bash
npm install
npx install-electron
npm run dev        # run with hot reload
npm run typecheck
npm run dist       # build release\Nest-Egg-Setup-<version>.exe
```

## Layout

```
src/shared/       data types shared by every part of the app
src/main/         Electron main process: data file, backups, price and FX requests
src/preload/      the small API the window is allowed to call
src/renderer/src/
  core/           platform-independent logic: money, monthly change, goals, CSV import
  components/     dialogs, charts, inputs
  pages/          Overview, Investments, Cash, Goals, History, Settings, Welcome
```

`src/renderer/src/core` and `src/shared` have no Electron or DOM dependencies, so an iOS version can reuse them.
